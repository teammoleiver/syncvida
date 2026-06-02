import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Invite a tester into the closed beta. The signed-in owner calls this with an
 * email; we create a confirmed account with a temporary password and return
 * those credentials. The owner shares them; the invitee signs in normally at
 * /auth and changes the password in Settings. No public signup, no magic-link
 * expiry / redirect-allowlist issues — works on any URL.
 */
function tempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  let s = "";
  for (const n of arr) s += chars[n % chars.length];
  return `${s}9!`; // satisfies length + complexity
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

    const { email } = await req.json();
    const clean = String(email || "").trim().toLowerCase();
    // Expected/user errors return 200 + `error` so the client shows the real
    // message (supabase.functions.invoke hides non-2xx bodies behind a generic
    // "non-2xx" error).
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return json({ error: "Enter a valid email address" }, 200);

    const admin = createClient(supabaseUrl, serviceKey);
    const password = tempPassword();

    const { error } = await admin.auth.admin.createUser({
      email: clean,
      password,
      email_confirm: true, // confirmed → they can sign in immediately
    });
    if (error) {
      const msg = /already.*regist|exists|been registered|duplicate/i.test(error.message)
        ? "That email is already registered — they can just sign in."
        : error.message;
      return json({ error: msg }, 200);
    }

    await admin.from("invites").insert({ email: clean, invited_by: user.id, status: "invited" });

    return json({ email: clean, password }, 200);
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
