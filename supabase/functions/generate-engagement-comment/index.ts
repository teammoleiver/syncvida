import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Default tones (editable per user in Settings) ──
export const DEFAULT_TONES: { id: string; label: string; description: string; prompt: string; max_words: number }[] = [
  { id: "peer-sharp", label: "Peer / sharp", description: "Practitioner, peer-to-peer.", max_words: 20,
    prompt: "1 sentence. Land ONE concrete take, a tactic, a number, or a sharp counterpoint. Sound like a practitioner texting a peer, not a thought leader writing a post." },
  { id: "supportive", label: "Supportive", description: "Warm, additive, one line.", max_words: 18,
    prompt: "1 short sentence. Agree by pointing at the ONE specific phrase or number in the post that lands, and why in 4 to 6 words. No 'love this', no 'great post', no recap." },
  { id: "contrarian", label: "Contrarian", description: "Polite pushback, one line.", max_words: 28,
    prompt: "1-2 short sentences. Name where you disagree and the reason in plain words. No 'respectfully', no hedging, no essay." },
  { id: "curious", label: "Curious", description: "Light add + a soft question.", max_words: 22,
    prompt: "1 short sentence. Reference one specific thing from the post, then a small natural question. Casual, not interview-style." },
  { id: "question-only", label: "Question only", description: "One sharp, specific question.", max_words: 16,
    prompt: "Output ONE question only, nothing else. It MUST quote or reference a specific concrete detail from the post (a number, name, tool, phrase, or claim) so it could not be asked on any other post. No generic 'thoughts?', 'curious to hear', 'what do you think?'. No setup sentence, no greeting, no opinion before the question. End with a question mark. If you cannot find a specific detail, ask about the single most surprising claim in the post." },
  { id: "tactical", label: "Tactical add-on", description: "One concrete tactic.", max_words: 28,
    prompt: "1-2 short sentences. Add ONE specific tactic, tool, or step that extends the post. Concrete and casual, no framing language." },
  { id: "reflective", label: "Reflective", description: "One honest personal line.", max_words: 22,
    prompt: "1 short sentence. Share a small honest reaction the post triggered. First person, plain words, no advice, no question." },
  { id: "funny", label: "Funny / light", description: "Dry one-liner.", max_words: 18,
    prompt: "1 short sentence. One dry, lightly funny line rooted in the post. Not corny, not meme-y, not 'haha'." },
  { id: "expert", label: "Expert nuance", description: "One sharp insider note.", max_words: 30,
    prompt: "1-2 short sentences. Add ONE nuance only someone who's done the work would notice, like an edge case, a mechanism, or a pattern. No jargon dump." },
  { id: "short", label: "Ultra short", description: "Max 10 words.", max_words: 10,
    prompt: "One punchy line that still says something specific. No greeting, no filler." },
  { id: "story", label: "Mini-story", description: "Two-line micro anecdote.", max_words: 32,
    prompt: "2 short sentences. Tiny concrete moment from your own work that mirrors the post. Land the point in the second line, no question." },
];

