// AI Auto-Fill for the LinkedIn carousel template.
//
// Given a post (hook + body), the user's brand/voice, and the structural
// template (Saleh's 8-slide library: Cover · Context · Insight · Checklist ·
// Proof · Quote · Comparison · CTA), this function asks Lovable AI to
// rewrite every slide so the copy actually fits the post — not generic
// template filler. It also returns icon hints (lucide names) and a
// suggested accent so the auto-decorator has something to work with.
//
// Learning loop: we load the 5 most recent accepted runs from
// `linkedin_template_fill_memory` for this user as few-shot examples,
// so the model picks up on the user's voice and structure preferences
// over time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a LinkedIn carousel ghostwriter for B2B operators.
You receive a long-form LinkedIn post (hook + body) and you must rewrite it as an
8-slide carousel that follows EXACTLY this structure:
  1. cover       — 1-line hook, 1-line teaser ("Swipe →")
  2. text        — Context / problem framing
  3. text        — Insight / why it matters
  4. bullets     — 5 short numbered playbook steps
  5. text        — Proof / concrete example
  6. quote       — One quotable line + the author name
  7. comparison  — Old way vs New way (4 short items each side)
  8. cta         — Question + follow CTA

Rules:
- Match the author's voice from the post. Keep it specific, no buzzwords.
- EXACTLY 8 slides — never more, never fewer. NEVER add a hashtags slide, a "tags" slide, or any slide whose body is a list of #hashtags. Hashtags do not belong inside the carousel.
- Titles ≤ 60 chars. They must be SHORT punchy phrases, not full sentences. Break a long thought into title + body — never let the title wrap more than 3 lines on a square canvas.
- Bodies ≤ 140 chars, written as 1–2 short sentences. Bullets ≤ 48 chars each.
- NARRATIVE CONTINUITY: slide N must build on slide N-1. Each slide picks up where the last left off — reference the prior idea, then advance it. The deck should read as ONE story, not 8 disconnected posters.
- Cover hook must be punchy (≤ 60 chars), no period at the end.
- The CTA slide is the ONLY place to mention follow/bell. No CTA copy in earlier slides.
- For each slide, also pick ONE lucide-react icon name (PascalCase, like "Target", "Zap", "BarChart3") that visually summarizes the slide.
- Pick ONE accent color key from: teal, coral, lavender, amber, mint.
- Return ONLY valid JSON matching the schema. No prose.`;

type Slide = {
  layout: "cover" | "text" | "bullets" | "quote" | "comparison" | "cta";
  eyebrow?: string;
  title: string;
  body?: string;
  closer?: string;
  bullets?: string[];
  quote?: string;
  quoteAuthor?: string;
  leftLabel?: string; leftItems?: string[];
  rightLabel?: string; rightItems?: string[];
  ctaPrompt?: string; ctaAction?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const hook = String(body.hook ?? "").trim();
    const post = String(body.body ?? "").trim();
    const author = String(body.author ?? "Saleh Seddik").trim();
    const handleShort = String(body.handleShort ?? "Salehseddik").trim();
    const themeKey = String(body.themeKey ?? "figma-template");
    const hashtagFirst = Boolean(body.hashtagFirst);
    if (!hook && !post) return json({ error: "hook or body required" }, 400);

    // Pull recent accepted runs as few-shot examples (learning loop).
    const { data: mem } = await supabase
      .from("linkedin_template_fill_memory")
      .select("post_hook, post_body, slides, icon_hints")
      .eq("user_id", user.id)
      .gte("rating", 0)
      .order("created_at", { ascending: false })
      .limit(3);

    // Brand voice hint.
    const { data: brand } = await supabase
      .from("brand_kits").select("voice, tagline, name, colors")
      .eq("user_id", user.id).maybeSingle();

    const examples = (mem ?? []).map((m: any, i: number) =>
      `### EXAMPLE ${i + 1}\nPost hook: ${m.post_hook ?? ""}\nPost body: ${(m.post_body ?? "").slice(0, 400)}\nAccepted output: ${JSON.stringify({ slides: m.slides, icons: m.icon_hints })}`,
    ).join("\n\n");

    const userPrompt = [
      brand?.voice ? `Author voice: ${brand.voice}` : "",
      brand?.tagline ? `Brand tagline: ${brand.tagline}` : "",
      `Author name: ${author}`,
      `Author handle: @${handleShort}`,
      `Theme: ${themeKey}`,
      hashtagFirst
        ? "STYLE: hashtag-first carousel. The reader expects 1 dedicated hashtag/tag slide near the end (slide 7 or 8). Keep it tasteful: max 6 hashtags, all on-topic."
        : "STYLE: standard. Never produce a hashtag-only slide.",
      `POST HOOK: ${hook}`,
      `POST BODY: ${post}`,
      examples ? `\n${examples}` : "",
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
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "emit_carousel",
            description: "Emit the rewritten 8-slide carousel.",
            parameters: {
              type: "object",
              properties: {
                accent: { type: "string" },
                slides: {
                  type: "array",
                  items: {
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
                      leftLabel: { type: "string" },
                      leftItems: { type: "array", items: { type: "string" } },
                      rightLabel: { type: "string" },
                      rightItems: { type: "array", items: { type: "string" } },
                      ctaPrompt: { type: "string" },
                      ctaAction: { type: "string" },
                      icon: { type: "string" },
                    },
                    required: ["layout", "title"],
                  },
                },
                rationale: { type: "string" },
              },
              required: ["slides"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "emit_carousel" } },
      }),
    });

    if (!ai.ok) {
      const t = await ai.text();
      if (ai.status === 429) return json({ error: "Rate limited. Try again in a minute." }, 429);
      if (ai.status === 402) return json({ error: "AI credits exhausted. Add credits in workspace settings." }, 402);
      return json({ error: `AI error: ${t.slice(0, 300)}` }, 500);
    }
    const aiBody = await ai.json();
    const call = aiBody.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = call?.function?.arguments;
    if (!argsStr) return json({ error: "AI returned no tool call" }, 500);
    let parsed: any;
    try { parsed = JSON.parse(argsStr); } catch { return json({ error: "AI returned invalid JSON" }, 500); }

    const rawSlides: any[] = Array.isArray(parsed.slides) ? parsed.slides : [];
    const accent = typeof parsed.accent === "string" ? parsed.accent : "teal";
    // Drop any hashtag-only / tags slide the model might still emit — unless
    // the user opted in to the hashtag-first style.
    const filtered = hashtagFirst ? rawSlides : rawSlides.filter((s) => !isHashtagSlide(s));
    // Hard-cap to 8 slides to match the template structure.
    const trimmed = filtered.slice(0, 8);
    const slides: Slide[] = trimmed.map((s) => sanitizeSlide(s, author, handleShort, accent));
    const iconHints = trimmed.map((s) => (typeof s.icon === "string" ? s.icon : null));

    // Guard: if AI returned a degenerate deck, fall back to error.
    if (slides.length < 4) return json({ error: "AI returned too few slides — please try again." }, 500);

    return json({ slides, iconHints, rationale: parsed.rationale ?? null, usedMemories: (mem ?? []).length });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function clamp(str: unknown, max: number): string {
  const s = String(str ?? "").trim();
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}

