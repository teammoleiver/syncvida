ALTER TABLE public.social_writer_settings
  ADD COLUMN IF NOT EXISTS comment_target_daily integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS comment_target_weekly integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS comment_target_monthly integer NOT NULL DEFAULT 200;