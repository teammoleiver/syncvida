import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * AI review of a LinkedIn carousel. Judges the deck as a viral-content expert
 * against the LinkedIn visual design system and returns structured, per-slide
 * feedback WITH ready-to-apply fixes. Honors the user's learned "memory" rules
 * so it doesn't re-flag patterns they've already accepted.
 *
 * Accepts an optional `appliedFixes` array of slide numbers (as strings) that
 * have already been corrected — the model will skip those slides and score the
 * deck higher accordingly.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { slides, hook, body, author, memory, appliedFixes, slidesMeta } = await req.json();
    if (!Array.isArray(slides) || slides.length === 0) return json({ error: "No slides provided" }, 400);

    const slideSummaries = slides.map((s: any, i: number) => ({
      n: i + 1,
      layout: s.layout || "text",
      eyebrow: s.eyebrow || "",
      title: s.title || "",
      body: s.body || "",
      bullets: s.bullets || [],
      stat: s.statValue || "",
      quote: s.quote || "",
    }));

    const memoryRules: string[] = Array.isArray(memory) ? memory.filter((m) => typeof m === "string" && m.trim()) : [];
    const memoryBlock = memoryRules.length
      ? `\n\nThe user has ALREADY accepted these preferences/rules from past reviews — apply them and DO NOT flag anything that already complies:\n- ${memoryRules.join("\n- ")}`
      : "";

    const fixedSlides: string[] = Array.isArray(appliedFixes) ? appliedFixes.filter((f) => typeof f === "string" && f.trim()) : [];
    const fixedBlock = fixedSlides.length
      ? `\n\nIMPORTANT: The following slide numbers have ALREADY been corrected by the user: [${fixedSlides.join(", ")}]. Do NOT flag these slides again in slideNotes. Acknowledge their improvement in your verdict/flow and adjust the score accordingly — a deck where all previously flagged slides were fixed should score 15-25 points higher than before.`
      : "";

    const slidesMetaList: any[] = Array.isArray(slidesMeta) ? slidesMeta : [];
    const slidesMetaBlock = slidesMetaList.length
      ? `\n\nSLIDES META (visual/design data):\n${JSON.stringify(slidesMetaList)}`
      : "";

    const systemPrompt = `You are a senior LinkedIn content strategist reviewing a carousel for a B2B / GTM founder. Judge it like a viral-content expert against these rules: a strong scroll-stopping cover hook; ONE clear idea per slide (<=50 words); a logical flow (cover -> build-up -> payoff -> CTA); a closing slide that explicitly asks to FOLLOW and TURN ON THE BELL; consistent voice; no filler or near-empty slides.${memoryBlock}${fixedBlock}${slidesMetaBlock}

Return ONLY valid JSON (no markdown) matching EXACTLY this schema:
{
  "score": <integer 0-100>,
  "verdict": "<one punchy sentence: is this ready to post or not?>",
  "flow": "<2-3 sentences on whether the slides connect and build a narrative, and where it breaks>",
  "slideNotes": [
    {
      "n": <slide number>,
      "severity": "high|medium|low",
      "issue": "<what is weak, in plain words>",
      "reason": "<why this hurts the post — the principle behind it (e.g. 'vague titles kill the scroll-stop')>",
      "suggestion": "<one specific, rewrite-ready fix>",
      "fix": {
        "action": "rewrite | remove | merge",
        "title": "<rewritten slide title (for rewrite/merge), or omit>",
        "body": "<rewritten slide body (for rewrite/merge), or omit>"
      }
    }
  ],
  "designNotes": [
    {
      "n": <slide number>,
      "type": "word-count | logo-clutter | empty-slide | weak-cta | missing-cover",
      "issue": "<plain words>",
      "fix": { "action": "trim | rewrite", "body": "<shortened version if trim>" }
    }
  ],
  "improvements": [ "<3-6 concrete, high-leverage improvements ordered by impact>" ]
}
Rules for slideNotes "fix":
- PREFER "rewrite" — give concrete replacement title/body in the SAME voice, <=50 words for body. This is the default and should be used whenever the slide can be salvaged.
- Use "remove" ONLY for a slide that is truly redundant/empty and adds no value (its content lives elsewhere).
- Use "merge" when a slide should fold into the slide directly above it — provide the combined title/body.
Every slideNote MUST include a "fix" with an "action" so the user can apply it in one click. Only include slideNotes for slides that genuinely need work. Be specific; never generic. No emojis in JSON values.
Also analyze the provided slidesMeta for visual/design issues and populate designNotes:
- word-count: body word count > 40 — flag as too long, provide trimmed version in fix.body (<=40 words)
- logo-clutter: overlayCount >= 4 — flag as too many logos/overlays
- empty-slide: hasContent is false — flag as empty slide
- weak-cta: last slide has no ctaAction or ctaPrompt and body is empty
Do NOT add design notes for slides that pass all checks. Only flag real issues. If no design issues exist, return an empty designNotes array.`;

    const userPrompt = JSON.stringify({
      hook: hook || "",
      body: body || "",
      author: author || "",
      slides: slideSummaries,
      slidesMeta: slidesMetaList.length ? slidesMetaList : undefined,
      appliedFixes: fixedSlides.length ? fixedSlides : undefined,
    });

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) return json({ error: `AI error: ${await res.text()}` }, 500);
    const data = await res.json();
    const review = JSON.parse(data.choices[0].message.content);
    return json({ review }, 200);
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
