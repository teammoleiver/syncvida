import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Post a Content Planner entry directly to a connected LinkedIn personal profile.
 *
 * Flow:
 *   1. Resolve the entry + the user's stored LinkedIn token + member URN.
 *   2. (optional) Refresh the token if expired and refresh_token is available.
 *   3. If image_url is present:
 *        a. POST /rest/images?action=initializeUpload  → returns upload URL + image URN
 *        b. fetch the image bytes
 *        c. PUT bytes to the upload URL
 *   4. POST /rest/posts with commentary + (optional) media
 *   5. Update the planner entry status + write a webhook_logs row for traceability.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LI_VERSION = "202506";

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
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth) return json({ error: "Unauthorized" }, 401);

    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE);

    // Two callers are supported:
    //   1. End-user from the browser → Bearer <user_jwt>; we resolve user via auth.getUser.
    //   2. Server cron / dispatcher → Bearer <service_role> with header x-impersonate-user
    //      (only valid when the bearer literally equals the service role key).
    let user: { id: string } | null = null;
    const bearer = auth.replace(/^Bearer\s+/i, "");
    if (bearer === SERVICE) {
      const impersonate = req.headers.get("x-impersonate-user");
      if (!impersonate) return json({ error: "x-impersonate-user header required for service-role calls" }, 400);
      user = { id: impersonate };
    } else {
      const { data: userRes } = await admin.auth.getUser(bearer);
      if (userRes?.user) user = { id: userRes.user.id };
    }
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const planId: string | undefined = body?.plan_id;
    const overrideText: string | undefined = body?.text;
    const overrideImageUrl: string | undefined = body?.image_url;
    const overrideDocumentUrl: string | undefined = body?.document_url;
    const overrideDocumentFilename: string | undefined = body?.document_filename;
    if (!planId && !overrideText) return json({ error: "plan_id or text required" }, 400);

    // 1. Connection + entry
    const { data: conn } = await admin
      .from("social_oauth_connections")
      .select("*")
      .eq("user_id", user.id).eq("provider", "linkedin")
      .maybeSingle();
    if (!conn) return json({ error: "LinkedIn not connected" }, 400);

    let entry: any = null;
    if (planId) {
      const { data } = await admin.from("social_content_plan").select("*")
        .eq("id", planId).eq("user_id", user.id).maybeSingle();
      if (!data) return json({ error: "Plan entry not found" }, 404);
      entry = data;
    }

    // Build the post text. If the body already starts with the hook (a very
    // common pattern when both fields are filled from one source), don't
    // prepend it again — that's how the post ended up with the title twice.
    const text: string = (overrideText ?? composePostText(entry?.hook, entry?.body)).trim();
    if (!text) return json({ error: "Post text is empty" }, 400);
    const imageUrl: string | null = overrideImageUrl ?? entry?.image_url ?? null;
    const documentUrl: string | null = overrideDocumentUrl ?? entry?.document_url ?? null;
    const documentFilename: string | null = overrideDocumentFilename ?? entry?.document_filename ?? null;

    // ── Safety guardrails ───────────────────────────────────────────────
    // These match (or undercut) LinkedIn's documented Marketing Developer
    // Platform throttles for /rest/posts so we never trip a spam flag.
    // The strict same-text duplicate check is skipped when:
    //  - the caller is the cron/service-role dispatcher (bearer === SERVICE), or
    //  - the matching prior post is for the SAME plan_id (a retry of the same
    //    scheduled entry, e.g. user clicks Post manually after scheduling).
    const isServiceCall = bearer === SERVICE;
    {
      const now = Date.now();
      const oneMinuteAgo = new Date(now - 60_000).toISOString();
      const oneHourAgo = new Date(now - 60 * 60_000).toISOString();
      const oneDayAgo = new Date(now - 24 * 60 * 60_000).toISOString();
      const sig = signature(text);
      const { data: recent } = await admin.from("webhook_logs")
        .select("attempted_at, ok, response_body, request_payload, plan_id")
        .eq("user_id", user.id).eq("platform", "linkedin")
        .gte("attempted_at", oneDayAgo)
        .order("attempted_at", { ascending: false })
        .limit(50);
      const successes = (recent ?? []).filter((r: any) => r.ok);
      // 1. minimum 30s between successful posts (skipped for cron)
      if (!isServiceCall) {
        const lastSuccessAt = successes[0] ? new Date(successes[0].attempted_at).getTime() : 0;
        if (lastSuccessAt && now - lastSuccessAt < 30_000) {
          const wait = Math.ceil((30_000 - (now - lastSuccessAt)) / 1000);
          return json({ error: `Slow down — wait ${wait}s before posting again to avoid LinkedIn rate limits.` }, 429);
        }
      }
      // 2. don't post the same text twice within 1 hour (LinkedIn flags duplicates).
      //    Skip when the cron is dispatching, and ignore matches on the same plan_id
    //    so a scheduled post that already partially attempted can still be retried.
      if (!isServiceCall) {
        const dupeWithinHour = successes.find((r: any) => {
          if (new Date(r.attempted_at).getTime() < now - 60 * 60_000) return false;
          if (planId && r.plan_id === planId) return false;
          const prevText = r.request_payload?.commentary;
          return typeof prevText === "string" && signature(prevText) === sig;
        });
        if (dupeWithinHour) {
          return json({ error: "This exact post was already published in the last hour. LinkedIn flags duplicates — change the text or wait." }, 429);
        }
      }
      // 3. soft daily cap — 25 successful posts / 24h is well under LinkedIn's spam threshold
      if (successes.length >= 25) {
        return json({ error: "Daily limit reached (25 posts/24h). This is a safety guard to keep your LinkedIn account in good standing." }, 429);
      }
    }

    // 2. Token (with naive refresh — LinkedIn member tokens last ~60 days
    //    and are non-refreshable for the basic scope, so we only attempt
    //    a refresh if a refresh_token is on file).
    let accessToken: string = conn.access_token;
    if (conn.expires_at && new Date(conn.expires_at).getTime() < Date.now() + 60_000) {
      if (conn.refresh_token) {
        const refreshed = await refreshLinkedInToken(conn.refresh_token);
        if (refreshed) {
          accessToken = refreshed.access_token;
          await admin.from("social_oauth_connections")
            .update({
              access_token: refreshed.access_token,
              expires_at: refreshed.expires_in
                ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
                : null,
              refresh_token: refreshed.refresh_token ?? conn.refresh_token,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", user.id).eq("provider", "linkedin");
        } else {
          return json({ error: "LinkedIn token expired and refresh failed. Reconnect in Settings." }, 401);
        }
      } else {
        return json({ error: "LinkedIn token expired. Reconnect in Settings." }, 401);
      }
    }

    const author = conn.provider_user_id; // urn:li:person:xxx

    // 3. Optional document upload (PDF carousel — takes priority over image).
    //    LinkedIn's /rest/documents endpoint converts the PDF into the native
    //    swipeable carousel UI in the feed.
    let documentUrn: string | null = null;
    let imageUrn: string | null = null;
    let uploadDetail: any = null;
    if (documentUrl) {
      const init = await fetch("https://api.linkedin.com/rest/documents?action=initializeUpload", {
        method: "POST",
        headers: liHeaders(accessToken),
        body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
      });
      const initText = await init.text();
      let initJson: any;
      try { initJson = initText ? JSON.parse(initText) : null; } catch { initJson = null; }
      if (!init.ok || !initJson?.value?.uploadUrl) {
        await logAttempt(admin, user.id, planId ?? null, "linkedin", "init_document_upload_failed",
          { entry_id: planId, request: { action: "initializeUpload-document", owner: author }, response: initText, status: init.status });
        return json({ error: `Document initializeUpload failed: ${initText.slice(0, 500)}`, status: init.status }, 500);
      }
      documentUrn = initJson.value.document as string;
      const uploadUrl = initJson.value.uploadUrl as string;

      try { await assertPublicUrl(documentUrl); }
      catch (e) { return json({ error: `Invalid document_url: ${(e as Error).message}` }, 400); }
      const docRes = await fetch(documentUrl);
      if (!docRes.ok) {
        return json({ error: `Failed to download PDF from document_url: ${docRes.status}` }, 500);
      }
      const docBytes = new Uint8Array(await docRes.arrayBuffer());
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: docBytes,
      });
      uploadDetail = { document: { status: put.status } };
      if (!put.ok) {
        const t = await put.text().catch(() => "");
        await logAttempt(admin, user.id, planId ?? null, "linkedin", "document_upload_failed",
          { entry_id: planId, response: t, status: put.status, document_urn: documentUrn });
        return json({ error: `Document PUT failed: ${t.slice(0, 500)}`, status: put.status }, 500);
      }
    } else if (imageUrl) {
      const init = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
        method: "POST",
        headers: liHeaders(accessToken),
        body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
      });
      const initText = await init.text();
      let initJson: any;
      try { initJson = initText ? JSON.parse(initText) : null; } catch { initJson = null; }
      if (!init.ok || !initJson?.value?.uploadUrl) {
        await logAttempt(admin, user.id, planId ?? null, "linkedin", "init_image_upload_failed",
          { entry_id: planId, request: { action: "initializeUpload", owner: author }, response: initText, status: init.status });
        return json({ error: `Image initializeUpload failed: ${initText.slice(0, 500)}`, status: init.status }, 500);
      }
      imageUrn = initJson.value.image as string; // urn:li:image:xxx
      const uploadUrl = initJson.value.uploadUrl as string;

      // Fetch the image bytes from the public URL
      try { await assertPublicUrl(imageUrl); }
      catch (e) { return json({ error: `Invalid image_url: ${(e as Error).message}` }, 400); }
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) {
        return json({ error: `Failed to download image from image_url: ${imgRes.status}` }, 500);
      }
      const imgBytes = new Uint8Array(await imgRes.arrayBuffer());

      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": imgRes.headers.get("Content-Type") ?? "image/png" },
        body: imgBytes,
      });
      uploadDetail = { status: put.status };
      if (!put.ok) {
        const t = await put.text().catch(() => "");
        await logAttempt(admin, user.id, planId ?? null, "linkedin", "image_upload_failed",
          { entry_id: planId, response: t, status: put.status, image_urn: imageUrn });
        return json({ error: `Image PUT failed: ${t.slice(0, 500)}`, status: put.status }, 500);
      }
    }

    // 4. Create the post
    // Minimal post body. LinkedIn rejects `distribution.thirdPartyDistribution`
    // for non-marketing apps; `targetEntities` is also optional and only needed
    // for company-page targeting which we don't do.
    const postBody: any = {
      author,
      commentary: text,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED" },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };
    if (documentUrn) {
      // LinkedIn requires a title on document posts; the title shows above the
      // PDF carousel. Use the post hook (or a sensible fallback).
      const title = (entry?.hook ?? "").slice(0, 100) || (documentFilename ?? "Carousel");
      postBody.content = { media: { id: documentUrn, title } };
    } else if (imageUrn) {
      postBody.content = { media: { id: imageUrn, title: (entry?.hook ?? "").slice(0, 80) || "" } };
    }

    const startedAt = Date.now();
    const postRes = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: liHeaders(accessToken),
      body: JSON.stringify(postBody),
    });
    const postText = await postRes.text();
    let postJson: any;
    try { postJson = postText ? JSON.parse(postText) : null; } catch { postJson = null; }
    const postUrn = postRes.headers.get("x-restli-id") ?? postRes.headers.get("x-linkedin-id") ?? postJson?.id ?? null;
    const ok = postRes.ok;

    // 5. Log + update plan
    await admin.from("webhook_logs").insert({
      user_id: user.id, plan_id: planId ?? null, platform: "linkedin",
      webhook_url: "https://api.linkedin.com/rest/posts",
      request_payload: { ...postBody, _image_url: imageUrl, _image_urn: imageUrn, _document_url: documentUrl, _document_urn: documentUrn, _upload: uploadDetail },
      status_code: postRes.status,
      ok,
      response_body: postText.slice(0, 4000),
      response_headers: Object.fromEntries(postRes.headers),
      error: ok ? null : (postJson?.message ?? `HTTP ${postRes.status}`),
      duration_ms: Date.now() - startedAt,
      trigger_kind: "manual",
    });

    if (planId) {
      await admin.from("social_content_plan").update({
        status: ok ? "posted" : "failed",
        webhook_status: ok ? "ok" : "error",
        webhook_sent_at: new Date().toISOString(),
        webhook_response: [{ platform: "linkedin", status: postRes.status, ok, post_urn: postUrn }],
        webhook_error: ok ? null : (postJson?.message ?? `HTTP ${postRes.status}`),
        posted_at: ok ? new Date().toISOString() : null,
      }).eq("id", planId);
    }

    if (!ok) return json({ error: postJson?.message ?? `HTTP ${postRes.status}`, raw: postJson, status: postRes.status }, 500);
    return json({ ok: true, post_urn: postUrn, status: postRes.status });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function liHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Restli-Protocol-Version": "2.0.0",
    "LinkedIn-Version": LI_VERSION,
  };
}

