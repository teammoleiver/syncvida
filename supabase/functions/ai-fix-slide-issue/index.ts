// Targeted rewrite of ONE carousel slide to resolve a specific validation
// issue (e.g. title too long, low continuity, hashtag-only slide). Called
// from the AI Auto-Fill preview dialog so the user can fix issues
// in-place before applying the deck to the canvas.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You are a LinkedIn carousel editor. You receive ONE problematic
slide (and the adjacent slides for context) and must return a fixed version
that resolves the issue while preserving the deck's narrative. Keep the SAME
layout key. Titles ≤ 60 chars, bodies ≤ 140 chars, bullets ≤ 48 chars. Never
output hashtag lists. Return ONLY JSON via the tool call.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const slides = Array.isArray(body.slides) ? body.slides : [];
    const idx = Number(body.slideIndex ?? -1);
    const issueCode = String(body.issueCode ?? "");
    const issueMessage = String(body.issueMessage ?? "");
    const hashtagFirst = Boolean(body.hashtagFirst);
    const hook = String(body.hook ?? "");
    const post = String(body.body ?? "").slice(0, 1500);
    if (idx < 0 || idx >= slides.length) return json({ error: "slideIndex out of range" }, 400);

    const target = slides[idx];
    const prev = slides[idx - 1] ?? null;
    const next = slides[idx + 1] ?? null;

    const userPrompt = [
      `ISSUE: ${issueCode} — ${issueMessage}`,
      hashtagFirst ? "Style: hashtag-first allowed (user opted in)." : "Strip any hashtag-only content.",
      hook ? `Post hook: ${hook}` : "",
      post ? `Post body: ${post}` : "",
      prev ? `Previous slide: ${JSON.stringify(prev)}` : "",
      `Target slide (fix this): ${JSON.stringify(target)}`,
      next ? `Next slide: ${JSON.stringify(next)}` : "",
    ].filter(Boolean).join("\n");

    // BYO key: if the user saved an OpenAI key, call OpenAI directly; otherwise
    // use the platform Lovable gateway (Gemini). Both are OpenAI-compatible.
    const { data: __aikeys } = await supabase.from("social_writer_settings").select("openai_api_key").eq("user_id", user.id).maybeSingle();
    const __userOpenai = ((__aikeys as any)?.openai_api_key || "").trim();
    const AI_ENDPOINT = __userOpenai ? "https://api.openai.com/v1/chat/completions" : "https://ai.gateway.lovable.dev/v1/chat/completions";
    const AI_MODEL = __userOpenai ? "gpt-4o-mini" : "google/gemini-3-flash-preview";
    const apiKey = __userOpenai || Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "No AI key available. Add your own in Social Hub → Settings → AI provider." }, 500);

    const ai = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userPrompt }],
        tools: [{
          type: "function",
          function: {
            name: "emit_fixed_slide",
            description: "Return the corrected slide and a one-line rationale.",
            parameters: {
              type: "object",
              properties: {
                slide: {
                  type: "object",
                  properties: {
                    layout: { type: "string" },
                    eyebrow: { type: "string" },
                    title: { type: "string" },
                    body: { type: "string" },
                    closer: { type: "string" },
                    bullets: { type: "array", items: { type: "string" } },
                    quote: { type: "string" },
                    quoteAuthor: { type: "string" },
                    leftLabel: { type: "string" }, leftItems: { type: "array", items: { type: "string" } },
                    rightLabel: { type: "string" }, rightItems: { type: "array", items: { type: "string" } },
                    ctaPrompt: { type: "string" }, ctaAction: { type: "string" },
                    icon: { type: "string" },
                    drop: { type: "boolean", description: "true if this slide should be removed entirely (e.g. pure hashtag slide)." },
                  },
                  required: ["layout"],
                },
                rationale: { type: "string" },
              },
              required: ["slide"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "emit_fixed_slide" } },
      }),
    });

    if (!ai.ok) {
      const t = await ai.text();
      if (ai.status === 429) return json({ error: "Rate limited." }, 429);
      if (ai.status === 402) return json({ error: "AI credits exhausted." }, 402);
      return json({ error: `AI error: ${t.slice(0, 200)}` }, 500);
    }
    const data = await ai.json();
    const argsStr = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) return json({ error: "AI returned no tool call" }, 500);
    let parsed: any;
    try { parsed = JSON.parse(argsStr); } catch { return json({ error: "Invalid JSON from AI" }, 500); }
    return json({ slide: parsed.slide ?? null, rationale: parsed.rationale ?? null });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}