const BASE_SYSTEM = `You write LinkedIn comments on OTHER people's posts on behalf of the user described in the persona block.

Hard rules (apply to every tone, no exceptions):
- Output ONLY the comment text. No preamble, no quotes, no labels, no markdown, no bullet points, no headers.
- DEFAULT LENGTH IS SHORT. Most real LinkedIn comments are 1 sentence. Never exceed the word limit set by the tone. If unsure, shorter wins.
- Sound like a busy human typing on their phone — not an AI, not a newsletter, not a thought leader.
- Use plain words. Contractions. Lowercase is fine. One idea per comment, never two.
- Reference one specific thing from the post (a phrase, number, name) so it can't read as a template.
- No emojis (unless the post is emoji-heavy). No hashtags. No links. No @mentions. No semicolons.

ZERO-TOLERANCE PUNCTUATION RULES (the #1 AI tell, never break these):
- NEVER use an em-dash (—) or en-dash (–). Use a comma, a period, or split into two sentences instead.
- NEVER use a hyphen as a pause ( - ). Same fix.
- NEVER use curly/smart quotes (" " ' '). Use straight quotes (" ' ) only when actually quoting from the post.
- NEVER use ellipses (…) or "..." for dramatic pause.
- NEVER use a colon to set up a punchline ("the truth: ...", "one thing: ...").
- If you catch yourself writing any of the above, rewrite the sentence without it before responding.

ANTI-AI PHRASING (banned, these are dead giveaways):
- Banned words/phrases anywhere in the output: "delve", "delves", "leverage", "leveraging", "unlock", "unlocks", "unleash", "navigate the", "in today's", "in the world of", "the landscape of", "the realm of", "tapestry", "testament", "journey", "ever-evolving", "fast-paced", "game-changer", "game changer", "paradigm", "synergy", "holistic", "robust", "seamless", "seamlessly", "harness", "elevate", "empower", "supercharge", "crucial", "pivotal", "vital", "essential to", "key to", "the key is", "at the end of the day", "it's important to note", "it's worth noting", "remember that", "keep in mind", "moreover", "furthermore", "additionally", "however,", "nevertheless", "indeed", "truly", "deeply", "profoundly", "resonates with me", "this really hits", "spot-on", "well put", "couldn't have said it better".
- Banned sentence shapes: "Not just X, but Y.", "It's not about X, it's about Y.", "X isn't just Y, it's Z.", "More than X, it's Y.", any tricolon ("X, Y, and Z that...").
- No rhetorical questions used as filler ("Right?", "Isn't it?", "Don't you think?").

Anti-repetition / variety rules (CRITICAL — real humans don't sound like a script):
- NEVER open with the same word/structure twice in a session. Rotate openers: a verb, a noun, a number, a fragment, a question, "yeah", "honestly", a name from the post, a quoted phrase. Avoid starting with "I" more than 1 in 3 comments.
- BANNED openers (never start a comment with any of these or a paraphrase): "I", "I've", "I'm", "We", "This", "That", "Such", "Really", "Big +", "+1", "Yes,", "Absolutely", "Couldn't agree more", "This resonates", "Spot on", "Great post", "Love this", "I appreciate", "Thanks for sharing", "This is great", "Well said", "100%", "So true", "Insightful", "Powerful", "Important reminder", "It's easy to", "Critical for", "I've seen that exact", "speaks to", "underscores", "highlights the importance".
- Vary sentence structure. Mix: fragments, statements, single questions, "X, then Y" patterns. Do NOT use the same template across tones.
- Never explain the post back to the author. Never summarize what they said. Never give unsolicited advice unless the tone explicitly asks for it.

Sound like a real person: small imperfections are fine (lowercase start, sentence fragment, casual contraction). Polished, balanced, "professional blogger" prose is the AI tell you must avoid.`;

function personaBlock(s: any): string {
  if (!s) return "Persona: B2B operator. (No profile filled in yet.)";
  const bits = [
    s.about_me && `About: ${s.about_me}`,
    s.career_summary && `Background: ${s.career_summary}`,
    s.expertise && `Expertise: ${s.expertise}`,
    s.target_audience && `Audience: ${s.target_audience}`,
    s.voice_notes && `Voice notes: ${s.voice_notes}`,
  ].filter(Boolean).join("\n");
  return `Persona (write AS this person, in first person, never about them):\n${bits || "(empty)"}`;
}

// Enforce a hard word cap on the model's output. Cuts cleanly at sentence boundaries when possible.
function enforceWordLimit(text: string, maxWords: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ").filter(Boolean);
  if (words.length <= maxWords) return cleaned;
  // Try to cut at the last sentence boundary within the cap
  const slice = words.slice(0, maxWords).join(" ");
  const lastPunct = Math.max(slice.lastIndexOf("."), slice.lastIndexOf("?"), slice.lastIndexOf("!"));
  if (lastPunct > slice.length * 0.6) return slice.slice(0, lastPunct + 1);
  // Otherwise truncate and add a sensible terminal punctuation
  const trimmed = slice.replace(/[,;:\-\s]+$/, "");
  if (/[.?!]$/.test(trimmed)) return trimmed;
  return trimmed + (cleaned.includes("?") && !cleaned.includes(".") ? "?" : ".");
}

