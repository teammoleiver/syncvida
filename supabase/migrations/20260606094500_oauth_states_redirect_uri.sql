-- Multi-origin OAuth: store the exact redirect_uri used in the authorize step so
-- the token exchange can reuse the identical value (OAuth requires a byte-for-byte
-- match). This lets one Supabase backend serve multiple front-end origins —
-- localhost:8080 in dev and https://instaleadsync.com in prod — instead of being pinned
-- to a single hardcoded LINKEDIN_REDIRECT_URI. Shared by linkedin/canva/meta flows.
alter table public.oauth_states
  add column if not exists redirect_uri text;
