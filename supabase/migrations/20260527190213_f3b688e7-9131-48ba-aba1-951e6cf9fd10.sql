-- 1. Explicit anon deny on canva_oauth_tokens
CREATE POLICY "No anon Canva token access"
ON public.canva_oauth_tokens
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 2. Restrict social_search_providers owner policy to authenticated only
DROP POLICY IF EXISTS "search_providers_owner" ON public.social_search_providers;

CREATE POLICY "search_providers_owner"
ON public.social_search_providers
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);