async function refreshLinkedInToken(refreshToken: string): Promise<{ access_token: string; expires_in?: number; refresh_token?: string } | null> {
  const clientId = Deno.env.get("LINKEDIN_CLIENT_ID");
  const clientSecret = Deno.env.get("LINKEDIN_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  const form = new URLSearchParams();
  form.set("grant_type", "refresh_token");
  form.set("refresh_token", refreshToken);
  form.set("client_id", clientId);
  form.set("client_secret", clientSecret);
  const r = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!r.ok) return null;
  return await r.json();
}

async function logAttempt(admin: any, userId: string, planId: string | null, platform: string, error: string, payload: any) {
  try {
    await admin.from("webhook_logs").insert({
      user_id: userId, plan_id: planId, platform,
      webhook_url: "https://api.linkedin.com/rest/posts",
      request_payload: payload, ok: false, error,
      trigger_kind: "manual",
    });
  } catch { /* ignore */ }
}

function json(o: any, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** Combine hook + body without duplicating the hook when the body's first
 * non-empty line already matches it. Case-insensitive, trim/punctuation tolerant. */
function composePostText(hook: string | null | undefined, body: string | null | undefined): string {
  const h = (hook ?? "").trim();
  const b = (body ?? "").trim();
  if (!b) return h;
  if (!h) return b;
  const firstLine = b.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? "";
  if (norm(firstLine) === norm(h)) return b; // body already starts with the hook
  return `${h}\n\n${b}`;
}
function norm(s: string): string {
  return s.toLowerCase().replace(/[\s.,!?:;"'`’]+/g, " ").trim();
}

/** Stable-ish signature of a post body for duplicate detection. */
function signature(s: string): string {
  return norm(s).slice(0, 500);
}
