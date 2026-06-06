import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { code, state } = await req.json();
    if (typeof code !== "string" || typeof state !== "string") return json({ error: "code and state required" }, 400);

    const clientId = Deno.env.get("LINKEDIN_CLIENT_ID");
    const clientSecret = Deno.env.get("LINKEDIN_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return json({ error: "LinkedIn integration not configured" }, 500);
    }

    // 1. Validate state belongs to this user and is fresh
    const { data: stateRow } = await admin.from("oauth_states").select("*").eq("state", state).maybeSingle();
    if (!stateRow) return json({ error: "Invalid state" }, 400);
    if (stateRow.user_id !== user.id) return json({ error: "State does not match user" }, 400);
    if (new Date(stateRow.expires_at).getTime() < Date.now()) {
      await admin.from("oauth_states").delete().eq("state", state);
      return json({ error: "State expired" }, 400);
    }

    // Reuse the exact redirect_uri from the authorize step (OAuth requires the
    // token-exchange redirect_uri to match byte-for-byte). Falls back to the env
    // var for states created before this column existed.
    const redirectUri = stateRow.redirect_uri ?? Deno.env.get("LINKEDIN_REDIRECT_URI");
    if (!redirectUri) return json({ error: "Missing redirect_uri for this auth session" }, 400);

    // 2. Exchange code for tokens
    const form = new URLSearchParams();
    form.set("grant_type", "authorization_code");
    form.set("code", code);
    form.set("client_id", clientId);
    form.set("client_secret", clientSecret);
    form.set("redirect_uri", redirectUri);

    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!tokenRes.ok) {
      const txt = await tokenRes.text();
      return json({ error: `LinkedIn token exchange failed: ${txt}` }, 500);
    }
    const tok = await tokenRes.json();
    const accessToken: string = tok.access_token;
    const expiresIn: number = Number(tok.expires_in ?? 0);
    const refreshToken: string | undefined = tok.refresh_token;
    const scope: string | undefined = tok.scope;

    // 3. Fetch profile via OIDC userinfo
    const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meRes.ok) {
      const txt = await meRes.text();
      return json({ error: `LinkedIn userinfo failed: ${txt}` }, 500);
    }
    const me = await meRes.json();
    // me.sub is the LinkedIn member id; URN is urn:li:person:<sub>
    const memberUrn = `urn:li:person:${me.sub}`;
    const displayName = me.name ?? [me.given_name, me.family_name].filter(Boolean).join(" ") ?? null;

    // 4. Persist (upsert)
    const { error: upErr } = await admin.from("social_oauth_connections").upsert({
      user_id: user.id,
      provider: "linkedin",
      provider_user_id: memberUrn,
      display_name: displayName,
      email: me.email ?? null,
      avatar_url: me.picture ?? null,
      access_token: accessToken,
      refresh_token: refreshToken ?? null,
      expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      scope: scope ?? null,
      raw_profile: me,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,provider" });
    if (upErr) return json({ error: upErr.message }, 500);

    // 5. Cleanup state
    await admin.from("oauth_states").delete().eq("state", state);

    return json({
      ok: true,
      provider: "linkedin",
      provider_user_id: memberUrn,
      display_name: displayName,
      avatar_url: me.picture ?? null,
      redirect_to: stateRow.redirect_to ?? null,
    });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(o: any, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
