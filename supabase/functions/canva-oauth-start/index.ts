import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SCOPES = [
  "profile:read",
  "design:meta:read", "design:content:read", "design:content:write",
  "asset:read", "asset:write",
  "brandtemplate:meta:read", "brandtemplate:content:read",
  "folder:read",
].join(" ");

// PKCE helpers
function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(64));
  const verifier = base64UrlEncode(verifierBytes);
  const enc = new TextEncoder().encode(verifier);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", enc));
  const challenge = base64UrlEncode(hash);
  return { verifier, challenge };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: userRes } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    const user = userRes?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const clientId = Deno.env.get("CANVA_CLIENT_ID");
    const redirectUri = Deno.env.get("CANVA_REDIRECT_URI");
    if (!clientId || !redirectUri) {
      return json({ error: "Canva integration not configured. Set CANVA_CLIENT_ID and CANVA_REDIRECT_URI in edge function secrets." }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const redirectTo: string | null = body?.redirect_to ?? null;

    const state = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const { verifier, challenge } = await generatePkce();
    await admin.from("oauth_states").insert({
      state, user_id: user.id, provider: "canva",
      redirect_to: redirectTo, code_verifier: verifier,
    });

    const url = new URL("https://www.canva.com/api/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");

    return json({ authorize_url: url.toString(), state });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(o: any, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
