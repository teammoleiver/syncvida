ALTER TABLE public.social_profiles
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lists text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_social_profiles_user_favorite ON public.social_profiles (user_id, is_favorite) WHERE is_favorite = true;
CREATE INDEX IF NOT EXISTS idx_social_profiles_lists_gin ON public.social_profiles USING GIN (lists);