-- 1. Remove permissive ALL policy on social_apify_accounts that exposed api_token via SELECT
DROP POLICY IF EXISTS "Users manage own social_apify_accounts" ON public.social_apify_accounts;

-- 2. Add missing INSERT policy on webhook_logs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='webhook_logs') THEN
    EXECUTE 'DROP POLICY IF EXISTS "webhook_logs owner insert" ON public.webhook_logs';
    EXECUTE 'CREATE POLICY "webhook_logs owner insert" ON public.webhook_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)';
  END IF;
END$$;

-- 3. Add missing UPDATE policy on social_website_enrichments
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='social_website_enrichments') THEN
    EXECUTE 'DROP POLICY IF EXISTS "social_website_enrichments owner update" ON public.social_website_enrichments';
    EXECUTE 'CREATE POLICY "social_website_enrichments owner update" ON public.social_website_enrichments FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
END$$;

-- 4. Fix mutable search_path on touch_apify_actors_updated_at
CREATE OR REPLACE FUNCTION public.touch_apify_actors_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END
$function$;