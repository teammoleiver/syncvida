// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Turn any Apify actor reference (id, store URL, owner/name) into the API id form.
function normalizeActorId(input?: string | null): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const parts = url.pathname.split("/").filter(Boolean);
    const ai = parts.indexOf("actors");
    if (ai >= 0 && parts[ai + 1]) return parts[ai + 1];
    const si = parts.indexOf("store");
    if (si >= 0 && parts[si + 1] && parts[si + 2]) return `${parts[si + 1]}~${parts[si + 2]}`;
    if (parts.length >= 2 && url.hostname.includes("apify.com")) return `${parts[0]}~${parts[1]}`;
  } catch { /* raw id */ }
  const cleaned = raw.replace(/^\/+/, "").replace(/\/+$/, "");
  if (cleaned.startsWith("actors/")) return cleaned.split("/")[1] ?? "";
  return cleaned.replace("/", "~");
}

function json(o: any, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes.user;
    if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

    const { actor_id, account_id } = await req.json().catch(() => ({}));
    const actorId = normalizeActorId(actor_id);
    if (!actorId) return json({ ok: false, error: "actor_id required" }, 400);

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Pick a token: a specific account if given, else any active account, else the platform token.
    let token = "";
    if (account_id) {
      const { data: acc } = await admin.from("social_apify_accounts").select("api_token").eq("id", account_id).eq("user_id", user.id).maybeSingle();
      token = (acc as any)?.api_token ?? "";
    }
    if (!token) {
      const { data: accs } = await admin.from("social_apify_accounts").select("api_token").eq("user_id", user.id).eq("active", true).limit(1);
      token = (accs as any[])?.[0]?.api_token ?? "";
    }
    if (!token) token = Deno.env.get("APIFY_API_TOKEN") ?? "";
    if (!token) return json({ ok: false, error: "No Apify token available. Add an Apify account first." }, 200);

    // GET the actor metadata — validates it exists and the token can reach it. No run, no cost.
    const r = await fetch(`https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}?token=${token}`);
    if (r.ok) {
      const d = await r.json().catch(() => ({}));
      const a = d?.data ?? {};
      return json({
        ok: true,
        actor_id: actorId,
        name: a.name ?? actorId,
        title: a.title ?? null,
        username: a.username ?? null,
        url: a.username && a.name ? `https://apify.com/${a.username}/${a.name}` : null,
      });
    }
    if (r.status === 404) return json({ ok: false, actor_id: actorId, error: "Actor not found (404). Check the ID." }, 200);
    if (r.status === 401) return json({ ok: false, actor_id: actorId, error: "Apify token rejected (401)." }, 200);
    const t = await r.text();
    return json({ ok: false, actor_id: actorId, error: `Apify ${r.status}: ${t.slice(0, 200)}` }, 200);
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500);
  }
});
