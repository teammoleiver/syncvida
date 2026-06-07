// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FRAMEWORKS: Record<string, { name: string; description: string; prompt: (i: Inputs) => string }> = {
  PPPP: {
    name: "PPPP — Promise, Picture, Proof, Push",
    description: "Bold result-led post. Best for stating a clear outcome with proof.",
    prompt: (i) => `ROLE: You are a B2B LinkedIn copywriter writing in the voice of a marketing automation practitioner. Short, punchy sentences. Zero corporate filler.

TASK: Write a LinkedIn post using the PPPP framework based on the research below.

STRUCTURE (target word counts inside the ${i.wordLimit}-word ceiling):
- Promise (15-25 words): A specific bold result. This IS the hook. State the outcome flat.
- Picture (25-40 words): The daily reality of someone who already lives this result. Concrete details.
- Proof (30-50 words): Lead with numbers from the data. Make it impossible to dismiss.
- Push (15-25 words): One direct, low-friction action.

VOICE RULES: Active voice. Avg sentence <15 words. Line breaks every 1-2 sentences. No "Imagine if", "In today's fast-paced world", "Have you ever".
HARD CONSTRAINTS: Max ${i.wordLimit} words. No emojis, no hashtags, no labels. Forbidden: ${i.banned}

Idea: ${i.idea}
Significance: ${i.significance}
Data: ${i.data}

OUTPUT: Just the post. No preamble.`,
  },
  BAB: {
    name: "BAB — Before, After, Bridge",
    description: "Pain → outcome → how-to. Best when transformation is clear.",
    prompt: (i) => `ROLE: You are a B2B LinkedIn copywriter who has actually solved the problem. Direct, slightly opinionated.

TASK: Write a LinkedIn post using the BAB framework.

STRUCTURE (within ${i.wordLimit}-word ceiling):
- Before (35-50 words): Vivid current pain. First line is a 6-12 word punch capturing the frustration.
- After (35-50 words): Specific new state. Real metrics if data supports.
- Bridge (35-50 words): How to get there. Specific steps/tools/logic.

VOICE RULES: Active voice only. Avg sentence <15 words. Line breaks every 1-2 sentences. No "in this post" framing.
HARD CONSTRAINTS: Max ${i.wordLimit} words. No emojis, hashtags, labels. Forbidden: ${i.banned}

Idea: ${i.idea}
Description: ${i.description}
Implications: ${i.implications}

OUTPUT: Just the post. Nothing else.`,
  },
  CIII: {
    name: "CIII — Connect, Inform, Inspire, Interact",
    description: "Conversation-starter. Best for sparking real comments.",
    prompt: (i) => `ROLE: You are a B2B LinkedIn copywriter who sparks real conversation. Peer-to-peer voice, willing to take a position.

TASK: Write a LinkedIn post using CIII.

STRUCTURE (within ${i.wordLimit}-word ceiling):
- Connect (20-30 words): A shared reality peers feel. "we" or "anyone who" framing. First line is recognition.
- Inform (35-55 words): The substantive shift. Use the data. No "industry is evolving" mush.
- Inspire (25-40 words): Reframe as career opportunity. Specific.
- Interact (15-25 words): One open-ended question demanding a real answer. Banned: "Thoughts?", "Agree?", "What do you think?".

VOICE RULES: Conversational, not casual-dumb. Avg sentence <15 words. Line breaks every 1-2 sentences.
HARD CONSTRAINTS: Max ${i.wordLimit} words. No emojis, hashtags, labels. Forbidden: ${i.banned}

Idea: ${i.idea}
Data: ${i.data}
Implications: ${i.implications}

OUTPUT: Just the post.`,
  },
  AICPBSAWR: {
    name: "AICPBSAWR — Authority Compressed",
    description: "5 functional beats. Best for high-conviction authority posts.",
    prompt: (i) => `ROLE: You are a B2B LinkedIn copywriter writing high-conviction posts. Direct, slightly contrarian, evidence-led.

TASK: Compress AICPBSAWR into 5 beats.

STRUCTURE (within ${i.wordLimit}-word ceiling):
- Attention (10-15 words): Pattern interrupt. Contrarian claim or counter-intuitive stat. First line only.
- Interest+Credibility/Proof (40-55 words): Why this matters NOW + data that proves it. Numbers do the work.
- Benefit (25-35 words): Concrete reader win. Tied to their job.
- Scarcity/Warning (20-30 words): Cost of ignoring. Specific, not generic doom.
- Action/Reiteration (15-20 words): One instruction + restate the takeaway.

VOICE RULES: Active voice. Avg sentence <15 words. Line breaks every 1-2 sentences. Lead with strongest claim.
HARD CONSTRAINTS: Max ${i.wordLimit} words. Hard ceiling. Cut ruthlessly. No emojis, hashtags, labels. Forbidden: ${i.banned}

Idea: ${i.idea}
Significance: ${i.significance}
Data: ${i.data}
Implications: ${i.implications}

OUTPUT: Just the post.`,
  },
  Contrarian: {
    name: "Contrarian Take",
    description: "Pick a fight with consensus. Best when you have data to back it.",
    prompt: (i) => `ROLE: You are a B2B LinkedIn copywriter writing contrarian, evidence-backed posts. Practitioner willing to disagree, not a hot-take farm.

TASK: Take a contrarian position supported by the research.

STRUCTURE (within ${i.wordLimit}-word ceiling):
- Hook (12-20 words): State consensus, then reject it. "Everyone says X. They're wrong." or "Standard advice is X. Data says otherwise."
- Why consensus is wrong (40-60 words): Show the flaw with data.
- What's actually true (40-60 words): Contrarian position with proof.
- Soft close (15-25 words): Stake-in-the-ground statement that invites disagreement. NOT a question.

VOICE RULES: Confident, not arrogant. Specific. Avg sentence <15 words. Active voice. Don't strawman.
HARD CONSTRAINTS: Max ${i.wordLimit} words. No emojis, hashtags, labels. Forbidden: ${i.banned}

Idea: ${i.idea}
Significance: ${i.significance}
Data: ${i.data}

OUTPUT: Just the post.`,
  },
  BuildInPublic: {
    name: "Build-in-Public / Process Snapshot",
    description: "Show your real work. Highest leverage format.",
    prompt: (i) => `ROLE: You are a B2B LinkedIn copywriter writing build-in-public posts. Hands-on operator showing real work, not selling. Specifics over abstraction.

TASK: Share a real process, system, or lesson tied to the idea.

STRUCTURE (within ${i.wordLimit}-word ceiling):
- Concrete first line (10-18 words): What was built/tested/figured out. Specific number, tool, or outcome. NOT "Today I want to share a learning..."
- The setup (30-50 words): What you were trying to do. Real problem, real context.
- The insight (50-70 words): What you learned. Use research+data. Specific mechanism, not "iteration matters".
- One-line takeaway (10-20 words): Transferable lesson in plain language.

VOICE RULES: First-person, present-tense where natural. Avg sentence <15 words. Specific tools/numbers/details. Active voice.
HARD CONSTRAINTS: Max ${i.wordLimit} words. No emojis, hashtags, labels. Forbidden: ${i.banned}

Idea: ${i.idea}
Description: ${i.description}
Data: ${i.data}
Implications: ${i.implications}

OUTPUT: Just the post.`,
  },
  Listicle: {
    name: "Numbered Insights / Listicle",
    description: "Most-saved format. Best for distilled lessons.",
    prompt: (i) => `ROLE: You are a B2B LinkedIn copywriter writing numbered-insight posts. Practitioner sharing earned lessons, not a content farm. Each item specific and non-obvious.

TASK: 3-5 insights drawn from the research.

STRUCTURE (within ${i.wordLimit}-word ceiling):
- Hook line (10-18 words): Specific frame. "5 things I got wrong about X." NOT "Here are 5 tips for marketers."
- The list (110-130 words across 3-5 items): Each = number + one-line insight + one-line "why it matters". Self-contained, specific. 3 strong > 5 weak.
- Optional close (0-10 words): Cut if filler.

VOICE RULES: Each item leads with insight. Avg sentence <15 words. Each item own line break. Active voice. Specifics: tools, numbers, names.
HARD CONSTRAINTS: Max ${i.wordLimit} words total. 3-5 items only. No emojis, hashtags, labels (numbers 1,2,3 are fine). Forbidden: ${i.banned}

Idea: ${i.idea}
Significance: ${i.significance}
Data: ${i.data}
Implications: ${i.implications}

OUTPUT: Just the post.`,
  },
};

