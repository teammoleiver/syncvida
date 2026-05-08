
-- ============ TABLES ============
CREATE TABLE public.brand_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  brand_name text,
  website_url text,
  colors jsonb NOT NULL DEFAULT '{"primary":"#1D9E75","secondary":"#0F6E56","accent":"#F5C451","bg":"#FFFFFF","text":"#0B0F0E"}'::jsonb,
  fonts jsonb NOT NULL DEFAULT '{"heading":"Inter","body":"Inter"}'::jsonb,
  logo_light_url text,
  logo_dark_url text,
  avatar_url text,
  footer_text text,
  tone text,
  extracted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.design_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('upload','ai_generated','ai_edited')),
  storage_path text NOT NULL,
  public_url text NOT NULL,
  prompt text,
  parent_asset_id uuid REFERENCES public.design_assets(id) ON DELETE SET NULL,
  width int,
  height int,
  mime text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX design_assets_user_idx ON public.design_assets(user_id, created_at DESC);

CREATE TABLE public.designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('single','carousel')),
  platform text NOT NULL DEFAULT 'linkedin' CHECK (platform IN ('linkedin','instagram','facebook','x','multi')),
  title text NOT NULL DEFAULT 'Untitled design',
  width int NOT NULL DEFAULT 1080,
  height int NOT NULL DEFAULT 1350,
  slides jsonb NOT NULL DEFAULT '[]'::jsonb,
  thumbnail_url text,
  planner_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX designs_user_idx ON public.designs(user_id, updated_at DESC);

CREATE TRIGGER trg_brand_kits_touch BEFORE UPDATE ON public.brand_kits
  FOR EACH ROW EXECUTE FUNCTION public.update_projects_updated_at();
CREATE TRIGGER trg_designs_touch BEFORE UPDATE ON public.designs
  FOR EACH ROW EXECUTE FUNCTION public.update_projects_updated_at();

-- ============ RLS ============
ALTER TABLE public.brand_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own brand kit select" ON public.brand_kits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own brand kit insert" ON public.brand_kits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own brand kit update" ON public.brand_kits FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own brand kit delete" ON public.brand_kits FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "own design assets select" ON public.design_assets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own design assets insert" ON public.design_assets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own design assets update" ON public.design_assets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own design assets delete" ON public.design_assets FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "own designs select" ON public.designs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own designs insert" ON public.designs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own designs update" ON public.designs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own designs delete" ON public.designs FOR DELETE USING (auth.uid() = user_id);

-- ============ STORAGE ============
INSERT INTO storage.buckets (id, name, public) VALUES
  ('brand-assets','brand-assets', false),
  ('design-assets','design-assets', false),
  ('design-exports','design-exports', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "brand-assets owner read" ON storage.objects FOR SELECT
  USING (bucket_id = 'brand-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "brand-assets owner write" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'brand-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "brand-assets owner update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'brand-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "brand-assets owner delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'brand-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "design-assets owner read" ON storage.objects FOR SELECT
  USING (bucket_id = 'design-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "design-assets owner write" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'design-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "design-assets owner update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'design-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "design-assets owner delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'design-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "design-exports owner read" ON storage.objects FOR SELECT
  USING (bucket_id = 'design-exports' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "design-exports owner write" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'design-exports' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "design-exports owner update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'design-exports' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "design-exports owner delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'design-exports' AND auth.uid()::text = (storage.foldername(name))[1]);
