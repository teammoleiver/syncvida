// NOTE: Supabase edge-function deploys are per-folder; we can't import from a
// sibling. This file exists only to keep these helpers in version control.
// They are duplicated inline in each canva-* function for deploy purposes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const CANVA_BASE = "https://api.canva.com/rest/v1";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(o: any, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

export async function resolveUser(req: Request, admin: any): Promise<{ id: string } | null> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return null;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const bearer = auth.replace(/^Bearer\s+/i, "");
  if (bearer === SERVICE) {
    const u = req.headers.get("x-impersonate-user");
    return u ? { id: u } : null;
  }
  const { data } = await admin.auth.getUser(bearer);
  return data?.user ? { id: data.user.id } : null;
}

export async function getCanvaToken(admin: any, userId: string): Promise<string | null> {
  const { data: conn } = await admin
    .from("social_oauth_connections").select("*")
    .eq("user_id", userId).eq("provider", "canva").maybeSingle();
  if (!conn) return null;
  // Refresh if expiring within 60s
  if (conn.expires_at && new Date(conn.expires_at).getTime() < Date.now() + 60_000 && conn.refresh_token) {
    const refreshed = await refreshCanvaToken(conn.refresh_token);
    if (refreshed?.access_token) {
      await admin.from("social_oauth_connections").update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token ?? conn.refresh_token,
        expires_at: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId).eq("provider", "canva");
      return refreshed.access_token;
    }
  }
  return conn.access_token;
}

async function refreshCanvaToken(refreshToken: string): Promise<{ access_token: string; refresh_token?: string; expires_in?: number } | null> {
  const clientId = Deno.env.get("CANVA_CLIENT_ID");
  const clientSecret = Deno.env.get("CANVA_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  const form = new URLSearchParams();
  form.set("grant_type", "refresh_token");
  form.set("refresh_token", refreshToken);
  const basic = btoa(`${clientId}:${clientSecret}`);
  const r = await fetch(`${CANVA_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
    body: form.toString(),
  });
  if (!r.ok) return null;
  return await r.json();
}
