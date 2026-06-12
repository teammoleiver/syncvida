
-- ============= CRM Companies =============
CREATE TABLE public.crm_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT,
  industry TEXT,
  size TEXT,
  website TEXT,
  logo_url TEXT,
  linkedin_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_companies TO authenticated;
GRANT ALL ON public.crm_companies TO service_role;
ALTER TABLE public.crm_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own companies" ON public.crm_companies FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_crm_companies_user ON public.crm_companies(user_id);
CREATE INDEX idx_crm_companies_domain ON public.crm_companies(user_id, lower(domain));

-- ============= CRM Contacts =============
CREATE TABLE public.crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  title TEXT,
  company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  linkedin_url TEXT,
  avatar_url TEXT,
  notes TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'manual', -- manual | card_scan | csv | social_hub | text
  source_profile_id UUID, -- references social_profiles loosely
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_contacts TO authenticated;
GRANT ALL ON public.crm_contacts TO service_role;
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own contacts" ON public.crm_contacts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_crm_contacts_user ON public.crm_contacts(user_id);
CREATE INDEX idx_crm_contacts_company ON public.crm_contacts(company_id);
CREATE INDEX idx_crm_contacts_linkedin ON public.crm_contacts(user_id, lower(linkedin_url));

-- ============= CRM Pipelines =============
CREATE TABLE public.crm_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#1D9E75',
  is_default BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_pipelines TO authenticated;
GRANT ALL ON public.crm_pipelines TO service_role;
ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pipelines" ON public.crm_pipelines FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_crm_pipelines_user ON public.crm_pipelines(user_id);

-- ============= CRM Pipeline Stages =============
CREATE TABLE public.crm_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#94a3b8',
  position INTEGER NOT NULL DEFAULT 0,
  is_won BOOLEAN NOT NULL DEFAULT false,
  is_lost BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_pipeline_stages TO authenticated;
GRANT ALL ON public.crm_pipeline_stages TO service_role;
ALTER TABLE public.crm_pipeline_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own stages" ON public.crm_pipeline_stages FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_crm_stages_pipeline ON public.crm_pipeline_stages(pipeline_id, position);

-- ============= CRM Deals =============
CREATE TABLE public.crm_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.crm_pipeline_stages(id) ON DELETE RESTRICT,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  value NUMERIC(14,2),
  currency TEXT NOT NULL DEFAULT 'USD',
  expected_close_date DATE,
  notes TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_deals TO authenticated;
GRANT ALL ON public.crm_deals TO service_role;
ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own deals" ON public.crm_deals FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_crm_deals_user ON public.crm_deals(user_id);
CREATE INDEX idx_crm_deals_stage ON public.crm_deals(stage_id, position);
CREATE INDEX idx_crm_deals_pipeline ON public.crm_deals(pipeline_id);

-- ============= CRM Activities =============
CREATE TABLE public.crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.crm_deals(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'note', -- note | email | call | meeting | task
  content TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_activities TO authenticated;
GRANT ALL ON public.crm_activities TO service_role;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own activities" ON public.crm_activities FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_crm_activities_contact ON public.crm_activities(contact_id, occurred_at DESC);
CREATE INDEX idx_crm_activities_deal ON public.crm_activities(deal_id, occurred_at DESC);

-- ============= updated_at triggers =============
CREATE TRIGGER trg_crm_companies_updated BEFORE UPDATE ON public.crm_companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_crm_contacts_updated BEFORE UPDATE ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_crm_pipelines_updated BEFORE UPDATE ON public.crm_pipelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_crm_stages_updated BEFORE UPDATE ON public.crm_pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_crm_deals_updated BEFORE UPDATE ON public.crm_deals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= Default pipeline seeder =============
CREATE OR REPLACE FUNCTION public.crm_ensure_default_pipeline(_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid UUID;
BEGIN
  SELECT id INTO pid FROM public.crm_pipelines
    WHERE user_id = _user_id AND is_default = true LIMIT 1;
  IF pid IS NOT NULL THEN RETURN pid; END IF;

  INSERT INTO public.crm_pipelines (user_id, name, description, color, is_default, position)
    VALUES (_user_id, 'Sales', 'Default sales pipeline', '#1D9E75', true, 0)
    RETURNING id INTO pid;

  INSERT INTO public.crm_pipeline_stages (user_id, pipeline_id, name, color, position, is_won, is_lost) VALUES
    (_user_id, pid, 'New Lead',    '#3b82f6', 0, false, false),
    (_user_id, pid, 'Qualified',   '#8b5cf6', 1, false, false),
    (_user_id, pid, 'Proposal',    '#f59e0b', 2, false, false),
    (_user_id, pid, 'Negotiation', '#ec4899', 3, false, false),
    (_user_id, pid, 'Won',         '#10b981', 4, true,  false),
    (_user_id, pid, 'Lost',        '#94a3b8', 5, false, true);

  RETURN pid;
END;
$$;

-- Seed on new profile creation
CREATE OR REPLACE FUNCTION public.crm_seed_on_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.crm_ensure_default_pipeline(NEW.user_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_crm_seed_on_profile AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.crm_seed_on_profile();

-- Backfill for existing users
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM public.profiles LOOP
    PERFORM public.crm_ensure_default_pipeline(r.user_id);
  END LOOP;
END $$;
