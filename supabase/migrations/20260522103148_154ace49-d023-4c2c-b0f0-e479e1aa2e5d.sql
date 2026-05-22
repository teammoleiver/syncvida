
-- 1) Replace open "Allow all" policies with owner-scoped policies
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'user_profile','weight_logs','water_logs','exercise_logs','meal_logs',
    'fasting_logs','fasting_52_schedule','daily_checklist','ai_chat_history','goals'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow all select on %1$s" ON public.%1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Allow all insert on %1$s" ON public.%1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Allow all update on %1$s" ON public.%1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Allow all delete on %1$s" ON public.%1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Users select own %1$s" ON public.%1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Users insert own %1$s" ON public.%1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Users update own %1$s" ON public.%1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Users delete own %1$s" ON public.%1$s', tbl);

    EXECUTE format('CREATE POLICY "Users select own %1$s" ON public.%1$s FOR SELECT TO authenticated USING (auth.uid() = user_id)', tbl);
    EXECUTE format('CREATE POLICY "Users insert own %1$s" ON public.%1$s FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)', tbl);
    EXECUTE format('CREATE POLICY "Users update own %1$s" ON public.%1$s FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', tbl);
    EXECUTE format('CREATE POLICY "Users delete own %1$s" ON public.%1$s FOR DELETE TO authenticated USING (auth.uid() = user_id)', tbl);
  END LOOP;
END $$;

-- 2) waitlist: tighten insert and add explicit deny for read/update/delete
DROP POLICY IF EXISTS "Anyone can join waitlist" ON public.waitlist;
CREATE POLICY "Anyone can join waitlist (valid email)"
ON public.waitlist FOR INSERT TO anon, authenticated
WITH CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' AND char_length(email) <= 254);

DROP POLICY IF EXISTS "Waitlist no client read" ON public.waitlist;
CREATE POLICY "Waitlist no client read" ON public.waitlist FOR SELECT TO anon, authenticated USING (false);
DROP POLICY IF EXISTS "Waitlist no client update" ON public.waitlist;
CREATE POLICY "Waitlist no client update" ON public.waitlist FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "Waitlist no client delete" ON public.waitlist;
CREATE POLICY "Waitlist no client delete" ON public.waitlist FOR DELETE TO anon, authenticated USING (false);

-- 3) oauth_states: explicit deny for all client access (service role bypasses RLS)
DROP POLICY IF EXISTS "oauth_states no client access" ON public.oauth_states;
CREATE POLICY "oauth_states no client access" ON public.oauth_states FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- 4) social_apify_accounts: hide api_token from clients via column privileges + safe view
REVOKE SELECT (api_token) ON public.social_apify_accounts FROM anon, authenticated;

CREATE OR REPLACE VIEW public.social_apify_accounts_safe
WITH (security_invoker = true) AS
SELECT
  id, user_id, label, actor_id, active, monthly_budget_usd,
  period_start, created_at, updated_at
FROM public.social_apify_accounts;

GRANT SELECT ON public.social_apify_accounts_safe TO anon, authenticated;
