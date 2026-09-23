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

-- Approved TCS lane roster.
insert into public.staff_lane_profiles
(organization_id, full_name, preferred_name, lane_level, lane_group, job_title, secondary_title, department, primary_location, reports_to_label, lane_summary, sort_order)
select id, x.full_name, x.preferred_name, x.lane_level, x.lane_group, x.job_title, x.secondary_title, x.department, x.primary_location, x.reports_to_label, x.lane_summary, x.sort_order
from public.organizations o
cross join (values
  ('Jennifer Thomason', null, 1, 'Executive', 'Director of Operations', null, 'Executive', null, null, 'Company operations and final organizational decisions.', 10),
  ('Anthony Thomason', 'Tony', 1, 'Executive', 'Owner • Director of Maintenance', null, 'Maintenance', null, null, 'Co-owner leadership, maintenance department, facilities, and ownership support.', 20),
  ('Danielle Moore', null, 2, 'Regional Leadership', 'Regional Director', 'Program Director — The School Age Center', 'Regional Operations', 'The School Age Center', 'Jennifer Thomason', 'Ensures childcare locations are safe, compliant, properly staffed, professionally operated, and following the Director of Operations expectations.', 30),
  ('Heather Graham', null, 2, 'Regional Leadership', 'Assistant Regional Director', 'Program Director — Our Little Village Childcare', 'Regional Operations', 'Our Little Village Childcare', 'Danielle Moore', 'Owns the safe, compliant, professional daily operation of Our Little Village Childcare while serving in a regional support role at other assigned locations.', 40),
  ('Noah Halstead', null, 3, 'Site Directors', 'Site Director', null, 'Childcare Operations', 'Tehachapi', 'Danielle Moore', 'Owns the safe, compliant, professional daily operation of Thomason Family Childcare in Tehachapi.', 50),
  ('Nathaly Cornejo', null, 3, 'Site Directors', 'Site Director', null, 'Childcare Operations', 'Cornejo Family Childcare • 33rd Street', 'Danielle Moore', 'Owns the safe, compliant, professional daily operation of Cornejo Family Childcare and is accountable for staff, families, documentation, and follow-through.', 60),
  ('Dynasty Lara', null, 3, 'Site Directors', 'Site Director', null, 'Childcare Operations', 'Lara Family Childcare • 42nd Street', 'Danielle Moore', 'Owns the safe, compliant, professional daily operation of Lara Family Childcare and is accountable for staff, families, documentation, and follow-through.', 70),
  ('Latrice Moore', null, 3, 'Site Directors', 'Site Director', null, 'Childcare Operations', 'Moore Family Childcare • Halcom', 'Danielle Moore', 'Owns the safe, compliant, professional daily operation of Moore Family Childcare across regular, extended, overnight, and weekend hours.', 80),
  ('Norma Valera', null, 4, 'Classroom Leadership', 'Lead Teacher', null, 'Classroom', 'Cornejo Family Childcare • 33rd Street', 'Nathaly Cornejo', 'Owns the safe, organized, engaging daily operation of her classroom and staff follow-through.', 90),
  ('Jacqueline Obregon', null, 4, 'Classroom Leadership', 'Lead Teacher', null, 'Classroom', 'Lara Family Childcare • 42nd Street', 'Dynasty Lara', 'Owns the safe, organized, engaging daily operation of her classroom and staff follow-through.', 100),
  ('Valeria Villalvazo', null, 5, 'Classroom Team', 'Teacher Assistant', null, 'Classroom', 'Lara Family Childcare • 42nd Street', 'Jacqueline Obregon', null, 110),
  ('Emily Olivares', null, 5, 'Classroom Team', 'Floater Teacher Assistant', null, 'Classroom', null, 'Heather Graham', null, 120),
  ('Jordan Molina', null, 5, 'Classroom Team', 'Floater Teacher Assistant', null, 'Classroom', null, 'Heather Graham', null, 130),
  ('Akeyla Tulbert-Moore', null, 6, 'Substitute Team', 'Substitute Teacher', null, 'Classroom / Transportation / Program Events', null, 'Assigned Location Director', null, 140),
  ('Alison Escobar', null, 6, 'Substitute Team', 'Substitute Teacher', null, 'Classroom', null, 'Assigned Location Director', null, 150),
  ('Francisco Escobar', null, 6, 'Substitute Team', 'Substitute Teacher', null, 'Classroom', null, 'Assigned Location Director', null, 160),
  ('Willman Zapeta', null, null, 'Maintenance Department', 'Maintenance Supervisor', null, 'Maintenance', null, 'Anthony Thomason', null, 170),
  ('Edvin Obregon', null, null, 'Maintenance Department', 'Maintenance Assistant', null, 'Maintenance', null, 'Willman Zapeta', null, 180),
  ('Philip Salias', null, null, 'Maintenance Department', 'Maintenance Assistant', null, 'Maintenance', null, 'Willman Zapeta', null, 190)
) as x(full_name, preferred_name, lane_level, lane_group, job_title, secondary_title, department, primary_location, reports_to_label, lane_summary, sort_order)
on conflict (organization_id, lower(full_name)) do update set
  preferred_name = excluded.preferred_name,
  lane_level = excluded.lane_level,
  lane_group = excluded.lane_group,
  job_title = excluded.job_title,
  secondary_title = excluded.secondary_title,
  department = excluded.department,
  primary_location = excluded.primary_location,
  reports_to_label = excluded.reports_to_label,
  lane_summary = excluded.lane_summary,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

update public.staff_lane_profiles slp
set staff_user_id = sa.user_id,
    updated_at = now()
from public.staff_access sa
where sa.organization_id = slp.organization_id
  and lower(sa.full_name) = lower(slp.full_name)
  and slp.staff_user_id is distinct from sa.user_id;

update public.staff_lane_profiles child
set reports_to_lane_id = parent.id,
    updated_at = now()
from public.staff_lane_profiles parent
where parent.organization_id = child.organization_id
  and child.reports_to_label is not null
  and lower(parent.full_name) = lower(child.reports_to_label)
  and child.reports_to_lane_id is distinct from parent.id;

-- Future lane changes update staff_lane_profiles without changing staff_access.role,
-- unless the person's actual software access also changes.
