-- =========================================================
-- social_apify_accounts: block client SELECT of api_token
-- =========================================================
DROP POLICY IF EXISTS "Users manage their own apify accounts" ON public.social_apify_accounts;
DROP POLICY IF EXISTS "Users can manage their own apify accounts" ON public.social_apify_accounts;
DROP POLICY IF EXISTS "Owner full access" ON public.social_apify_accounts;
DROP POLICY IF EXISTS "social_apify_accounts_all" ON public.social_apify_accounts;
DROP POLICY IF EXISTS "Users can insert their own apify accounts" ON public.social_apify_accounts;
DROP POLICY IF EXISTS "Users can update their own apify accounts" ON public.social_apify_accounts;
DROP POLICY IF EXISTS "Users can delete their own apify accounts" ON public.social_apify_accounts;

ALTER TABLE public.social_apify_accounts ENABLE ROW LEVEL SECURITY;

-- No SELECT policy on purpose: clients must read the sanitized
-- public.social_apify_accounts_safe view, which excludes api_token.
CREATE POLICY "Users can insert their own apify accounts"
  ON public.social_apify_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own apify accounts"
  ON public.social_apify_accounts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own apify accounts"
  ON public.social_apify_accounts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- =========================================================
-- social_oauth_connections: deny all direct client access
-- =========================================================
DROP POLICY IF EXISTS "Users can view their own connections" ON public.social_oauth_connections;
DROP POLICY IF EXISTS "Users can insert their own connections" ON public.social_oauth_connections;
DROP POLICY IF EXISTS "Users can update their own connections" ON public.social_oauth_connections;
DROP POLICY IF EXISTS "Users can delete their own connections" ON public.social_oauth_connections;
DROP POLICY IF EXISTS "Users manage their own connections" ON public.social_oauth_connections;
DROP POLICY IF EXISTS "social_oauth_connections_all" ON public.social_oauth_connections;

ALTER TABLE public.social_oauth_connections ENABLE ROW LEVEL SECURITY;

-- Explicit deny-by-default SELECT so OAuth tokens are never readable from the
-- client. Reads happen via the get_my_social_connections() SECURITY DEFINER
-- function (returns safe columns only). Writes happen in edge functions using
-- the service role, which bypasses RLS.
CREATE POLICY "Deny client SELECT on oauth connections"
  ON public.social_oauth_connections
  FOR SELECT
  TO authenticated
  USING (false);

CREATE POLICY "Deny client INSERT on oauth connections"
  ON public.social_oauth_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "Deny client UPDATE on oauth connections"
  ON public.social_oauth_connections
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Users can delete their own oauth connections"
  ON public.social_oauth_connections
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);