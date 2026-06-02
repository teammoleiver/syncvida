-- Allow the 'deleted' status (used by LinkedIn Review reject → delete).
alter table public.linkedin_post_states drop constraint if exists linkedin_post_states_status_check;
alter table public.linkedin_post_states add constraint linkedin_post_states_status_check
  check (status in ('pending','kept','rejected','deleted'));
