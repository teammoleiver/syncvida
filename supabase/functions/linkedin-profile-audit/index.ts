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

const SECTIONS = [
  "visual_identity",
  "headline",
  "about",
  "experience",
  "skills",
  "featured",
  "recommendations",
  "missing_sections",
] as const;

function diffAudits(prev: any, next: any) {
  if (!prev) return null;
  const overall_delta = (next.overall_score ?? 0) - (prev.overall_score ?? 0);
  const sections: Record<string, { prev: number | null; next: number | null; delta: number; change: "improved" | "worse" | "same" }> = {};
  for (const key of SECTIONS) {
    const p = prev?.sections?.[key]?.score ?? null;
    const n = next?.sections?.[key]?.score ?? null;
    if (p == null && n == null) continue;
    const delta = (n ?? 0) - (p ?? 0);
    sections[key] = {
      prev: p, next: n, delta,
      change: delta > 0 ? "improved" : delta < 0 ? "worse" : "same",
    };
  }
  return { overall_delta, sections };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? Deno.env.get("OPENAI_API_KEY");

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes.user;
    if (!user) return jr({ error: "Unauthorized" }, 401);
    if (!LOVABLE_API_KEY) return jr({ error: "LOVABLE_API_KEY not configured" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE);

    // Load self profile + recent posts + writer settings.
    const { data: profile } = await admin.from("social_profiles")
      .select("*").eq("user_id", user.id).eq("is_self", true).maybeSingle();
    if (!profile) return jr({ error: "Run 'Analyze my LinkedIn' first to create your self profile." }, 400);

    const { data: posts } = await admin.from("social_posts")
      .select("post_text,posted_at,likes,comments,shares,views,post_url,media_type")
      .eq("profile_id", profile.id)
      .order("posted_at", { ascending: false })
      .limit(25);

    const { data: settings } = await admin.from("social_writer_settings")
      .select("about_me,career_summary,expertise,target_audience,writing_samples")
      .eq("user_id", user.id).maybeSingle();

    // Previous audit for comparison.
    const { data: prevAudit } = await admin.from("linkedin_profile_audits")
      .select("id,report,created_at,overall_score")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle();

    const totals = (posts || []).reduce((a: any, p: any) => ({
      likes: a.likes + (p.likes || 0),
      comments: a.comments + (p.comments || 0),
      shares: a.shares + (p.shares || 0),
      views: a.views + (p.views || 0),
    }), { likes: 0, comments: 0, shares: 0, views: 0 });
    const n = (posts || []).length || 1;
    const avg_engagement = Math.round(((totals.likes + totals.comments + totals.shares) / n) * 10) / 10;

    const profileSummary = {
      display_name: profile.display_name || profile.full_name,
      headline: profile.title,
      company: profile.company,
      location: profile.location || profile.country,
      followers: profile.num_followers || profile.followers,
      about: profile.info_summary,
      avatar_url: profile.avatar_url,
      profile_url: profile.profile_url,
      username: profile.username,
    };

    const recentPosts = (posts || []).map((p: any) => ({
      text: (p.post_text || "").slice(0, 600),
      posted_at: p.posted_at,
      likes: p.likes, comments: p.comments, shares: p.shares, views: p.views,
      media_type: p.media_type,
    }));

    const previousScores = prevAudit?.report
      ? Object.fromEntries(SECTIONS.map((s) => [s, (prevAudit.report as any)?.sections?.[s]?.score ?? null]))
      : null;

    const systemPrompt = `You are a senior LinkedIn brand strategist. Produce a STRICT JSON audit. No prose outside JSON. Base every recommendation on the user's REAL data — never invent facts. If data is missing, say so in the relevant field. All advice must be specific and actionable, never generic. Each section must include an "improvements" array of 2-5 concrete actions the user can take next.`;

    const userPrompt = `Analyze this LinkedIn profile and produce a JSON audit.

PROFILE DATA:
${JSON.stringify(profileSummary, null, 2)}

WRITER SETTINGS (self-described context):
${JSON.stringify(settings ?? {}, null, 2)}

RECENT POSTS (last ${recentPosts.length}):
${JSON.stringify(recentPosts, null, 2)}

AGGREGATE METRICS:
${JSON.stringify({ post_count: recentPosts.length, totals, avg_engagement_per_post: avg_engagement }, null, 2)}

${previousScores ? `PREVIOUS AUDIT SECTION SCORES (so you can comment on changes): ${JSON.stringify(previousScores)}` : "This is the first audit."}

Return JSON with this EXACT shape:
{
  "classification": { "industry": "", "profile_type": "", "target_audience": "", "geographic_focus": "" },
  "overall_score": 0,
  "summary": "2-3 sentence executive summary",
  "sections": {
    "visual_identity": { "score": 0, "photo_score": 0, "banner_score": 0, "url_customized": true, "notes": "", "improvements": [] },
    "headline": { "score": 0, "current": "", "options": ["", "", ""], "improvements": [] },
    "about": { "score": 0, "current": "", "rewrite": "", "improvements": [] },
    "experience": { "score": 0, "rewrites": [{ "role": "", "rewrite": "" }], "improvements": [] },
    "skills": { "score": 0, "add": [], "remove": [], "reorder": [], "improvements": [] },
    "featured": { "score": 0, "suggestions": [], "improvements": [] },
    "recommendations": { "score": 0, "count_estimate": 0, "ask_targets": [], "improvements": [] },
    "missing_sections": { "score": 0, "items": [], "improvements": [] }
  },
  "metrics": {
    "ssi_estimated": 0,
    "ssi_breakdown": { "brand": 0, "find": 0, "engage": 0, "build": 0 },
    "engagement_rate_pct": 0,
    "engagement_benchmark_note": "",
    "visibility_notes": ""
  },
  "strategy": {
    "keywords": { "primary": [], "secondary": [], "long_tail": [] },
    "quick_wins": [],
    "long_term": [],
    "content_pillars": [{ "name": "", "ideas": [] }],
    "format_recommendations": []
  },
  "growth_plan": { "day_1_30": [], "day_31_60": [], "day_61_90": [] },
  "multilingual": { "has_secondary": false, "recommendation": "" }
}

All scores are 0-100 except SSI which is 0-25 per pillar (0-100 total). overall_score must be your weighted average of section scores.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      return jr({ error: `AI ${aiRes.status}: ${t.slice(0, 400)}` }, 502);
    }
    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let report: any;
    try { report = JSON.parse(content); } catch { return jr({ error: "AI returned non-JSON" }, 502); }

    const diff = diffAudits(prevAudit?.report ?? null, report);

    const { data: saved, error: insErr } = await admin.from("linkedin_profile_audits").insert({
      user_id: user.id,
      profile_url: profile.profile_url,
      overall_score: report.overall_score ?? null,
      report,
      diff,
    }).select().single();
    if (insErr) return jr({ error: insErr.message }, 500);

    return jr({ ok: true, audit: saved, previous_at: prevAudit?.created_at ?? null });
  } catch (e: any) {
    return jr({ error: String(e?.message ?? e) }, 500);
  }
});