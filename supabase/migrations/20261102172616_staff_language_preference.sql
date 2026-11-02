-- Interface preference only; does not affect roles, permissions or location access.
alter table public.staff_lane_profiles add column preferred_language text check(preferred_language in ('en','es'));
