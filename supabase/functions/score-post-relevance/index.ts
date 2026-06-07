// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jr(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Scoring is a "fast" task. We try the cheap model first, then fall back across
// the user's other key AND the platform keys — so a user whose own OpenAI key has
// no billing (passes /models but 429s on completions) still gets scored.
async function callOpenAI(prompt: string, key: string, model: string): Promise<string> {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" }, temperature: 0.2 }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j?.choices?.[0]?.message?.content ?? "{}";
}

async function callAnthropic(prompt: string, key: string, model: string): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: "user", content: prompt + "\n\nReturn ONLY the JSON object, nothing else." }] }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j?.content?.[0]?.text ?? "{}";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    // Use cached result if recent and not forced
    if (!force && post.relevance_score != null && post.relevance_computed_at) {
      return jr({ cached: true, score: post.relevance_score, fields: post.relevance_fields ?? [], reasoning: post.relevance_reasoning ?? "", computed_at: post.relevance_computed_at });
    }

    const { data: settings } = await admin.from("social_writer_settings")
      .select("about_me,career_summary,expertise,target_audience,headline,industry,openai_api_key,anthropic_api_key,openai_model,anthropic_model,ai_task_routing")
      .eq("user_id", user.id).maybeSingle();

    // Empty post → store a 0 without burning an AI call.
    const postText = String(post.post_text ?? "").trim();
    if (!postText) {
      await admin.from("social_posts").update({ relevance_score: 0, relevance_fields: { fields: [], matched_to_user: [] }, relevance_reasoning: "No text to score.", relevance_computed_at: new Date().toISOString() }).eq("id", post_id).eq("user_id", user.id);
      return jr({ cached: false, score: 0, fields: [], matched_to_user: [], reasoning: "No text to score." });
    }

    // Build the candidate list: the user's own keys first (fast/cheap first),
    // then the platform keys as a safety net.
    const s: any = settings ?? {};
    const userOpenai = (s.openai_api_key || "").trim();
    const userAnthropic = (s.anthropic_api_key || "").trim();
    const platOpenai = Deno.env.get("OPENAI_API_KEY") || "";
    const platAnthropic = Deno.env.get("ANTHROPIC_API_KEY") || "";
    const oaModel = (s.openai_model || "").trim() || "gpt-4o-mini";
    const anModel = (s.anthropic_model || "").trim() || "claude-sonnet-4-20250514";
    const fastPref = s.ai_task_routing?.fast?.provider;

    type Cand = { provider: "openai" | "anthropic"; key: string; label: string };
    const cands: Cand[] = [];
    const add = (provider: "openai" | "anthropic", key: string, label: string) => { if (key && !cands.some((c) => c.provider === provider && c.key === key)) cands.push({ provider, key, label }); };
    if (fastPref === "anthropic") { add("anthropic", userAnthropic, "your Anthropic"); add("openai", userOpenai, "your OpenAI"); }
    else { add("openai", userOpenai, "your OpenAI"); add("anthropic", userAnthropic, "your Anthropic"); }
    add("openai", platOpenai, "platform OpenAI");
    add("anthropic", platAnthropic, "platform Anthropic");

    if (cands.length === 0) return jr({ error: "No AI key available. Add your own OpenAI or Anthropic key in Settings → AI API." }, 400);

    const persona = [
      s.headline && `Headline: ${s.headline}`,
      s.industry && `Industry: ${s.industry}`,
      s.about_me && `About me: ${s.about_me}`,
      s.career_summary && `Career: ${s.career_summary}`,
      s.expertise && `Expertise: ${s.expertise}`,
      s.target_audience && `Target audience: ${s.target_audience}`,
    ].filter(Boolean).join("\n");

    const { data: ignoredSamples } = await admin.from("social_posts").select("author,post_text,ignored_reason").eq("user_id", user.id).not("ignored_at", "is", null).order("ignored_at", { ascending: false }).limit(15);
    const { data: memoryRows } = await admin.from("social_scrape_memory").select("signal,tags,reason,source_post_author,source_post_excerpt,created_at").eq("user_id", user.id).eq("active", true).order("created_at", { ascending: false }).limit(60);
    const negatives = (ignoredSamples ?? []).map((p: any, i: number) => `#${i + 1} by ${p.author ?? "?"}${p.ignored_reason ? ` (reason: ${p.ignored_reason})` : ""}: ${String(p.post_text ?? "").slice(0, 300)}`).join("\n");
    const fmtMemory = (r: any) => { const tagPart = Array.isArray(r.tags) && r.tags.length ? `[${r.tags.join(", ")}]` : ""; const reasonPart = r.reason ? ` ${r.reason}` : ""; const ctx = r.source_post_author ? ` (re: ${r.source_post_author})` : ""; return `- ${tagPart}${reasonPart}${ctx}`.trim(); };
    const positiveMemory = (memoryRows ?? []).filter((r: any) => r.signal === "positive").map(fmtMemory).join("\n");
    const negativeMemory = (memoryRows ?? []).filter((r: any) => r.signal === "negative").map(fmtMemory).join("\n");

    const prompt = `You score how relevant a LinkedIn post is for THIS user, based on their persona and the topics they've previously dismissed.

USER PERSONA:
${persona || "(no persona configured — score generously based on professional value)"}

LEARNED PREFERENCES (positive — score SIMILAR posts HIGHER):
${positiveMemory || "(none yet)"}

LEARNED PREFERENCES (negative — score SIMILAR posts LOWER):
${negativeMemory || "(none yet)"}

POSTS THE USER PREVIOUSLY MARKED AS IRRELEVANT (do NOT score similar topics highly):
${negatives || "(none yet)"}

POST TO SCORE:
Author: ${post.author ?? "?"}
Company: ${post.company ?? "?"}
Text: ${postText.slice(0, 3000)}

Return STRICT JSON:
{
  "score": <integer 0-100 — how relevant this post is to the user's work, expertise and audience>,
  "fields": [<3-6 short tags identifying the topics/fields/themes of this post>],
  "matched_to_user": [<which of the user's expertise/audience tags this post matches, empty array if none>],
  "reasoning": "<1-2 sentence explanation of why this score, in plain English>"
}`;

    // Try each candidate until one succeeds. Surface the last real error if all fail.
    let content = ""; let lastErr: any = null;
    for (const c of cands) {
      try {
        content = c.provider === "openai" ? await callOpenAI(prompt, c.key, oaModel) : await callAnthropic(prompt, c.key, anModel);
        if (content) break;
      } catch (e: any) { lastErr = e; }
    }
    if (!content) {
      const msg = String(lastErr?.message ?? "all providers failed");
      const hint = /quota|insufficient|429|billing/i.test(msg) ? " — your OpenAI key has no credits; add billing on OpenAI or rely on Anthropic/platform." : "";
      return jr({ error: `Scoring failed: ${msg}${hint}` }, 502);
    }

    let parsed: any = {};
    try { parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? content ?? "{}"); } catch { /* */ }
    const score = Math.max(0, Math.min(100, Number(parsed.score ?? 0) | 0));
    const fields = Array.isArray(parsed.fields) ? parsed.fields.slice(0, 8).map((x: any) => String(x)) : [];
    const matched = Array.isArray(parsed.matched_to_user) ? parsed.matched_to_user.slice(0, 8).map((x: any) => String(x)) : [];
    const reasoning = String(parsed.reasoning ?? "").slice(0, 600);

    await admin.from("social_posts").update({ relevance_score: score, relevance_fields: { fields, matched_to_user: matched }, relevance_reasoning: reasoning, relevance_computed_at: new Date().toISOString() }).eq("id", post_id).eq("user_id", user.id);

    return jr({ cached: false, score, fields, matched_to_user: matched, reasoning });
  } catch (e: any) {
    return jr({ error: e?.message ?? "Server error" }, 500);
  }
});
