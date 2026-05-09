import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Three creation modes (controlled by request body):
 *   { plan_id, kind: "blank", design_type?: "instagram_post" | "linkedin_post" | ... }
 *      → POST /designs (empty)
 *   { plan_id, kind: "from_design", source_design_id }
 *      → opens an existing design's edit URL (no creation needed; just returns it)
 *   { plan_id, kind: "autofill", brand_template_id, fields: {...} }
 *      → POST /autofills, polls until done, returns the new design's edit URL
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
    const planId: string | undefined = body?.plan_id;
    const kind: "blank" | "from_design" | "autofill" = body?.kind ?? "blank";

    let designId: string | null = null;
    let editUrl: string | null = null;
    let viewUrl: string | null = null;

    if (kind === "from_design") {
      designId = body?.source_design_id;
      if (!designId) return json({ error: "source_design_id required" }, 400);
      const r = await fetch(`https://api.canva.com/rest/v1/designs/${designId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return json({ error: `Canva design fetch failed: ${await r.text()}` }, 500);
      const d = await r.json();
      editUrl = d.design?.urls?.edit_url ?? null;
      viewUrl = d.design?.urls?.view_url ?? null;
    } else if (kind === "blank") {
      // Canva's preset list for /designs is small (doc/email/presentation/whiteboard).
      // For social-media sizes we use the `custom` shape with explicit pixel dimensions.
      const presetMap: Record<string, { width: number; height: number }> = {
        linkedin_post: { width: 1200, height: 627 },
        linkedin_square: { width: 1080, height: 1080 },
        linkedin_carousel: { width: 1080, height: 1350 },
        instagram_post: { width: 1080, height: 1080 },
        instagram_portrait: { width: 1080, height: 1350 },
        instagram_story: { width: 1080, height: 1920 },
        facebook_post: { width: 1200, height: 630 },
        twitter_post: { width: 1600, height: 900 },
      };
      const sizeKey: string = body?.design_type ?? "linkedin_post";
      const size = presetMap[sizeKey] ?? presetMap.linkedin_post;
      const r = await fetch("https://api.canva.com/rest/v1/designs", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          design_type: { type: "custom", width: size.width, height: size.height },
          title: body?.title ?? "Syncvida design",
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        return json({ error: `Canva create design failed: ${t.slice(0, 500)}`, status: r.status }, 500);
      }
      const d = await r.json();
      designId = d.design?.id ?? null;
      editUrl = d.design?.urls?.edit_url ?? null;
      viewUrl = d.design?.urls?.view_url ?? null;
    } else if (kind === "autofill") {
      const brandTemplateId: string | undefined = body?.brand_template_id;
      const fields: Record<string, any> = body?.fields ?? {};
      if (!brandTemplateId) return json({ error: "brand_template_id required" }, 400);

      // POST /autofills returns a job; poll until status='success' to get the design id
      const start = await fetch("https://api.canva.com/rest/v1/autofills", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_template_id: brandTemplateId,
          title: body?.title ?? "Syncvida autofill",
          // Canva expects a map of placeholder_name → { type: "text"|"image", text?: "...", asset_id?: "..." }
          data: Object.fromEntries(Object.entries(fields).map(([k, v]) =>
            typeof v === "string" ? [k, { type: "text", text: v }] : [k, v])),
        }),
      });
      if (!start.ok) {
        const t = await start.text();
        return json({ error: `Canva autofill start failed: ${t.slice(0, 500)}`, status: start.status }, 500);
      }
      const job0 = await start.json();
      const jobId = job0.job?.id;
      if (!jobId) return json({ error: "No autofill job id returned" }, 500);

      // Poll
      const deadline = Date.now() + 60_000;
      let job: any = job0.job;
      while (job?.status === "in_progress" && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        const p = await fetch(`https://api.canva.com/rest/v1/autofills/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!p.ok) break;
        const pj = await p.json();
        job = pj.job;
      }
      if (job?.status !== "success") {
        return json({ error: `Autofill did not complete: ${JSON.stringify(job ?? {}).slice(0, 500)}` }, 500);
      }
      designId = job.result?.design?.id ?? null;
      editUrl = job.result?.design?.url ?? null;
    }

    if (planId && designId) {
      try {
        await admin.from("social_content_plan").update({
          canva_design_id: designId,
          canva_design_url: editUrl ?? viewUrl ?? null,
        }).eq("id", planId);
      } catch { /* ignore */ }
    }

    return json({ design_id: designId, edit_url: editUrl, view_url: viewUrl });
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
