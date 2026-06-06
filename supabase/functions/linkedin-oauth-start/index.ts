import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SCOPES = "openid profile email w_member_social";

// Origins allowed to drive the OAuth flow. Comma-separated OAUTH_ALLOWED_ORIGINS
// overrides this; otherwise we fall back to prod + local dev. The redirect_uri
// sent to LinkedIn is always derived from one of these — never from arbitrary
// caller input — and must also be registered in the LinkedIn app's "Authorized
// redirect URLs".
function allowedOrigins(): string[] {
  const fromEnv = (Deno.env.get("OAUTH_ALLOWED_ORIGINS") ?? "")
    .split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
  const defaults = [
    "https://syncvida.io",
    "https://www.syncvida.io",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
  ];
  // Also trust the origin of the configured fallback redirect URI, if any.
  const fallback = Deno.env.get("LINKEDIN_REDIRECT_URI");
  if (fallback) { try { defaults.push(new URL(fallback).origin); } catch { /* ignore */ } }
  return Array.from(new Set([...fromEnv, ...defaults]));
}

function resolveRedirectUri(origin: string | null): string | null {
  const fallback = Deno.env.get("LINKEDIN_REDIRECT_URI") ?? null;
  if (!origin) return fallback;
  const clean = origin.replace(/\/$/, "");
  if (!allowedOrigins().includes(clean)) return fallback;
  return `${clean}/oauth/linkedin/callback`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: userRes } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    const user = userRes?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const clientId = Deno.env.get("LINKEDIN_CLIENT_ID");
    const body = await req.json().catch(() => ({}));
    const redirectTo: string | null = body?.redirect_to ?? null;
    const origin: string | null = body?.origin ?? null;
    const redirectUri = resolveRedirectUri(origin);
    if (!clientId || !redirectUri) {
      return json({ error: "LinkedIn integration not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_REDIRECT_URI in edge function secrets." }, 500);
    }

    // Random state, persisted (so callback can validate). Store the exact
    // redirect_uri so the token exchange reuses the identical value.
    const state = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    await admin.from("oauth_states").insert({
      state, user_id: user.id, provider: "linkedin", redirect_to: redirectTo, redirect_uri: redirectUri,
    });

    const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", SCOPES);

    return json({ authorize_url: url.toString(), state });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(o: any, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
