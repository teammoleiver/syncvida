import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

function renderTemplate(tpl: any, ctx: Record<string, any>): any {
  if (tpl == null) return tpl;
  if (typeof tpl === "string") {
    return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
      const v = key.split(".").reduce((acc: any, k: string) => (acc == null ? acc : acc[k]), ctx);
      return v == null ? "" : String(v);
    });
  }
  if (Array.isArray(tpl)) return tpl.map((t) => renderTemplate(t, ctx));
  if (typeof tpl === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(tpl)) out[k] = renderTemplate(v, ctx);
    return out;
  }
  return tpl;
}

function defaultPayload(platform: string, ctx: Record<string, any>) {
  return {
    platform, plan_id: ctx.plan_id,
    hook: ctx.hook, body: ctx.body,
    image_url: ctx.image_url, scheduled_at: ctx.scheduled_at,
    figma_brief: ctx.figma_brief,
    design_id: ctx.design_id, design_url: ctx.design_url, design_thumbnail_url: ctx.design_thumbnail_url,
  };
}

function appBaseUrl(): string {
  return Deno.env.get("APP_BASE_URL") || "https://app.syncvida.com";
}

/**
 * Make sure a public-image URL is suitable for LinkedIn / Zapier:
 * - rewrite signed URLs in newly-public buckets to the clean public form
 * - migrate legacy health-records/<user>/post-images/* objects to the public
 *   post-images bucket and update the row's image_url
 */