// Strip AI-tell punctuation the model may still slip in (em/en dash, ellipses, smart quotes, hyphen-as-pause).
function scrubAiTells(text: string): string {
  let t = text;
  // em/en dash with optional surrounding spaces -> ", "
  t = t.replace(/\s*[—–]\s*/g, ", ");
  // " - " used as a pause -> ", "
  t = t.replace(/\s+-\s+/g, ", ");
  // ellipses
  t = t.replace(/\s*(?:…|\.{3,})\s*/g, ". ");
  // smart quotes -> straight
  t = t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  // collapse double punctuation/spaces
  t = t.replace(/,\s*,/g, ",").replace(/\s{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
  return t;
}

async function callAI(systemPrompt: string, userPrompt: string, openaiKey?: string) {
  // Always OpenAI: the user's saved key, else the platform OpenAI key.
  const endpoint = "https://api.openai.com/v1/chat/completions";
  const model = "gpt-4o-mini";
  const apiKey = (openaiKey || "").trim() || Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("No OpenAI key available. Add your own in Settings → AI API.");
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (r.status === 429) throw new Error("rate_limited");
  if (r.status === 402) throw new Error("payment_required");
  if (!r.ok) {
    const t = await r.text();
    console.error("AI gateway error", r.status, t);
    throw new Error("AI gateway error");
  }
  const j = await r.json();
  return String(j?.choices?.[0]?.message?.content ?? "").trim();
}

serve(async (req) => {
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

    const body = await req.json().catch(() => ({} as any));
    const action = (body as any).action || "generate";

    const { data: settings } = await admin.from("social_writer_settings").select("*").eq("user_id", user.id).maybeSingle();
    const __openaiKey = ((settings as any)?.openai_api_key || "").trim(); // BYO: routes callAI to the user's OpenAI when set
    const customTones: any[] = Array.isArray(settings?.comment_tones) ? settings!.comment_tones : [];
    // Merge: if user has custom tones, use them but fill missing max_words from defaults (or fall back to 30).
    const tones = (customTones.length ? customTones : DEFAULT_TONES).map((t: any) => {
      if (typeof t.max_words === "number") return t;
      const d = DEFAULT_TONES.find((x) => x.id === t.id);
      return { ...t, max_words: d?.max_words ?? 30 };
    });

    // ── List tones ──
    if (action === "list_tones") {
      return new Response(JSON.stringify({ tones, defaults: DEFAULT_TONES, is_custom: customTones.length > 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Save tones (or reset by passing empty array / null) ──
    if (action === "save_tones") {
      const next = Array.isArray((body as any).tones) ? (body as any).tones : null;
      const payload = next && next.length ? next : null; // null = reset to defaults
      if (settings) {
        await admin.from("social_writer_settings").update({ comment_tones: payload }).eq("user_id", user.id);
      } else {
        await admin.from("social_writer_settings").insert({ user_id: user.id, comment_tones: payload });
      }
      return new Response(JSON.stringify({ ok: true, count: payload?.length ?? 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Suggest best tone for a given post ──
    if (action === "suggest_tone") {
      const post_text = String((body as any).post_text || "").slice(0, 4000);
      if (!post_text.trim()) return new Response(JSON.stringify({ error: "post_text required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const list = tones.map((t: any) => `- ${t.id}: ${t.label} — ${t.description || ""}`).join("\n");
      const sys = `You pick the best LinkedIn comment tone for a given post. Return STRICT JSON only: {"tone_id":"<id>","reason":"<1 short sentence>"}. tone_id MUST be exactly one of the provided ids.`;
      const usr = `${personaBlock(settings)}\n\nAvailable tones:\n${list}\n\nPost to comment on:\n---\n${post_text}\n---\n\nReturn JSON only.`;
      const text = await callAI(sys, usr, __openaiKey);
      let parsed: any = {};
      try { parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || "{}"); } catch { /* */ }
      const valid = tones.find((t: any) => t.id === parsed.tone_id) ? parsed.tone_id : tones[0].id;
      return new Response(JSON.stringify({ tone_id: valid, reason: parsed.reason || "" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Preview: generate ONE short example per tone for a given post ──
    if (action === "preview_all") {
      const post_text = String((body as any).post_text || "").slice(0, 4000);
      if (!post_text.trim()) return new Response(JSON.stringify({ error: "post_text required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const author = (body as any).author;
      const results = await Promise.all(tones.map(async (t: any) => {
        try {
          const sys = `${BASE_SYSTEM}\n\n${personaBlock(settings)}\n\nTONE INSTRUCTIONS:\n${t.prompt}\n\nHARD LIMIT: ${t.max_words} words maximum. If you exceed it, the output is rejected.`;
          const usr = `Write a LinkedIn comment for this post${author ? ` by ${author}` : ""}.\n\n--- POST ---\n${post_text}`;
          let c = await callAI(sys, usr, __openaiKey);
          c = c.replace(/^["“]|["”]$/g, "").trim();
          c = scrubAiTells(c);
          c = enforceWordLimit(c, t.max_words);
          return { tone_id: t.id, label: t.label, comment: c };
        } catch (err: any) {
          return { tone_id: t.id, label: t.label, comment: "", error: String(err?.message || "failed") };
        }
      }));
      return new Response(JSON.stringify({ previews: results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Generate comment (default action) ──
    const post_text = String((body as any).post_text || "");
    const author = (body as any).author;
    const tone_id = (body as any).tone_id || (body as any).tone || tones[0].id;
    const instruction = (body as any).instruction;
    // "original" → reply in the post's own language (and return an English translation).
    const language = (body as any).language === "original" ? "original" : "english";
    if (!post_text.trim()) return new Response(JSON.stringify({ error: "post_text required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const tone = tones.find((t: any) => t.id === tone_id) || tones[0];
    const langRule = language === "original"
      ? `\n\nLANGUAGE: Detect the language of the POST and write your comment in that SAME language, sounding native and natural. Do NOT write in English unless the post itself is English.`
      : `\n\nLANGUAGE: Write the comment in English.`;
    const sys = `${BASE_SYSTEM}\n\n${personaBlock(settings)}\n\nTONE INSTRUCTIONS:\n${tone.prompt}\n\nHARD LIMIT: ${tone.max_words} words maximum. Going over is a failure — count your words before responding.${langRule}`;
    const usr = `Write a LinkedIn comment for this post${author ? ` by ${author}` : ""}.${instruction ? `\nExtra instruction: ${instruction}.` : ""}\n\n--- POST ---\n${post_text.slice(0, 4000)}`;
    let comment = await callAI(sys, usr, __openaiKey);
    comment = comment.replace(/^["“]|["”]$/g, "").trim();
    comment = scrubAiTells(comment);
    comment = enforceWordLimit(comment, tone.max_words);

    // When replying in the post's language, also return an English translation
    // (display-only — the user comments with `comment`, not this).
    let translation: string | null = null;
    if (language === "original") {
      try {
        const tSys = "Translate the user's short social-media comment into natural, plain English. Return ONLY the English translation — no quotes, no notes, no preamble. If it is already English, return it unchanged.";
        translation = (await callAI(tSys, comment, __openaiKey)).replace(/^["“]|["”]$/g, "").trim();
        if (translation && translation.toLowerCase() === comment.toLowerCase()) translation = null; // already English
      } catch { translation = null; }
    }
    return new Response(JSON.stringify({ comment, tone_id: tone.id, translation, language }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    const msg = String(e?.message ?? "Unknown");
    const status = msg.includes("rate_limited") ? 429 : msg.includes("payment_required") ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});