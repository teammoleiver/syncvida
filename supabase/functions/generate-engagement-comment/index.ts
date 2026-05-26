import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Default tones (editable per user in Settings) ──
export const DEFAULT_TONES: { id: string; label: string; description: string; prompt: string }[] = [
  { id: "peer-sharp", label: "Peer / sharp", description: "Practitioner, peer-to-peer.",
    prompt: "1 sentence max ~20 words. Land ONE concrete take: a tactic, number, or sharp counterpoint. Sound like a practitioner texting a peer, not a thought leader writing a post." },
  { id: "supportive", label: "Supportive", description: "Warm, additive, one line.",
    prompt: "1 short sentence (max ~18 words). Agree by pointing at the ONE specific thing in the post that lands, and why. No 'love this', no 'great post', no recap." },
  { id: "contrarian", label: "Contrarian", description: "Polite pushback, one line.",
    prompt: "1-2 short sentences, max ~28 words total. Name where you disagree and the reason in plain words. No 'respectfully', no hedging, no essay." },
  { id: "curious", label: "Curious", description: "Light add + a soft question.",
    prompt: "1 short sentence, max ~22 words. Reference one specific thing from the post, then a small natural question. Casual, not interview-style." },
  { id: "question-only", label: "Question only", description: "Just one sharp question.",
    prompt: "Output ONE question only. Max ~18 words. Specific to something in the post (not generic 'thoughts?'). No setup, no preamble, no statement before it." },
  { id: "tactical", label: "Tactical add-on", description: "One concrete tactic.",
    prompt: "1-2 short sentences, max ~28 words. Add ONE specific tactic, tool, or step that extends the post. Concrete and casual, no framing language." },
  { id: "reflective", label: "Reflective", description: "One honest personal line.",
    prompt: "1 short sentence, max ~22 words. Share a small honest reaction the post triggered. First person, plain words, no advice, no question." },
  { id: "funny", label: "Funny / light", description: "Dry one-liner.",
    prompt: "1 short sentence, max ~18 words. One dry, lightly funny line rooted in the post. Not corny, not meme-y, not 'haha'." },
  { id: "expert", label: "Expert nuance", description: "One sharp insider note.",
    prompt: "1-2 short sentences, max ~30 words. Add ONE nuance only someone who's done the work would notice — an edge case, mechanism, or pattern. No jargon dump." },
  { id: "short", label: "Ultra short", description: "Max 10 words.",
    prompt: "Max 10 words total. One punchy line that still says something specific. No greeting, no filler." },
  { id: "story", label: "Mini-story", description: "Two-line micro anecdote.",
    prompt: "2 short sentences, max ~32 words total. Tiny concrete moment from your own work that mirrors the post. Land the point in the second line — no question." },
];

const BASE_SYSTEM = `You write LinkedIn comments on OTHER people's posts on behalf of the user described in the persona block.

Hard rules (apply to every tone, no exceptions):
- Output ONLY the comment text. No preamble, no quotes, no labels, no markdown, no bullet points.
- DEFAULT LENGTH IS SHORT. Most real LinkedIn comments are 1 sentence. Never exceed the word limit set by the tone. If unsure, shorter wins.
- Sound like a busy human typing on their phone — not an AI, not a newsletter, not a thought leader.
- Use plain words. Contractions. Lowercase is fine. One idea per comment, never two.
- Reference one specific thing from the post (a phrase, number, name) so it can't read as a template.
- No emojis (unless the post is emoji-heavy). No hashtags. No links. No @mentions. No em-dashes.
- BANNED phrases/openers: "Couldn't agree more", "This resonates", "Spot on", "Great post", "Love this", "I appreciate", "Thanks for sharing", "This is great", "Well said", "100%", "So true", "Insightful", "Powerful", "Important reminder", "It's easy to", "Critical for", "I've seen that exact", "speaks to", "underscores", "highlights the importance".
- Never explain the post back to the author. Never summarize what they said. Never give unsolicited advice.
- Vary sentence length. Don't start with "I" every time. It's OK to start mid-thought.`;

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

async function callAI(systemPrompt: string, userPrompt: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
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
    const customTones: any[] = Array.isArray(settings?.comment_tones) ? settings!.comment_tones : [];
    const tones = customTones.length ? customTones : DEFAULT_TONES;

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
      const text = await callAI(sys, usr);
      let parsed: any = {};
      try { parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || "{}"); } catch { /* */ }
      const valid = tones.find((t: any) => t.id === parsed.tone_id) ? parsed.tone_id : tones[0].id;
      return new Response(JSON.stringify({ tone_id: valid, reason: parsed.reason || "" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Generate comment (default action) ──
    const post_text = String((body as any).post_text || "");
    const author = (body as any).author;
    const tone_id = (body as any).tone_id || (body as any).tone || tones[0].id;
    const instruction = (body as any).instruction;
    if (!post_text.trim()) return new Response(JSON.stringify({ error: "post_text required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const tone = tones.find((t: any) => t.id === tone_id) || tones[0];
    const sys = `${BASE_SYSTEM}\n\n${personaBlock(settings)}\n\n${tone.prompt}`;
    const usr = `Write a LinkedIn comment for this post${author ? ` by ${author}` : ""}.${instruction ? `\nExtra instruction: ${instruction}.` : ""}\n\n--- POST ---\n${post_text.slice(0, 4000)}`;
    let comment = await callAI(sys, usr);
    comment = comment.replace(/^["“]|["”]$/g, "").trim();
    return new Response(JSON.stringify({ comment, tone_id: tone.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    const msg = String(e?.message ?? "Unknown");
    const status = msg.includes("rate_limited") ? 429 : msg.includes("payment_required") ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});