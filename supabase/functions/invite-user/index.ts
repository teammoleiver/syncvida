import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Manage closed-beta invites (action = invite | resend | remove).
 *  - invite: create a confirmed account with a temp password; return creds.
 *  - resend: set a NEW temp password for an email you invited; return creds.
 *  - remove: delete the account + the invite record for an email you invited.
 * resend/remove are scoped to invites the CALLER created, so this can't be used
 * to touch arbitrary accounts.
 */
function tempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  let s = "";
  for (const n of arr) s += chars[n % chars.length];
  return `${s}9!`;
}

async function findUserByEmail(admin: any, email: string) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return (data?.users || []).find((u: any) => (u.email || "").toLowerCase() === email) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const action = String(body?.action || "invite");
    const clean = String(body?.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return json({ error: "Enter a valid email address" }, 200);

    const admin = createClient(supabaseUrl, serviceKey);

    if (action === "invite") {
      const password = tempPassword();
      const { error } = await admin.auth.admin.createUser({ email: clean, password, email_confirm: true });
      if (error) {
        const msg = /already.*regist|exists|been registered|duplicate/i.test(error.message)
          ? "That email is already registered — they can just sign in."
          : error.message;
        return json({ error: msg }, 200);
      }
      await admin.from("invites").insert({ email: clean, invited_by: user.id, status: "invited" });
      return json({ email: clean, password }, 200);
    }

    // resend / remove must target an invite the caller actually sent.
    const { data: own } = await admin.from("invites").select("id").eq("email", clean).eq("invited_by", user.id);
    if (!own?.length) return json({ error: "You haven't invited that email." }, 200);

    const target = await findUserByEmail(admin, clean);

    if (action === "remove") {
      if (target) await admin.auth.admin.deleteUser(target.id);
      await admin.from("invites").delete().eq("email", clean).eq("invited_by", user.id);
      return json({ ok: true }, 200);
    }

    if (action === "resend") {
      const password = tempPassword();
      const res = target
        ? await admin.auth.admin.updateUserById(target.id, { password, email_confirm: true })
        : await admin.auth.admin.createUser({ email: clean, password, email_confirm: true });
      if ((res as any)?.error) return json({ error: (res as any).error.message }, 200);
      return json({ email: clean, password }, 200);
    }

    return json({ error: "Unknown action" }, 200);
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
