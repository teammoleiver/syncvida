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

    const { url, name } = await req.json();
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return json({ error: "Valid URL required" }, 400);

    const fetched = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 SyncvidaDesigner" } });
    if (!fetched.ok) return json({ error: `Could not fetch URL (${fetched.status})` }, 400);
    const ct = fetched.headers.get("content-type") ?? "image/png";
    if (!ct.startsWith("image/")) return json({ error: `URL is not an image (got ${ct})` }, 400);
    const buf = new Uint8Array(await fetched.arrayBuffer());
    if (buf.byteLength > 15 * 1024 * 1024) return json({ error: "Image larger than 15 MB" }, 400);

    const ext = (ct.split("/")[1] ?? "png").split(";")[0];
    const path = `${user.id}/url-${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("design-assets").upload(path, buf, { contentType: ct });
    if (upErr) return json({ error: upErr.message }, 500);
    const { data: pub } = supabase.storage.from("design-assets").getPublicUrl(path);

    const fallbackName = (() => {
      try { return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "").replace(/\.[a-z0-9]+$/i, "") || null; }
      catch { return null; }
    })();

    const { data: row, error: insErr } = await supabase.from("design_assets").insert({
      user_id: user.id, kind: "url_import", storage_path: path, public_url: pub?.publicUrl ?? "",
      mime: ct, name: (typeof name === "string" && name.trim()) ? name.trim() : fallbackName,
    }).select().single();
    if (insErr) return json({ error: insErr.message }, 500);
    return json({ asset: row });
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
});

function json(o: any, s = 200) { return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }