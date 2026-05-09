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

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: userRes } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    const user = userRes?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { code, state } = await req.json();
    if (typeof code !== "string" || typeof state !== "string") return json({ error: "code and state required" }, 400);

    const clientId = Deno.env.get("CANVA_CLIENT_ID");
    const clientSecret = Deno.env.get("CANVA_CLIENT_SECRET");
    const redirectUri = Deno.env.get("CANVA_REDIRECT_URI");
    if (!clientId || !clientSecret || !redirectUri) {
      return json({ error: "Canva integration not configured" }, 500);
    }

    const { data: stateRow } = await admin.from("oauth_states").select("*").eq("state", state).maybeSingle();
    if (!stateRow) return json({ error: "Invalid state" }, 400);
    if (stateRow.user_id !== user.id) return json({ error: "State does not match user" }, 400);
    if (stateRow.provider !== "canva") return json({ error: "Wrong provider for this state" }, 400);
    if (new Date(stateRow.expires_at).getTime() < Date.now()) {
      await admin.from("oauth_states").delete().eq("state", state);
      return json({ error: "State expired" }, 400);
    }

    const form = new URLSearchParams();
    form.set("grant_type", "authorization_code");
    form.set("code", code);
    form.set("code_verifier", stateRow.code_verifier ?? "");
    form.set("redirect_uri", redirectUri);

    // Canva accepts client credentials either via Basic auth header or in the body.
    // Basic auth is the recommended path for confidential apps.
    const basic = btoa(`${clientId}:${clientSecret}`);
    const tokenRes = await fetch("https://api.canva.com/rest/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: form.toString(),
    });
    if (!tokenRes.ok) {
      const txt = await tokenRes.text();
      return json({ error: `Canva token exchange failed: ${txt}` }, 500);
    }
    const tok = await tokenRes.json();
    const accessToken: string = tok.access_token;
    const expiresIn: number = Number(tok.expires_in ?? 0);
    const refreshToken: string | undefined = tok.refresh_token;
    const scope: string | undefined = tok.scope;

    // Fetch profile
    let me: any = {};
    try {
      const meRes = await fetch("https://api.canva.com/rest/v1/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (meRes.ok) me = await meRes.json();
    } catch { /* best effort */ }

    // /users/me returns { team: { id }, user: { id } } in current API
    const memberId = me?.team?.user?.id ?? me?.user?.id ?? me?.user_id ?? "unknown";
    const profileUrn = `canva:user:${memberId}`;
    const displayName: string | null = me?.user?.display_name ?? me?.display_name ?? null;
    const email: string | null = me?.user?.email ?? me?.email ?? null;

    const { error: upErr } = await admin.from("social_oauth_connections").upsert({
      user_id: user.id,
      provider: "canva",
      provider_user_id: profileUrn,
      display_name: displayName,
      email,
      avatar_url: null,
      access_token: accessToken,
      refresh_token: refreshToken ?? null,
      expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      scope: scope ?? null,
      raw_profile: me,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,provider" });
    if (upErr) return json({ error: upErr.message }, 500);

    await admin.from("oauth_states").delete().eq("state", state);

    return json({
      ok: true, provider: "canva",
      provider_user_id: profileUrn,
      display_name: displayName,
      avatar_url: null,
      redirect_to: stateRow.redirect_to ?? null,
    });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(o: any, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
