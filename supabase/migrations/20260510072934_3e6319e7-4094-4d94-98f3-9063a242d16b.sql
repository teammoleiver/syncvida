ALTER TABLE public.design_assets ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.design_assets DROP CONSTRAINT IF EXISTS design_assets_kind_check;
ALTER TABLE public.design_assets ADD CONSTRAINT design_assets_kind_check CHECK (kind IN ('upload','ai_generated','ai_edited','url_import','bg_removed'));