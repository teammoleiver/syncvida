// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Default templates use {{placeholders}} that match the variables substituted in generate-social-post.
const DEFAULT_TEMPLATES: Record<string, { name: string; description: string; prompt: string }> = {
  PPPP: {
    name: "PPPP — Promise, Picture, Proof, Push",
    description: "Bold result-led post. Best for stating a clear outcome with proof.",
    prompt: `ROLE: You are a B2B LinkedIn copywriter writing in the voice of a marketing automation practitioner. Short, punchy sentences. Zero corporate filler.

TASK: Write a LinkedIn post using the PPPP framework.

STRUCTURE (target word counts inside the {{wordLimit}}-word ceiling):
- Promise (15-25 words): A specific bold result. This IS the hook. State the outcome flat.
- Picture (25-40 words): The daily reality of someone who already lives this result. Concrete details.
- Proof (30-50 words): Lead with numbers from the data.
- Push (15-25 words): One direct, low-friction action.

VOICE RULES: Active voice. Avg sentence <15 words. Line breaks every 1-2 sentences. No "Imagine if", "In today's fast-paced world".
HARD CONSTRAINTS: Max {{wordLimit}} words. No emojis, no hashtags, no labels. Forbidden: {{banned}}

Idea: {{idea}}
Significance: {{significance}}
Data: {{data}}

OUTPUT: Just the post.`,
  },
  BAB: {
    name: "BAB — Before, After, Bridge",
    description: "Pain → outcome → how-to.",
    prompt: `ROLE: You are a B2B LinkedIn copywriter who has actually solved the problem.

TASK: Write a LinkedIn post using the BAB framework.

STRUCTURE (within {{wordLimit}}-word ceiling):
- Before (35-50 words): Vivid current pain.
- After (35-50 words): Specific new state. Real metrics if data supports.
- Bridge (35-50 words): How to get there. Specific steps.

HARD CONSTRAINTS: Max {{wordLimit}} words. No emojis, hashtags, labels. Forbidden: {{banned}}

Idea: {{idea}}
Description: {{description}}
Implications: {{implications}}

OUTPUT: Just the post.`,
  },
  CIII: {
    name: "CIII — Connect, Inform, Inspire, Interact",
    description: "Conversation-starter.",
    prompt: `ROLE: You are a B2B LinkedIn copywriter who sparks real conversation.

TASK: Write a LinkedIn post using CIII.

STRUCTURE (within {{wordLimit}}-word ceiling):
- Connect (20-30 words): A shared reality peers feel.
- Inform (35-55 words): The substantive shift. Use the data.
- Inspire (25-40 words): Reframe as career opportunity.
- Interact (15-25 words): One open-ended question. Banned: "Thoughts?", "Agree?".

HARD CONSTRAINTS: Max {{wordLimit}} words. No emojis, hashtags, labels. Forbidden: {{banned}}

Idea: {{idea}}
Data: {{data}}
Implications: {{implications}}

OUTPUT: Just the post.`,
  },
  AICPBSAWR: {
    name: "AICPBSAWR — Authority Compressed",
    description: "5 functional beats.",
    prompt: `ROLE: You are a B2B LinkedIn copywriter writing high-conviction posts.

TASK: Compress AICPBSAWR into 5 beats within {{wordLimit}} words.
- Attention (10-15): Pattern interrupt.
- Interest+Proof (40-55): Why now + data.
- Benefit (25-35): Concrete reader win.
- Scarcity (20-30): Cost of ignoring.
- Action (15-20): One instruction + restate.

HARD CONSTRAINTS: Max {{wordLimit}} words. No emojis, hashtags, labels. Forbidden: {{banned}}

Idea: {{idea}}
Significance: {{significance}}
Data: {{data}}
Implications: {{implications}}

OUTPUT: Just the post.`,
  },
  Contrarian: {
    name: "Contrarian Take",
    description: "Pick a fight with consensus.",
    prompt: `ROLE: B2B LinkedIn contrarian, evidence-backed.

STRUCTURE (within {{wordLimit}} words):
- Hook (12-20): State consensus, then reject it.
- Why consensus is wrong (40-60): Show flaw with data.
- What's actually true (40-60): Contrarian position with proof.
- Soft close (15-25): Stake-in-the-ground statement (NOT a question).

HARD CONSTRAINTS: Max {{wordLimit}} words. No emojis, hashtags, labels. Forbidden: {{banned}}

Idea: {{idea}}
Significance: {{significance}}
Data: {{data}}

OUTPUT: Just the post.`,
  },
  BuildInPublic: {
    name: "Build-in-Public / Process Snapshot",
    description: "Show your real work.",
    prompt: `ROLE: Hands-on operator showing real work.

STRUCTURE (within {{wordLimit}} words):
- Concrete first line (10-18): What was built/tested.
- The setup (30-50): What you were trying to do.
- The insight (50-70): Specific mechanism.
- Takeaway (10-20): Transferable lesson.

HARD CONSTRAINTS: Max {{wordLimit}} words. No emojis, hashtags, labels. Forbidden: {{banned}}

Idea: {{idea}}
Description: {{description}}
Data: {{data}}
Implications: {{implications}}

OUTPUT: Just the post.`,
  },
  Listicle: {
    name: "Numbered Insights / Listicle",
    description: "Most-saved format.",
    prompt: `ROLE: Practitioner sharing earned lessons.

STRUCTURE (within {{wordLimit}} words):
- Hook (10-18): Specific frame. NOT "Here are 5 tips".
- The list (110-130 across 3-5 items): number + insight + why-it-matters per item.
- Optional close (0-10).

HARD CONSTRAINTS: Max {{wordLimit}} words. 3-5 items only. No emojis, hashtags, labels (numbers 1,2,3 fine). Forbidden: {{banned}}

Idea: {{idea}}
Significance: {{significance}}
Data: {{data}}
Implications: {{implications}}

OUTPUT: Just the post.`,
  },
  PersonalExperience: {
    name: "Personal Experience — Humanized Story",
    description: "Share a real moment, feeling, or lesson in your own voice.",
    prompt: `ROLE: You are ghostwriting a personal LinkedIn post for a real human. The tone is warm, reflective, and grounded — like talking to a friend, not lecturing an audience. You are NOT a marketer. You are NOT writing a "thought-leadership" piece. You are helping someone share a moment from their life.

TASK: Write ONE personal post within {{wordLimit}} words.

STRUCTURE (loose — feel matters more than format):
- Opening (1 short line): A grounded, specific moment. Where you were, what you saw, what you felt. NOT a question. NOT a stat. NOT "Today I learned…".
- Middle (the bulk): Tell the small story. Concrete sensory details over abstractions. Show the thought as it arrived, not as a polished conclusion. It is OK to wander a little.
- Quiet close (1-2 lines): A small honest takeaway. No "What about you?", no CTA, no advice for "leaders", no question to drive comments. Just land it.

HARD RULES — break any of these and the post fails:
- First person, present-tense where natural. Contractions ("I'm", "it's", "didn't"). Short sentences mixed with one longer one.
- NO buzzwords: synergy, leverage, ecosystem, journey, mindset shift, unlock, harness, navigate, embrace, dive deep, game-changer, transformative, paradigm.
- NO LinkedIn-ese openers: "In today's world", "Building for the future", "As I reflect on this", "Let's…", "Here's the thing", "I've been thinking about", "Recently I had the opportunity".
- NO grand claims about "the future of X", "the next generation", "we as leaders", "systems that scale". Stay small and personal.
- NO advice or 3-step frameworks. NO bullet lists. NO emojis. NO hashtags. NO labels.
- Avoid AI tells: balanced "not just X but Y" constructions, smooth tricolons ("clarity, purpose, and intention"), aphoristic closings.
- If the author shared notes, build the post AROUND those exact details — names, places, feelings they mentioned. Do not generalize them away.
- Forbidden: {{banned}}

Idea / moment: {{idea}}
Why it matters to me: {{significance}}
What I noticed / details: {{description}}

OUTPUT: Just the post — no preamble, no headers.`,
  },
};

