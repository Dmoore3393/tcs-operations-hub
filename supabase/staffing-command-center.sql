-- TCS Operations Hub — Staffing Command Center foundation
-- This file mirrors the additive production changes applied to the existing Supabase project.
-- It does not contain child, family, employee schedule, or other live operational data.
-- Run only against an existing TCS Operations Hub schema that already contains:
-- organizations, locations, staff_access, transportation_routes, auth helpers,
-- set_updated_at(), audit_location_row_change(), current_staff_organization_id(),
-- can_read_location_module(), can_write_location_module(), can_access_location(),
-- is_tcs_owner(), and is_tcs_licensee().

create table if not exists public.staff_shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id()
    references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  user_id uuid references public.staff_access(user_id) on delete set null,
  staff_name text not null,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'Draft' check (status in ('Draft','Published','Cancelled')),
  position_label text,
  notes text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table if not exists public.staff_activity_intervals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id()
    references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  shift_id uuid references public.staff_shifts(id) on delete cascade,
  user_id uuid references public.staff_access(user_id) on delete set null,
  staff_name text not null,
  activity_date date not null,
  start_time time not null,
  end_time time not null,
  activity_type text not null check (activity_type in ('Floor','Transportation','Break','Admin','Training','Offsite','Other')),
  counts_toward_floor boolean not null default true,
  transportation_route_id uuid references public.transportation_routes(id) on delete set null,
  reason text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table if not exists public.child_attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id()
    references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  child_id uuid references public.children(id) on delete cascade,
  child_name text not null,
  attendance_date date not null,
  check_in_at timestamptz,
  check_out_at timestamptz,
  status text not null default 'Expected' check (status in ('Expected','Checked In','Checked Out','Absent','Cancelled')),
  source text not null default 'Hub',
  notes text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out_at is null or check_in_at is null or check_out_at >= check_in_at)
);

create table if not exists public.staffing_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id()
    references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  rule_name text not null,
  age_group text,
  children_per_staff integer check (children_per_staff is null or children_per_staff > 0),
  minimum_staff integer check (minimum_staff is null or minimum_staff >= 0),
  maximum_group_size integer check (maximum_group_size is null or maximum_group_size > 0),
  effective_from date not null,
  effective_to date,
  source_type text not null default 'TCS Configured'
    check (source_type in ('TCS Configured','License/Regulation','Certificate/Program','Other')),
  source_note text,
  is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.schedule_publications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id()
    references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  week_of date not null,
  status text not null default 'Draft' check (status in ('Draft','Published','Superseded')),
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  notes text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, location_id, week_of, status)
);

create index if not exists staff_shifts_location_date_idx on public.staff_shifts(location_id, shift_date, start_time, end_time);
create index if not exists staff_shifts_user_date_idx on public.staff_shifts(user_id, shift_date);
create index if not exists staff_activity_location_date_idx on public.staff_activity_intervals(location_id, activity_date, start_time, end_time);
create index if not exists staff_activity_user_date_idx on public.staff_activity_intervals(user_id, activity_date);
create index if not exists child_attendance_location_date_idx on public.child_attendance_sessions(location_id, attendance_date, status);
create index if not exists staffing_rules_location_effective_idx on public.staffing_rules(location_id, effective_from, effective_to) where is_active;
create index if not exists schedule_publications_location_week_idx on public.schedule_publications(location_id, week_of);

alter table public.staff_shifts enable row level security;
alter table public.staff_activity_intervals enable row level security;
alter table public.child_attendance_sessions enable row level security;
alter table public.staffing_rules enable row level security;
alter table public.schedule_publications enable row level security;

create policy "staff shifts read" on public.staff_shifts for select to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_read_location_module(location_id, 'schedules'));
create policy "staff shifts insert" on public.staff_shifts for insert to authenticated
with check (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'schedules'));
create policy "staff shifts update" on public.staff_shifts for update to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'schedules'))
with check (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'schedules'));
create policy "staff shifts delete" on public.staff_shifts for delete to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'schedules'));

