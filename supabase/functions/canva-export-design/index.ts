import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Export a Canva design to PNG (or PDF), pull the file into our public
 * post-images bucket, and (if a plan_id was given) set the planner entry's
 * image_url to the new public URL.
 *
 * Body: { design_id: string, plan_id?: string, format?: "png" | "pdf" }
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const { data: userRes } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    const user = userRes?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const token = await canvaToken(admin, user.id);
    if (!token) return json({ error: "Canva not connected" }, 400);

    const body = await req.json();
    const designId: string | undefined = body?.design_id;
    const planId: string | undefined = body?.plan_id;
    const format: "png" | "pdf" = body?.format === "pdf" ? "pdf" : "png";
    if (!designId) return json({ error: "design_id required" }, 400);

    // 1. Start the export job
    const startRes = await fetch("https://api.canva.com/rest/v1/exports", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        design_id: designId,
        format: { type: format },
      }),
    });
    if (!startRes.ok) {
      const t = await startRes.text();
      return json({ error: `Canva export start failed: ${t.slice(0, 500)}`, status: startRes.status }, 500);
    }
    const startJson = await startRes.json();
    const jobId = startJson.job?.id;
    if (!jobId) return json({ error: "Canva did not return an export job id" }, 500);

    // 2. Poll until done
    let job: any = startJson.job;
    const deadline = Date.now() + 90_000; // 90 seconds
    while (job?.status === "in_progress" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      const r = await fetch(`https://api.canva.com/rest/v1/exports/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) break;
      const pj = await r.json();
      job = pj.job;
    }
    if (job?.status !== "success") {
      return json({ error: `Canva export did not complete: ${JSON.stringify(job ?? {}).slice(0, 500)}` }, 500);
    }
    const fileUrl: string | undefined = job.urls?.[0] ?? job.url;
    if (!fileUrl) return json({ error: "Canva export returned no URL" }, 500);

    // 3. Download the file
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) return json({ error: `Failed to download Canva export: ${fileRes.status}` }, 500);
    const bytes = new Uint8Array(await fileRes.arrayBuffer());
    const contentType = format === "pdf" ? "application/pdf" : "image/png";
    const ext = format === "pdf" ? "pdf" : "png";

    // 4. Upload to our public post-images bucket
    const path = `${user.id}/canva-${designId}-${Date.now()}.${ext}`;
    const { error: upErr } = await admin.storage.from("post-images").upload(path, bytes, { contentType, upsert: true });
    if (upErr) return json({ error: `Storage upload failed: ${upErr.message}` }, 500);
    const { data: pub } = admin.storage.from("post-images").getPublicUrl(path);
    const publicUrl = pub?.publicUrl;
    if (!publicUrl) return json({ error: "Could not derive public URL" }, 500);

    // 5. If a plan_id was given, set image_url + canva_design_id on the entry
    if (planId) {
      try {
        await admin.from("social_content_plan").update({
          image_url: publicUrl,
          canva_design_id: designId,
        }).eq("id", planId).eq("user_id", user.id);
      } catch { /* ignore */ }
    }

    return json({ ok: true, image_url: publicUrl, design_id: designId, format });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

async function canvaToken(admin: any, userId: string): Promise<string | null> {
  const { data: conn } = await admin
    .from("social_oauth_connections").select("*")
    .eq("user_id", userId).eq("provider", "canva").maybeSingle();
  if (!conn) return null;
  if (conn.expires_at && new Date(conn.expires_at).getTime() < Date.now() + 60_000 && conn.refresh_token) {
    const r = await refreshCanva(conn.refresh_token);
    if (r) {
      await admin.from("social_oauth_connections").update({
        access_token: r.access_token,
        refresh_token: r.refresh_token ?? conn.refresh_token,
        expires_at: r.expires_in ? new Date(Date.now() + r.expires_in * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId).eq("provider", "canva");
      return r.access_token;
    }
  }
  return conn.access_token;
}
async function refreshCanva(refreshToken: string) {
  const clientId = Deno.env.get("CANVA_CLIENT_ID");
  const clientSecret = Deno.env.get("CANVA_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  const form = new URLSearchParams();
  form.set("grant_type", "refresh_token"); form.set("refresh_token", refreshToken);
  const basic = btoa(`${clientId}:${clientSecret}`);
  const r = await fetch("https://api.canva.com/rest/v1/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
    body: form.toString(),
  });
  if (!r.ok) return null;
  return await r.json();
}

function json(o: any, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
