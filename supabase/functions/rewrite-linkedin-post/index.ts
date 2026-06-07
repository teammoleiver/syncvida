import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OUTPUT_RULES = `Output rules:
- Return ONLY the rewritten post body. No preamble, no "Here is the rewrite:", no explanation.
- Preserve LinkedIn-friendly formatting: blank lines between paragraphs, arrows where they belong, hashtags at the end on their own line.
- Don't fabricate specific numbers if the source has placeholders — keep them as placeholders.`;

/**
 * Build the system prompt for THIS user — their name + self-described voice/
 * persona from their writer settings. Never hardcodes a specific person, so
 * every account's posts are rewritten in their own voice (not the app author's).
 */
function buildSystemPrompt(authorName: string, settings: any): string {
  const name = (authorName || "the author").trim();
  if (settings?.custom_system_prompt?.trim()) {
    const voice = settings?.voice_notes ? `\n\nVoice notes: ${settings.voice_notes}` : "";
    return `${settings.custom_system_prompt.trim()}${voice}\n\n${OUTPUT_RULES}`;
  }
  const persona: string[] = [];
  if (settings?.about_me) persona.push(`About them: ${settings.about_me}`);
  if (settings?.career_summary) persona.push(`Career: ${settings.career_summary}`);
  if (settings?.expertise) persona.push(`Expertise: ${settings.expertise}`);
  if (settings?.target_audience) persona.push(`Audience: ${settings.target_audience}`);
  if (settings?.voice_notes) persona.push(`Voice notes: ${settings.voice_notes}`);
  if (settings?.writing_samples) persona.push(`Writing samples to mimic:\n${String(settings.writing_samples).slice(0, 1500)}`);
  const personaBlock = persona.length ? `\n\nAuthor context (ground the rewrite in this — never invent facts):\n${persona.join("\n")}` : "";
  return `You are rewriting LinkedIn posts for ${name}. Write in their authentic voice — practitioner, not consultant; sharp and specific; concrete numbers and real detail; short paragraphs (often single-line), em-dashes, arrows (→) for lists; no corporate filler or "thrilled to announce" energy; close with a question, hook, or sharp line.${personaBlock}\n\n${OUTPUT_RULES}`;
}

const STYLE_MAP: Record<string, string> = {
  punchier: "Make it punchier — shorter sentences, sharper hook, harder ending. Cut filler.",
  contrarian: "Make it more contrarian — open with a stronger counter-position. Lean into the unpopular take.",
  story: "Restructure it as a personal story with a clear narrative arc — setup, tension, resolution, takeaway.",
  framework: "Restructure it as a teachable framework — name the principle, list the steps, show the example.",
  carousel: "Convert it to a LinkedIn carousel outline — 6-8 slides, one idea per slide, with hook slide first and CTA slide last.",
  casual: "Make it more casual and conversational — like talking to a friend in DMs, less polished.",
};

function buildInstruction(p: any): string {
  const { mode, customText, instruction, newTopic, keywords, style } = p;
  switch (mode) {
    case "custom":
      return `Apply this instruction to the LinkedIn post: "${customText ?? instruction ?? ""}". Keep the author's voice and the tools/context already present in the post. Don't break the post's core argument unless the instruction explicitly asks you to.`;
    case "topic":
      return `Refocus this LinkedIn post so its main subject becomes: "${newTopic ?? ""}". Keep the author's voice. Keep roughly the same length and structure. Keep hashtags relevant to the new topic.`;
    case "remove":
      return `Rewrite this LinkedIn post WITHOUT mentioning any of these terms: ${(keywords ?? []).map((k: string) => `"${k}"`).join(", ")}. Find natural substitutes or restructure sentences. Keep the post's core argument, voice, and structure.`;
    case "rewrite":
      return STYLE_MAP[style] ?? STYLE_MAP.punchier;
    case "shorter":
      return "Rewrite this LinkedIn post making it ~40% shorter. Keep the strongest line, the hook, and one CTA. Cut everything else. Keep the author's voice.";
    case "longer":
      return "Expand this LinkedIn post by ~40%. Add one concrete example with numbers, and one practitioner detail. Keep the author's voice. Don't pad — add substance.";
    case "hook":
      return "Rewrite ONLY the first 1-2 lines of this LinkedIn post to create a stronger hook. Keep the rest of the post identical. The hook should stop the scroll — concrete, specific, slightly contrarian. No 'Did you know' or 'Here's the thing' templates. Return the full post with the new hook on top.";
    case "proof":
      return "Rewrite this LinkedIn post to add concrete proof. Add at least one real-feeling number (with units), one named tool or method, and one specific outcome. Don't fabricate facts that contradict what's there — replace vague claims with specific ones. Keep length roughly the same.";
    case "less-corporate":
      return "Rewrite this LinkedIn post to strip ALL corporate filler. No 'thrilled to announce', 'excited to share', 'in today's landscape', 'leverage', 'synergy', 'unlock value'. Replace any abstract phrasing with concrete, plain operator language. Make it feel like a Slack message from a smart friend. Keep the core point.";
    case "polish":
      return "Lightly polish this LinkedIn post. ONLY fix: grammar, spacing, awkward sentence flow, missing line breaks, inconsistent dashes. Do NOT change the structure, argument, voice, hook, ending, or any specific numbers/tools mentioned. If nothing needs fixing, return it unchanged.";
    case "translate-es":
      return "Rewrite this LinkedIn post in Spanish. Not a translation — a cultural rewrite for a Spanish-speaking B2B audience (Iberia + LATAM). Lead with social proof and certainty, not urgency. Adapt tone, structure, and any culture-specific references. Keep the core argument intact. Keep hashtags in English where they're industry-standard, in Spanish where natural.";
    case "translate-ar":
      return "Rewrite this LinkedIn post in Arabic. Not a translation — a cultural rewrite for a B2B Arab audience (MENA). Lead with context (the why) before the offer (the what). Adapt tone, structure, and any culture-specific references. Keep the core argument intact. Keep hashtags in English where they're industry-standard.";
    default:
      return "Lightly polish this LinkedIn post.";
  }
}

