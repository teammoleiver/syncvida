import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Invite a new user into the closed beta. The signed-in owner calls this with
 * an email; we create the auth account (if new) and return a one-time invite
 * link they can share by any channel. Clicking it lands the invitee on
 * /reset-password where they set a password and are in — no public signup.
 */
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

    const { email, redirectTo } = await req.json();
    const clean = String(email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return json({ error: "Enter a valid email address" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    const redirect = (typeof redirectTo === "string" && redirectTo.startsWith("http"))
      ? redirectTo
      : `${Deno.env.get("APP_BASE_URL") || "https://app.syncvida.com"}/reset-password`;

    // Creates the auth user (if new) and returns a one-time invite action link.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email: clean,
      options: { redirectTo: redirect },
    });
    if (error) {
      const msg = /already.*regist|exists/i.test(error.message)
        ? "That email is already registered."
        : error.message;
      return json({ error: msg }, 400);
    }
    const link = (data as any)?.properties?.action_link ?? null;

    await admin.from("invites").insert({ email: clean, invited_by: user.id, status: "invited" });

    return json({ link, email: clean }, 200);
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
