// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(o: any, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function num(...vals: any[]): number | null {
  for (const v of vals) { const n = Number(v); if (!Number.isNaN(n) && v != null) return n; }
  return null;
}

/**
 * For each of the user's Apify accounts, read the REAL usage + monthly limit
 * straight from Apify (via the saved token — no password/login needed), plus
 * check whether the LinkedIn actor's permissions are approved. Writes a status
 * back to each account so the pool bar reflects true credit, not our estimate.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { actor_id } = await req.json().catch(() => ({}));
    const actorId = String(actor_id || "94SdiE9JwTx0RNyfS").trim();

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: accounts } = await admin.from("social_apify_accounts").select("id,label,api_token,actor_id").eq("user_id", user.id);
    if (!accounts?.length) return json({ accounts: [] });

    const results = await Promise.all((accounts as any[]).map(async (a) => {
      const token = a.api_token;
      const out: any = { id: a.id, label: a.label };
      try {
        // 1) Identity + plan
        const me = await fetch(`https://api.apify.com/v2/users/me?token=${token}`);
        if (!me.ok) { out.status = me.status === 401 ? "invalid token" : `auth ${me.status}`; out.ok = false; return out; }
        const meJson = await me.json().catch(() => ({}));
        out.username = meJson?.data?.username ?? null;
        out.plan = meJson?.data?.plan?.id ?? meJson?.data?.plan ?? "free";

        // 2) Real monthly usage + limit + billing-cycle dates (when $5 renews)
        const lim = await fetch(`https://api.apify.com/v2/users/me/limits?token=${token}`);
        if (lim.ok) {
          const d = (await lim.json().catch(() => ({})))?.data ?? {};
          const limitUsd = num(d?.limits?.maxMonthlyUsageUsd, d?.maxMonthlyUsageUsd, d?.current?.maxMonthlyUsageUsd) ?? 5;
          const usedUsd = num(d?.current?.monthlyUsageUsd, d?.monthlyUsageUsd, d?.current?.monthlyServiceUsageUsd) ?? 0;
          out.limitUsd = limitUsd;
          out.usedUsd = usedUsd;
          out.remainingUsd = Math.max(0, limitUsd - usedUsd);
          out.limitHit = out.remainingUsd <= 0.01;
          // Cycle end = when the monthly free usage renews.
          out.cycleEnd = d?.monthlyUsageCycle?.endAt ?? d?.current?.monthlyUsageCycleEndAt ?? null;
        }

        // 3) Actor permission check — GET the actor with this token. 200 = reachable.
        const act = await fetch(`https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}?token=${token}`);
        out.actorReachable = act.ok;

        // Decide a single status the UI can color.
        if (out.limitHit) out.status = "out of credit";
        else if (out.remainingUsd != null && out.remainingUsd < 0.5) out.status = "low credit";
        else out.status = "ok";
        out.ok = !out.limitHit;
      } catch (e: any) {
        out.status = "check failed"; out.ok = false; out.error = String(e?.message ?? e);
      }
      // Persist a status for the pool bar to reflect real credit.
      await admin.from("social_apify_accounts").update({
        last_test_status: out.status, last_test_at: new Date().toISOString(),
        apify_usage_usd: out.usedUsd ?? null,
        apify_limit_usd: out.limitUsd ?? null,
        apify_cycle_end: out.cycleEnd ?? null,
        apify_checked_at: new Date().toISOString(),
      }).eq("id", a.id);
      return out;
    }));

    const approvalUrl = `https://console.apify.com/actors/${actorId}?approvePermissions=true`;
    return json({ accounts: results, actor_id: actorId, approval_url: approvalUrl });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
