-- Learned writing-style rules from rejected/deleted posts (Settings-editable).
create table if not exists public.linkedin_writing_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rule text not null,
  reason text,
  source text not null default 'reject',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.linkedin_writing_memory enable row level security;
drop policy if exists "own linkedin_writing_memory" on public.linkedin_writing_memory;
create policy "own linkedin_writing_memory"
  on public.linkedin_writing_memory for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists linkedin_writing_memory_user_idx on public.linkedin_writing_memory (user_id, created_at desc);
