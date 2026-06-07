// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes.user;
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: settings } = await admin.from("social_writer_settings").select("*").eq("user_id", user.id).maybeSingle();

    // Pull the full post history for richer clustering (capped to 500 most recent for the prompt,
    // but engagement/reach/recency scoring uses every row we fetch).
    const { data: posts } = await admin.from("social_posts")
      .select("id,author,company,post_text,likes,comments,shares,posted_at,profile_id,scraped_at")
      .eq("user_id", user.id)
      .not("post_text", "is", null)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(500);

    if (!posts?.length) {
      return new Response(JSON.stringify({ error: "No posts to cluster. Scrape some profiles first." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compute engagement+reach+recency weight per post for the prompt context (top 200 by weight).
    const now = Date.now();
    const weighted = posts.map((p, i) => {
      const eng = (Number(p.likes) || 0) + 2 * (Number(p.comments) || 0) + 3 * (Number(p.shares) || 0);
      const ageDays = p.posted_at ? Math.max(0, (now - new Date(p.posted_at).getTime()) / 86400000) : 30;
      const recency = Math.exp(-ageDays / 21); // half-life ~ 2 weeks
      return { i, p, eng, recency, weight: eng * (0.4 + recency) };
    }).sort((a, b) => b.weight - a.weight).slice(0, 200);

    const postsForPrompt = weighted.map(({ i, p, eng }) =>
      `[${i}] w=${eng} (${p.likes}L/${p.comments}C/${p.shares ?? 0}S) ${p.author}@${p.company || "—"}: ${(p.post_text || "").slice(0, 400)}`
    ).join("\n");

    const systemPrompt = "You are a B2B content strategist clustering LinkedIn posts into trending topics for a marketing automation specialist.";
    const userPrompt = `Cluster the posts below into 8-12 distinct hot topics that this user (a B2B marketing automation specialist) should consider speaking about.

Consider:
- Volume: how many posts and how many distinct profiles touch the theme (reach).
- Engagement: likes (1x) + comments (2x) + shares (3x) — already shown as w=… per post.
- Recency: themes with weight in the last 14 days score higher than older themes.
- Voice fit: prefer themes the user can credibly speak about given the network (other B2B / GTM / AI operators).

For each topic return:
- title (5-8 words, specific, never just "AI")
- description (1-2 sentences explaining the trend and WHY it's hot now)
- score (0-100, blending volume + reach + engagement + recency)
- timeframe ("Ongoing", "Last 7 days", "Q1 2026", etc.)
- recommended_angle (1 sentence: how the user could uniquely contribute)
- post_indices (array of [n] indices belonging to this topic)

Return JSON: {"topics":[{...}]}

POSTS:
${postsForPrompt}`;

    // BYO keys: prefer the user's saved keys, fall back to platform secrets.
    const anthropicKey = (settings?.anthropic_api_key || "").trim() || Deno.env.get("ANTHROPIC_API_KEY");
    const openaiKey = (settings?.openai_api_key || "").trim() || Deno.env.get("OPENAI_API_KEY");
    const provider = settings?.preferred_provider || "openai";

    const tryOrder = provider === "anthropic" ? ["anthropic", "openai"] : ["openai", "anthropic"];

    let resultText = "";
    let usedProvider = "";
    let lastErr: any = null;

    for (const p of tryOrder) {
      try {
        if (p === "anthropic" && anthropicKey) {
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST", headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
            body: JSON.stringify({ model: settings?.anthropic_model || "claude-sonnet-4-20250514", max_tokens: 4096, system: systemPrompt, messages: [{ role: "user", content: userPrompt }] }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(JSON.stringify(d));
          resultText = d.content?.[0]?.text ?? ""; usedProvider = p; break;
        }
        if (p === "openai" && openaiKey) {
          const r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST", headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: settings?.openai_model || "gpt-5-mini", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], response_format: { type: "json_object" } }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(JSON.stringify(d));
          resultText = d.choices?.[0]?.message?.content ?? ""; usedProvider = p; break;
        }
      } catch (e) { lastErr = e; }
    }
    if (!resultText) throw lastErr ?? new Error("no_provider_succeeded");

    const match = resultText.match(/\{[\s\S]*\}/);
    let parsed: { topics?: any[] } = {};
    try { parsed = JSON.parse(match?.[0] ?? resultText); } catch { /* ignore */ }
    const topics = parsed.topics ?? [];

    // Refresh the hot-topics cache only — never delete underlying scraped posts.
    await admin.from("social_hot_topics").delete().eq("user_id", user.id);
    const inserts = topics.map((t: any) => {
      const indices: number[] = (t.post_indices || []).map((n: any) => Number(n)).filter((n: number) => !Number.isNaN(n));
      const relatedIds = indices.map((i) => posts[i]?.id).filter(Boolean);
      const profSet = new Set(indices.map((i) => posts[i]?.profile_id).filter(Boolean));
      const desc = [t.description, t.recommended_angle ? `Angle: ${t.recommended_angle}` : null].filter(Boolean).join(" \n");
      return {
        user_id: user.id, title: t.title, description: desc, score: Number(t.score) || 0,
        timeframe: t.timeframe || null, post_count: indices.length, profile_count: profSet.size, related_post_ids: relatedIds,
      };
    }).filter((t: any) => t.title);
    if (inserts.length) await admin.from("social_hot_topics").insert(inserts);

    return new Response(JSON.stringify({ topics: inserts.length, provider: usedProvider }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("cluster-hot-topics:", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
