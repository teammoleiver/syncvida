import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Default tones (editable per user in Settings) ──
export const DEFAULT_TONES: { id: string; label: string; description: string; prompt: string }[] = [
  { id: "peer-sharp", label: "Peer / sharp", description: "Practitioner, peer-to-peer, never fan or salesy.",
    prompt: "Tone: peer-to-peer practitioner. 1-3 sharp sentences. Add ONE concrete idea: counter-take, tactic, number, tool, or sharp question. No fanboy language, no 'great post', no 'this resonates'." },
  { id: "supportive", label: "Supportive", description: "Warm, additive, builds on the author's point.",
    prompt: "Tone: supportive and additive. 1-2 short sentences. Validate the specific point with a concrete example from your own experience. No empty cheerleading." },
  { id: "contrarian", label: "Contrarian", description: "Politely pushes back with evidence.",
    prompt: "Tone: respectful contrarian. 2-3 sentences. Name where you disagree, give the concrete reason or counter-example. Stay collegial, never dismissive." },
  { id: "curious", label: "Curious question", description: "Asks one sharp, useful question.",
    prompt: "Tone: genuinely curious. 1-2 sentences ending with ONE sharp question that opens new ground. Skip generic 'what do you think?' questions." },
  { id: "tactical", label: "Tactical add-on", description: "Adds a concrete tactic, tool, or step.",
    prompt: "Tone: tactical operator. 1-3 sentences. Add ONE specific tactic, tool, prompt, or step that extends what the author said. Be concrete, no fluff." },
  { id: "reflective", label: "Reflective", description: "Slower, thoughtful, personal lens.",
    prompt: "Tone: reflective and grounded. 2-3 short sentences. Share a small, honest reflection the post triggered. First person, no advice, no question." },
  { id: "funny", label: "Funny / light", description: "Playful one-liner with substance underneath.",
    prompt: "Tone: dry, lightly funny. 1-2 sentences. One joke or playful observation rooted in the post, then one genuine point. Never cringe or meme-y." },
  { id: "expert", label: "Authoritative expert", description: "Speaks from depth and experience.",
    prompt: "Tone: senior practitioner. 2-3 sentences. Add a nuance only someone with deep experience would notice. Cite a mechanism, edge case, or pattern. No hedging." },
  { id: "short", label: "Ultra short", description: "Max 12 words. One punchy line.",
    prompt: "Tone: ultra-short. Maximum 12 words total. One punchy line that lands a real point or question. No filler, no greeting." },
  { id: "story", label: "Mini-story", description: "Tiny anecdote that mirrors the post.",
    prompt: "Tone: micro-story. 3-4 short sentences. Tell a tiny, concrete anecdote from your own work that mirrors the post's theme. End on the lesson, not a question." },
];

const BASE_SYSTEM = `You write LinkedIn comments on OTHER people's posts on behalf of the user described in the persona block.

Hard rules (apply to every tone):
- Output ONLY the comment text. No preamble, no quotes, no labels, no markdown.
- No emojis unless the original post is heavy on them. No hashtags. No links. No @mentions.
- Reference at least one specific thing from the post so it doesn't read like a template.
- Never use: "Couldn't agree more", "This resonates", "Spot on", "Great post", "Love this".
- Sound human, not LLM-flavored. Vary sentence length. Contractions are fine.`;

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