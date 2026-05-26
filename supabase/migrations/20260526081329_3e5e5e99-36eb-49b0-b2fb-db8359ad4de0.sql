
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE IF NOT EXISTS public.linkedin_engagement_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  draft_text TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  liked BOOLEAN NOT NULL DEFAULT false,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);

ALTER TABLE public.linkedin_engagement_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "engagement select own" ON public.linkedin_engagement_comments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "engagement insert own" ON public.linkedin_engagement_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "engagement update own" ON public.linkedin_engagement_comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "engagement delete own" ON public.linkedin_engagement_comments FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_engagement_user_post ON public.linkedin_engagement_comments(user_id, post_id);

CREATE TRIGGER trg_engagement_updated_at
BEFORE UPDATE ON public.linkedin_engagement_comments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