interface Inputs {
  idea: string;
  significance: string;
  data: string;
  description: string;
  implications: string;
  banned: string;
  wordLimit: number;
}

async function callAnthropic(systemPrompt: string, userPrompt: string, model: string, key?: string) {
  if (!key) throw new Error("anthropic_not_configured");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 1024, system: systemPrompt, messages: [{ role: "user", content: userPrompt }] }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${JSON.stringify(d)}`);
  return d.content?.[0]?.text ?? "";
}

async function callOpenAI(systemPrompt: string, userPrompt: string, model: string, key?: string) {
  if (!key) throw new Error("openai_not_configured");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }] }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${JSON.stringify(d)}`);
  return d.choices?.[0]?.message?.content ?? "";
}

async function callLovable(systemPrompt: string, userPrompt: string, model: string) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("lovable_not_configured");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }] }),
  });
  if (res.status === 429) throw new Error("rate_limited");
  if (res.status === 402) throw new Error("payment_required");
  const d = await res.json();
  if (!res.ok) throw new Error(`Lovable AI ${res.status}: ${JSON.stringify(d)}`);
  return d.choices?.[0]?.message?.content ?? "";
}

// Task-aware routing: "quality" tasks (post writing) prefer the best writer
// (Claude), "fast" tasks prefer the cheap model (OpenAI). An explicit override
// in settings.ai_task_routing wins; otherwise it auto-picks from available keys.
function pickProvider(settings: any, tier: "quality" | "fast"): string {
  const hasAnthropic = !!((settings?.anthropic_api_key || "").trim() || Deno.env.get("ANTHROPIC_API_KEY"));
  const hasOpenai = !!((settings?.openai_api_key || "").trim() || Deno.env.get("OPENAI_API_KEY"));
  const explicit = settings?.ai_task_routing?.[tier]?.provider;
  if (explicit === "anthropic" && hasAnthropic) return "anthropic";
  if (explicit === "openai" && hasOpenai) return "openai";
  if (tier === "quality") return hasAnthropic ? "anthropic" : "openai";
  return hasOpenai ? "openai" : "anthropic";
}

