import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const body = await req.json().catch(() => ({}));
    const q: string | undefined = body?.q;

    const url = new URL("https://api.canva.com/rest/v1/designs");
    if (q) url.searchParams.set("query", q);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) {
      const t = await r.text();
      return json({ error: `Canva designs fetch failed: ${t.slice(0, 500)}`, status: r.status }, 500);
    }
    const data = await r.json();
    const items = (data.items ?? []).map((d: any) => ({
      id: d.id,
      title: d.title ?? "Untitled",
      thumbnail_url: d.thumbnail?.url ?? null,
      view_url: d.urls?.view_url ?? null,
      edit_url: d.urls?.edit_url ?? null,
      updated_at: d.updated_at,
    }));
    return json({ items });
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
