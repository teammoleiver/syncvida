import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80") || lower.startsWith("::ffff:")) return true;
    return false;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true;
  return false;
}
async function assertPublicUrl(rawUrl: string): Promise<void> {
  const u = new URL(rawUrl);
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) URLs allowed");
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new Error("URL host is not public");
  }
  const a4 = await Deno.resolveDns(host, "A").catch(() => [] as string[]);
  const a6 = await Deno.resolveDns(host, "AAAA").catch(() => [] as string[]);
  for (const ip of [...a4, ...a6]) if (isPrivateIp(ip)) throw new Error("URL resolves to a private address");
}

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
    const size = aspectStr === "1:1" ? "1024x1024" : aspectStr === "9:16" ? "1024x1536" : "1024x1536";

    // BYO key: prefer the user's own saved OpenAI key, fall back to platform.
    const { data: __aikeys } = await supabase.from("social_writer_settings").select("openai_api_key").eq("user_id", user.id).maybeSingle();
    const apiKey = ((__aikeys as any)?.openai_api_key || "").trim() || Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "No OpenAI key available. Add your own in Social Hub → Settings → AI provider." }, 500);

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

    let ai: Response;
    if (refUrls.length === 0) {
      ai = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size, n: 1 }),
      });
    } else {
      const form = new FormData();
      form.append("model", "gpt-image-1");
      form.append("prompt", `Use the attached image(s) as references — incorporate their logos, brand marks, products or the person shown faithfully. ${prompt}`);
      form.append("size", size);
      let idx = 0;
      for (const url of refUrls) {
        try {
          await assertPublicUrl(url);
          const imgRes = await fetch(url);
          if (!imgRes.ok) continue;
          const blob = await imgRes.blob();
          form.append("image[]", blob, `ref-${idx++}.png`);
        } catch { /* ignore */ }
      }
      ai = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
    }
    if (!ai.ok) {
      if (ai.status === 429) return json({ error: "AI rate limit, try again shortly" }, 429);
      if (ai.status === 402) return json({ error: "AI credits exhausted" }, 402);
      return json({ error: `AI error: ${await ai.text()}` }, 500);
    }
    const data = await ai.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) {
      return json({ error: "The image model didn't return an image. Try a more visual prompt.", fallback: true }, 200);
    }
    const mime = "image/png";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ext = "png";
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