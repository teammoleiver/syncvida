-- Fix: new users got "permission denied for table social_apify_accounts" when
-- adding an Apify account. The `authenticated` role had INSERT/UPDATE/DELETE but
-- was missing the table-level SELECT grant, so loading the pool — and reading
-- back the row after insert (.select()) — was denied at the privilege layer
-- (this is distinct from RLS; the per-user RLS policies were already correct).
grant select on table public.social_apify_accounts to authenticated;
