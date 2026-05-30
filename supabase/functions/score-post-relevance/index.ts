// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jr(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return jr({ error: "OPENAI_API_KEY not configured" }, 400);

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes.user;
    if (!user) return jr({ error: "Unauthorized" }, 401);

    const { post_id, force } = await req.json().catch(() => ({} as any));
    if (!post_id || typeof post_id !== "string") return jr({ error: "post_id required" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: post } = await admin.from("social_posts").select("*").eq("id", post_id).eq("user_id", user.id).maybeSingle();
    if (!post) return jr({ error: "Post not found" }, 404);

    // Use cached result if recent (<30 days) and not forced
    if (!force && post.relevance_score != null && post.relevance_computed_at) {
      return jr({
        cached: true,
        score: post.relevance_score,
        fields: post.relevance_fields ?? [],
        reasoning: post.relevance_reasoning ?? "",
        computed_at: post.relevance_computed_at,
      });
    }

    const { data: settings } = await admin.from("social_writer_settings").select("about_me,career_summary,expertise,target_audience,headline,industry").eq("user_id", user.id).maybeSingle();

    // Negative examples — what the user has explicitly ignored
    const { data: ignoredSamples } = await admin
      .from("social_posts")
      .select("author,post_text,ignored_reason")
      .eq("user_id", user.id)
      .not("ignored_at", "is", null)
      .order("ignored_at", { ascending: false })
      .limit(15);

    const persona = [
      settings?.headline && `Headline: ${settings.headline}`,
      settings?.industry && `Industry: ${settings.industry}`,
      settings?.about_me && `About me: ${settings.about_me}`,
      settings?.career_summary && `Career: ${settings.career_summary}`,
      settings?.expertise && `Expertise: ${settings.expertise}`,
      settings?.target_audience && `Target audience: ${settings.target_audience}`,
    ].filter(Boolean).join("\n");

    const negatives = (ignoredSamples ?? []).map((p: any, i: number) =>
      `#${i + 1} by ${p.author ?? "?"}${p.ignored_reason ? ` (reason: ${p.ignored_reason})` : ""}: ${String(p.post_text ?? "").slice(0, 300)}`
    ).join("\n");

    const prompt = `You score how relevant a LinkedIn post is for THIS user, based on their persona and the topics they've previously dismissed.

USER PERSONA:
${persona || "(no persona configured — score generously based on professional value)"}

POSTS THE USER PREVIOUSLY MARKED AS IRRELEVANT (do NOT score similar topics highly):
${negatives || "(none yet)"}

POST TO SCORE:
Author: ${post.author ?? "?"}
Company: ${post.company ?? "?"}
Text: ${String(post.post_text ?? "").slice(0, 3000)}

Return STRICT JSON:
{
  "score": <integer 0-100 — how relevant this post is to the user's work, expertise and audience>,
  "fields": [<3-6 short tags identifying the topics/fields/themes of this post, e.g. "B2B sales", "AI agents", "Founder story">],
  "matched_to_user": [<which of the user's expertise/audience tags this post matches, empty array if none>],
  "reasoning": "<1-2 sentence explanation of why this score, in plain English>"
}`;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      return jr({ error: `OpenAI ${aiRes.status}: ${t.slice(0, 300)}` }, 502);
    }
    const j = await aiRes.json();
    const parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? "{}");
    const score = Math.max(0, Math.min(100, Number(parsed.score ?? 0) | 0));
    const fields = Array.isArray(parsed.fields) ? parsed.fields.slice(0, 8).map((x: any) => String(x)) : [];
    const matched = Array.isArray(parsed.matched_to_user) ? parsed.matched_to_user.slice(0, 8).map((x: any) => String(x)) : [];
    const reasoning = String(parsed.reasoning ?? "").slice(0, 600);

    const payload = { fields, matched_to_user: matched };
    await admin.from("social_posts").update({
      relevance_score: score,
      relevance_fields: payload,
      relevance_reasoning: reasoning,
      relevance_computed_at: new Date().toISOString(),
    }).eq("id", post_id).eq("user_id", user.id);

    return jr({ cached: false, score, fields, matched_to_user: matched, reasoning });
  } catch (e: any) {
    return jr({ error: e?.message ?? "Server error" }, 500);
  }
});