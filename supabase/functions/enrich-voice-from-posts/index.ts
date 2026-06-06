// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Keep these in sync with framework-prompts/index.ts DEFAULT_TEMPLATES
const FRAMEWORKS: { id: string; name: string; description: string }[] = [
  { id: "PPPP", name: "PPPP — Promise, Picture, Proof, Push", description: "Bold result-led post." },
  { id: "BAB", name: "BAB — Before, After, Bridge", description: "Pain → outcome → how-to." },
  { id: "CIII", name: "CIII — Connect, Inform, Inspire, Interact", description: "Conversation-starter." },
  { id: "AICPBSAWR", name: "AICPBSAWR — Authority Compressed", description: "5 functional beats." },
  { id: "Contrarian", name: "Contrarian Take", description: "Pick a fight with consensus." },
  { id: "BuildInPublic", name: "Build-in-Public / Process Snapshot", description: "Show your real work." },
  { id: "Listicle", name: "Numbered Insights / Listicle", description: "Most-saved format." },
];

const PLACEHOLDERS = ["{{idea}}", "{{significance}}", "{{data}}", "{{description}}", "{{implications}}", "{{banned}}", "{{wordLimit}}"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    let lovableKey = Deno.env.get("OPENAI_API_KEY"); // overridden by the user's own key after settings load

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes.user;
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!lovableKey) return new Response(JSON.stringify({ error: "OPENAI_API_KEY missing" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(supabaseUrl, serviceKey);

    // Find self profile and pull recent posts
    const { data: self } = await admin.from("social_profiles").select("id").eq("user_id", user.id).eq("is_self", true).maybeSingle();
    if (!self?.id) return new Response(JSON.stringify({ error: "No self profile yet — run 'Analyze my LinkedIn' first." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: posts } = await admin.from("social_posts")
      .select("post_text, likes, comments, shares, posted_at")
      .eq("user_id", user.id).eq("profile_id", self.id)
      .order("posted_at", { ascending: false })
      .limit(50);

    const usable = (posts ?? []).filter((p: any) => (p.post_text ?? "").trim().length > 30);
    if (usable.length === 0) {
      return new Response(JSON.stringify({ error: "No posts available yet — run 'Scrape my last 50 posts' first." }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load existing settings so we MERGE rather than overwrite
    const { data: settings } = await admin.from("social_writer_settings").select("*").eq("user_id", user.id).maybeSingle();
    // BYO key: prefer the user's own saved OpenAI key, fall back to platform.
    lovableKey = ((settings as any)?.openai_api_key || "").trim() || lovableKey;

    const sample = usable.slice(0, 25).map((p: any, i: number) =>
      `--- Post ${i + 1} (likes:${p.likes ?? 0} comments:${p.comments ?? 0}) ---\n${(p.post_text ?? "").slice(0, 1200)}`
    ).join("\n\n");

    // ── STEP 1: Refine voice profile + generate personalized Writer system prompt ──
    const voicePrompt = `You will refine a LinkedIn author's "voice profile" AND generate a personalized Writer system prompt, using ONLY the posts below. Never invent.

Existing voice (may be empty):
${JSON.stringify({
  about_me: settings?.about_me ?? "",
  career_summary: settings?.career_summary ?? "",
  expertise: settings?.expertise ?? "",
  target_audience: settings?.target_audience ?? "",
  voice_notes: settings?.voice_notes ?? "",
}, null, 2)}

Real posts (most recent first):
${sample.slice(0, 16000)}

Return JSON with keys:
- about_me: 2-3 first-person sentences. Keep it grounded in topics the author ACTUALLY talks about in the posts. If existing about_me already fits, return it unchanged.
- career_summary: one short paragraph in first person. Only mention companies/roles if they appear in the posts. Otherwise, return existing value or empty string.
- expertise: comma-separated topics ACTUALLY discussed across posts (max 12). Empty if unclear.
- target_audience: who the posts seem to address (e.g. "founders", "data engineers"). Empty if unclear.
- voice_traits: comma-separated style descriptors observed in posts (e.g. "short punchy lines, frequent questions, uses emojis sparingly").
- writing_samples: pick 3 of the highest-engagement posts verbatim joined by "\n\n---\n\n".
- custom_system_prompt: a complete Writer system prompt (180-280 words) that captures THIS author's voice. Format:
    "ROLE: You are a LinkedIn copywriter writing in the EXACT voice of [first-person identity grounded in about_me/career_summary/expertise].
     AUDIENCE: [target_audience].
     VOICE: [3-6 concrete style rules pulled from voice_traits — sentence length, hook patterns, emoji/hashtag usage, line-break cadence, opener style, signature phrases].
     DO: [3-4 things THIS author actually does in their posts].
     DON'T: [3-4 things THIS author never does — no generic filler, banned phrases observed].
     OUTPUT: Just the post."
    Make it specific and concrete. No filler. This will be the master persona used by all writers.

Rules: no generic filler ("versatile skill set", "passionate professional", "exploring opportunities"). If a key cannot be supported by the posts, return empty string.`;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: voicePrompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      return new Response(JSON.stringify({ error: `AI ${aiRes.status}: ${t.slice(0, 300)}` }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const j = await aiRes.json();
    const parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? "{}");

    const updates: Record<string, any> = { user_id: user.id, last_voice_enriched_at: new Date().toISOString() };
    if (typeof parsed.about_me === "string" && parsed.about_me.trim()) updates.about_me = parsed.about_me.trim();
    if (typeof parsed.career_summary === "string" && parsed.career_summary.trim()) updates.career_summary = parsed.career_summary.trim();
    if (typeof parsed.expertise === "string" && parsed.expertise.trim()) updates.expertise = parsed.expertise.trim();
    if (typeof parsed.target_audience === "string" && parsed.target_audience.trim()) updates.target_audience = parsed.target_audience.trim();
    if (typeof parsed.writing_samples === "string" && parsed.writing_samples.trim()) updates.writing_samples = parsed.writing_samples.trim();
    if (typeof parsed.custom_system_prompt === "string" && parsed.custom_system_prompt.trim()) updates.custom_system_prompt = parsed.custom_system_prompt.trim();
    if (typeof parsed.voice_traits === "string" && parsed.voice_traits.trim()) updates.voice_notes = parsed.voice_traits.trim();

    // ── STEP 2: Rewrite ALL 7 framework prompts in this author's voice ──
    const personaForFrameworks = updates.custom_system_prompt ?? settings?.custom_system_prompt ?? "";
    const voiceTraits = updates.voice_notes ?? settings?.voice_notes ?? "";
    const webCtx = (settings as any)?.reference_web_context ?? "";
    let framework_prompts: Record<string, string> = { ...(settings?.framework_prompts ?? {}) };
    let frameworksRewritten = 0;

    if (personaForFrameworks) {
      const fwPrompt = `Rewrite the 7 LinkedIn framework prompt templates so they ALL use the WRITER PERSONA below as their ROLE/voice while keeping their distinct STRUCTURE intact.

WRITER PERSONA (use as the ROLE block at the top of every template):
${personaForFrameworks}

VOICE TRAITS (must shape style rules in every template):
${voiceTraits || "(none)"}

COMPETITIVE / TOPICAL WEB CONTEXT (use to ground topics & angles; do not copy verbatim):
${(webCtx || "(none)").slice(0, 3000)}

TOP-PERFORMING POSTS (style reference — mimic rhythm/openers/cadence, do NOT copy words):
${sample.slice(0, 10000)}

CRITICAL RULES:
1. EVERY template MUST keep these placeholders intact and unmodified where they appear: ${PLACEHOLDERS.join(" ")}.
2. Keep each framework's unique STRUCTURE (PPPP keeps Promise/Picture/Proof/Push beats; BAB keeps Before/After/Bridge; etc.).
3. Replace generic ROLE lines with the WRITER PERSONA's voice. Adapt VOICE RULES to match the author's actual habits (sentence length, openers, emoji/hashtag policy from the reference posts).
4. End every template with: OUTPUT: Just the post.
5. No generic filler. No "passionate", "versatile", "exploring".

Return JSON with shape: { "PPPP": "...", "BAB": "...", "CIII": "...", "AICPBSAWR": "...", "Contrarian": "...", "BuildInPublic": "...", "Listicle": "..." }

Framework specs (preserve their structures):
- PPPP: Promise (15-25w hook stating outcome), Picture (25-40w concrete daily reality), Proof (30-50w with numbers from {{data}}), Push (15-25w one direct CTA). Use {{idea}} {{significance}} {{data}}.
- BAB: Before (35-50w pain), After (35-50w new state with metrics if {{data}}), Bridge (35-50w how). Use {{idea}} {{description}} {{implications}}.
- CIII: Connect (20-30w shared reality), Inform (35-55w substantive shift using {{data}}), Inspire (25-40w career reframe), Interact (15-25w open-ended question, ban "Thoughts?"/"Agree?"). Use {{idea}} {{data}} {{implications}}.
- AICPBSAWR: 5 beats — Attention (10-15w), Interest+Proof (40-55w + {{data}}), Benefit (25-35w), Scarcity (20-30w), Action (15-20w). Use {{idea}} {{significance}} {{data}} {{implications}}.
- Contrarian: Hook (12-20w state then reject consensus), Why-wrong (40-60w with {{data}}), Truth (40-60w contrarian position), Soft close (15-25w stake-in-ground, NOT a question). Use {{idea}} {{significance}} {{data}}.
- BuildInPublic: Concrete first line (10-18w), Setup (30-50w), Insight (50-70w specific mechanism), Takeaway (10-20w). Use {{idea}} {{description}} {{data}} {{implications}}.
- Listicle: Hook (10-18w specific frame, NOT "Here are 5 tips"), List (110-130w across 3-5 items: number + insight + why), Optional close (0-10w). Use {{idea}} {{significance}} {{data}} {{implications}}.

Every template MUST end with: "HARD CONSTRAINTS: Max {{wordLimit}} words. No emojis, no hashtags, no labels. Forbidden: {{banned}}" then the input fields then "OUTPUT: Just the post."`;

      try {
        const fwRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: fwPrompt }],
            response_format: { type: "json_object" },
          }),
        });
        if (fwRes.ok) {
          const fwJson = await fwRes.json();
          const fwParsed = JSON.parse(fwJson?.choices?.[0]?.message?.content ?? "{}");
          for (const fw of FRAMEWORKS) {
            const tpl = fwParsed?.[fw.id];
            if (typeof tpl !== "string" || tpl.trim().length < 80) continue;
            // Validate placeholders that the default uses are still present (best-effort).
            const requiredCore = ["{{wordLimit}}", "{{banned}}", "{{idea}}"];
            const missing = requiredCore.filter((p) => !tpl.includes(p));
            if (missing.length) { console.warn(`framework ${fw.id} missing placeholders`, missing); continue; }
            framework_prompts[fw.id] = tpl.trim();
            frameworksRewritten++;
          }
          if (frameworksRewritten > 0) updates.framework_prompts = framework_prompts;
        } else {
          console.warn("framework rewrite non-OK:", fwRes.status, (await fwRes.text()).slice(0, 300));
        }
      } catch (e) { console.warn("framework rewrite error:", e); }
    }

    if (settings) await admin.from("social_writer_settings").update(updates).eq("user_id", user.id);
    else await admin.from("social_writer_settings").insert(updates);

    return new Response(JSON.stringify({
      ok: true,
      used_posts: usable.length,
      summary: parsed,
      frameworks_rewritten: frameworksRewritten,
      generated_system_prompt: !!updates.custom_system_prompt,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});