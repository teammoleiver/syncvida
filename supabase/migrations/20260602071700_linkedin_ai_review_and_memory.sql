-- Cached AI review per LinkedIn design + learned design-memory rules.
create table if not exists public.linkedin_ai_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  design_id text not null,
  review jsonb not null default '{}'::jsonb,
  applied jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, design_id)
);
alter table public.linkedin_ai_reviews enable row level security;
drop policy if exists "own linkedin_ai_reviews" on public.linkedin_ai_reviews;
create policy "own linkedin_ai_reviews"
  on public.linkedin_ai_reviews for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.linkedin_design_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rule text not null,
  source text not null default 'ai_review',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.linkedin_design_memory enable row level security;
drop policy if exists "own linkedin_design_memory" on public.linkedin_design_memory;
create policy "own linkedin_design_memory"
  on public.linkedin_design_memory for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists linkedin_design_memory_user_idx on public.linkedin_design_memory (user_id, created_at desc);
