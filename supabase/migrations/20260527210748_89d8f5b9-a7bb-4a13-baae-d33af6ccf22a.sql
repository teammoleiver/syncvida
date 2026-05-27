CREATE OR REPLACE VIEW public.social_apify_accounts_safe
WITH (security_invoker = true) AS
SELECT
  id,
  user_id,
  label,
  actor_id,
  active,
  monthly_budget_usd,
  period_start,
  created_at,
  updated_at
FROM public.social_apify_accounts
WHERE user_id = auth.uid();

GRANT SELECT ON public.social_apify_accounts_safe TO authenticated;
REVOKE ALL ON public.social_apify_accounts_safe FROM anon;