async function callAIWithFallback(provider: string, settings: any, systemPrompt: string, userPrompt: string) {
  // Prefer the user's own API key (BYO key from settings); fall back to the
  // platform secret so users who leave it blank keep working.
  const anthropicKey = (settings?.anthropic_api_key || "").trim() || Deno.env.get("ANTHROPIC_API_KEY");
  const openaiKey = (settings?.openai_api_key || "").trim() || Deno.env.get("OPENAI_API_KEY");
  const tryOrder = provider === "anthropic" ? ["anthropic", "openai"] : ["openai", "anthropic"];
  let lastErr: any = null;
  for (const p of tryOrder) {
    try {
      if (p === "anthropic") return { provider: p, text: await callAnthropic(systemPrompt, userPrompt, settings?.anthropic_model || "claude-sonnet-4-20250514", anthropicKey) };
      if (p === "openai") return { provider: p, text: await callOpenAI(systemPrompt, userPrompt, settings?.openai_model || "gpt-5-mini", openaiKey) };
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error("all_providers_failed");
}

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
    const body = await req.json();
    const { framework, source_post_id, source_topic_id, idea, significance, data, description, implications, mode } = body as any;

    const { data: settings } = await admin.from("social_writer_settings").select("*").eq("user_id", user.id).maybeSingle();

    let sourceText = "";
    if (source_post_id) {
      const { data: post } = await admin.from("social_posts").select("*").eq("id", source_post_id).eq("user_id", user.id).maybeSingle();
      if (post) sourceText = `Original post by ${post.author ?? "unknown"} (${post.likes} likes, ${post.comments} comments):\n${post.post_text}`;
    }
    if (source_topic_id) {
      const { data: topic } = await admin.from("social_hot_topics").select("*").eq("id", source_topic_id).eq("user_id", user.id).maybeSingle();
      if (topic) sourceText = `Topic: ${topic.title}\nDescription: ${topic.description}`;
    }

    // SUGGEST mode: pick best 2-3 frameworks for this post
    if (mode === "suggest") {
      const sysP = settings?.custom_system_prompt || "You are a senior B2B LinkedIn strategist.";
      const userP = `Given the source content below, recommend the top 2-3 LinkedIn post frameworks (from this exact list: PPPP, BAB, CIII, AICPBSAWR, Contrarian, BuildInPublic, Listicle) that would produce the highest-engagement repost. For each, give a one-sentence reason.

Return JSON: {"suggestions":[{"framework":"BuildInPublic","reason":"..."}]}

SOURCE:
${sourceText || idea}`;
      const result = await callAIWithFallback(pickProvider(settings, "quality"), settings, sysP, userP);
      const match = result.text.match(/\{[\s\S]*\}/);
      let parsed: any = { suggestions: [] };
      try { parsed = JSON.parse(match?.[0] ?? "{}"); } catch { /* ignore */ }
      return new Response(JSON.stringify({ ...parsed, provider: result.provider }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // GENERATE mode: produce one post for the requested framework
    const fw = FRAMEWORKS[framework];
    if (!fw) return new Response(JSON.stringify({ error: `Unknown framework: ${framework}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // If the user has saved a custom prompt for this framework, use it (with the same {{placeholders}}).
    const customPromptTpl: string | undefined = settings?.framework_prompts?.[framework];

    const inputs: Inputs = {
      idea: idea || sourceText || "(no idea provided)",
      significance: significance || "(infer from source)",
      data: data || "(use the engagement metrics from the source if relevant)",
      description: description || sourceText || "",
      implications: implications || "(infer)",
      banned: (settings?.banned_words ?? []).join(", ") || "leverage, synergy, unleash, game-changer, in today's fast-paced world",
      wordLimit: settings?.default_word_limit || 150,
    };

    const personaParts: string[] = [];
    if (settings?.about_me) personaParts.push(`ABOUT ME: ${settings.about_me}`);
    if (settings?.career_summary) personaParts.push(`CAREER: ${settings.career_summary}`);
    if (settings?.expertise) personaParts.push(`EXPERTISE: ${settings.expertise}`);
    if (settings?.target_audience) personaParts.push(`TARGET AUDIENCE: ${settings.target_audience}`);
    if (settings?.goals) personaParts.push(`MY GOALS: ${settings.goals}`);
    if (settings?.writing_samples) personaParts.push(`WRITING SAMPLES (mimic this style):\n${String(settings.writing_samples).slice(0, 2000)}`);
    if ((settings as any)?.reference_web_context) personaParts.push(`COMPETITIVE / TOPICAL WEB CONTEXT (from author's reference websites — use to ground claims, borrow or counter angles, mention recurring topics. Do NOT copy verbatim):\n${String((settings as any).reference_web_context).slice(0, 3500)}`);
    const personaBlock = personaParts.length ? `\n\n--- AUTHOR CONTEXT ---\n${personaParts.join("\n\n")}\n--- END CONTEXT ---` : "";

    const baseSys = (settings?.custom_system_prompt
      ? `${settings.custom_system_prompt}\n\nVoice notes: ${settings.voice_notes ?? ""}`
      : `You write LinkedIn posts that sound like a real practitioner, not an LLM. ${settings?.voice_notes ?? ""}`)
      + personaBlock;

    const userPrompt = customPromptTpl
      ? customPromptTpl
          .replaceAll("{{idea}}", inputs.idea)
          .replaceAll("{{significance}}", inputs.significance)
          .replaceAll("{{data}}", inputs.data)
          .replaceAll("{{description}}", inputs.description)
          .replaceAll("{{implications}}", inputs.implications)
          .replaceAll("{{banned}}", inputs.banned)
          .replaceAll("{{wordLimit}}", String(inputs.wordLimit))
      : fw.prompt(inputs);
    const result = await callAIWithFallback(pickProvider(settings, "quality"), settings, baseSys, userPrompt);
    const text = result.text.trim();

    const { data: draft } = await admin.from("social_generated_drafts").insert({
      user_id: user.id,
      source_post_id: source_post_id ?? null,
      source_topic_id: source_topic_id ?? null,
      framework,
      body: text,
      word_count: text.split(/\s+/).length,
    }).select().single();

    return new Response(JSON.stringify({ draft, provider: result.provider, framework: fw.name }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-social-post:", e);
    const msg = String(e?.message ?? e);
    const status = msg.includes("rate_limited") ? 429 : msg.includes("payment_required") ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
