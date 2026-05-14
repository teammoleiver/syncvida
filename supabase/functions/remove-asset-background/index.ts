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

    const { asset_id } = await req.json();
    if (typeof asset_id !== "string") return json({ error: "asset_id required" }, 400);

    const { data: src } = await supabase.from("design_assets").select("*").eq("id", asset_id).eq("user_id", user.id).maybeSingle();
    if (!src) return json({ error: "Asset not found" }, 404);

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "OPENAI_API_KEY missing" }, 500);

    const srcImg = await fetch(src.public_url);
    if (!srcImg.ok) return json({ error: "Could not fetch source image" }, 500);
    const srcBlob = await srcImg.blob();
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", "Remove the background completely. Keep only the main subject. Return a clean PNG with a fully transparent background.");
    form.append("background", "transparent");
    form.append("size", "1024x1024");
    form.append("image[]", srcBlob, "source.png");
    const ai = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!ai.ok) {
      if (ai.status === 429) return json({ error: "AI rate limit, try again shortly" }, 429);
      if (ai.status === 402) return json({ error: "AI credits exhausted" }, 402);
      return json({ error: `AI error: ${await ai.text()}`, fallback: true }, 200);
    }
    const data = await ai.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return json({ error: "Background removal didn't return an image. Try again.", fallback: true }, 200);
    const mime = "image/png";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ext = "png";
    const path = `${user.id}/bg-${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("design-assets").upload(path, bytes, { contentType: mime });
    if (upErr) return json({ error: upErr.message }, 500);
    const { data: pub } = supabase.storage.from("design-assets").getPublicUrl(path);
    const newName = src.name ? `${src.name} (no bg)` : null;
    const { data: row, error: insErr } = await supabase.from("design_assets").insert({
      user_id: user.id, kind: "bg_removed", storage_path: path, public_url: pub?.publicUrl ?? "",
      parent_asset_id: src.id, mime, name: newName, prompt: "Remove background",
    }).select().single();
    if (insErr) return json({ error: insErr.message }, 500);
    return json({ asset: row });
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
});

function json(o: any, s = 200) { return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }