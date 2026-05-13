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

    const { asset_id, prompt } = await req.json();
    if (typeof asset_id !== "string" || typeof prompt !== "string" || prompt.trim().length < 3) return json({ error: "asset_id and prompt required" }, 400);

    const { data: src } = await supabase.from("design_assets").select("*").eq("id", asset_id).eq("user_id", user.id).maybeSingle();
    if (!src) return json({ error: "Asset not found" }, 404);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    async function callModel(extra = "") {
      return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: [
            { type: "text", text: `${prompt}${extra}` },
            { type: "image_url", image_url: { url: src.public_url } },
          ] }],
          modalities: ["image", "text"],
        }),
      });
    }
    let ai = await callModel();
    if (!ai.ok) {
      if (ai.status === 429) return json({ error: "AI rate limit, try again shortly" }, 429);
      if (ai.status === 402) return json({ error: "AI credits exhausted" }, 402);
      return json({ error: `AI error: ${await ai.text()}`, fallback: true }, 200);
    }
    let data = await ai.json();
    let dataUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl?.startsWith("data:image/")) {
      ai = await callModel(" Return ONLY an image. Do not respond with text.");
      if (ai.ok) { data = await ai.json(); dataUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url; }
    }
    if (!dataUrl?.startsWith("data:image/")) {
      return json({ error: "The image model didn't return an image. Try a more specific edit instruction.", fallback: true }, 200);
    }
    const [meta, b64] = dataUrl.split(",");
    const mime = meta.match(/data:([^;]+);/)?.[1] ?? "image/png";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ext = mime.split("/")[1] ?? "png";
    const path = `${user.id}/edit-${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("design-assets").upload(path, bytes, { contentType: mime });
    if (upErr) return json({ error: upErr.message }, 500);
    const { data: signed } = supabase.storage.from("design-assets").getPublicUrl(path);
    const { data: row, error: insErr } = await supabase.from("design_assets").insert({
      user_id: user.id, kind: "ai_edited", storage_path: path, public_url: signed?.publicUrl ?? "",
      prompt, parent_asset_id: asset_id, mime,
    }).select().single();
    if (insErr) return json({ error: insErr.message }, 500);
    return json({ asset: row });
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
});

function json(o: any, s = 200) { return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }