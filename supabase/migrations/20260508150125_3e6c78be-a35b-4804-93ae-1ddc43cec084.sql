
-- Carousel exports bucket: scope storage policies to owner folder
DROP POLICY IF EXISTS "carousel-exports public read" ON storage.objects;
DROP POLICY IF EXISTS "carousel-exports authed write" ON storage.objects;
DROP POLICY IF EXISTS "carousel-exports authed update" ON storage.objects;

CREATE POLICY "carousel-exports owner select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'carousel-exports' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "carousel-exports owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'carousel-exports' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "carousel-exports owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'carousel-exports' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'carousel-exports' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "carousel-exports owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'carousel-exports' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- Make carousel-exports private (public file URLs replaced with signed URLs in app code if needed)
UPDATE storage.buckets SET public = false WHERE id = 'carousel-exports';

-- Revoke EXECUTE on SECURITY DEFINER functions from anon/authenticated (they're trigger-only)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, public;
