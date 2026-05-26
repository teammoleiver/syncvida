import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You write LinkedIn comments on other people's posts on behalf of a B2B GTM marketing automation operator.

Voice:
- Practitioner, peer-to-peer — never fan, never salesy, never "great post!"
- Short (1-3 sentences, ~25-60 words). Two short sentences beats one long one.
- Add ONE concrete idea: a counter-take, a specific tactic, a number, a tool, or a sharp question.
- Reference one specific thing from the post so it doesn't read like a template.
- No emojis unless the original post is heavy on them. No hashtags. No links. No @mentions.
- Sound human, not LLM-flavored. No "Couldn't agree more", "This resonates", "Spot on".

Output rules:
- Return ONLY the comment text. No preamble, no quotes, no explanation.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { post_text, author, tone, instruction } = await req.json();
    if (!post_text?.trim()) {
      return new Response(JSON.stringify({ error: "post_text required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const toneLine = tone && tone !== "default" ? `Tone: ${tone}.` : "";
    const extra = instruction ? `Extra instruction: ${instruction}.` : "";
    const userMsg = `Write a LinkedIn comment for this post${author ? ` by ${author}` : ""}.\n${toneLine}\n${extra}\n\n--- POST ---\n${post_text.slice(0, 4000)}`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: "Rate limit, try again." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (r.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!r.ok) {
      const t = await r.text();
      console.error("AI gateway error", r.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const j = await r.json();
    let comment = j?.choices?.[0]?.message?.content ?? "";
    comment = comment.trim().replace(/^["“]|["”]$/g, "").trim();
    return new Response(JSON.stringify({ comment }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});