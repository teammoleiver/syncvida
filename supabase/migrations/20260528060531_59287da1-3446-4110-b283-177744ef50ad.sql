DROP POLICY IF EXISTS "Users can view their own apify account metadata" ON public.social_apify_accounts;
REVOKE SELECT ON public.social_apify_accounts FROM authenticated;