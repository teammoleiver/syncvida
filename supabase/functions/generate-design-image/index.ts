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

    const { prompt, aspect, reference_asset_ids, reference_urls } = await req.json();
    if (typeof prompt !== "string" || prompt.trim().length < 3) return json({ error: "Prompt required" }, 400);
    const aspectStr = ["1:1", "4:5", "9:16"].includes(aspect) ? aspect : "1:1";

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    // Optional: include reference images so the model can incorporate logos / personal photos.
    let refUrls: string[] = [];
    if (Array.isArray(reference_asset_ids) && reference_asset_ids.length > 0) {
      const ids = reference_asset_ids.filter((x: unknown): x is string => typeof x === "string").slice(0, 6);
      if (ids.length > 0) {
        const { data: refs } = await supabase.from("design_assets")
          .select("public_url").in("id", ids).eq("user_id", user.id);
        refUrls = (refs ?? []).map((r: any) => r.public_url).filter(Boolean);
      }
    }
    if (Array.isArray(reference_urls)) {
      const extra = reference_urls.filter((u: unknown): u is string => typeof u === "string");
      refUrls = [...refUrls, ...extra];
    }
    refUrls = refUrls.slice(0, 6);

    const userContent: any = refUrls.length === 0
      ? `Aspect ratio ${aspectStr}. ${prompt}`
      : [
          { type: "text", text: `Aspect ratio ${aspectStr}. Use the attached image(s) as references — incorporate their logos, brand marks, products or the person shown faithfully. ${prompt}` },
          ...refUrls.map((url) => ({ type: "image_url", image_url: { url } })),
        ];

    async function callImageModel(extraNudge = "") {
      const content = typeof userContent === "string"
        ? `${userContent}${extraNudge}`
        : [{ type: "text", text: `${userContent[0].text}${extraNudge}` }, ...userContent.slice(1)];
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content }],
          modalities: ["image", "text"],
        }),
      });
      return r;
    }

    let ai = await callImageModel();
    if (!ai.ok) {
      if (ai.status === 429) return json({ error: "AI rate limit, try again shortly" }, 429);
      if (ai.status === 402) return json({ error: "AI credits exhausted" }, 402);
      return json({ error: `AI error: ${await ai.text()}` }, 500);
    }
    let data = await ai.json();
    let dataUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl?.startsWith("data:image/")) {
      // Retry once with an explicit instruction to return an image
      ai = await callImageModel(" Return ONLY an image. Do not respond with text.");
      if (ai.ok) {
        data = await ai.json();
        dataUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      }
    }
    if (!dataUrl?.startsWith("data:image/")) {
      const textOut = data.choices?.[0]?.message?.content;
      console.warn("No image returned. Text response:", typeof textOut === "string" ? textOut.slice(0, 300) : "");
      return json({
        error: "The image model didn't return an image. Try a more visual prompt (e.g. include a subject and style), or try again.",
        fallback: true,
      }, 200);
    }
    const [meta, b64] = dataUrl.split(",");
    const mime = meta.match(/data:([^;]+);/)?.[1] ?? "image/png";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ext = mime.split("/")[1] ?? "png";
    const path = `${user.id}/ai-${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("design-assets").upload(path, bytes, { contentType: mime, upsert: false });
    if (upErr) return json({ error: upErr.message }, 500);
    const { data: signed } = supabase.storage.from("design-assets").getPublicUrl(path);
    const { data: row, error: insErr } = await supabase.from("design_assets").insert({
      user_id: user.id, kind: "ai_generated", storage_path: path, public_url: signed?.publicUrl ?? "", prompt, mime,
      parent_asset_id: refUrls.length > 0 && Array.isArray(reference_asset_ids) ? reference_asset_ids[0] : null,
    }).select().single();
    if (insErr) return json({ error: insErr.message }, 500);
    return json({ asset: row });
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
});

function json(o: any, s = 200) { return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }