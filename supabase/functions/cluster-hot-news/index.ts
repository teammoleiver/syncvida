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
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));

    // Require auth. Only allow body.user_id override when caller presents the
    // service role key (used by internal cron / fan-out calls).
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "");
    const isServiceRole = bearer && bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    let userId: string | null = null;
    if (isServiceRole) {
      userId = (body?.user_id as string) ?? null;
    } else {
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data } = await userClient.auth.getUser();
      userId = data.user?.id ?? null;
    }
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: settings } = await admin.from("social_writer_settings").select("*").eq("user_id", userId).maybeSingle();

    const { data: articles } = await admin.from("social_articles")
      .select("id,title,snippet,source_label,published_at,article_url")
      .eq("user_id", userId)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(300);

    if (!articles?.length) {
      return new Response(JSON.stringify({ topics: 0, reason: "no_articles" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const now = Date.now();
    const weighted = articles.map((a, i) => {
      const ageDays = a.published_at ? Math.max(0, (now - new Date(a.published_at).getTime()) / 86400000) : 30;
      const recency = Math.exp(-ageDays / 14);
      return { i, a, recency };
    }).sort((x, y) => y.recency - x.recency).slice(0, 200);

    const articlesForPrompt = weighted.map(({ i, a, recency }) =>
      `[${i}] (r=${recency.toFixed(2)}, ${a.source_label ?? "src"}) ${a.title} — ${(a.snippet || "").slice(0, 240)}`
    ).join("\n");

    const aboutMe = [settings?.about_me, settings?.career_summary, settings?.expertise, settings?.target_audience, settings?.goals]
      .filter(Boolean).join("\n");

    const systemPrompt = "You cluster news articles into hot topics tailored to a specific person, ranking by how postable they are for that person.";
    const userPrompt = `Cluster the news articles below into 6-10 distinct HOT NEWS topics this user should consider posting about.

About the user (use to bias relevance — do not invent facts):
${aboutMe || "(no profile yet)"}

For each topic return:
- title (5-8 words)
- description (1-2 sentences explaining the trend and why it's hot now)
- score (0-100, blending volume + recency + fit-to-user)
- timeframe ("Last 7 days", "This month", etc.)
- recommended_angle (1 sentence — how this user could uniquely speak to it)
- article_indices (array of [n] indices belonging to this topic)

Return JSON: {"topics":[{...}]}

ARTICLES:
${articlesForPrompt}`;

    // BYO keys: prefer the user's saved keys, fall back to platform secrets.
    const lovableKey = Deno.env.get("OPENAI_API_KEY");
    const anthropicKey = (settings?.anthropic_api_key || "").trim() || Deno.env.get("ANTHROPIC_API_KEY");
    const openaiKey = (settings?.openai_api_key || "").trim() || Deno.env.get("OPENAI_API_KEY");
    const provider = settings?.preferred_provider || "lovable";
    const tryOrder = provider === "anthropic" ? ["anthropic", "openai", "lovable"]
      : provider === "openai" ? ["openai", "anthropic", "lovable"]
      : ["lovable", "anthropic", "openai"];

    let resultText = ""; let usedProvider = ""; let lastErr: any = null;
    for (const p of tryOrder) {
      try {
        if (p === "anthropic" && anthropicKey) {
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST", headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
            body: JSON.stringify({ model: settings?.anthropic_model || "claude-sonnet-4-20250514", max_tokens: 4096, system: systemPrompt, messages: [{ role: "user", content: userPrompt }] }),
          });
          const d = await r.json(); if (!r.ok) throw new Error(JSON.stringify(d));
          resultText = d.content?.[0]?.text ?? ""; usedProvider = p; break;
        }
        if (p === "openai" && openaiKey) {
          const r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST", headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: settings?.openai_model || "gpt-5-mini", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], response_format: { type: "json_object" } }),
          });
          const d = await r.json(); if (!r.ok) throw new Error(JSON.stringify(d));
          resultText = d.choices?.[0]?.message?.content ?? ""; usedProvider = p; break;
        }
        if (p === "lovable" && lovableKey) {
          const r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST", headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: settings?.lovable_model || "gpt-4o-mini", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], response_format: { type: "json_object" } }),
          });
          if (r.status === 429) throw new Error("rate_limited");
          if (r.status === 402) throw new Error("payment_required");
          const d = await r.json(); if (!r.ok) throw new Error(JSON.stringify(d));
          resultText = d.choices?.[0]?.message?.content ?? ""; usedProvider = p; break;
        }
      } catch (e) { lastErr = e; }
    }
    if (!resultText) throw lastErr ?? new Error("no_provider_succeeded");

    const match = resultText.match(/\{[\s\S]*\}/);
    let parsed: { topics?: any[] } = {};
    try { parsed = JSON.parse(match?.[0] ?? resultText); } catch { /* ignore */ }
    const topics = parsed.topics ?? [];

    await admin.from("social_hot_news").delete().eq("user_id", userId);
    const inserts = topics.map((t: any) => {
      const idx: number[] = (t.article_indices || []).map((n: any) => Number(n)).filter((n: number) => !Number.isNaN(n));
      const ids = idx.map((i) => articles[i]?.id).filter(Boolean);
      const desc = [t.description, t.recommended_angle ? `Angle: ${t.recommended_angle}` : null].filter(Boolean).join(" \n");
      return { user_id: userId, title: t.title, description: desc, score: Number(t.score) || 0, timeframe: t.timeframe || null, article_count: idx.length, related_article_ids: ids };
    }).filter((t: any) => t.title);
    if (inserts.length) await admin.from("social_hot_news").insert(inserts);

    return new Response(JSON.stringify({ topics: inserts.length, provider: usedProvider }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("cluster-hot-news:", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});