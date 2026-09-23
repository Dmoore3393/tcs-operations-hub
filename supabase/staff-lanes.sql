-- TCS Operations Hub — Approved Staff Lane Profiles
-- The lane sheet is the organizational source of truth.
-- Hub access role remains separate in public.staff_access.

create table if not exists public.staff_lane_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  staff_user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  preferred_name text,
  lane_level integer check (lane_level is null or lane_level between 1 and 6),
  lane_group text not null,
  job_title text not null,
  secondary_title text,
  department text,
  primary_location text,
  reports_to_lane_id uuid references public.staff_lane_profiles(id) on delete set null,
  reports_to_label text,
  lane_summary text,
  source_label text not null default 'Approved TCS Lane Sheet',
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists staff_lane_profiles_org_name_unique
  on public.staff_lane_profiles (organization_id, lower(full_name));

create index if not exists staff_lane_profiles_org_sort_idx
  on public.staff_lane_profiles (organization_id, lane_group, sort_order, full_name);

create index if not exists staff_lane_profiles_reports_to_idx
  on public.staff_lane_profiles (reports_to_lane_id)
  where reports_to_lane_id is not null;

alter table public.staff_lane_profiles enable row level security;

drop policy if exists "staff lanes read same organization" on public.staff_lane_profiles;
create policy "staff lanes read same organization"
on public.staff_lane_profiles
for select
to authenticated
using (organization_id = public.current_staff_organization_id());

revoke insert, update, delete on public.staff_lane_profiles from authenticated;
grant select on public.staff_lane_profiles to authenticated;
grant all on public.staff_lane_profiles to service_role;

drop trigger if exists set_staff_lane_profiles_updated_at on public.staff_lane_profiles;
create trigger set_staff_lane_profiles_updated_at
before update on public.staff_lane_profiles
for each row execute function public.set_updated_at();

-- Approved lane roster is seeded in production from the TCS lane-sheet set.
-- Future lane changes should update this table without changing staff_access.role,
-- unless the person's actual software access also changes.
