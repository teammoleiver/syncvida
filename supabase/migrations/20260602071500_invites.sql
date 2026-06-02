-- Invite-only beta access: tracks invites sent from Settings → Invite people.
-- Idempotent so it applies cleanly on a fresh DB or one already updated via MCP.
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  invited_by uuid references auth.users(id) on delete set null,
  status text not null default 'invited',
  created_at timestamptz not null default now()
);

alter table public.invites enable row level security;

drop policy if exists "own invites" on public.invites;
create policy "own invites"
  on public.invites for all
  using (invited_by = auth.uid())
  with check (invited_by = auth.uid());

create index if not exists invites_inviter_idx on public.invites (invited_by, created_at desc);
