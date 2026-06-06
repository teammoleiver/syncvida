-- Profile photos: let users mark design assets as one of their own headshots.
-- These (not the company brand logo) are used as the author face in LinkedIn
-- designs, and surfaced in the Brand Kit "Profile photos" section.
alter table public.design_assets
  add column if not exists is_profile boolean not null default false;

-- Fast lookup of a user's profile headshots.
create index if not exists design_assets_is_profile_idx
  on public.design_assets (user_id)
  where is_profile;
