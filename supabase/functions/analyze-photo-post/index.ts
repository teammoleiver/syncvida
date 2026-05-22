// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE);

    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Unauthorized" }, 401);
    const { data: userRes } = await admin.auth.getUser(jwt);
    const user = userRes?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_KEY) return json({ error: "OPENAI_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const mode: "suggest" | "write" = body?.mode === "write" ? "write" : "suggest";
    const image_url: string | null = body?.image_url ?? null;
    const user_note: string = String(body?.user_note ?? "").slice(0, 2000);
    const hook: string = String(body?.hook ?? "").slice(0, 500);
    const platform: string = String(body?.platform ?? "linkedin");
    const current_draft: string = String(body?.current_draft ?? "").slice(0, 4000);
    const framework: string = String(body?.framework ?? "PersonalExperience");
    if (!image_url && !user_note && !current_draft) {
      return json({ error: "image_url, user_note or current_draft required" }, 400);
    }

    const [{ data: settings }, { data: profile }] = await Promise.all([
      admin.from("social_writer_settings").select("*").eq("user_id", user.id).maybeSingle(),
      admin.from("profiles").select("full_name, name, headline").eq("user_id", user.id).maybeSingle(),
    ]);

    const personaParts: string[] = [];
    const authorName =
      (profile as any)?.full_name || (profile as any)?.name || user.email?.split("@")[0] || "the author";
    personaParts.push(`AUTHOR NAME: ${authorName}`);
    if ((profile as any)?.headline) personaParts.push(`HEADLINE: ${(profile as any).headline}`);
    if ((settings as any)?.about_me) personaParts.push(`ABOUT ME: ${(settings as any).about_me}`);
    if ((settings as any)?.career_summary) personaParts.push(`CAREER: ${(settings as any).career_summary}`);
    if ((settings as any)?.expertise) personaParts.push(`EXPERTISE: ${(settings as any).expertise}`);
    if ((settings as any)?.target_audience) personaParts.push(`AUDIENCE: ${(settings as any).target_audience}`);
    if ((settings as any)?.goals) personaParts.push(`GOALS: ${(settings as any).goals}`);
    if ((settings as any)?.voice_notes) personaParts.push(`VOICE NOTES: ${(settings as any).voice_notes}`);
    if ((settings as any)?.writing_samples) {
      personaParts.push(`WRITING SAMPLES (mimic this style):\n${String((settings as any).writing_samples).slice(0, 1800)}`);
    }
    const bannedWords: string[] = (settings as any)?.banned_words ?? [];
    const wordLimit: number = (settings as any)?.default_word_limit || 180;
    const userFrameworkPrompt: string | null =
      ((settings as any)?.framework_prompts ?? {})[framework] ?? null;

    const personaBlock = personaParts.length ? `\n--- AUTHOR CONTEXT ---\n${personaParts.join("\n")}\n--- END ---\n` : "";

    // Default frameworks used when the user hasn't customized one for the photo flow.
    const FRAMEWORK_DEFAULTS: Record<string, string> = {
      PersonalExperience: `Write a warm, first-person personal post about this moment. Small story, sensory detail, one honest takeaway. NO advice, NO frameworks, NO "leaders / future / journey", NO closing question. Contractions OK. Sound like a real human texting a thoughtful friend, not a LinkedIn thought-leader.`,
      PPPP: `Use PPPP: Promise (specific outcome as hook) → Picture (daily reality) → Proof (numbers/specifics) → Push (one low-friction action).`,
      BAB: `Use BAB: Before (vivid pain) → After (specific new state) → Bridge (how to get there, concrete steps).`,
      CIII: `Use CIII: Connect (shared reality) → Inform (the shift) → Inspire (reframe as opportunity) → Interact (one real question, never "Thoughts?").`,
      AICPBSAWR: `Compress AICPBSAWR into 5 beats: Attention → Interest+Proof → Benefit → Scarcity → Action.`,
      Contrarian: `Contrarian take: state consensus, reject it, prove it wrong with specifics, land a stake-in-the-ground close (no question).`,
      BuildInPublic: `Build-in-Public: concrete first line of what was built/tested, the setup, the insight with a specific mechanism, transferable takeaway.`,
      Listicle: `Numbered insights (3-5 items): specific frame, then number + insight + why-it-matters per item. NOT "Here are 5 tips".`,
    };
    const frameworkBlock =
      userFrameworkPrompt ||
      FRAMEWORK_DEFAULTS[framework] ||
      FRAMEWORK_DEFAULTS.PersonalExperience;

    const ANTI_AI_RULES = `
ANTI-AI VOICE RULES — these are non-negotiable, the post must NOT sound like ChatGPT:
- Sound like a human typing on their phone. Contractions. Short sentences mixed with one longer one.
- BANNED openers: "In today's...", "Building for the future...", "As I reflect...", "Let me share...", "Here's the thing...", "Recently I had the opportunity...".
- BANNED words/phrases: synergy, leverage, ecosystem, journey, mindset shift, unlock, harness, navigate, embrace, dive deep, game-changer, transformative, paradigm, "intention", "grounded in", "pave the way", "for us and the next generation", "let's create", "thought leadership".
- BANNED structures: "It's not just X — it's Y", smooth tricolons ("clarity, purpose, and intention"), aphoristic moralizing endings.
- NO closing question / CTA / "What about you?" unless the framework explicitly says so.
- NO advice to "leaders" or abstract pronouncements about "the future of X". Stay personal and specific.
- Use the author's own details from their note. Do NOT generalize them away.
- NO emojis. NO hashtags. NO labels like "Hook:" or "Takeaway:".`;

    const systemPrompt = mode === "suggest"
      ? `You are a senior social media copy coach helping ${authorName} brainstorm a post.
You will see a photo the author wants to post about. Be specific and grounded — describe what is ACTUALLY in the photo (people, setting, objects, mood, activity). Do NOT invent facts or names.
Return STRICT JSON only (no markdown), with this shape:
{
  "description": "1-2 sentence factual description of what's visible",
  "themes": ["3-5 short angle/theme ideas tied to the photo + their context"],
  "hooks": ["3 punchy opening hooks the author could use (<=18 words each)"],
  "questions": ["2 short questions to help the author decide what to say"]
}
${personaBlock}`
      : `You are ghostwriting ONE ${platform} post for ${authorName} based on their photo and notes.

CHOSEN STYLE: ${framework}
STYLE INSTRUCTIONS:
${frameworkBlock}

${ANTI_AI_RULES}

HARD LIMITS:
- Max ${wordLimit} words.
${bannedWords.length ? `- Also forbidden (author's own banned list): ${bannedWords.join(", ")}` : ""}
- If an existing draft is provided, REFINE it — keep the author's wording where it's already good; only fix what sounds AI-generated or off-voice.
- Reference what is actually in the photo and in the author's notes. Do not invent details.

Return STRICT JSON only (no markdown):
{
  "hook": "first line of the post",
  "body": "the rest of the post (newline-separated from hook)"
}
${personaBlock}`;

    const userContent: any[] = [];
    const noteBlock = [
      hook ? `Existing hook idea: ${hook}` : "",
      user_note ? `Author's notes about this moment:\n${user_note}` : "",
      current_draft ? `Existing draft to refine:\n${current_draft}` : "",
      `Target platform: ${platform}`,
    ].filter(Boolean).join("\n\n");
    userContent.push({ type: "text", text: noteBlock || "Help me write a post about this photo." });
    if (image_url) userContent.push({ type: "image_url", image_url: { url: image_url } });

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.7,
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error("openai vision error", r.status, t);
      return json({ error: `OpenAI ${r.status}: ${t.slice(0, 300)}` }, 500);
    }
    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = { raw: content }; }

    return json({ mode, ...parsed });
  } catch (e) {
    console.error("analyze-photo-post fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
