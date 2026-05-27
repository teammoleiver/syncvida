GRANT SELECT (
  id,
  user_id,
  label,
  actor_id,
  monthly_budget_usd,
  cost_per_10_posts_usd,
  period_start,
  posts_used_this_period,
  last_used_at,
  last_test_status,
  last_test_at,
  active,
  created_at,
  updated_at,
  actor_input_defaults
) ON public.social_apify_accounts TO authenticated;

REVOKE SELECT (api_token) ON public.social_apify_accounts FROM authenticated, anon;

DROP POLICY IF EXISTS "Users can view their own apify account metadata" ON public.social_apify_accounts;
CREATE POLICY "Users can view their own apify account metadata"
  ON public.social_apify_accounts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);