function isHashtagSlide(s: any): boolean {
  const title = String(s?.title ?? "");
  const body = String(s?.body ?? "");
  const eyebrow = String(s?.eyebrow ?? "").toLowerCase();
  const hashCount = (title.match(/#/g)?.length ?? 0) + (body.match(/#/g)?.length ?? 0);
  if (hashCount >= 3) return true;
  if (/hashtag|tags/.test(eyebrow)) return true;
  return false;
}

function sanitizeSlide(s: any, author: string, handle: string, accent: string): Slide {
  const layout = ["cover", "text", "bullets", "quote", "comparison", "cta"].includes(s.layout) ? s.layout : "text";
  const base: Slide = {
    layout,
    eyebrow: clamp(s.eyebrow, 40).toUpperCase() || undefined,
    title: stripHashtags(clamp(s.title, 70)) || "Untitled",
    body: s.body ? stripHashtags(clamp(s.body, 160)) : undefined,
    closer: s.closer ? clamp(s.closer, 40) : "Swipe →",
  } as any;
  (base as any).accent = accent;
  if (layout === "bullets") base.bullets = (Array.isArray(s.bullets) ? s.bullets : []).slice(0, 5).map((b: any) => stripHashtags(clamp(b, 56)));
  if (layout === "quote") {
    base.quote = stripHashtags(clamp(s.quote ?? s.title, 140));
    base.quoteAuthor = clamp(s.quoteAuthor ?? author, 40);
  }
  if (layout === "comparison") {
    base.leftLabel = clamp(s.leftLabel ?? "Before", 24);
    base.rightLabel = clamp(s.rightLabel ?? "After", 24);
    base.leftItems = (Array.isArray(s.leftItems) ? s.leftItems : []).slice(0, 4).map((b: any) => stripHashtags(clamp(b, 48)));
    base.rightItems = (Array.isArray(s.rightItems) ? s.rightItems : []).slice(0, 4).map((b: any) => stripHashtags(clamp(b, 48)));
  }
  if (layout === "cta") {
    base.ctaPrompt = clamp(s.ctaPrompt ?? s.title, 60);
    base.ctaAction = clamp(s.ctaAction ?? `Follow @${handle} for more\nTurn on the bell so you never miss a post`, 200);
    base.quoteAuthor = author;
    base.closer = "DROP A COMMENT · FOLLOW + CONNECT";
  }
  return base;
}

function stripHashtags(s: string): string {
  // Remove "#word" tokens but keep regular text intact.
  return s.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, "$1").replace(/\s{2,}/g, " ").trim();
}