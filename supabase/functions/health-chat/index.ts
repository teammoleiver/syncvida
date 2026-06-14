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

    const { messages } = await req.json();
    // BYO key: prefer the user's own saved OpenAI key, fall back to platform.
    const { data: settings } = await userClient.from("social_writer_settings")
      .select("openai_api_key, display_name, about_me, career_summary, expertise, target_audience, goals, linkedin_url")
      .eq("user_id", userRes.user.id).maybeSingle();
    const s: any = settings ?? {};
    const OPENAI_API_KEY = ((s.openai_api_key || "").trim()) || Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("No OpenAI key available. Add your own in Settings → AI API.");

    const userContext = [
      s.display_name && `Name: ${s.display_name}`,
      s.about_me && `About: ${s.about_me}`,
      s.career_summary && `Background: ${s.career_summary}`,
      s.expertise && `Expertise: ${s.expertise}`,
      s.target_audience && `Audience: ${s.target_audience}`,
      s.goals && `Goal: ${s.goals}`,
      s.linkedin_url && `LinkedIn: ${s.linkedin_url}`,
    ].filter(Boolean).join("\n") || "(Profile not filled in yet — suggest they complete Settings → Social Hub.)";

    const systemPrompt = `You are the **Instaleadsync Assistant**, an AI copilot inside Instaleadsync (instaleadsync.com) — a LinkedIn intelligence, content-creation and (soon) lead-management platform. You help the user grow their personal brand and turn social activity into opportunities.

What Instaleadsync does, and what you can help with:
- **Social Hub** — track LinkedIn profiles, scrape their posts, an Engagement Feed for drafting comments, Hot Topics & Rewrites, plus Search, YouTube and News/RSS radars.
- **Content Studio & Content Planner** — build a content library, generate posts, and schedule them.
- **Designer** — carousels, post images, and a brand kit.
- **Projects, Tasks & Calendar** — lightweight productivity.
- **Leads / Pre-CRM** — coming soon: turn tracked profiles and engagement into a client pipeline.

Be a sharp, practical copilot. Help with: writing LinkedIn posts and comments in the user's voice, content ideas and angles, planning a content calendar, analysing what tracked profiles are posting about, engagement strategy, repurposing content, and general project/task questions. When you draft posts or comments, write like a real human (no corporate filler, no em-dashes, no hashtags unless asked).

This is NOT a health or medical product — never give health, nutrition, fitness, or medical advice; if asked, gently redirect to what Instaleadsync actually does.

THE USER:
${userContext}

Style: respond in the user's language, use clear markdown, be concise and actionable, and tailor advice to their goal and audience above.`;

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
