import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an expert gym/exercise training plan parser. The input is raw text from a PDF training plan in any language (often Spanish, English, Portuguese, French, etc).

Extract every training session and every exercise. Translate ALL exercise names and notes to clean, concise English. Return ONLY a valid JSON object with this exact shape (no markdown, no commentary):

{
  "planName": "string",
  "trainer": "string or null",
  "startDate": "YYYY-MM-DD or null",
  "endDate": "YYYY-MM-DD or null",
  "durationWeeks": number or null,
  "frequency": "string or null",
  "goal": "string or null",
  "summary": "1-2 sentence overview in English",
  "days": [
    {
      "day": "Session label in English (e.g. 'Upper Body 1', 'Lower Body 1', 'Push Day')",
      "focus": "Muscle group focus or null",
      "exercises": [
        {
          "name": "Exercise name in English",
          "sets": number or null,
          "reps": number or string or null,
          "duration_min": number or null,
          "rest_min": number or null,
          "notes": "Short technique tip in English or null (max 140 chars)"
        }
      ]
    }
  ]
}

Rules:
- Identify each distinct session/workout day, even if labeled "Tren Superior", "Tren inferior", "Día 1", "Push", etc.
- Convert rest like "3 mín." → 3, "1 min" → 1
- "REPETICIONES" = reps; "CONJUNTOS" = sets; "DURACIÓN" + "mín" = duration_min
- Include EVERY exercise listed, do not skip any.
- The "days" array MUST contain at least one session if any exercise is found.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { pdfText } = await req.json();
    if (!pdfText || typeof pdfText !== "string" || pdfText.trim().length < 50) {
      return new Response(JSON.stringify({ error: "pdfText is required and must contain readable content" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const truncated = pdfText.slice(0, 18000);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Parse this gym/exercise plan PDF text and return the structured JSON:\n\n${truncated}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "OpenAI credits exhausted. Please add funds to your OpenAI account." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error", details: t }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");

    let plan;
    try {
      plan = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Could not parse JSON from AI response");
      plan = JSON.parse(match[0]);
    }

    return new Response(JSON.stringify({ plan }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-exercise-plan error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});