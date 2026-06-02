-- Backend-only config (service role bypasses RLS; no anon/authenticated policies).
-- Holds the shared secret the every-minute cron uses to authorize cron-dispatch.
create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;

insert into public.app_config (key, value)
  values ('cron_secret', gen_random_uuid()::text)
  on conflict (key) do nothing;
