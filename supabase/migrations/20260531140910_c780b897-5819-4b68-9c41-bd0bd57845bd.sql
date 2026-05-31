-- Memory entries learned from the user's accept/reject choices on scraped social posts.
-- Mirrors linkedin_writing_memory: each row is one "rule" (a tag or sentence) the
-- relevance scorer will use to better understand what the user likes/dislikes.
CREATE TABLE IF NOT EXISTS public.social_scrape_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  signal TEXT NOT NULL CHECK (signal IN ('positive','negative')),
  tags TEXT[] NOT NULL DEFAULT '{}',
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'manual',  -- 'ignore' | 'delete' | 'generate' | 'manual' | 'like'
  source_post_id UUID,
  source_post_author TEXT,
  source_post_excerpt TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_scrape_memory TO authenticated;
GRANT ALL ON public.social_scrape_memory TO service_role;

ALTER TABLE public.social_scrape_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own scrape memory"
  ON public.social_scrape_memory FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own scrape memory"
  ON public.social_scrape_memory FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own scrape memory"
  ON public.social_scrape_memory FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users delete own scrape memory"
  ON public.social_scrape_memory FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS social_scrape_memory_user_active_idx
  ON public.social_scrape_memory (user_id, active, created_at DESC);

CREATE TRIGGER touch_social_scrape_memory_updated_at
BEFORE UPDATE ON public.social_scrape_memory
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();