create policy "staff activity read" on public.staff_activity_intervals for select to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_read_location_module(location_id, 'schedules'));
create policy "staff activity insert" on public.staff_activity_intervals for insert to authenticated
with check (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'schedules'));
create policy "staff activity update" on public.staff_activity_intervals for update to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'schedules'))
with check (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'schedules'));
create policy "staff activity delete" on public.staff_activity_intervals for delete to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'schedules'));

create policy "child attendance read" on public.child_attendance_sessions for select to authenticated
using (
  organization_id = public.current_staff_organization_id()
  and (public.can_read_location_module(location_id, 'daily_care') or public.can_read_location_module(location_id, 'schedules'))
);
create policy "child attendance insert" on public.child_attendance_sessions for insert to authenticated
with check (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'daily_care'));
create policy "child attendance update" on public.child_attendance_sessions for update to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'daily_care'))
with check (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'daily_care'));
create policy "child attendance delete" on public.child_attendance_sessions for delete to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'daily_care'));

create policy "staffing rules read" on public.staffing_rules for select to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_read_location_module(location_id, 'schedules'));
create policy "staffing rules insert" on public.staffing_rules for insert to authenticated
with check (organization_id = public.current_staff_organization_id() and public.can_access_location(location_id) and (public.is_tcs_owner() or public.is_tcs_licensee()));
create policy "staffing rules update" on public.staffing_rules for update to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_access_location(location_id) and (public.is_tcs_owner() or public.is_tcs_licensee()))
with check (organization_id = public.current_staff_organization_id() and public.can_access_location(location_id) and (public.is_tcs_owner() or public.is_tcs_licensee()));
create policy "staffing rules delete" on public.staffing_rules for delete to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_access_location(location_id) and (public.is_tcs_owner() or public.is_tcs_licensee()));

create policy "schedule publications read" on public.schedule_publications for select to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_read_location_module(location_id, 'schedules'));
create policy "schedule publications insert" on public.schedule_publications for insert to authenticated
with check (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'schedules'));
create policy "schedule publications update" on public.schedule_publications for update to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'schedules'))
with check (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'schedules'));
create policy "schedule publications delete" on public.schedule_publications for delete to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'schedules'));

grant select, insert, update, delete on public.staff_shifts, public.staff_activity_intervals, public.child_attendance_sessions, public.staffing_rules, public.schedule_publications to authenticated;
grant all on public.staff_shifts, public.staff_activity_intervals, public.child_attendance_sessions, public.staffing_rules, public.schedule_publications to service_role;

create trigger set_staff_shifts_updated_at before update on public.staff_shifts for each row execute function public.set_updated_at();
create trigger set_staff_activity_intervals_updated_at before update on public.staff_activity_intervals for each row execute function public.set_updated_at();
create trigger set_child_attendance_sessions_updated_at before update on public.child_attendance_sessions for each row execute function public.set_updated_at();
create trigger set_staffing_rules_updated_at before update on public.staffing_rules for each row execute function public.set_updated_at();
create trigger set_schedule_publications_updated_at before update on public.schedule_publications for each row execute function public.set_updated_at();

create trigger audit_staff_shifts after insert or update or delete on public.staff_shifts for each row execute function public.audit_location_row_change();
create trigger audit_staff_activity_intervals after insert or update or delete on public.staff_activity_intervals for each row execute function public.audit_location_row_change();
create trigger audit_child_attendance_sessions after insert or update or delete on public.child_attendance_sessions for each row execute function public.audit_location_row_change();
create trigger audit_staffing_rules after insert or update or delete on public.staffing_rules for each row execute function public.audit_location_row_change();
create trigger audit_schedule_publications after insert or update or delete on public.schedule_publications for each row execute function public.audit_location_row_change();