function stripWrapping(s: string): string {
  let out = s.trim();
  if (out.startsWith('"""') && out.endsWith('"""')) out = out.slice(3, -3).trim();
  else if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("“") && out.endsWith("”"))) out = out.slice(1, -1).trim();
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
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

    const payload = await req.json();
    const { postBody } = payload;
    if (!postBody?.trim()) {
      return new Response(JSON.stringify({ error: "postBody is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (postBody.length > 10000) {
      return new Response(JSON.stringify({ error: "postBody too large (max 10000 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userInstruction = buildInstruction(payload);
    const avoid: string[] = Array.isArray(payload.avoid) ? payload.avoid.filter((x: any) => typeof x === "string" && x.trim()) : [];
    const avoidBlock = avoid.length
      ? `\n\nThe user has REJECTED past posts for these reasons — make sure this rewrite does NOT repeat them:\n- ${avoid.join("\n- ")}`
      : "";
    const userMessage = `${userInstruction}${avoidBlock}\n\n--- ORIGINAL POST ---\n${postBody}`;

    // Bring-your-own keys + per-user persona: load this user's keys AND their
    // self-described voice so the rewrite is in THEIR voice, not the app author's.
    const { data: aiSettings } = await userClient
      .from("social_writer_settings")
      .select("anthropic_api_key, openai_api_key, custom_system_prompt, voice_notes, about_me, career_summary, expertise, target_audience, writing_samples")
      .eq("user_id", userRes.user.id)
      .maybeSingle();
    const ANTHROPIC_API_KEY = (aiSettings?.anthropic_api_key || "").trim() || Deno.env.get("ANTHROPIC_API_KEY");
    const OPENAI_API_KEY = (aiSettings?.openai_api_key || "").trim() || Deno.env.get("OPENAI_API_KEY");

    // The signed-in user's display name (profiles → auth metadata → email).
    const { data: prof } = await userClient.from("profiles").select("full_name, name").eq("user_id", userRes.user.id).maybeSingle();
    const meta = (userRes.user.user_metadata ?? {}) as Record<string, any>;
    const authorName = ((prof as any)?.full_name || (prof as any)?.name || meta.full_name || meta.name
      || (userRes.user.email ? userRes.user.email.split("@")[0] : "")).trim();
    const SYSTEM_PROMPT = buildSystemPrompt(authorName, aiSettings);

    let rewrite = "";

    if (ANTHROPIC_API_KEY) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        console.error("Anthropic error:", r.status, t);
        return new Response(JSON.stringify({ error: `Claude error: ${r.status}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const j = await r.json();
      rewrite = j?.content?.[0]?.text ?? "";
    } else if (OPENAI_API_KEY) {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
        }),
      });
      if (r.status === 429) return new Response(JSON.stringify({ error: "Rate limit, try again." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (r.status === 402) return new Response(JSON.stringify({ error: "OpenAI credits exhausted. Add funds to your OpenAI account." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (!r.ok) {
        const t = await r.text();
        console.error("AI gateway error:", r.status, t);
        return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const j = await r.json();
      rewrite = j?.choices?.[0]?.message?.content ?? "";
    } else {
      return new Response(JSON.stringify({ error: "No AI key configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ rewrite: stripWrapping(rewrite) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("rewrite-linkedin-post error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});