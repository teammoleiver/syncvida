
-- 1) Fix SECURITY DEFINER view: enforce caller's RLS
ALTER VIEW public.social_apify_accounts_safe SET (security_invoker = true);

-- 2) Drop duplicate DELETE policy on social_oauth_connections that targets PUBLIC role
DROP POLICY IF EXISTS "users delete own connections" ON public.social_oauth_connections;

-- 3) Add storage policies for the private health-records bucket (owner folder = auth.uid())
DROP POLICY IF EXISTS "health_records_select_own" ON storage.objects;
DROP POLICY IF EXISTS "health_records_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "health_records_update_own" ON storage.objects;
DROP POLICY IF EXISTS "health_records_delete_own" ON storage.objects;

CREATE POLICY "health_records_select_own"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'health-records' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "health_records_insert_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'health-records' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "health_records_update_own"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'health-records' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'health-records' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "health_records_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'health-records' AND auth.uid()::text = (storage.foldername(name))[1]);
