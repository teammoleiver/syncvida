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

function firstString(...values: any[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function parseCount(value: any): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const text = String(value ?? "").trim();
  if (!text) return null;
  const match = text.match(/([\d][\d,\.\s]*)\s*([kKmMbB])?/);
  if (!match) return null;
  const base = Number(match[1].replace(/[\s,]/g, ""));
  if (!Number.isFinite(base)) return null;
  const suffix = (match[2] ?? "").toLowerCase();
  const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
  const parsed = Math.round(base * multiplier);
  return parsed > 0 ? parsed : null;
}

function extractFollowerCount(...chunks: any[]): number | null {
  const text = chunks.map((c) => String(c ?? "")).join("\n");
  const patterns = [
    /([\d][\d,\.\s]*\s*[kKmMbB]?)\s*(?:\+\s*)?followers?\b/i,
    /followers?\s*[:•\-]?\s*([\d][\d,\.\s]*\s*[kKmMbB]?)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const parsed = parseCount(match?.[1]);
    if (parsed) return parsed;
  }
  return null;
}

async function linkupSearch(apiKey: string, query: string, depth: "standard" | "deep" = "deep", includeImages = false) {
  const r = await fetch("https://api.linkup.so/v1/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ q: query, depth, outputType: "sourcedAnswer", includeImages }),
  });
  const text = await r.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  if (!r.ok) throw new Error(`Linkup ${r.status}: ${text.slice(0, 400)}`);
  const answer = (json?.answer ?? json?.sourcedAnswer ?? "").toString();
  const sources = (json?.sources ?? json?.results ?? []) as any[];
  return {
    answer,
    sources: Array.isArray(sources)
      ? sources.slice(0, 12).map((s) => ({ name: s?.name ?? s?.title ?? "", url: s?.url ?? "", snippet: s?.snippet ?? s?.content ?? "", image: s?.image ?? s?.imageUrl ?? s?.thumbnail ?? s?.thumbnailUrl ?? "" }))
      : [],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    let openaiKey = Deno.env.get("OPENAI_API_KEY"); // overridden by the user's own key after settings load
    const linkupKey = Deno.env.get("LINKUP_API_KEY");

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes.user;
    if (!user) return jr({ error: "Unauthorized" }, 401);
    if (!linkupKey) return jr({ error: "LINKUP_API_KEY not configured" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const { linkedin_url } = body as { linkedin_url?: string };

    const { data: settings } = await admin.from("social_writer_settings").select("*").eq("user_id", user.id).maybeSingle();
    // BYO key: prefer the user's own saved OpenAI key, fall back to platform.
    openaiKey = ((settings as any)?.openai_api_key || "").trim() || openaiKey;
    const url = (linkedin_url || settings?.linkedin_url || "").trim();
    if (!url) return jr({ error: "LinkedIn URL required" }, 400);

    const handle = (() => { try { return new URL(url).pathname.split("/").filter(Boolean).pop() ?? ""; } catch { return ""; } })();

    // ── Linkup search 1: profile-focused (name, headline, about, current role) ──
    const profileQuery = `LinkedIn profile ${url} — full name, current job title and company, headline, about/bio, location, country, number of followers, number of connections, years of experience, expertise areas, skills, target audience. Use the public LinkedIn page and any other public web sources (company site, press, conference bios, podcasts).`;
    const profileSearch = await linkupSearch(linkupKey, profileQuery, "deep", true);

    // ── Linkup search 2: posts & writing style ──
    const postsQuery = `Recent public LinkedIn posts and articles authored by the person at ${url} (handle: ${handle}). Return the actual post text excerpts when available, the topics they post about, post format (short hooks, long-form, listicles), tone and writing style.`;
    const postsSearch = await linkupSearch(linkupKey, postsQuery, "deep").catch((e) => ({ answer: `(posts search failed: ${e.message})`, sources: [] as any[] }));
    const followerCount = extractFollowerCount(profileSearch.answer, ...profileSearch.sources.map((s) => `${s.name}\n${s.snippet}`));
    const avatarUrl = firstString(...profileSearch.sources.map((s) => s.image));

    if (!profileSearch.answer && !postsSearch.answer) {
      return jr({ error: "Linkup returned no usable data for this LinkedIn URL." }, 422);
    }

    // ── AI summarization grounded strictly in Linkup output ──
    let about_me = "";
    let career_summary = "";
    let expertise = "";
    let target_audience = "";
    let writing_samples = "";
    let fullName = "";
    let company = "";
    let headline = "";
    let location = "";

    if (openaiKey) {
      const prompt = `You are extracting a LinkedIn persona using ONLY the WEB CONTEXT below (sourced via Linkup public web search). Strict rules:
- Do NOT invent any fact. If a field is not clearly supported by the WEB CONTEXT, return an empty string.
- Use first person ("I") for narrative fields.
- No filler ("passionate", "versatile", "various roles", etc.).
- For writing_samples: include up to 3 short verbatim excerpts from the person's own LinkedIn posts found in WEB CONTEXT (1–3 sentences each, separated by a blank line). Empty string if none.

Return JSON with keys: full_name, headline, company, location, about_me (1–3 sentences), career_summary (one short paragraph from real roles), expertise (comma-separated areas/skills), target_audience (who they speak to; empty if unclear), writing_samples (verbatim post excerpts; empty if none).

WEB CONTEXT — PROFILE SEARCH:
${profileSearch.answer.slice(0, 6000)}

WEB CONTEXT — POSTS SEARCH:
${postsSearch.answer.slice(0, 6000)}`;

      try {
        const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
          }),
        });
        if (aiRes.ok) {
          const j = await aiRes.json();
          const parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? "{}");
          fullName = (parsed.full_name ?? "").toString().trim();
          headline = (parsed.headline ?? "").toString().trim();
          company = (parsed.company ?? "").toString().trim();
          location = (parsed.location ?? "").toString().trim();
          about_me = (parsed.about_me ?? "").toString().trim();
          career_summary = (parsed.career_summary ?? "").toString().trim();
          expertise = (parsed.expertise ?? "").toString().trim();
          target_audience = (parsed.target_audience ?? "").toString().trim();
          writing_samples = (parsed.writing_samples ?? "").toString().trim();
        } else {
          console.warn("AI gateway non-OK:", aiRes.status, (await aiRes.text()).slice(0, 300));
        }
      } catch (e) { console.warn("AI summarize error:", e); }
    }

    // Save to writer settings — don't overwrite user edits with empty strings.
    const updates: Record<string, any> = {
      user_id: user.id,
      linkedin_url: url,
      last_self_analyzed_at: new Date().toISOString(),
    };
    if (about_me) updates.about_me = about_me;
    if (career_summary) updates.career_summary = career_summary;
    if (expertise) updates.expertise = expertise;
    if (target_audience) updates.target_audience = target_audience;
    if (writing_samples && !settings?.writing_samples) updates.writing_samples = writing_samples;

    if (settings) {
      await admin.from("social_writer_settings").update(updates).eq("user_id", user.id);
    } else {
      await admin.from("social_writer_settings").insert(updates);
    }

    // Upsert "self" profile in social_profiles
    const username = handle;
    const { data: existingSelf } = await admin.from("social_profiles").select("id").eq("user_id", user.id).eq("is_self", true).maybeSingle();
    let selfProfileId = existingSelf?.id ?? null;
    const profilePatch: Record<string, any> = { profile_url: url, username, is_self: true, active: true };
    if (fullName) profilePatch.display_name = fullName;
    if (company) profilePatch.company = company;
    if (location) profilePatch.location = location;
    if (headline) profilePatch.title = headline;
    if (about_me) profilePatch.info_summary = about_me;
    if (followerCount != null) { profilePatch.num_followers = followerCount; profilePatch.followers = followerCount; }
    if (avatarUrl) profilePatch.avatar_url = avatarUrl;

    if (selfProfileId) {
      await admin.from("social_profiles").update(profilePatch).eq("id", selfProfileId);
    } else {
      const { data: created } = await admin.from("social_profiles")
        .insert({ ...profilePatch, user_id: user.id, scrape_cadence: "manual" })
        .select("id").single();
      selfProfileId = created?.id ?? null;
    }

    return jr({
      ok: true,
      self_profile_id: selfProfileId,
      source: "linkup",
      scraped: { fullName, headline, company, location, followers: followerCount, avatarUrl },
      summary: { about_me, career_summary, expertise, target_audience, writing_samples },
      web_context: {
        profile: { answer: profileSearch.answer, sources: profileSearch.sources },
        posts: { answer: postsSearch.answer, sources: postsSearch.sources },
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});