async function callOpenAI(systemPrompt: string, userPrompt: string, model: string, key?: string) {
  if (!key) throw new Error("No OpenAI key available. Add your own in Settings → AI API.");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }] }),
  });
  if (res.status === 429) throw new Error("rate_limited");
  if (res.status === 402) throw new Error("payment_required");
  const d = await res.json();
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${JSON.stringify(d)}`);
  return d.choices?.[0]?.message?.content ?? "";
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
    const body = await req.json().catch(() => ({}));
    const action = (body as any).action || "list";

    if (action === "list") {
      const { data: settings } = await admin.from("social_writer_settings").select("framework_prompts").eq("user_id", user.id).maybeSingle();
      const overrides = settings?.framework_prompts ?? {};
      const out = Object.entries(DEFAULT_TEMPLATES).map(([id, def]) => ({
        id, name: def.name, description: def.description,
        default_prompt: def.prompt,
        custom_prompt: overrides[id] ?? null,
        is_custom: !!overrides[id],
      }));
      return new Response(JSON.stringify({ frameworks: out }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "suggest") {
      const { framework_id } = body as any;
      const def = DEFAULT_TEMPLATES[framework_id];
      if (!def) return new Response(JSON.stringify({ error: "unknown framework" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      // Pull the user's top-engagement scraped posts as voice/network reference.
      const { data: posts } = await admin.from("social_posts")
        .select("author,company,post_text,likes,comments,shares,posted_at")
        .eq("user_id", user.id)
        .not("post_text", "is", null)
        .order("posted_at", { ascending: false })
        .limit(120);

      const top = (posts ?? [])
        .map((p) => ({ ...p, eng: (p.likes || 0) + 2 * (p.comments || 0) + 3 * (p.shares || 0) }))
        .sort((a, b) => b.eng - a.eng)
        .slice(0, 25);

      const reference = top.map((p, i) => `[${i}] (${p.eng}eng) ${p.author}@${p.company || "—"}: ${(p.post_text || "").slice(0, 350)}`).join("\n");

      const { data: settings } = await admin.from("social_writer_settings").select("*").eq("user_id", user.id).maybeSingle();
      const currentPrompt = settings?.framework_prompts?.[framework_id] ?? def.prompt;

      const sysP = `You are a senior B2B LinkedIn copywriting coach. You improve prompt templates so the resulting posts sound like the highest-performing voices in the user's actual network.`;
      const userP = `Improve the prompt template below for the "${def.name}" framework.

Reference: top-engagement posts from the user's tracked LinkedIn network. Mimic their tone, sentence rhythm, hook patterns, opener style, line-break cadence, and contrarian angles WITHOUT copying any specific words.

CURRENT TEMPLATE (must keep all {{placeholders}} intact: {{idea}} {{significance}} {{data}} {{description}} {{implications}} {{banned}} {{wordLimit}}):
---
${currentPrompt}
---

REFERENCE POSTS:
${reference || "(no scraped posts yet)"}

Return JSON ONLY:
{"improved_prompt":"...","change_summary":"3-5 bullets explaining what you changed and why, grounded in the reference posts"}`;

      // BYO key: prefer the user's own saved OpenAI key, fall back to platform.
      const __openaiKey = ((settings as any)?.openai_api_key || "").trim() || Deno.env.get("OPENAI_API_KEY");
      const text = await callOpenAI(sysP, userP, settings?.openai_model || "gpt-4o-mini", __openaiKey);
      const match = text.match(/\{[\s\S]*\}/);
      let parsed: any = {};
      try { parsed = JSON.parse(match?.[0] ?? "{}"); } catch { /* */ }
      return new Response(JSON.stringify({
        framework_id,
        improved_prompt: parsed.improved_prompt ?? null,
        change_summary: parsed.change_summary ?? null,
        sample_size: top.length,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "save") {
      const { framework_id, prompt } = body as any;
      if (!DEFAULT_TEMPLATES[framework_id]) return new Response(JSON.stringify({ error: "unknown framework" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: settings } = await admin.from("social_writer_settings").select("*").eq("user_id", user.id).maybeSingle();
      const next = { ...(settings?.framework_prompts ?? {}) };
      if (prompt && prompt.trim()) next[framework_id] = prompt;
      else delete next[framework_id]; // empty = revert to default

      if (settings) {
        await admin.from("social_writer_settings").update({ framework_prompts: next }).eq("user_id", user.id);
      } else {
        await admin.from("social_writer_settings").insert({ user_id: user.id, framework_prompts: next });
      }
      return new Response(JSON.stringify({ ok: true, is_custom: !!next[framework_id] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("framework-prompts:", e);
    const msg = String(e?.message ?? e);
    const status = msg.includes("rate_limited") ? 429 : msg.includes("payment_required") ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});