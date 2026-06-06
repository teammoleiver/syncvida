-- History of AI Auto-Fill generations so users can compare quality scores
-- across prompts, themes, and the new hashtag-first style toggle.
CREATE TABLE IF NOT EXISTS public.linkedin_template_fill_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  theme_key text,
  hashtag_first boolean NOT NULL DEFAULT false,
  post_hook text,
  post_body text,
  slides jsonb NOT NULL,
  icon_hints jsonb,
  score integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  warnings integer NOT NULL DEFAULT 0,
  applied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.linkedin_template_fill_history TO authenticated;
GRANT ALL ON public.linkedin_template_fill_history TO service_role;

ALTER TABLE public.linkedin_template_fill_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fill_history_select_own" ON public.linkedin_template_fill_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "fill_history_insert_own" ON public.linkedin_template_fill_history
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "fill_history_update_own" ON public.linkedin_template_fill_history
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "fill_history_delete_own" ON public.linkedin_template_fill_history
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_fill_history_user_created
  ON public.linkedin_template_fill_history (user_id, created_at DESC);
