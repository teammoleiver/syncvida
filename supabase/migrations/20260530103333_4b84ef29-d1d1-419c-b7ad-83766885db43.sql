ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS ignored_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ignored_reason TEXT,
  ADD COLUMN IF NOT EXISTS relevance_score INTEGER,
  ADD COLUMN IF NOT EXISTS relevance_fields JSONB,
  ADD COLUMN IF NOT EXISTS relevance_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS relevance_computed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_social_posts_ignored ON public.social_posts(user_id, ignored_at);
CREATE INDEX IF NOT EXISTS idx_social_posts_relevance ON public.social_posts(user_id, relevance_score DESC NULLS LAST);