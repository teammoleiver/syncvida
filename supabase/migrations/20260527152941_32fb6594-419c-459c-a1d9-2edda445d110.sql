CREATE TABLE public.social_self_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  followers integer,
  connections integer,
  posts_count integer,
  total_likes integer,
  total_comments integer,
  total_shares integer,
  total_views integer,
  raw jsonb
);
CREATE INDEX social_self_snapshots_user_time_idx ON public.social_self_snapshots(user_id, captured_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_self_snapshots TO authenticated;
GRANT ALL ON public.social_self_snapshots TO service_role;
ALTER TABLE public.social_self_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "self snapshots select own" ON public.social_self_snapshots FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "self snapshots insert own" ON public.social_self_snapshots FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "self snapshots update own" ON public.social_self_snapshots FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "self snapshots delete own" ON public.social_self_snapshots FOR DELETE TO authenticated USING (auth.uid() = user_id);