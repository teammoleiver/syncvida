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

    const { prompt, type, platform, slideCount } = await req.json();
    if (typeof prompt !== "string" || prompt.trim().length < 5) return json({ error: "Prompt required" }, 400);
    const isCarousel = type === "carousel";
    const n = isCarousel ? Math.min(8, Math.max(1, Number(slideCount) || 4)) : 1;
    const plat = ["linkedin", "instagram", "facebook", "x"].includes(platform) ? platform : "linkedin";

    const { data: brand } = await supabase.from("brand_kits").select("*").eq("user_id", user.id).maybeSingle();
    const colors = brand?.colors ?? { primary: "#1D9E75", secondary: "#0F6E56", accent: "#F5C451", bg: "#FFFFFF", text: "#0B0F0E" };
    const fonts = brand?.fonts ?? { heading: "Inter", body: "Inter" };

    // BYO key: prefer the user's own saved OpenAI key, fall back to platform.
    const { data: __aikeys } = await supabase.from("social_writer_settings").select("openai_api_key").eq("user_id", user.id).maybeSingle();
    const apiKey = ((__aikeys as any)?.openai_api_key || "").trim() || Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "No OpenAI key available. Add your own in Social Hub → Settings → AI provider." }, 500);

    // 1. Get copy
    const ai = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `You write social copy. Return ONLY JSON: { "title": string, "slides": [ { "headline": string, "body": string, "image_prompt": string } ] }. Produce exactly ${n} slides. Tone: ${brand?.tone ?? "professional, bold, no fluff"}. Platform: ${plat}.` },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!ai.ok) {
      if (ai.status === 429) return json({ error: "AI rate limit" }, 429);
      if (ai.status === 402) return json({ error: "AI credits exhausted" }, 402);
      return json({ error: `AI error: ${await ai.text()}` }, 500);
    }
    const copy = JSON.parse((await ai.json()).choices[0].message.content);

    // 2. Generate background images per slide (parallel)
    const W = 1080, H = isCarousel ? 1350 : 1080;
    const imageResults = await Promise.all((copy.slides as any[]).slice(0, n).map(async (s) => {
      try {
        const r = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-image-1",
            prompt: `Background image for a ${plat} post. ${s.image_prompt}. Brand palette: primary ${colors.primary}, accent ${colors.accent}. Editorial, high-quality.`,
            size: isCarousel ? "1024x1536" : "1024x1024",
            n: 1,
          }),
        });
        if (!r.ok) return null;
        const d = await r.json();
        const b64 = d.data?.[0]?.b64_json;
        if (!b64) return null;
        const mime = "image/png";
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const path = `${user.id}/ai-${crypto.randomUUID()}.png`;
        await supabase.storage.from("design-assets").upload(path, bytes, { contentType: mime });
        const { data: signed } = supabase.storage.from("design-assets").getPublicUrl(path);
        const { data: row } = await supabase.from("design_assets").insert({
          user_id: user.id, kind: "ai_generated", storage_path: path, public_url: signed?.publicUrl ?? "", prompt: s.image_prompt, mime,
        }).select().single();
        return row;
      } catch { return null; }
    }));

    // 3. Compose slides
    const slides = (copy.slides as any[]).slice(0, n).map((s, i) => {
      const asset = imageResults[i];
      const elements: any[] = [];
      if (asset) elements.push({ id: crypto.randomUUID(), type: "image", x: 0, y: 0, w: W, h: H, src: asset.public_url, fit: "cover", radius: 0, assetId: asset.id });
      // dark scrim
      elements.push({ id: crypto.randomUUID(), type: "shape", shape: "rect", x: 0, y: H * 0.45, w: W, h: H * 0.55, fill: "#000000", radius: 0 });
      elements.push({ id: crypto.randomUUID(), type: "text", x: 60, y: H * 0.55, w: W - 120, h: 220, text: s.headline ?? "", font: "heading", size: 72, weight: 800, color: "#FFFFFF", align: "left" });
      elements.push({ id: crypto.randomUUID(), type: "text", x: 60, y: H * 0.78, w: W - 120, h: 200, text: s.body ?? "", font: "body", size: 32, weight: 400, color: "#FFFFFF", align: "left" });
      if (brand?.logo_light_url || brand?.logo_dark_url) {
        elements.push({ id: crypto.randomUUID(), type: "logo", variant: "dark", x: 60, y: H - 110, w: 160, h: 60 });
      }
      return { id: crypto.randomUUID(), bg: colors.bg, elements };
    });

    const { data: design, error } = await supabase.from("designs").insert({
      user_id: user.id, type: isCarousel ? "carousel" : "single", platform: plat,
      title: copy.title ?? "AI design", width: W, height: H, slides,
    }).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ id: design.id });
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
});

function json(o: any, s = 200) { return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }