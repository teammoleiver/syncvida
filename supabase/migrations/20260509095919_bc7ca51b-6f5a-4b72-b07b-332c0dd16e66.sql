CREATE TABLE public.linkedin_post_states (
  user_id UUID NOT NULL,
  post_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','kept','rejected')),
  edited_body TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

ALTER TABLE public.linkedin_post_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users select own linkedin post states"
  ON public.linkedin_post_states FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users insert own linkedin post states"
  ON public.linkedin_post_states FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own linkedin post states"
  ON public.linkedin_post_states FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own linkedin post states"
  ON public.linkedin_post_states FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_linkedin_post_states_updated_at
  BEFORE UPDATE ON public.linkedin_post_states
  FOR EACH ROW EXECUTE FUNCTION public.update_projects_updated_at();