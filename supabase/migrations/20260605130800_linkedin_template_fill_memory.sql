-- Memory store for the AI carousel template auto-filler.
CREATE TABLE IF NOT EXISTS public.linkedin_template_fill_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  theme_key text,
  post_hook text,
  post_body text,
  slides jsonb NOT NULL,
  icon_hints jsonb,
  rating smallint,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedin_template_fill_memory_user_idx
  ON public.linkedin_template_fill_memory (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.linkedin_template_fill_memory TO authenticated;
GRANT ALL ON public.linkedin_template_fill_memory TO service_role;

ALTER TABLE public.linkedin_template_fill_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own rows select" ON public.linkedin_template_fill_memory
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own rows insert" ON public.linkedin_template_fill_memory
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own rows update" ON public.linkedin_template_fill_memory
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own rows delete" ON public.linkedin_template_fill_memory
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
