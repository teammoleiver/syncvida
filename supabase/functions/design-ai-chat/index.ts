import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const designId: string = body.designId;
    const slideIndex: number = Number(body.slideIndex ?? 0);
    const message: string = String(body.message ?? "").trim();
    const selectedIds: string[] = Array.isArray(body.selectedIds) ? body.selectedIds : [];
    if (!designId || !message) return json({ error: "designId and message required" }, 400);

    const { data: design, error: dErr } = await supabase
      .from("designs").select("*").eq("id", designId).eq("user_id", user.id).maybeSingle();
    if (dErr) return json({ error: dErr.message }, 500);
    if (!design) return json({ error: "Design not found" }, 404);

    const { data: brand } = await supabase.from("brand_kits").select("*").eq("user_id", user.id).maybeSingle();

    // BYO key: prefer the user's own saved OpenAI key, fall back to platform.
    const { data: __aikeys } = await supabase.from("social_writer_settings").select("openai_api_key").eq("user_id", user.id).maybeSingle();
    const apiKey = ((__aikeys as any)?.openai_api_key || "").trim() || Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "No OpenAI key available. Add your own in Social Hub → Settings → AI provider." }, 500);

    const slide = (design.slides as any[])[slideIndex] ?? (design.slides as any[])[0];
    const compactSlide = slide ? {
      bg: slide.bg,
      elements: (slide.elements ?? []).map((e: any) => ({
        id: e.id, type: e.type,
        x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.w), h: Math.round(e.h),
        rotation: e.rotation, opacity: e.opacity,
        ...(e.type === "text" ? { text: (e.text ?? "").slice(0, 200), size: e.size, weight: e.weight, color: e.color, align: e.align } : {}),
        ...(e.type === "shape" ? { shape: e.shape, fill: e.fill, radius: e.radius } : {}),
        ...(e.type === "image" ? { fit: e.fit, radius: e.radius, hasSrc: !!e.src } : {}),
        ...(e.type === "icon" ? { name: e.name, color: e.color } : {}),
        ...(e.type === "line" ? { stroke: e.stroke, strokeWidth: e.strokeWidth } : {}),
        ...(e.type === "logo" ? { variant: e.variant } : {}),
      })),
    } : null;

    const systemPrompt = `You are a design editing assistant for a Figma/Canva-style editor.
You receive a user instruction and the current slide as JSON.
Return ONLY a JSON object: {"summary": string, "patches": Patch[]}
A Patch is one of:
  { "op": "add",         "slideIndex": number, "element": Element }
  { "op": "update",      "slideIndex": number, "id": string, "props": object }
  { "op": "remove",      "slideIndex": number, "id": string }
  { "op": "set_bg",      "slideIndex": number, "bg": string | Gradient }
  { "op": "add_slide",   "index": number, "slide": { id: string, bg: string|Gradient, elements: Element[] } }
  { "op": "remove_slide","index": number }
  { "op": "set_title",   "title": string }

Element types and their required props:
  text:  { id, type:"text", x, y, w, h, text, size, weight, color, align, font?: "heading"|"body" }
  shape: { id, type:"shape", x, y, w, h, shape:"rect"|"circle"|"triangle", fill: string|Gradient, radius? }
  image: { id, type:"image", x, y, w, h, src, fit:"cover"|"contain", radius? }
  line:  { id, type:"line", x, y, w, h, stroke, strokeWidth, arrowEnd?, arrowStart? }
  icon:  { id, type:"icon", x, y, w, h, name, color, strokeWidth? }   // name is a lucide-react PascalCase name
  logo:  { id, type:"logo", x, y, w, h, variant:"light"|"dark" }
Gradient: { kind:"linear"|"radial", angle?, stops:[{offset:0..1, color}] }

Rules:
- Use the provided brand palette when picking colors. Brand colors: ${JSON.stringify(brand?.colors ?? {})}.
- Canvas is ${design.width}×${design.height}. Keep elements inside.
- Always generate fresh UUID-style ids when adding (e.g. "el_<random>").
- Prefer minimal, surgical patches. Don't recreate everything.
- If the user references "selected", apply only to ids: ${JSON.stringify(selectedIds)}.
- Keep "summary" under 150 chars, plain English.
- Return ONLY JSON, no markdown.`;

    const userPrompt = `Instruction: "${message}"
Selected ids: ${JSON.stringify(selectedIds)}
Current slide #${slideIndex} of ${(design.slides as any[]).length}:
${JSON.stringify(compactSlide)}`;

    const ai = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!ai.ok) {
      if (ai.status === 429) return json({ error: "AI rate limit" }, 429);
      if (ai.status === 402) return json({ error: "AI credits exhausted" }, 402);
      return json({ error: `AI error: ${await ai.text()}` }, 500);
    }
    const aiBody = await ai.json();
    const content = aiBody.choices?.[0]?.message?.content;
    let parsed: any;
    try { parsed = typeof content === "string" ? JSON.parse(content) : content; }
    catch { return json({ error: "AI returned non-JSON" }, 500); }

    const patches: any[] = Array.isArray(parsed?.patches) ? parsed.patches : [];
    const summary: string = String(parsed?.summary ?? "Done.").slice(0, 200);

    // Apply patches server-side, persist, return updated design
    const updated = applyPatches(structuredClone(design), patches);
    const { data: saved, error: upErr } = await supabase
      .from("designs").update({ slides: updated.slides, title: updated.title }).eq("id", designId).select().single();
    if (upErr) return json({ error: upErr.message }, 500);

    return json({ summary, patches, updated: saved });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(o: any, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function applyPatches(design: any, patches: any[]) {
  for (const p of patches) {
    if (!p || typeof p !== "object") continue;
    const op = String(p.op);
    if (op === "set_title" && typeof p.title === "string") { design.title = p.title; continue; }
    if (op === "add_slide" && p.slide) {
      const i = typeof p.index === "number" ? p.index : design.slides.length;
      design.slides.splice(i, 0, withFreshIds(p.slide));
      continue;
    }
    if (op === "remove_slide" && typeof p.index === "number") {
      design.slides.splice(p.index, 1);
      if (!design.slides.length) design.slides.push({ id: crypto.randomUUID(), bg: "#FFFFFF", elements: [] });
      continue;
    }
    const si = typeof p.slideIndex === "number" ? p.slideIndex : 0;
    const slide = design.slides[si];
    if (!slide) continue;
    if (op === "set_bg") { slide.bg = p.bg; continue; }
    if (op === "add" && p.element) {
      const el = { ...p.element, id: p.element.id ?? crypto.randomUUID() };
      // basic clamp
      if (typeof el.x === "number" && typeof el.w === "number") {
        el.x = Math.max(0, Math.min(design.width - 20, el.x));
        el.w = Math.max(20, Math.min(design.width, el.w));
      }
      if (typeof el.y === "number" && typeof el.h === "number") {
        el.y = Math.max(0, Math.min(design.height - 20, el.y));
        el.h = Math.max(20, Math.min(design.height, el.h));
      }
      slide.elements.push(el);
      continue;
    }
    if (op === "remove" && p.id) {
      slide.elements = slide.elements.filter((e: any) => e.id !== p.id);
      continue;
    }
    if (op === "update" && p.id && p.props && typeof p.props === "object") {
      slide.elements = slide.elements.map((e: any) => e.id === p.id ? { ...e, ...p.props } : e);
      continue;
    }
  }
  return design;
}

function withFreshIds(slide: any) {
  return {
    ...slide,
    id: crypto.randomUUID(),
    elements: (slide.elements ?? []).map((e: any) => ({ ...e, id: crypto.randomUUID() })),
  };
}
