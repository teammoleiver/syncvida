// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function num(...vals: any[]): number | null {
  for (const v of vals) { const n = Number(v); if (!Number.isNaN(n) && v != null) return n; }
  return null;
}

/**
 * Weekly cron: refreshes EVERY Apify account's real usage/limit/renewal from the
 * Apify API (via each saved token). Keeps the pool's credit numbers fresh and lets
 * the scraper rotation always pick the fullest account first. No actor runs.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: accounts } = await admin.from("social_apify_accounts").select("id, api_token");
    const list = (accounts as any[]) ?? [];
    let updated = 0;

    // Process in small concurrent batches to stay within the function time limit.
    for (let i = 0; i < list.length; i += 8) {
      const chunk = list.slice(i, i + 8);
      await Promise.all(chunk.map(async (a) => {
        const patch: any = { apify_checked_at: new Date().toISOString(), last_test_at: new Date().toISOString() };
        try {
          const lim = await fetch(`https://api.apify.com/v2/users/me/limits?token=${a.api_token}`);
          if (!lim.ok) {
            patch.last_test_status = lim.status === 401 ? "invalid token" : `auth ${lim.status}`;
          } else {
            const d = (await lim.json().catch(() => ({})))?.data ?? {};
            const limitUsd = num(d?.limits?.maxMonthlyUsageUsd, d?.maxMonthlyUsageUsd, d?.current?.maxMonthlyUsageUsd) ?? 5;
            const usedUsd = num(d?.current?.monthlyUsageUsd, d?.monthlyUsageUsd, d?.current?.monthlyServiceUsageUsd) ?? 0;
            const remaining = Math.max(0, limitUsd - usedUsd);
            patch.apify_usage_usd = usedUsd;
            patch.apify_limit_usd = limitUsd;
            patch.apify_cycle_end = d?.monthlyUsageCycle?.endAt ?? d?.current?.monthlyUsageCycleEndAt ?? null;
            patch.last_test_status = remaining <= 0.01 ? "out of credit" : remaining < 0.5 ? "low credit" : "ok";
          }
        } catch (e: any) {
          patch.last_test_status = "check failed";
        }
        await admin.from("social_apify_accounts").update(patch).eq("id", a.id);
        updated++;
      }));
    }

    return new Response(JSON.stringify({ ok: true, accounts: list.length, updated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