async function normalizeImageUrl(admin: any, post: any): Promise<string | null> {
  const url: string | null = post.image_url;
  if (!url) return null;

  // 1. design-assets / design-exports signed → public
  const m1 = url.match(/\/storage\/v1\/object\/sign\/(design-assets|design-exports)\/([^?]+)/);
  if (m1) {
    const fixed = url.replace(/\/storage\/v1\/object\/sign\/(design-assets|design-exports)\/([^?]+)\?[^"]*/, "/storage/v1/object/public/$1/$2");
    if (fixed !== url) {
      try { await admin.from("social_content_plan").update({ image_url: fixed }).eq("id", post.id); } catch { /* ignore */ }
      return fixed;
    }
  }

  // 2. legacy health-records/<uid>/post-images/* → migrate to public post-images bucket
  const m2 = url.match(/\/storage\/v1\/object\/(?:sign|public)\/health-records\/([^/]+)\/post-images\/([^?]+)/);
  if (m2) {
    const oldPath = `${m2[1]}/post-images/${m2[2]}`;
    const newPath = `${m2[1]}/${m2[2]}`;
    try {
      const { data: blob, error: dlErr } = await admin.storage.from("health-records").download(oldPath);
      if (dlErr || !blob) return url; // can't fix, send as-is
      const { error: upErr } = await admin.storage.from("post-images").upload(newPath, blob, { contentType: "image/png", upsert: true });
      if (upErr) return url;
      const { data: pub } = admin.storage.from("post-images").getPublicUrl(newPath);
      const newUrl = pub?.publicUrl ?? url;
      if (newUrl !== url) {
        try { await admin.from("social_content_plan").update({ image_url: newUrl }).eq("id", post.id); } catch { /* ignore */ }
        // clean up the old object best-effort
        admin.storage.from("health-records").remove([oldPath]).catch(() => {});
      }
      return newUrl;
    } catch {
      return url;
    }
  }
  return url;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  let bodyJson: any = {};
  try { bodyJson = await req.json(); } catch { /* GET / cron */ }
  const single_plan_id: string | undefined = bodyJson?.plan_id;

  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "");
  const isServiceRole = bearer && bearer === serviceKey;

  // For single push: validate caller owns it (user JWT path).
  // For cron mode (no plan_id): require the service role key.
  let userScope: string | null = null;
  if (single_plan_id) {
    if (!authHeader) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (isServiceRole) {
      // Service-role caller may dispatch any plan id (used by internal flows).
    } else {
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      userScope = user.id;
    }
  } else {
    if (!isServiceRole) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  // Find candidate posts
  let q = admin.from("social_content_plan").select("*");
  if (single_plan_id) {
    q = q.eq("id", single_plan_id);
    if (userScope) q = q.eq("user_id", userScope);
  } else {
    // Cron mode: scheduled posts whose moment has arrived. We check both
    // the new `scheduled_at` (timezone-aware UTC timestamp) and the legacy
    // date+time pair. Filter loosely here; the per-row check below confirms.
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    q = q.eq("status", "scheduled").or(
      `scheduled_at.lte.${now.toISOString()},scheduled_date.lte.${today}`,
    );
  }
  const { data: posts, error } = await q;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const results: any[] = [];
  for (const post of posts ?? []) {
    // Cron-only time filter — exact moment check.
    if (!single_plan_id) {
      const now = new Date();
      if (post.scheduled_at) {
        if (new Date(post.scheduled_at).getTime() > now.getTime()) continue;
      } else if (post.scheduled_time) {
        // Legacy fallback: assume scheduled_time is in user's local time.
        // We don't have the user's timezone, so we treat it as UTC (the old
        // behavior). Users should re-save their scheduled posts to get the
        // new tz-aware behavior.
        const [h, m] = String(post.scheduled_time).split(":").map(Number);
        const due = new Date(`${post.scheduled_date}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00Z`);
        if (due.getTime() > now.getTime()) continue;
      }
    }

    const platforms: string[] = (post.platforms?.length ? post.platforms : (post.platforms ?? [])) as string[];
    if (!platforms.length) {
      results.push({ id: post.id, skipped: "no_platforms" });
      continue;
    }

    // Look up linked design (if user used "Design in Studio") so its
    // thumbnail and editor URL flow into the webhook payload.
    let designCtx: Record<string, any> = { design_id: null, design_url: null, design_thumbnail_url: null };
    try {
      const { data: design } = await admin.from("designs").select("id,thumbnail_url")
        .eq("planner_entry_id", post.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (design) {
        designCtx = {
          design_id: (design as any).id,
          design_url: `${appBaseUrl()}/designer/${(design as any).id}`,
          design_thumbnail_url: (design as any).thumbnail_url ?? null,
        };
      }
    } catch { /* best effort */ }

    const cleanImageUrl = await normalizeImageUrl(admin, post);
    const ctx = {
      hook: post.hook, body: post.body, image_url: cleanImageUrl,
      scheduled_at: post.scheduled_date && post.scheduled_time ? `${post.scheduled_date}T${post.scheduled_time}` : post.scheduled_date,
      plan_id: post.id,
      figma_brief: post.figma_brief ?? null,
      ...designCtx,
    };

    // Direct platform connections (used in preference to webhooks when present)
    const { data: connRows } = await admin.from("social_oauth_connections")
      .select("provider").eq("user_id", post.user_id);
    const directProviders = new Set<string>((connRows ?? []).map((r: any) => r.provider));

    const directFunctionForPlatform: Record<string, string | null> = {
      linkedin: directProviders.has("linkedin") ? "post-to-linkedin" : null,
      facebook: directProviders.has("meta") ? "post-to-facebook" : null,
      instagram: directProviders.has("meta") ? "post-to-instagram" : null,
    };

    const perPlatform: any[] = [];
    let anyError = false;
    for (const platform of platforms) {
      // ── Direct posting via dedicated edge function when a connection exists ──
      const directFn = directFunctionForPlatform[platform];
      if (directFn) {
        const startedAt = Date.now();
        let logRow: any = {
          user_id: post.user_id, plan_id: post.id, platform,
          webhook_url: `internal://${directFn}`,
          request_payload: { plan_id: post.id, text: [post.hook, post.body].filter(Boolean).join("\n\n"), image_url: cleanImageUrl },
          trigger_kind: single_plan_id ? "manual" : "cron",
        };
        try {
          const directRes = await fetch(`${supabaseUrl}/functions/v1/${directFn}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, "x-impersonate-user": post.user_id },
            body: JSON.stringify({ plan_id: post.id }),
          });
          const txt = await directRes.text();
          logRow = {
            ...logRow,
            status_code: directRes.status,
            ok: directRes.ok,
            response_body: txt.slice(0, 4000),
            duration_ms: Date.now() - startedAt,
          };
          perPlatform.push({ platform, status: directRes.status, ok: directRes.ok, body: txt.slice(0, 500), via: "direct" });
          if (!directRes.ok) anyError = true;
        } catch (e: any) {
          const msg = String(e?.message ?? e);
          logRow = { ...logRow, ok: false, error: msg, duration_ms: Date.now() - startedAt };
          perPlatform.push({ platform, error: msg, via: "direct" });
          anyError = true;
        }
        try { await admin.from("webhook_logs").insert(logRow); } catch { /* ignore */ }
        continue;
      }
      // ── Legacy LinkedIn-specific direct path (kept for safety; the table above already covers it) ──
      if (platform === "linkedin" && directProviders.has("linkedin")) {
        const startedAt = Date.now();
        let logRow: any = {
          user_id: post.user_id, plan_id: post.id, platform,
          webhook_url: "internal://post-to-linkedin",
          request_payload: { plan_id: post.id, text: [post.hook, post.body].filter(Boolean).join("\n\n"), image_url: cleanImageUrl },
          trigger_kind: single_plan_id ? "manual" : "cron",
        };
        try {
          const directRes = await fetch(`${supabaseUrl}/functions/v1/post-to-linkedin`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, "x-impersonate-user": post.user_id },
            body: JSON.stringify({ plan_id: post.id }),
          });
          const txt = await directRes.text();
          logRow = {
            ...logRow,
            status_code: directRes.status,
            ok: directRes.ok,
            response_body: txt.slice(0, 4000),
            duration_ms: Date.now() - startedAt,
          };
          perPlatform.push({ platform, status: directRes.status, ok: directRes.ok, body: txt.slice(0, 500), via: "direct" });
          if (!directRes.ok) anyError = true;
        } catch (e: any) {
          const msg = String(e?.message ?? e);
          logRow = { ...logRow, ok: false, error: msg, duration_ms: Date.now() - startedAt };
          perPlatform.push({ platform, error: msg, via: "direct" });
          anyError = true;
        }
        try { await admin.from("webhook_logs").insert(logRow); } catch { /* ignore */ }
        continue;
      }
      // ── Fallback: webhook delivery ──
      const { data: cfg } = await admin.from("social_webhook_settings").select("*")
        .eq("user_id", post.user_id).eq("platform", platform).maybeSingle();
      if (!cfg?.webhook_url || !cfg.active) {
        const reason = !cfg?.webhook_url ? "no_webhook_configured" : "webhook_inactive";
        try {
          await admin.from("webhook_logs").insert({
            user_id: post.user_id, plan_id: post.id, platform,
            webhook_url: cfg?.webhook_url ?? "",
            request_payload: null, ok: false, error: reason,
            trigger_kind: single_plan_id ? "manual" : "cron",
          });
        } catch { /* ignore */ }
        perPlatform.push({ platform, error: reason });
        anyError = true;
        continue;
      }
      const payload = cfg.json_template && Object.keys(cfg.json_template).length
        ? renderTemplate(cfg.json_template, { ...ctx, platform })
        : defaultPayload(platform, ctx);
      const startedAt = Date.now();
      let logRow: any = {
        user_id: post.user_id,
        plan_id: post.id,
        platform,
        webhook_url: cfg.webhook_url,
        request_payload: payload,
        trigger_kind: single_plan_id ? "manual" : "cron",
      };
      try {
        await assertPublicUrl(cfg.webhook_url);
        const resp = await fetch(cfg.webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const text = await resp.text();
        const headersOut: Record<string, string> = {};
        resp.headers.forEach((v, k) => { headersOut[k] = v; });
        logRow = {
          ...logRow,
          status_code: resp.status,
          ok: resp.ok,
          response_body: text.slice(0, 4000),
          response_headers: headersOut,
          duration_ms: Date.now() - startedAt,
        };
        perPlatform.push({ platform, status: resp.status, ok: resp.ok, body: text.slice(0, 500) });
        if (!resp.ok) anyError = true;
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        logRow = { ...logRow, ok: false, error: msg, duration_ms: Date.now() - startedAt };
        perPlatform.push({ platform, error: msg });
        anyError = true;
      }
      // Append to webhook_logs (best-effort, never block the dispatch)
      try { await admin.from("webhook_logs").insert(logRow); } catch { /* ignore */ }
    }

    const newStatus = anyError ? "failed" : "posted";
    await admin.from("social_content_plan").update({
      status: newStatus,
      webhook_status: anyError ? "error" : "ok",
      webhook_sent_at: new Date().toISOString(),
      webhook_response: perPlatform,
      webhook_error: anyError ? perPlatform.filter((r) => r.error || !r.ok).map((r) => `${r.platform}: ${r.error ?? r.status}`).join("; ") : null,
      posted_at: anyError ? null : new Date().toISOString(),
    }).eq("id", post.id);

    results.push({ id: post.id, status: newStatus, perPlatform });
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});