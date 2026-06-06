import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Require authenticated user — prevents anonymous abuse of AI credits.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, healthContext } = await req.json();
    // BYO key: prefer the user's own saved OpenAI key, fall back to platform.
    const { data: __aikeys } = await userClient.from("social_writer_settings").select("openai_api_key").eq("user_id", userRes.user.id).maybeSingle();
    const OPENAI_API_KEY = ((__aikeys as any)?.openai_api_key || "").trim() || Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("No OpenAI key available. Add your own in Social Hub → Settings → AI provider.");

    const systemPrompt = `You are Syncvida — a personal AI health intelligence system. You have FULL ACCESS to the user's complete, real-time health data from ALL modules: sleep, nutrition, exercise, fasting, weight, blood tests, and daily habits. ALL these data points are interconnected — they form ONE health system. Syncvida (syncvida.io) is the unified health platform that synchronizes all health data.

The user's actual health data context is provided below. Use ONLY this data — do not assume or fabricate any health information.

${healthContext || "No health data available yet. Encourage the user to start logging their data."}

CROSS-MODULE ANALYSIS RULES:
1. Always analyze how modules affect each other (sleep→exercise, nutrition→liver, exercise→weight, sleep→nutrition)
2. If sleep quality is low, suggest how it affects exercise recovery, weight, and overall health
3. If exercise is lacking, explain impact on sleep quality, weight, and overall wellness
4. If hydration is low, connect to sleep disruption, exercise performance, and organ function
5. For liver questions: connect to nutrition choices, exercise patterns, and sleep recovery
6. For weight questions: connect to sleep, exercise frequency, fasting compliance, and calorie intake
7. For mood questions: analyze sleep quality, exercise endorphins, nutrition quality, and fasting state
8. Always provide ACTIONABLE suggestions that consider ALL modules together
9. Always check if user is in fasting window before discussing food
10. Recommend consulting their doctor for medical concerns
11. Respond in the same language the user writes in
12. Be warm, honest, and motivational
13. Use markdown formatting for clarity
14. When giving overall health assessment, score each area and show how they interconnect`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
