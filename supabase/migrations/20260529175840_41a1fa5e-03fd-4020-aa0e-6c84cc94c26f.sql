CREATE TABLE public.linkedin_profile_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  profile_url text,
  overall_score integer,
  report jsonb NOT NULL,
  diff jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lpa_user_created ON public.linkedin_profile_audits (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.linkedin_profile_audits TO authenticated;
GRANT ALL ON public.linkedin_profile_audits TO service_role;

ALTER TABLE public.linkedin_profile_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit owners select" ON public.linkedin_profile_audits
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "audit owners insert" ON public.linkedin_profile_audits
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "audit owners delete" ON public.linkedin_profile_audits
  FOR DELETE TO authenticated USING (auth.uid() = user_id);