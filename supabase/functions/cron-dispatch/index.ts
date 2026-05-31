import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/**
 * Tiny authorized relay for the every-minute scheduler cron.
 *
 * The real worker (`dispatch-due-posts`) only accepts cron-mode calls from the
 * service-role key. pg_cron can't safely hold that key, so the cron instead
 * calls THIS function with a shared `x-cron-secret` (stored in `app_config`).
 * We verify the secret, then invoke `dispatch-due-posts` with the service-role
 * key this function already has in its environment.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const secret = req.headers.get("x-cron-secret") || "";
  const { data: cfg } = await admin.from("app_config").select("value").eq("key", "cron_secret").maybeSingle();
  if (!secret || !(cfg as any)?.value || (cfg as any).value !== secret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/dispatch-due-posts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: "{}",
  });
  const txt = await res.text();
  return new Response(txt, {
    status: res.status, headers: { "Content-Type": "application/json" },
  });
});
