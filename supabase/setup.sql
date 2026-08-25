-- TCS Operations Hub secure shared-data + email invitation setup
-- Run this entire file in Supabase Dashboard > SQL Editor.
-- This migration is safe to run over the previous pilot setup.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.organizations (id, name)
values ('00000000-0000-4000-8000-000000000001', 'Thomason Childcare Solutions')
on conflict (id) do update set name = excluded.name;

create table if not exists public.staff_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade default '00000000-0000-4000-8000-000000000001',
  email text not null,
  full_name text not null,
  role text not null default 'Employee',
  locations text[] not null default array['Halcom']::text[],
  permissions text[] not null default array[]::text[],
  is_active boolean not null default true,
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_access add column if not exists permissions text[] not null default array[]::text[];
alter table public.staff_access add column if not exists invited_by uuid references auth.users(id) on delete set null;
alter table public.staff_access add column if not exists invited_at timestamptz;
alter table public.staff_access add column if not exists accepted_at timestamptz;

create unique index if not exists staff_access_email_idx on public.staff_access (lower(email));

create table if not exists public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade default '00000000-0000-4000-8000-000000000001',
  auth_user_id uuid references auth.users(id) on delete set null,
  email text not null,
  full_name text not null,
  role text not null,
  locations text[] not null default array[]::text[],
  permissions text[] not null default array[]::text[],
  status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled')),
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email)
);

create index if not exists staff_invitations_status_idx on public.staff_invitations (organization_id, status, invited_at desc);

create or replace function public.current_staff_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.staff_access
  where user_id = auth.uid() and is_active = true
  limit 1;
$$;

create or replace function public.current_staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(trim(role))
  from public.staff_access
  where user_id = auth.uid() and is_active = true
  limit 1;
$$;

create or replace function public.current_staff_permissions()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(permissions, array[]::text[])
  from public.staff_access
  where user_id = auth.uid() and is_active = true
  limit 1;
$$;

create or replace function public.is_active_tcs_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_access
    where user_id = auth.uid() and is_active = true
  );
$$;

create or replace function public.is_tcs_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_staff_role() in (
    'owner / admin', 'owner/admin', 'owner / director',
    'administrator', 'admin', 'director',
    'corporate / admin', 'corporate admin', 'operations admin'
  ), false);
$$;

create or replace function public.is_tcs_licensee()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_staff_role() in (
    'location licensee', 'licensee', 'licensee/admin', 'licensee / admin'
  ), false);
$$;

create or replace function public.is_tcs_employee()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_staff_role() in (
    'employee', 'teacher', 'driver', 'teacher in training', 'scanning support'
  ), false);
$$;

create or replace function public.has_staff_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_permission = any(public.current_staff_permissions()), false);
$$;

create or replace function public.is_tcs_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_tcs_owner();
$$;

create or replace function public.is_approved_tcs_pilot_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_tcs_owner() or public.is_tcs_licensee() or public.is_tcs_employee();
$$;

create or replace function public.can_read_hub_state_key(p_state_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_approved_tcs_pilot_user() then return false; end if;
  if public.is_tcs_owner() then return true; end if;

  if public.is_tcs_licensee() then
    return p_state_key <> 'tcs-settings';
  end if;

  if not public.is_tcs_employee() then return false; end if;

  return case
    when p_state_key = 'tcs-children-v1' then
      public.has_staff_permission('children_basic') or public.has_staff_permission('daily_care') or
      public.has_staff_permission('meals') or public.has_staff_permission('schedules') or
      public.has_staff_permission('ratios') or public.has_staff_permission('transportation') or
      public.has_staff_permission('health_safety')
    when p_state_key = 'tcs-child-schedules-v2' then
      public.has_staff_permission('schedules') or public.has_staff_permission('meals') or
      public.has_staff_permission('ratios') or public.has_staff_permission('transportation')
    when p_state_key = 'tcs-daily-care-v1' then
      public.has_staff_permission('daily_care') or public.has_staff_permission('meals') or public.has_staff_permission('shift_reports')
    when p_state_key in ('tcs-meal-services-v1', 'tcs-weekly-menus-v1') then
      public.has_staff_permission('meals') or public.has_staff_permission('daily_care')
    when p_state_key in ('tcs-shift-handoffs-v1', 'tcs-shift-reports-v1') then
      public.has_staff_permission('shift_reports')
    when p_state_key = 'tcs-work-tasks' then public.has_staff_permission('work_plans')
    when p_state_key in ('tcs-routes', 'tcs-schools-v2', 'tcs-vehicles-v2', 'tcs-vehicle-readiness-v2') then
      public.has_staff_permission('transportation')
    when p_state_key = 'tcs-health-safety-v1' then
      public.has_staff_permission('health_safety') or public.has_staff_permission('shift_reports')
    when p_state_key = 'tcs-kidkare-enrollments-v1' then false
    when p_state_key in ('tcs-location-hours-v2', 'tcs-shifts') then public.has_staff_permission('ratios')
    else false
  end;
end;
$$;

create or replace function public.can_write_hub_state_key(p_state_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_approved_tcs_pilot_user() then return false; end if;
  if public.is_tcs_owner() then return true; end if;

  if public.is_tcs_licensee() then
    return p_state_key not in (
      'tcs-settings',
      'tcs-locations-v2',
      'tcs-location-hours-v2',
      'tcs-schools-v2',
      'tcs-vehicles-v2',
      'tcs-timesheet-department-routes-v1'
    );
  end if;

  if not public.is_tcs_employee() then return false; end if;

  return case
    when p_state_key = 'tcs-daily-care-v1' then public.has_staff_permission('daily_care') or public.has_staff_permission('meals')
    when p_state_key in ('tcs-meal-services-v1', 'tcs-weekly-menus-v1') then public.has_staff_permission('meals')
    when p_state_key = 'tcs-child-schedules-v2' then public.has_staff_permission('schedules')
    when p_state_key in ('tcs-shift-handoffs-v1', 'tcs-shift-reports-v1') then public.has_staff_permission('shift_reports')
    when p_state_key = 'tcs-work-tasks' then public.has_staff_permission('work_plans')
    when p_state_key in ('tcs-routes', 'tcs-vehicle-readiness-v2') then public.has_staff_permission('transportation')
    when p_state_key = 'tcs-health-safety-v1' then public.has_staff_permission('health_safety')
    when p_state_key = 'tcs-kidkare-enrollments-v1' then false
    else false
  end;
end;
$$;

create or replace function public.can_access_hub_state_key(p_state_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_read_hub_state_key(p_state_key);
$$;

revoke all on function public.current_staff_organization_id() from public;
revoke all on function public.current_staff_role() from public;
revoke all on function public.current_staff_permissions() from public;
revoke all on function public.is_active_tcs_staff() from public;
revoke all on function public.is_tcs_owner() from public;
revoke all on function public.is_tcs_licensee() from public;
revoke all on function public.is_tcs_employee() from public;
revoke all on function public.has_staff_permission(text) from public;
revoke all on function public.is_tcs_admin() from public;
revoke all on function public.is_approved_tcs_pilot_user() from public;
revoke all on function public.can_read_hub_state_key(text) from public;
revoke all on function public.can_write_hub_state_key(text) from public;
revoke all on function public.can_access_hub_state_key(text) from public;

grant execute on function public.current_staff_organization_id() to authenticated;
grant execute on function public.current_staff_role() to authenticated;
grant execute on function public.current_staff_permissions() to authenticated;
grant execute on function public.is_active_tcs_staff() to authenticated;
grant execute on function public.is_tcs_owner() to authenticated;
grant execute on function public.is_tcs_licensee() to authenticated;
grant execute on function public.is_tcs_employee() to authenticated;
grant execute on function public.has_staff_permission(text) to authenticated;
grant execute on function public.is_tcs_admin() to authenticated;
grant execute on function public.is_approved_tcs_pilot_user() to authenticated;
grant execute on function public.can_read_hub_state_key(text) to authenticated;
grant execute on function public.can_write_hub_state_key(text) to authenticated;
grant execute on function public.can_access_hub_state_key(text) to authenticated;

create table if not exists public.hub_state (
  organization_id uuid not null references public.organizations(id) on delete cascade default public.current_staff_organization_id(),
  state_key text not null,
  state_value jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, state_key),
  constraint hub_state_key_length check (char_length(state_key) between 1 and 120),
  constraint hub_state_version_positive check (version > 0)
);

create index if not exists hub_state_updated_at_idx on public.hub_state (updated_at desc);

create table if not exists public.hub_audit (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  state_key text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  version integer,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists hub_audit_org_time_idx on public.hub_audit (organization_id, changed_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists staff_access_set_updated_at on public.staff_access;
create trigger staff_access_set_updated_at before update on public.staff_access for each row execute function public.set_updated_at();

drop trigger if exists staff_invitations_set_updated_at on public.staff_invitations;
create trigger staff_invitations_set_updated_at before update on public.staff_invitations for each row execute function public.set_updated_at();

create or replace function public.audit_hub_state_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.hub_audit (organization_id, state_key, action, version, changed_by)
  values (
    coalesce(new.organization_id, old.organization_id),
    coalesce(new.state_key, old.state_key),
    tg_op,
    coalesce(new.version, old.version),
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists hub_state_audit_trigger on public.hub_state;
create trigger hub_state_audit_trigger after insert or update or delete on public.hub_state for each row execute function public.audit_hub_state_change();

create or replace function public.save_hub_state(
  p_state_key text,
  p_state_value jsonb,
  p_expected_version integer default 0
)
returns public.hub_state
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid;
  v_current public.hub_state;
  v_saved public.hub_state;
begin
  v_org := public.current_staff_organization_id();
  if v_org is null or not public.can_write_hub_state_key(p_state_key) then
    raise exception 'This staff role cannot change %', p_state_key using errcode = '42501';
  end if;

  select * into v_current
  from public.hub_state
  where organization_id = v_org and state_key = p_state_key
  for update;

  if not found then
    if coalesce(p_expected_version, 0) <> 0 then
      raise exception 'Version conflict for %', p_state_key using errcode = '40001';
    end if;

    insert into public.hub_state (organization_id, state_key, state_value, version, updated_by)
    values (v_org, p_state_key, p_state_value, 1, auth.uid())
    returning * into v_saved;
    return v_saved;
  end if;

  if p_expected_version is not null and p_expected_version <> v_current.version then
    raise exception 'Version conflict for %', p_state_key using errcode = '40001';
  end if;

  update public.hub_state
  set state_value = p_state_value,
      version = v_current.version + 1,
      updated_by = auth.uid(),
      updated_at = now()
  where organization_id = v_org and state_key = p_state_key
  returning * into v_saved;

  return v_saved;
end;
$$;

revoke all on function public.save_hub_state(text, jsonb, integer) from public;
grant execute on function public.save_hub_state(text, jsonb, integer) to authenticated;

-- ONE-TIME BOOTSTRAP ONLY: create the first Auth user in Supabase, then run this helper.
-- After the first Owner exists, invite Jennifer, future admins, Licensees, and Employees from Team Access.
create or replace function public.grant_tcs_staff_access(
  p_email text,
  p_full_name text,
  p_role text default 'Owner / Admin',
  p_locations text[] default array['All Locations']::text[]
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_email text;
  v_role text;
  v_locations text[];
begin
  select id, email into v_user_id, v_email
  from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1;

  if v_user_id is null then raise exception 'No Supabase Auth user exists for %', p_email; end if;

  v_role := trim(p_role);
  v_locations := p_locations;

  if lower(v_role) in ('owner / admin', 'owner/admin', 'owner / director', 'administrator', 'admin', 'director', 'corporate / admin') then
    v_locations := array['All Locations']::text[];
  elsif lower(v_role) in ('location licensee', 'licensee', 'licensee/admin', 'licensee / admin') then
    if cardinality(v_locations) <> 1 or v_locations[1] = 'All Locations' then
      raise exception 'A Location Licensee must be assigned exactly one location';
    end if;
  end if;

  insert into public.staff_access (
    user_id, email, full_name, role, locations, permissions, is_active, invited_at, accepted_at
  ) values (
    v_user_id, lower(v_email), trim(p_full_name), v_role, v_locations, array[]::text[], true, now(), now()
  )
  on conflict (user_id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role,
      locations = excluded.locations,
      permissions = excluded.permissions,
      is_active = true,
      accepted_at = coalesce(public.staff_access.accepted_at, now()),
      updated_at = now();
end;
$$;

revoke all on function public.grant_tcs_staff_access(text, text, text, text[]) from public;
revoke all on function public.grant_tcs_staff_access(text, text, text, text[]) from anon;
revoke all on function public.grant_tcs_staff_access(text, text, text, text[]) from authenticated;

alter table public.staff_access enable row level security;
alter table public.staff_invitations enable row level security;
alter table public.hub_state enable row level security;
alter table public.hub_audit enable row level security;

revoke all on public.staff_access from anon, authenticated;
revoke all on public.staff_invitations from anon, authenticated;
revoke all on public.hub_state from anon, authenticated;
revoke all on public.hub_audit from anon, authenticated;

grant select, update on public.staff_access to authenticated;
grant select, insert, update, delete on public.hub_state to authenticated;
grant select on public.hub_audit to authenticated;

-- Staff can read only their own profile in the browser. Owner/Admin account management
-- runs through protected server routes using the server secret.
drop policy if exists "Staff can read own access" on public.staff_access;
drop policy if exists "Admins can update staff access" on public.staff_access;
drop policy if exists "Owners can update staff access" on public.staff_access;
create policy "Staff can read own access"
on public.staff_access for select to authenticated
using (user_id = auth.uid());

create policy "Owners can update staff access"
on public.staff_access for update to authenticated
using (public.is_tcs_owner())
with check (public.is_tcs_owner() and organization_id = public.current_staff_organization_id());

drop policy if exists "Approved staff can read permitted hub state" on public.hub_state;
create policy "Approved staff can read permitted hub state"
on public.hub_state for select to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_read_hub_state_key(state_key));

drop policy if exists "Approved staff can insert permitted hub state" on public.hub_state;
create policy "Approved staff can insert permitted hub state"
on public.hub_state for insert to authenticated
with check (organization_id = public.current_staff_organization_id() and public.can_write_hub_state_key(state_key));

drop policy if exists "Approved staff can update permitted hub state" on public.hub_state;
create policy "Approved staff can update permitted hub state"
on public.hub_state for update to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_write_hub_state_key(state_key))
with check (organization_id = public.current_staff_organization_id() and public.can_write_hub_state_key(state_key));

drop policy if exists "Owners can delete hub state" on public.hub_state;
create policy "Owners can delete hub state"
on public.hub_state for delete to authenticated
using (public.is_tcs_owner() and organization_id = public.current_staff_organization_id());

drop policy if exists "Owners can read audit" on public.hub_audit;
create policy "Owners can read audit"
on public.hub_audit for select to authenticated
using (public.is_tcs_owner() and organization_id = public.current_staff_organization_id());

do $$
begin
  alter publication supabase_realtime add table public.hub_state;
exception when duplicate_object then null;
end $$;

-- FIRST OWNER EXAMPLE (replace the email after creating only Danielle's first Auth user):
-- select public.grant_tcs_staff_access('danielle@example.com', 'Danielle Moore', 'Owner / Admin', array['All Locations']);
-- Then sign in and invite Jennifer as Owner / Admin from Team Access.

-- TCS PRODUCTION HARDENING (relational location-scoped records)

-- TCS Operations Hub production hardening
-- Relational, location-scoped data; immutable audit; encrypted private documents.
-- Safe to run after the base setup in this repository.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Canonical locations and staff-to-location assignments
-- ---------------------------------------------------------------------------

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null,
  name text not null,
  full_name text not null,
  color_primary text not null default '#15803d',
  color_secondary text not null default '#111827',
  capacity integer not null default 0 check (capacity >= 0),
  program_type text not null default 'Family Childcare',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  unique (organization_id, name)
);

insert into public.locations (organization_id, slug, name, full_name, color_primary, color_secondary, capacity, program_type)
values
  ('00000000-0000-4000-8000-000000000001', 'halcom', 'Halcom', 'Moore Family Childcare • Halcom', '#15803d', '#111827', 14, 'Family Childcare'),
  ('00000000-0000-4000-8000-000000000001', '21st-street', '21st Street', 'Cathers Family Childcare • 21st Street', '#111827', '#d1d5db', 14, 'Family Childcare'),
  ('00000000-0000-4000-8000-000000000001', 'division', 'Division', 'The School Age Center • Division', '#dc2626', '#111827', 17, 'School Age Center'),
  ('00000000-0000-4000-8000-000000000001', '33rd-street', '33rd Street', 'Cornejo Family Childcare • 33rd Street', '#ca8a04', '#111827', 14, 'Family Childcare'),
  ('00000000-0000-4000-8000-000000000001', 'tehachapi', 'Tehachapi', 'Tehachapi Transportation Hub', '#1e3a8a', '#fbbf24', 14, 'Transportation / Care Hub'),
  ('00000000-0000-4000-8000-000000000001', '42nd-street', '42nd Street', 'Lara Family Childcare • 42nd Street', '#7e22ce', '#fbbf24', 14, 'Family Childcare')
on conflict (organization_id, slug) do update
set name = excluded.name,
    full_name = excluded.full_name,
    color_primary = excluded.color_primary,
    color_secondary = excluded.color_secondary,
    capacity = excluded.capacity,
    program_type = excluded.program_type,
    is_active = true,
    updated_at = now();

create or replace function public.tcs_location_slug(p_value text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := lower(coalesce(p_value, ''));
begin
  if v like '%halcom%' or v like '%moore family%' then return 'halcom'; end if;
  if v like '%21st%' or v like '%cathers%' then return '21st-street'; end if;
  if v like '%division%' or v like '%school age center%' or v like '%astor%' then return 'division'; end if;
  if v like '%33rd%' or v like '%cornejo%' then return '33rd-street'; end if;
  if v like '%tehachapi%' then return 'tehachapi'; end if;
  if v like '%42nd%' or v like '%lara%' then return '42nd-street'; end if;
  return null;
end;
$$;

create or replace function public.is_tcs_owner_role_text(p_role text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(trim(coalesce(p_role, ''))) in (
    'owner / admin', 'owner/admin', 'owner / director',
    'administrator', 'admin', 'director', 'corporate / admin',
    'corporate admin', 'operations admin'
  );
$$;

create table if not exists public.staff_location_assignments (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.staff_access(user_id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, location_id)
);

create index if not exists staff_location_assignments_org_location_idx
  on public.staff_location_assignments (organization_id, location_id, user_id);

create or replace function public.sync_staff_location_assignments_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff_access;
  v_name text;
  v_slug text;
begin
  select * into v_staff from public.staff_access where user_id = p_user_id;
  if not found then return; end if;

  delete from public.staff_location_assignments where user_id = p_user_id;
  if not v_staff.is_active then return; end if;

  if public.is_tcs_owner_role_text(v_staff.role) or 'All Locations' = any(v_staff.locations) then
    insert into public.staff_location_assignments (organization_id, user_id, location_id)
    select v_staff.organization_id, v_staff.user_id, l.id
    from public.locations l
    where l.organization_id = v_staff.organization_id and l.is_active
    on conflict do nothing;
    return;
  end if;

  foreach v_name in array coalesce(v_staff.locations, array[]::text[]) loop
    v_slug := public.tcs_location_slug(v_name);
    if v_slug is not null then
      insert into public.staff_location_assignments (organization_id, user_id, location_id)
      select v_staff.organization_id, v_staff.user_id, l.id
      from public.locations l
      where l.organization_id = v_staff.organization_id and l.slug = v_slug and l.is_active
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

create or replace function public.sync_staff_location_assignments_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_staff_location_assignments_for_user(new.user_id);
  return new;
end;
$$;

drop trigger if exists staff_access_sync_location_assignments on public.staff_access;
create trigger staff_access_sync_location_assignments
after insert or update of organization_id, role, locations, is_active on public.staff_access
for each row execute function public.sync_staff_location_assignments_trigger();

do $$
declare r record;
begin
  for r in select user_id from public.staff_access loop
    perform public.sync_staff_location_assignments_for_user(r.user_id);
  end loop;
end $$;

create or replace function public.current_staff_location_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select sla.location_id
  from public.staff_location_assignments sla
  join public.staff_access sa on sa.user_id = sla.user_id
  where sla.user_id = auth.uid()
    and sa.is_active
    and sla.organization_id = sa.organization_id;
$$;

create or replace function public.can_access_location(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_tcs_owner()
    or exists (
      select 1 from public.staff_location_assignments sla
      join public.staff_access sa on sa.user_id = sla.user_id
      where sla.user_id = auth.uid()
        and sla.location_id = p_location_id
        and sa.is_active
    ), false
  );
$$;

create or replace function public.can_read_location_module(p_location_id uuid, p_module text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_approved_tcs_pilot_user() or not public.can_access_location(p_location_id) then return false; end if;
  if public.is_tcs_owner() or public.is_tcs_licensee() then return true; end if;
  if not public.is_tcs_employee() then return false; end if;

  return case p_module
    when 'children' then
      public.has_staff_permission('children_basic') or public.has_staff_permission('daily_care') or
      public.has_staff_permission('meals') or public.has_staff_permission('schedules') or
      public.has_staff_permission('ratios') or public.has_staff_permission('transportation') or
      public.has_staff_permission('health_safety')
    when 'schedules' then public.has_staff_permission('schedules') or public.has_staff_permission('meals') or public.has_staff_permission('ratios') or public.has_staff_permission('transportation')
    when 'daily_care' then public.has_staff_permission('daily_care') or public.has_staff_permission('meals') or public.has_staff_permission('shift_reports')
    when 'meals' then public.has_staff_permission('meals') or public.has_staff_permission('daily_care')
    when 'reports' then public.has_staff_permission('shift_reports')
    when 'incidents' then public.has_staff_permission('health_safety') or public.has_staff_permission('shift_reports')
    when 'kidkare' then false
    when 'transportation' then public.has_staff_permission('transportation')
    else false
  end;
end;
$$;

create or replace function public.can_write_location_module(p_location_id uuid, p_module text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_approved_tcs_pilot_user() or not public.can_access_location(p_location_id) then return false; end if;
  if public.is_tcs_owner() then return true; end if;
  if public.is_tcs_licensee() then return true; end if;
  if not public.is_tcs_employee() then return false; end if;

  return case p_module
    when 'children' then false
    when 'schedules' then public.has_staff_permission('schedules')
    when 'daily_care' then public.has_staff_permission('daily_care') or public.has_staff_permission('meals')
    when 'meals' then public.has_staff_permission('meals')
    when 'reports' then public.has_staff_permission('shift_reports')
    when 'incidents' then public.has_staff_permission('health_safety')
    when 'kidkare' then false
    when 'transportation' then public.has_staff_permission('transportation')
    else false
  end;
end;
$$;

revoke all on function public.current_staff_location_ids() from public;
revoke all on function public.can_access_location(uuid) from public;
revoke all on function public.can_read_location_module(uuid, text) from public;
revoke all on function public.can_write_location_module(uuid, text) from public;
grant execute on function public.current_staff_location_ids() to authenticated;
grant execute on function public.can_access_location(uuid) to authenticated;
grant execute on function public.can_read_location_module(uuid, text) to authenticated;
grant execute on function public.can_write_location_module(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Location-owned relational tables
-- Each row keeps the typed fields used for indexing/reporting plus record_data
-- for forward-compatible UI fields.
-- ---------------------------------------------------------------------------

create table if not exists public.children (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id() references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  legacy_id text not null,
  first_name text not null,
  last_name text not null,
  date_of_birth date,
  age_group text,
  enrollment_status text not null default 'Active',
  attendance_status text,
  guardian_name text,
  school_name text,
  record_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_id)
);

create table if not exists public.child_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id() references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  child_id uuid references public.children(id) on delete cascade,
  legacy_id text not null,
  child_name text not null,
  age_group text,
  is_primary boolean not null default false,
  weekly_schedule jsonb not null default '{}'::jsonb,
  record_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_id)
);

alter table public.child_schedules add column if not exists is_primary boolean not null default false;

-- A child can attend several locations. Membership rows are derived from the
-- child's primary enrollment, location-specific schedule fragments, and
-- KidKare enrollment records. They are never edited directly by the browser.
create table if not exists public.child_location_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  from_primary boolean not null default false,
  from_schedule boolean not null default false,
  from_kidkare boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, child_id, location_id)
);

create index if not exists child_location_memberships_location_idx
  on public.child_location_memberships (organization_id, location_id, child_id);

create table if not exists public.daily_care_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id() references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  child_id uuid references public.children(id) on delete set null,
  legacy_id text not null,
  child_name text not null,
  entry_date date not null,
  entry_time text not null,
  category text not null,
  action text,
  result text,
  staff_initials text,
  notes text,
  record_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_id)
);

create table if not exists public.weekly_menus (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id() references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  legacy_id text not null,
  week_of date,
  menu_data jsonb not null default '{}'::jsonb,
  record_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_id)
);

create table if not exists public.meal_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id() references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  legacy_id text not null,
  service_date date not null,
  meal_type text not null,
  service_time text,
  food_served text,
  drink_served text,
  staff_initials text,
  record_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_id)
);

create table if not exists public.shift_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id() references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  legacy_id text not null,
  report_date date not null,
  report_type text not null check (report_type in ('Opening', 'Closing')),
  status text not null default 'Draft',
  completed_by text,
  staff_initials text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  record_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_id)
);

create table if not exists public.handoff_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id() references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  source_report_id uuid references public.shift_reports(id) on delete set null,
  legacy_id text not null,
  handoff_date date not null,
  category text not null,
  priority text not null default 'Normal',
  completed boolean not null default false,
  record_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_id)
);

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id() references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  child_id uuid references public.children(id) on delete set null,
  legacy_id text not null,
  child_name text not null,
  occurred_date date not null,
  occurred_time text not null,
  incident_type text not null,
  status text not null default 'Open',
  parent_contact text,
  formal_report boolean not null default false,
  staff_initials text,
  record_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_id)
);

create table if not exists public.kidkare_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id() references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  child_id uuid references public.children(id) on delete cascade,
  legacy_id text not null,
  child_name text not null,
  status text not null default 'Not Started',
  required boolean not null default true,
  kidkare_child_id text,
  submitted_at date,
  verified_at date,
  completed_by text,
  record_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_id)
);

create table if not exists public.timesheets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id() references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  child_id uuid references public.children(id) on delete set null,
  legacy_id text not null,
  child_name text not null,
  family_name text,
  service_period text not null,
  funding_source text not null,
  workflow_stage text not null default 'Licensee Preparation',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  record_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_id)
);

create table if not exists public.timesheet_submission_routes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id() references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  legacy_id text not null,
  funding_source text not null,
  department text,
  department_email text,
  deadline text,
  file_name_format text,
  record_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_id)
);

create table if not exists public.transportation_routes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id() references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  child_id uuid references public.children(id) on delete set null,
  legacy_id text not null,
  child_name text not null,
  school_name text,
  driver_name text,
  vehicle_name text,
  route_status text not null default 'Needs Review',
  record_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_id)
);


create table if not exists public.compliance_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id() references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  legacy_id text not null,
  person_name text not null,
  record_type text not null,
  document_name text not null,
  status text not null default 'Missing',
  due_label text,
  record_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_id)
);

create table if not exists public.transportation_fee_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id() references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  legacy_id text not null,
  week_of date not null,
  family_key text not null,
  family_name text not null,
  guardian_name text,
  expected_amount numeric(10,2) not null default 0 check (expected_amount >= 0),
  charged_amount numeric(10,2) not null default 0 check (charged_amount >= 0),
  payment_status text not null default 'Unpaid',
  record_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_id)
);

create table if not exists public.enrollment_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id() references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  legacy_id text not null,
  family_name text not null,
  parent_name text,
  child_name text,
  stage text not null default 'Inquiry',
  follow_up_date date,
  tour_at timestamptz,
  record_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_id)
);

create table if not exists public.digital_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id() references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  legacy_id text not null,
  subject_type text not null,
  subject_name text not null,
  form_name text not null,
  signer_name text,
  status text not null default 'Draft',
  signature_method text not null default 'Not Signed',
  due_date date,
  signed_at timestamptz,
  record_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_id)
);

create index if not exists children_location_status_idx on public.children (organization_id, location_id, enrollment_status);
create index if not exists child_schedules_location_idx on public.child_schedules (organization_id, location_id, child_id);
create index if not exists child_schedules_child_primary_idx on public.child_schedules (organization_id, child_id, is_primary);
create index if not exists daily_care_location_date_idx on public.daily_care_entries (organization_id, location_id, entry_date desc);
create index if not exists meal_services_location_date_idx on public.meal_services (organization_id, location_id, service_date desc);
create index if not exists shift_reports_location_date_idx on public.shift_reports (organization_id, location_id, report_date desc);
create index if not exists incidents_location_date_idx on public.incidents (organization_id, location_id, occurred_date desc);
create index if not exists kidkare_location_status_idx on public.kidkare_enrollments (organization_id, location_id, status);
create index if not exists timesheets_location_stage_idx on public.timesheets (organization_id, location_id, workflow_stage);
create index if not exists transportation_routes_location_status_idx on public.transportation_routes (organization_id, location_id, route_status);
create index if not exists compliance_files_location_status_idx on public.compliance_files (organization_id, location_id, status);
create index if not exists transportation_fee_location_week_idx on public.transportation_fee_records (organization_id, location_id, week_of desc);
create index if not exists enrollment_leads_location_stage_idx on public.enrollment_leads (organization_id, location_id, stage);
create index if not exists digital_forms_location_status_idx on public.digital_forms (organization_id, location_id, status);

create or replace function public.set_tcs_row_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.organization_id := coalesce(new.organization_id, public.current_staff_organization_id());
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := coalesce(new.updated_by, auth.uid());
    new.updated_at := now();
    return new;
  end if;

  if (to_jsonb(new) - 'updated_at' - 'updated_by') is not distinct from (to_jsonb(old) - 'updated_at' - 'updated_by') then
    return new;
  end if;

  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Immutable audit log
-- ---------------------------------------------------------------------------

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('CREATE', 'UPDATE', 'REVIEW', 'EXPORT', 'DELETE')),
  table_name text not null,
  row_id uuid,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists audit_log_org_time_idx on public.audit_log (organization_id, occurred_at desc);
create index if not exists audit_log_location_time_idx on public.audit_log (location_id, occurred_at desc);

create or replace function public.audit_location_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new jsonb;
  v_old jsonb;
  v_org uuid;
  v_location uuid;
  v_id uuid;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_org := new.organization_id;
    v_location := new.location_id;
    v_id := new.id;
  elsif tg_op = 'UPDATE' then
    v_new := to_jsonb(new);
    v_old := to_jsonb(old);
    v_org := new.organization_id;
    v_location := new.location_id;
    v_id := new.id;
  else
    v_old := to_jsonb(old);
    v_org := old.organization_id;
    v_location := old.location_id;
    v_id := old.id;
  end if;
  if tg_op = 'UPDATE' and v_new is not distinct from v_old then
    return new;
  end if;

  insert into public.audit_log (organization_id, location_id, actor_user_id, action, table_name, row_id, old_data, new_data)
  values (
    v_org,
    v_location,
    auth.uid(),
    case tg_op when 'INSERT' then 'CREATE' when 'UPDATE' then 'UPDATE' else 'DELETE' end,
    tg_table_name,
    v_id,
    v_old,
    v_new
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Audit records are immutable' using errcode = '42501';
end;
$$;

drop trigger if exists audit_log_no_update on public.audit_log;
create trigger audit_log_no_update before update or delete on public.audit_log
for each row execute function public.prevent_audit_log_mutation();


create or replace function public.audit_global_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new jsonb;
  v_old jsonb;
  v_row jsonb;
  v_org uuid;
  v_location uuid;
  v_id uuid;
  v_actor uuid;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_row := v_new;
  elsif tg_op = 'UPDATE' then
    v_new := to_jsonb(new);
    v_old := to_jsonb(old);
    if v_new is not distinct from v_old then return new; end if;
    v_row := v_new;
  else
    v_old := to_jsonb(old);
    v_row := v_old;
  end if;

  v_org := nullif(v_row->>'organization_id', '')::uuid;
  if tg_table_name = 'locations' then
    v_location := nullif(v_row->>'id', '')::uuid;
  else
    v_location := nullif(v_row->>'location_id', '')::uuid;
  end if;
  v_id := nullif(coalesce(v_row->>'id', v_row->>'user_id'), '')::uuid;
  v_actor := coalesce(auth.uid(), nullif(v_row->>'invited_by', '')::uuid);

  insert into public.audit_log (organization_id, location_id, actor_user_id, action, table_name, row_id, old_data, new_data, metadata)
  values (
    v_org,
    v_location,
    v_actor,
    case tg_op when 'INSERT' then 'CREATE' when 'UPDATE' then 'UPDATE' else 'DELETE' end,
    tg_table_name,
    v_id,
    v_old,
    v_new,
    case when tg_table_name = 'hub_state' then jsonb_build_object('state_key', v_row->>'state_key') else '{}'::jsonb end
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.record_audit_event(
  p_action text,
  p_table_name text,
  p_row_id uuid default null,
  p_location_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_org uuid := public.current_staff_organization_id();
  v_action text := upper(trim(p_action));
begin
  if v_action not in ('REVIEW', 'EXPORT') then
    raise exception 'Manual audit action must be REVIEW or EXPORT';
  end if;
  if v_org is null or not public.is_approved_tcs_pilot_user() then
    raise exception 'Active staff access required' using errcode = '42501';
  end if;
  if p_location_id is not null and not public.can_access_location(p_location_id) then
    raise exception 'Location access denied' using errcode = '42501';
  end if;

  insert into public.audit_log (organization_id, location_id, actor_user_id, action, table_name, row_id, metadata)
  values (v_org, p_location_id, auth.uid(), v_action, left(p_table_name, 120), p_row_id, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_audit_event(text, text, uuid, uuid, jsonb) from public;
grant execute on function public.record_audit_event(text, text, uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Multi-location child/schedule helpers
-- ---------------------------------------------------------------------------

create or replace function public.tcs_schedule_location_slugs(p_item jsonb)
returns table(slug text)
language sql
stable
set search_path = public
as $$
  with candidates as (
    select p_item->>'defaultLocation' as location_name
    union all
    select block_item->>'location'
    from jsonb_each(coalesce(p_item->'days', '{}'::jsonb)) as day_entry(day_name, day_value)
    cross join lateral jsonb_array_elements(coalesce(day_entry.day_value->'blocks', '[]'::jsonb)) as block_item
  ), normalized as (
    select public.tcs_location_slug(location_name) as slug from candidates
  )
  select distinct normalized.slug
  from normalized
  where normalized.slug is not null;
$$;

create or replace function public.tcs_schedule_for_location(
  p_item jsonb,
  p_slug text,
  p_location_name text
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with filtered_days as (
    select
      day_entry.day_name,
      jsonb_set(
        jsonb_set(
          jsonb_set(
            day_entry.day_value,
            '{blocks}',
            coalesce((
              select jsonb_agg(block_item order by block_item->>'start', block_item->>'end')
              from jsonb_array_elements(coalesce(day_entry.day_value->'blocks', '[]'::jsonb)) as block_item
              where public.tcs_location_slug(block_item->>'location') = p_slug
            ), '[]'::jsonb),
            true
          ),
          '{noCare}',
          to_jsonb(not exists (
            select 1
            from jsonb_array_elements(coalesce(day_entry.day_value->'blocks', '[]'::jsonb)) as block_item
            where public.tcs_location_slug(block_item->>'location') = p_slug
          )),
          true
        ),
        '{note}',
        case when exists (
          select 1
          from jsonb_array_elements(coalesce(day_entry.day_value->'blocks', '[]'::jsonb)) as block_item
          where public.tcs_location_slug(block_item->>'location') = p_slug
        ) then coalesce(day_entry.day_value->'note', '""'::jsonb) else '""'::jsonb end,
        true
      ) as day_value
    from jsonb_each(coalesce(p_item->'days', '{}'::jsonb)) as day_entry(day_name, day_value)
  ), rebuilt as (
    select coalesce(jsonb_object_agg(day_name, day_value), '{}'::jsonb) as days from filtered_days
  )
  select jsonb_set(
    jsonb_set(p_item, '{defaultLocation}', to_jsonb(p_location_name), true),
    '{days}', rebuilt.days, true
  )
  from rebuilt;
$$;

create or replace function public.refresh_child_location_membership(p_child_id uuid, p_location_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_primary boolean := false;
  v_schedule boolean := false;
  v_kidkare boolean := false;
begin
  if p_child_id is null or p_location_id is null then return; end if;

  select c.organization_id, (c.location_id = p_location_id)
    into v_org, v_primary
  from public.children c
  where c.id = p_child_id;

  if v_org is null then
    delete from public.child_location_memberships
    where child_id = p_child_id and location_id = p_location_id;
    return;
  end if;

  select exists (
    select 1 from public.child_schedules s
    where s.child_id = p_child_id and s.location_id = p_location_id
  ) into v_schedule;

  select exists (
    select 1 from public.kidkare_enrollments k
    where k.child_id = p_child_id and k.location_id = p_location_id and k.required
  ) into v_kidkare;

  if v_primary or v_schedule or v_kidkare then
    insert into public.child_location_memberships (
      organization_id, child_id, location_id, from_primary, from_schedule, from_kidkare, updated_at
    ) values (
      v_org, p_child_id, p_location_id, v_primary, v_schedule, v_kidkare, now()
    )
    on conflict (organization_id, child_id, location_id) do update
    set from_primary = excluded.from_primary,
        from_schedule = excluded.from_schedule,
        from_kidkare = excluded.from_kidkare,
        updated_at = now();
  else
    delete from public.child_location_memberships
    where organization_id = v_org and child_id = p_child_id and location_id = p_location_id;
  end if;
end;
$$;

create or replace function public.refresh_child_membership_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_child_location_membership(old.child_id, old.location_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_child_location_membership(new.child_id, new.location_id);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.refresh_child_primary_membership_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.location_id is distinct from new.location_id then
    perform public.refresh_child_location_membership(old.id, old.location_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_child_location_membership(new.id, new.location_id);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.can_read_child(p_child_id uuid, p_module text default 'children')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_tcs_owner() or exists (
    select 1
    from public.child_location_memberships m
    where m.child_id = p_child_id
      and m.organization_id = public.current_staff_organization_id()
      and public.can_read_location_module(m.location_id, p_module)
  ), false);
$$;

create or replace function public.can_write_child(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_tcs_owner() or exists (
    select 1
    from public.child_location_memberships m
    where m.child_id = p_child_id
      and m.organization_id = public.current_staff_organization_id()
      and public.can_write_location_module(m.location_id, 'children')
  ), false);
$$;

revoke all on function public.tcs_schedule_location_slugs(jsonb) from public;
revoke all on function public.tcs_schedule_for_location(jsonb, text, text) from public;
revoke all on function public.refresh_child_location_membership(uuid, uuid) from public;
revoke all on function public.can_read_child(uuid, text) from public;
revoke all on function public.can_write_child(uuid) from public;
grant execute on function public.tcs_schedule_location_slugs(jsonb) to authenticated;
grant execute on function public.tcs_schedule_for_location(jsonb, text, text) to authenticated;
grant execute on function public.can_read_child(uuid, text) to authenticated;
grant execute on function public.can_write_child(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Collection synchronization RPC

create or replace function public.resolve_tcs_location_id(p_value text, p_org uuid default public.current_staff_organization_id())
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.locations
  where organization_id = p_org
    and slug = public.tcs_location_slug(p_value)
    and is_active
  limit 1;
$$;

create or replace function public.sync_tcs_collection(p_collection_key text, p_items jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid := public.current_staff_organization_id();
  v_item jsonb;
  v_location uuid;
  v_child uuid;
  v_legacy text;
  v_slug text;
  v_location_name text;
  v_partial jsonb;
  v_expected_legacy text[] := array[]::text[];
  v_count integer := 0;
begin
  if v_org is null or jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid collection payload';
  end if;

  if p_collection_key = 'tcs-children-v1' then
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_legacy := coalesce(v_item->>'id', gen_random_uuid()::text);
      v_location := public.resolve_tcs_location_id(v_item->>'location', v_org);
      if v_location is null then raise exception 'A valid location is required for child %', v_legacy; end if;
      insert into public.children (organization_id, location_id, legacy_id, first_name, last_name, date_of_birth, age_group, enrollment_status, attendance_status, guardian_name, school_name, record_data)
      values (v_org, v_location, v_legacy, coalesce(v_item->>'firstName',''), coalesce(v_item->>'lastName',''), nullif(v_item->>'dateOfBirth','')::date, v_item->>'ageGroup', coalesce(v_item->>'enrollmentStatus','Active'), v_item->>'attendanceToday', v_item->>'primaryGuardian', v_item->>'school', v_item)
      on conflict (organization_id, legacy_id) do update set location_id=excluded.location_id, first_name=excluded.first_name, last_name=excluded.last_name, date_of_birth=excluded.date_of_birth, age_group=excluded.age_group, enrollment_status=excluded.enrollment_status, attendance_status=excluded.attendance_status, guardian_name=excluded.guardian_name, school_name=excluded.school_name, record_data=excluded.record_data;
      v_count := v_count + 1;
    end loop;
    delete from public.children c where c.organization_id=v_org and not exists (select 1 from jsonb_array_elements(p_items) i where coalesce(i->>'id','')=c.legacy_id);

  elsif p_collection_key = 'tcs-child-schedules-v2' then
    v_expected_legacy := array[]::text[];
    for v_item in select value from jsonb_array_elements(p_items) loop
      select id into v_child
      from public.children
      where organization_id = v_org and legacy_id = v_item->>'childId'
      limit 1;

      for v_slug in select slug from public.tcs_schedule_location_slugs(v_item) loop
        select id, name into v_location, v_location_name
        from public.locations
        where organization_id = v_org and slug = v_slug and is_active
        limit 1;
        if v_location is null then continue; end if;

        v_legacy := concat(coalesce(v_item->>'childId', gen_random_uuid()::text), ':', v_slug);
        v_expected_legacy := array_append(v_expected_legacy, v_legacy);
        v_partial := public.tcs_schedule_for_location(v_item, v_slug, v_location_name);

        insert into public.child_schedules (
          organization_id, location_id, child_id, legacy_id, child_name, age_group,
          is_primary, weekly_schedule, record_data
        )
        values (
          v_org, v_location, v_child, v_legacy, coalesce(v_item->>'childName',''),
          v_item->>'ageGroup',
          public.tcs_location_slug(v_item->>'defaultLocation') = v_slug,
          coalesce(v_partial->'days','{}'::jsonb), v_partial
        )
        on conflict (organization_id, legacy_id) do update
        set location_id = excluded.location_id,
            child_id = excluded.child_id,
            child_name = excluded.child_name,
            age_group = excluded.age_group,
            is_primary = excluded.is_primary,
            weekly_schedule = excluded.weekly_schedule,
            record_data = excluded.record_data;
        v_count := v_count + 1;
      end loop;
    end loop;

    delete from public.child_schedules r
    where r.organization_id = v_org
      and not (r.legacy_id = any(v_expected_legacy));

  elsif p_collection_key = 'tcs-daily-care-v1' then
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_legacy := coalesce(v_item->>'id', gen_random_uuid()::text);
      v_location := public.resolve_tcs_location_id(v_item->>'location', v_org);
      select id into v_child from public.children where organization_id=v_org and legacy_id=v_item->>'childId' limit 1;
      if v_location is null then raise exception 'A valid location is required for care entry %', v_legacy; end if;
      insert into public.daily_care_entries (organization_id, location_id, child_id, legacy_id, child_name, entry_date, entry_time, category, action, result, staff_initials, notes, record_data)
      values (v_org, v_location, v_child, v_legacy, coalesce(v_item->>'childName',''), coalesce(nullif(v_item->>'date','')::date, current_date), coalesce(v_item->>'time',''), coalesce(v_item->>'category','Daily Note'), v_item->>'action', v_item->>'result', v_item->>'initials', v_item->>'notes', v_item)
      on conflict (organization_id, legacy_id) do update set location_id=excluded.location_id, child_id=excluded.child_id, child_name=excluded.child_name, entry_date=excluded.entry_date, entry_time=excluded.entry_time, category=excluded.category, action=excluded.action, result=excluded.result, staff_initials=excluded.staff_initials, notes=excluded.notes, record_data=excluded.record_data;
      v_count := v_count + 1;
    end loop;
    delete from public.daily_care_entries r where r.organization_id=v_org and not exists (select 1 from jsonb_array_elements(p_items) i where coalesce(i->>'id','')=r.legacy_id);

  elsif p_collection_key = 'tcs-weekly-menus-v1' then
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_legacy := coalesce(v_item->>'id', concat(coalesce(v_item->>'location',''), '-', coalesce(v_item->>'weekOf','')));
      v_location := public.resolve_tcs_location_id(v_item->>'location', v_org);
      if v_location is null then raise exception 'A valid location is required for weekly menu %', v_legacy; end if;
      insert into public.weekly_menus (organization_id, location_id, legacy_id, week_of, menu_data, record_data)
      values (v_org, v_location, v_legacy, nullif(v_item->>'weekOf','')::date, coalesce(v_item->'days','{}'::jsonb), v_item)
      on conflict (organization_id, legacy_id) do update set location_id=excluded.location_id, week_of=excluded.week_of, menu_data=excluded.menu_data, record_data=excluded.record_data;
      v_count := v_count + 1;
    end loop;
    delete from public.weekly_menus r where r.organization_id=v_org and not exists (select 1 from jsonb_array_elements(p_items) i where coalesce(i->>'id', concat(coalesce(i->>'location',''), '-', coalesce(i->>'weekOf','')))=r.legacy_id);

  elsif p_collection_key = 'tcs-meal-services-v1' then
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_legacy := coalesce(v_item->>'id', gen_random_uuid()::text);
      v_location := public.resolve_tcs_location_id(v_item->>'location', v_org);
      if v_location is null then raise exception 'A valid location is required for meal service %', v_legacy; end if;
      insert into public.meal_services (organization_id, location_id, legacy_id, service_date, meal_type, service_time, food_served, drink_served, staff_initials, record_data)
      values (v_org, v_location, v_legacy, coalesce(nullif(v_item->>'date','')::date, current_date), coalesce(v_item->>'meal','Meal'), v_item->>'servedTime', coalesce(nullif(v_item->>'actualFoods',''), v_item->>'plannedFoods'), v_item->>'drinkServed', v_item->>'initials', v_item)
      on conflict (organization_id, legacy_id) do update set location_id=excluded.location_id, service_date=excluded.service_date, meal_type=excluded.meal_type, service_time=excluded.service_time, food_served=excluded.food_served, drink_served=excluded.drink_served, staff_initials=excluded.staff_initials, record_data=excluded.record_data;
      v_count := v_count + 1;
    end loop;
    delete from public.meal_services r where r.organization_id=v_org and not exists (select 1 from jsonb_array_elements(p_items) i where coalesce(i->>'id','')=r.legacy_id);

  elsif p_collection_key = 'tcs-shift-reports-v1' then
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_legacy := coalesce(v_item->>'id', gen_random_uuid()::text);
      v_location := public.resolve_tcs_location_id(v_item->>'location', v_org);
      if v_location is null then raise exception 'A valid location is required for shift report %', v_legacy; end if;
      insert into public.shift_reports (organization_id, location_id, legacy_id, report_date, report_type, status, completed_by, staff_initials, reviewed_by, reviewed_at, record_data)
      values (v_org, v_location, v_legacy, coalesce(nullif(v_item->>'date','')::date,current_date), coalesce(v_item->>'type','Opening'), coalesce(v_item->>'status','Draft'), v_item->>'completedBy', v_item->>'initials', case when coalesce(v_item->>'status','Draft') = 'Reviewed' then auth.uid() else null end, nullif(v_item->>'reviewedAt','')::timestamptz, v_item)
      on conflict (organization_id, legacy_id) do update set location_id=excluded.location_id, report_date=excluded.report_date, report_type=excluded.report_type, status=excluded.status, completed_by=excluded.completed_by, staff_initials=excluded.staff_initials, reviewed_by=excluded.reviewed_by, reviewed_at=excluded.reviewed_at, record_data=excluded.record_data;
      v_count := v_count + 1;
    end loop;
    delete from public.shift_reports r where r.organization_id=v_org and not exists (select 1 from jsonb_array_elements(p_items) i where coalesce(i->>'id','')=r.legacy_id);

  elsif p_collection_key = 'tcs-shift-handoffs-v1' then
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_legacy := coalesce(v_item->>'id', gen_random_uuid()::text);
      v_location := public.resolve_tcs_location_id(v_item->>'location', v_org);
      if v_location is null then raise exception 'A valid location is required for handoff %', v_legacy; end if;
      insert into public.handoff_items (organization_id, location_id, legacy_id, handoff_date, category, priority, completed, record_data)
      values (v_org, v_location, v_legacy, coalesce(nullif(v_item->>'date','')::date,current_date), coalesce(v_item->>'category','Other'), coalesce(v_item->>'priority','Normal'), coalesce((v_item->>'completed')::boolean,false), v_item)
      on conflict (organization_id, legacy_id) do update set location_id=excluded.location_id, handoff_date=excluded.handoff_date, category=excluded.category, priority=excluded.priority, completed=excluded.completed, record_data=excluded.record_data;
      v_count := v_count + 1;
    end loop;
    delete from public.handoff_items r where r.organization_id=v_org and not exists (select 1 from jsonb_array_elements(p_items) i where coalesce(i->>'id','')=r.legacy_id);

  elsif p_collection_key = 'tcs-health-safety-v1' then
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_legacy := coalesce(v_item->>'id', gen_random_uuid()::text);
      v_location := public.resolve_tcs_location_id(v_item->>'location', v_org);
      select id into v_child from public.children where organization_id=v_org and legacy_id=v_item->>'childId' limit 1;
      if v_location is null then raise exception 'A valid location is required for incident %', v_legacy; end if;
      insert into public.incidents (organization_id, location_id, child_id, legacy_id, child_name, occurred_date, occurred_time, incident_type, status, parent_contact, formal_report, staff_initials, record_data)
      values (v_org, v_location, v_child, v_legacy, coalesce(v_item->>'childName',''), coalesce(nullif(v_item->>'date','')::date,current_date), coalesce(v_item->>'time',''), coalesce(v_item->>'type','Boo-Boo / Incident'), coalesce(v_item->>'status','Open'), v_item->>'parentContact', coalesce((v_item->>'formalReport')::boolean,false), v_item->>'initials', v_item)
      on conflict (organization_id, legacy_id) do update set location_id=excluded.location_id, child_id=excluded.child_id, child_name=excluded.child_name, occurred_date=excluded.occurred_date, occurred_time=excluded.occurred_time, incident_type=excluded.incident_type, status=excluded.status, parent_contact=excluded.parent_contact, formal_report=excluded.formal_report, staff_initials=excluded.staff_initials, record_data=excluded.record_data;
      v_count := v_count + 1;
    end loop;
    delete from public.incidents r where r.organization_id=v_org and not exists (select 1 from jsonb_array_elements(p_items) i where coalesce(i->>'id','')=r.legacy_id);

  elsif p_collection_key = 'tcs-kidkare-enrollments-v1' then
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_legacy := coalesce(v_item->>'id', gen_random_uuid()::text);
      v_location := public.resolve_tcs_location_id(v_item->>'location', v_org);
      select id into v_child from public.children where organization_id=v_org and legacy_id=v_item->>'childId' limit 1;
      if v_location is null then raise exception 'A valid location is required for KidKare record %', v_legacy; end if;
      insert into public.kidkare_enrollments (organization_id, location_id, child_id, legacy_id, child_name, status, required, kidkare_child_id, submitted_at, verified_at, completed_by, record_data)
      values (v_org, v_location, v_child, v_legacy, coalesce(v_item->>'childName',''), coalesce(v_item->>'status','Not Started'), coalesce((v_item->>'required')::boolean,true), v_item->>'kidKareChildId', nullif(v_item->>'dateAdded','')::date, nullif(v_item->>'lastVerified','')::date, v_item->>'completedBy', v_item)
      on conflict (organization_id, legacy_id) do update set location_id=excluded.location_id, child_id=excluded.child_id, child_name=excluded.child_name, status=excluded.status, required=excluded.required, kidkare_child_id=excluded.kidkare_child_id, submitted_at=excluded.submitted_at, verified_at=excluded.verified_at, completed_by=excluded.completed_by, record_data=excluded.record_data;
      v_count := v_count + 1;
    end loop;
    delete from public.kidkare_enrollments r where r.organization_id=v_org and not exists (select 1 from jsonb_array_elements(p_items) i where coalesce(i->>'id','')=r.legacy_id);

  elsif p_collection_key = 'tcs-timesheets-v1' then
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_legacy := coalesce(v_item->>'id', gen_random_uuid()::text);
      v_location := public.resolve_tcs_location_id(v_item->>'location', v_org);
      select id into v_child from public.children where organization_id=v_org and lower(concat(first_name,' ',last_name))=lower(v_item->>'childName') limit 1;
      if v_location is null then raise exception 'A valid location is required for timesheet %', v_legacy; end if;
      insert into public.timesheets (organization_id, location_id, child_id, legacy_id, child_name, family_name, service_period, funding_source, workflow_stage, reviewed_at, record_data)
      values (v_org, v_location, v_child, v_legacy, coalesce(v_item->>'childName',''), v_item->>'familyName', coalesce(v_item->>'servicePeriod',''), coalesce(v_item->>'fundingSource','Private Pay'), coalesce(v_item->>'stage','Licensee Preparation'), nullif(v_item->>'dynastyReviewedAt','')::timestamptz, v_item)
      on conflict (organization_id, legacy_id) do update set location_id=excluded.location_id, child_id=excluded.child_id, child_name=excluded.child_name, family_name=excluded.family_name, service_period=excluded.service_period, funding_source=excluded.funding_source, workflow_stage=excluded.workflow_stage, reviewed_at=excluded.reviewed_at, record_data=excluded.record_data;
      v_count := v_count + 1;
    end loop;
    delete from public.timesheets r where r.organization_id=v_org and not exists (select 1 from jsonb_array_elements(p_items) i where coalesce(i->>'id','')=r.legacy_id);

  elsif p_collection_key = 'tcs-timesheet-department-routes-v1' then
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_legacy := coalesce(v_item->>'id', gen_random_uuid()::text);
      v_location := public.resolve_tcs_location_id(v_item->>'location', v_org);
      if v_location is null then raise exception 'A valid location is required for submission route %', v_legacy; end if;
      insert into public.timesheet_submission_routes (organization_id, location_id, legacy_id, funding_source, department, department_email, deadline, file_name_format, record_data)
      values (v_org, v_location, v_legacy, coalesce(v_item->>'fundingSource',''), v_item->>'department', v_item->>'email', v_item->>'deadline', v_item->>'fileNameFormat', v_item)
      on conflict (organization_id, legacy_id) do update set location_id=excluded.location_id, funding_source=excluded.funding_source, department=excluded.department, department_email=excluded.department_email, deadline=excluded.deadline, file_name_format=excluded.file_name_format, record_data=excluded.record_data;
      v_count := v_count + 1;
    end loop;
    delete from public.timesheet_submission_routes r where r.organization_id=v_org and not exists (select 1 from jsonb_array_elements(p_items) i where coalesce(i->>'id','')=r.legacy_id);

  elsif p_collection_key = 'tcs-routes' then
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_legacy := coalesce(v_item->>'id', gen_random_uuid()::text);
      v_location := public.resolve_tcs_location_id(v_item->>'location', v_org);
      if v_location is null then
        select c.location_id into v_location from public.children c where c.organization_id=v_org and lower(concat(c.first_name,' ',c.last_name))=lower(v_item->>'child') limit 1;
      end if;
      if v_location is null then raise exception 'A childcare location is required for transportation route %', v_legacy; end if;
      select id into v_child from public.children where organization_id=v_org and lower(concat(first_name,' ',last_name))=lower(v_item->>'child') limit 1;
      insert into public.transportation_routes (organization_id, location_id, child_id, legacy_id, child_name, school_name, driver_name, vehicle_name, route_status, record_data)
      values (v_org, v_location, v_child, v_legacy, coalesce(v_item->>'child',''), v_item->>'school', v_item->>'driver', v_item->>'vehicle', coalesce(v_item->>'status','Needs Review'), v_item)
      on conflict (organization_id, legacy_id) do update set location_id=excluded.location_id, child_id=excluded.child_id, child_name=excluded.child_name, school_name=excluded.school_name, driver_name=excluded.driver_name, vehicle_name=excluded.vehicle_name, route_status=excluded.route_status, record_data=excluded.record_data;
      v_count := v_count + 1;
    end loop;
    delete from public.transportation_routes r where r.organization_id=v_org and not exists (select 1 from jsonb_array_elements(p_items) i where coalesce(i->>'id','')=r.legacy_id);

  elsif p_collection_key = 'tcs-files' then
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_legacy := coalesce(v_item->>'id', gen_random_uuid()::text);
      v_location := public.resolve_tcs_location_id(v_item->>'location', v_org);
      if v_location is null then raise exception 'A valid location is required for compliance file %', v_legacy; end if;
      insert into public.compliance_files (organization_id, location_id, legacy_id, person_name, record_type, document_name, status, due_label, record_data)
      values (v_org, v_location, v_legacy, coalesce(v_item->>'person',''), coalesce(v_item->>'recordType','Child'), coalesce(v_item->>'document',''), coalesce(v_item->>'status','Missing'), v_item->>'due', v_item)
      on conflict (organization_id, legacy_id) do update set location_id=excluded.location_id, person_name=excluded.person_name, record_type=excluded.record_type, document_name=excluded.document_name, status=excluded.status, due_label=excluded.due_label, record_data=excluded.record_data;
      v_count := v_count + 1;
    end loop;
    delete from public.compliance_files r where r.organization_id=v_org and not exists (select 1 from jsonb_array_elements(p_items) i where coalesce(i->>'id','')=r.legacy_id);

  elsif p_collection_key = 'tcs-transportation-fees-v1' then
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_legacy := coalesce(v_item->>'id', gen_random_uuid()::text);
      v_location := public.resolve_tcs_location_id(v_item->>'location', v_org);
      if v_location is null then raise exception 'A valid location is required for transportation fee record %', v_legacy; end if;
      insert into public.transportation_fee_records (organization_id, location_id, legacy_id, week_of, family_key, family_name, guardian_name, expected_amount, charged_amount, payment_status, record_data)
      values (v_org, v_location, v_legacy, coalesce(nullif(v_item->>'weekOf','')::date,current_date), coalesce(v_item->>'familyKey',''), coalesce(v_item->>'familyName',''), v_item->>'guardianName', coalesce(nullif(v_item->>'expectedAmount','')::numeric,0), coalesce(nullif(v_item->>'chargedAmount','')::numeric,0), coalesce(v_item->>'paymentStatus','Unpaid'), v_item)
      on conflict (organization_id, legacy_id) do update set location_id=excluded.location_id, week_of=excluded.week_of, family_key=excluded.family_key, family_name=excluded.family_name, guardian_name=excluded.guardian_name, expected_amount=excluded.expected_amount, charged_amount=excluded.charged_amount, payment_status=excluded.payment_status, record_data=excluded.record_data;
      v_count := v_count + 1;
    end loop;
    delete from public.transportation_fee_records r where r.organization_id=v_org and not exists (select 1 from jsonb_array_elements(p_items) i where coalesce(i->>'id','')=r.legacy_id);

  elsif p_collection_key = 'tcs-enrollment-pipeline-v1' then
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_legacy := coalesce(v_item->>'id', gen_random_uuid()::text);
      v_location := public.resolve_tcs_location_id(v_item->>'location', v_org);
      if v_location is null then raise exception 'A valid location is required for enrollment lead %', v_legacy; end if;
      insert into public.enrollment_leads (organization_id, location_id, legacy_id, family_name, parent_name, child_name, stage, follow_up_date, tour_at, record_data)
      values (v_org, v_location, v_legacy, coalesce(v_item->>'familyName',''), v_item->>'parentName', v_item->>'childName', coalesce(v_item->>'stage','Inquiry'), nullif(v_item->>'followUpDate','')::date, nullif(v_item->>'tourDate','')::timestamptz, v_item)
      on conflict (organization_id, legacy_id) do update set location_id=excluded.location_id, family_name=excluded.family_name, parent_name=excluded.parent_name, child_name=excluded.child_name, stage=excluded.stage, follow_up_date=excluded.follow_up_date, tour_at=excluded.tour_at, record_data=excluded.record_data;
      v_count := v_count + 1;
    end loop;
    delete from public.enrollment_leads r where r.organization_id=v_org and not exists (select 1 from jsonb_array_elements(p_items) i where coalesce(i->>'id','')=r.legacy_id);

  elsif p_collection_key = 'tcs-digital-forms-v1' then
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_legacy := coalesce(v_item->>'id', gen_random_uuid()::text);
      v_location := public.resolve_tcs_location_id(v_item->>'location', v_org);
      if v_location is null then raise exception 'A valid location is required for digital form %', v_legacy; end if;
      insert into public.digital_forms (organization_id, location_id, legacy_id, subject_type, subject_name, form_name, signer_name, status, signature_method, due_date, signed_at, record_data)
      values (v_org, v_location, v_legacy, coalesce(v_item->>'subjectType','Child'), coalesce(v_item->>'subjectName',''), coalesce(v_item->>'formName',''), v_item->>'signerName', coalesce(v_item->>'status','Draft'), coalesce(v_item->>'signatureMethod','Not Signed'), nullif(v_item->>'dueDate','')::date, nullif(v_item->>'signedAt','')::timestamptz, v_item)
      on conflict (organization_id, legacy_id) do update set location_id=excluded.location_id, subject_type=excluded.subject_type, subject_name=excluded.subject_name, form_name=excluded.form_name, signer_name=excluded.signer_name, status=excluded.status, signature_method=excluded.signature_method, due_date=excluded.due_date, signed_at=excluded.signed_at, record_data=excluded.record_data;
      v_count := v_count + 1;
    end loop;
    delete from public.digital_forms r where r.organization_id=v_org and not exists (select 1 from jsonb_array_elements(p_items) i where coalesce(i->>'id','')=r.legacy_id);

  else
    raise exception 'Unsupported relational collection: %', p_collection_key;
  end if;

  return v_count;
end;
$$;

revoke all on function public.sync_tcs_collection(text, jsonb) from public;
grant execute on function public.sync_tcs_collection(text, jsonb) to authenticated;


-- Relational collections must never be written back into the broad hub_state
-- JSON table. Owners can read legacy rows only long enough to migrate them.
create or replace function public.is_tcs_relational_state_key(p_state_key text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_state_key = any(array[
    'tcs-children-v1','tcs-child-schedules-v2','tcs-daily-care-v1',
    'tcs-weekly-menus-v1','tcs-meal-services-v1','tcs-shift-reports-v1',
    'tcs-shift-handoffs-v1','tcs-health-safety-v1','tcs-kidkare-enrollments-v1',
    'tcs-timesheets-v1','tcs-timesheet-department-routes-v1','tcs-routes','tcs-files',
    'tcs-transportation-fees-v1','tcs-enrollment-pipeline-v1','tcs-digital-forms-v1'
  ]::text[]);
$$;

create or replace function public.can_read_hub_state_key(p_state_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_approved_tcs_pilot_user() then return false; end if;
  if public.is_tcs_relational_state_key(p_state_key) then return public.is_tcs_owner(); end if;
  if public.is_tcs_owner() then return true; end if;

  if public.is_tcs_licensee() then
    return p_state_key <> 'tcs-settings';
  end if;
  if not public.is_tcs_employee() then return false; end if;

  return case
    when p_state_key = 'tcs-work-tasks' then public.has_staff_permission('work_plans')
    when p_state_key in ('tcs-schools-v2', 'tcs-vehicles-v2', 'tcs-vehicle-readiness-v2') then public.has_staff_permission('transportation')
    when p_state_key in ('tcs-location-hours-v2', 'tcs-shifts') then public.has_staff_permission('ratios')
    else false
  end;
end;
$$;

create or replace function public.can_write_hub_state_key(p_state_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_approved_tcs_pilot_user() then return false; end if;
  if public.is_tcs_relational_state_key(p_state_key) then return false; end if;
  if public.is_tcs_owner() then return true; end if;

  if public.is_tcs_licensee() then
    return p_state_key not in (
      'tcs-settings','tcs-locations-v2','tcs-location-hours-v2',
      'tcs-schools-v2','tcs-vehicles-v2','tcs-timesheet-department-routes-v1'
    );
  end if;
  if not public.is_tcs_employee() then return false; end if;

  return case
    when p_state_key = 'tcs-work-tasks' then public.has_staff_permission('work_plans')
    when p_state_key = 'tcs-vehicle-readiness-v2' then public.has_staff_permission('transportation')
    else false
  end;
end;
$$;

create or replace function public.prevent_relational_hub_state_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_tcs_relational_state_key(new.state_key) then
    raise exception 'This collection is stored in a relational location-scoped table' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists hub_state_block_relational_write on public.hub_state;
create trigger hub_state_block_relational_write
before insert or update on public.hub_state
for each row execute function public.prevent_relational_hub_state_write();

revoke all on function public.is_tcs_relational_state_key(text) from public;
grant execute on function public.is_tcs_relational_state_key(text) to authenticated;

-- One-time migration for projects that already used hub_state JSON collections.
-- Run this while signed in as an Owner/Admin. Each successfully migrated JSON
-- row is deleted immediately so sensitive records are not retained twice.
create or replace function public.migrate_tcs_legacy_state()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_key text;
  v_value jsonb;
  v_count integer;
  v_result jsonb := '{}'::jsonb;
begin
  if not public.is_tcs_owner() then
    raise exception 'Owner/Admin access required' using errcode = '42501';
  end if;

  foreach v_key in array array[
    'tcs-children-v1','tcs-child-schedules-v2','tcs-daily-care-v1',
    'tcs-weekly-menus-v1','tcs-meal-services-v1','tcs-shift-reports-v1',
    'tcs-shift-handoffs-v1','tcs-health-safety-v1','tcs-kidkare-enrollments-v1',
    'tcs-timesheets-v1','tcs-timesheet-department-routes-v1','tcs-routes'
  ] loop
    select state_value into v_value
    from public.hub_state
    where organization_id = public.current_staff_organization_id()
      and state_key = v_key;

    if v_value is not null and jsonb_typeof(v_value) = 'array' then
      v_count := public.sync_tcs_collection(v_key, v_value);
      delete from public.hub_state
      where organization_id = public.current_staff_organization_id()
        and state_key = v_key;
      v_result := v_result || jsonb_build_object(v_key, jsonb_build_object('rows', v_count, 'legacy_json_deleted', true));
    end if;
  end loop;

  return v_result;
end;
$$;
revoke all on function public.migrate_tcs_legacy_state() from public;
grant execute on function public.migrate_tcs_legacy_state() to authenticated;

-- Keep child-location memberships synchronized after relational writes.
drop trigger if exists children_refresh_location_membership on public.children;
create trigger children_refresh_location_membership
after insert or update of location_id on public.children
for each row execute function public.refresh_child_primary_membership_trigger();

drop trigger if exists child_schedules_refresh_location_membership on public.child_schedules;
create trigger child_schedules_refresh_location_membership
after insert or update or delete on public.child_schedules
for each row execute function public.refresh_child_membership_trigger();

drop trigger if exists kidkare_refresh_location_membership on public.kidkare_enrollments;
create trigger kidkare_refresh_location_membership
after insert or update or delete on public.kidkare_enrollments
for each row execute function public.refresh_child_membership_trigger();

-- Backfill or repair memberships when hardening is applied to an existing project.
insert into public.child_location_memberships (
  organization_id, child_id, location_id, from_primary, from_schedule, from_kidkare
)
select
  source.organization_id,
  source.child_id,
  source.location_id,
  bool_or(source.source_type = 'primary'),
  bool_or(source.source_type = 'schedule'),
  bool_or(source.source_type = 'kidkare')
from (
  select c.organization_id, c.id as child_id, c.location_id, 'primary'::text as source_type
  from public.children c
  union all
  select s.organization_id, s.child_id, s.location_id, 'schedule'::text
  from public.child_schedules s where s.child_id is not null
  union all
  select k.organization_id, k.child_id, k.location_id, 'kidkare'::text
  from public.kidkare_enrollments k where k.child_id is not null and k.required
) source
group by source.organization_id, source.child_id, source.location_id
on conflict (organization_id, child_id, location_id) do update
set from_primary = excluded.from_primary,
    from_schedule = excluded.from_schedule,
    from_kidkare = excluded.from_kidkare,
    updated_at = now();

delete from public.child_location_memberships m
where not exists (
  select 1 from public.children c where c.id = m.child_id and c.location_id = m.location_id
)
and not exists (
  select 1 from public.child_schedules s where s.child_id = m.child_id and s.location_id = m.location_id
)
and not exists (
  select 1 from public.kidkare_enrollments k where k.child_id = m.child_id and k.location_id = m.location_id and k.required
);

-- ---------------------------------------------------------------------------
-- RLS and audit triggers for every location-owned table
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'children','child_schedules','daily_care_entries','weekly_menus','meal_services',
    'shift_reports','handoff_items','incidents','kidkare_enrollments','timesheets',
    'timesheet_submission_routes','transportation_routes','compliance_files','transportation_fee_records',
    'enrollment_leads','digital_forms'
  ] loop
    execute format('drop trigger if exists %I_set_metadata on public.%I', t, t);
    execute format('create trigger %I_set_metadata before insert or update on public.%I for each row execute function public.set_tcs_row_metadata()', t, t);
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_location_row_change()', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

drop trigger if exists child_location_memberships_audit on public.child_location_memberships;
create trigger child_location_memberships_audit
after insert or update or delete on public.child_location_memberships
for each row execute function public.audit_location_row_change();

-- Helper to create consistent policies without dynamic user input.
create or replace function public.tcs_module_for_table(p_table text)
returns text language sql immutable as $$
  select case p_table
    when 'children' then 'children'
    when 'child_schedules' then 'schedules'
    when 'daily_care_entries' then 'daily_care'
    when 'weekly_menus' then 'meals'
    when 'meal_services' then 'meals'
    when 'shift_reports' then 'reports'
    when 'handoff_items' then 'reports'
    when 'incidents' then 'incidents'
    when 'kidkare_enrollments' then 'kidkare'
    when 'timesheets' then 'timesheets'
    when 'timesheet_submission_routes' then 'timesheets'
    when 'transportation_routes' then 'transportation'
    when 'compliance_files' then 'admin_files'
    when 'transportation_fee_records' then 'billing'
    when 'enrollment_leads' then 'enrollment'
    when 'digital_forms' then 'forms'
    else 'none' end;
$$;

-- Children use derived memberships so a child who attends more than one site is
-- visible at each authorized site without exposing unrelated location records.
alter table public.children enable row level security;
drop policy if exists "child membership read" on public.children;
create policy "child membership read" on public.children for select to authenticated
using (
  organization_id = public.current_staff_organization_id()
  and public.can_read_child(id, 'children')
);
drop policy if exists "child assigned insert" on public.children;
create policy "child assigned insert" on public.children for insert to authenticated
with check (
  organization_id = public.current_staff_organization_id()
  and public.can_write_location_module(location_id, 'children')
);
drop policy if exists "child membership update" on public.children;
create policy "child membership update" on public.children for update to authenticated
using (
  organization_id = public.current_staff_organization_id()
  and public.can_write_child(id)
)
with check (
  organization_id = public.current_staff_organization_id()
  and (public.is_tcs_owner() or public.can_access_location(location_id))
);
drop policy if exists "child membership delete" on public.children;
create policy "child membership delete" on public.children for delete to authenticated
using (
  organization_id = public.current_staff_organization_id()
  and public.can_write_child(id)
);

alter table public.child_location_memberships enable row level security;
revoke all on public.child_location_memberships from anon, authenticated;
grant select on public.child_location_memberships to authenticated;
drop policy if exists "membership location read" on public.child_location_memberships;
create policy "membership location read" on public.child_location_memberships for select to authenticated
using (
  organization_id = public.current_staff_organization_id()
  and public.can_read_location_module(location_id, 'children')
);

-- Tables with standard module policies.
do $$
declare
  t text;
  m text;
begin
  foreach t in array array['child_schedules','daily_care_entries','weekly_menus','meal_services','shift_reports','handoff_items','incidents','kidkare_enrollments','transportation_routes','compliance_files','transportation_fee_records','enrollment_leads','digital_forms'] loop
    m := public.tcs_module_for_table(t);
    execute format('drop policy if exists %I on public.%I', 'location read', t);
    execute format('create policy %I on public.%I for select to authenticated using (organization_id = public.current_staff_organization_id() and public.can_read_location_module(location_id, %L))', 'location read', t, m);
    execute format('drop policy if exists %I on public.%I', 'location insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, %L))', 'location insert', t, m);
    execute format('drop policy if exists %I on public.%I', 'location update', t);
    execute format('create policy %I on public.%I for update to authenticated using (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, %L)) with check (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, %L))', 'location update', t, m, m);
    execute format('drop policy if exists %I on public.%I', 'location delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, %L))', 'location delete', t, m);
  end loop;
end $$;

-- Timesheets are operational for Owners and Licensees; employees cannot access them.
alter table public.timesheets enable row level security;
drop policy if exists "timesheets read" on public.timesheets;
create policy "timesheets read" on public.timesheets for select to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_access_location(location_id) and (public.is_tcs_owner() or public.is_tcs_licensee()));
drop policy if exists "timesheets write" on public.timesheets;
create policy "timesheets write" on public.timesheets for all to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_access_location(location_id) and (public.is_tcs_owner() or public.is_tcs_licensee()))
with check (organization_id = public.current_staff_organization_id() and public.can_access_location(location_id) and (public.is_tcs_owner() or public.is_tcs_licensee()));

drop policy if exists "submission routes owner read" on public.timesheet_submission_routes;
create policy "submission routes owner read" on public.timesheet_submission_routes for select to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_access_location(location_id) and public.is_tcs_owner());
drop policy if exists "submission routes owner write" on public.timesheet_submission_routes;
create policy "submission routes owner write" on public.timesheet_submission_routes for all to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_access_location(location_id) and public.is_tcs_owner())
with check (organization_id = public.current_staff_organization_id() and public.can_access_location(location_id) and public.is_tcs_owner());

alter table public.locations enable row level security;
alter table public.staff_location_assignments enable row level security;
alter table public.audit_log enable row level security;
revoke all on public.locations from anon, authenticated;
revoke all on public.staff_location_assignments from anon, authenticated;
revoke all on public.audit_log from anon, authenticated;
grant select, insert, update, delete on public.locations to authenticated;
grant select on public.staff_location_assignments to authenticated;
grant select on public.audit_log to authenticated;

drop policy if exists "staff read locations" on public.locations;
create policy "staff read locations" on public.locations for select to authenticated
using (organization_id = public.current_staff_organization_id() and (public.is_tcs_owner() or public.can_access_location(id)));
drop policy if exists "owners manage locations" on public.locations;
create policy "owners manage locations" on public.locations for all to authenticated
using (organization_id = public.current_staff_organization_id() and public.is_tcs_owner())
with check (organization_id = public.current_staff_organization_id() and public.is_tcs_owner());

drop policy if exists "staff read own assignments" on public.staff_location_assignments;
create policy "staff read own assignments" on public.staff_location_assignments for select to authenticated
using (user_id = auth.uid() or public.is_tcs_owner());

drop policy if exists "owners read audit" on public.audit_log;
create policy "owners read audit" on public.audit_log for select to authenticated
using (organization_id = public.current_staff_organization_id() and public.is_tcs_owner());


-- Company-wide configuration and access changes are audited too.
drop trigger if exists locations_set_updated_at on public.locations;
create trigger locations_set_updated_at before update on public.locations
for each row execute function public.set_updated_at();
drop trigger if exists locations_global_audit on public.locations;
create trigger locations_global_audit after insert or update or delete on public.locations
for each row execute function public.audit_global_row_change();

drop trigger if exists staff_access_global_audit on public.staff_access;
create trigger staff_access_global_audit after insert or update or delete on public.staff_access
for each row execute function public.audit_global_row_change();

drop trigger if exists staff_invitations_global_audit on public.staff_invitations;
create trigger staff_invitations_global_audit after insert or update or delete on public.staff_invitations
for each row execute function public.audit_global_row_change();

drop trigger if exists hub_state_global_audit on public.hub_state;
create trigger hub_state_global_audit after insert or update or delete on public.hub_state
for each row execute function public.audit_global_row_change();

-- ---------------------------------------------------------------------------
-- Private encrypted document storage and retention controls
-- ---------------------------------------------------------------------------

create table if not exists public.retention_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_type text not null,
  retention_years integer not null default 3 check (retention_years between 0 and 50),
  anchor_event text not null default 'upload_date' check (anchor_event in ('upload_date','child_exit_date','incident_date','service_period_end')),
  description text not null,
  is_active boolean not null default true,
  requires_legal_hold_check boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, document_type)
);

insert into public.retention_policies (organization_id, document_type, retention_years, anchor_event, description)
values
  ('00000000-0000-4000-8000-000000000001', 'LIC 700 / Emergency Information', 3, 'child_exit_date', 'Company baseline: retain through enrollment and at least three years after care ends; review licensing requirements before destruction.'),
  ('00000000-0000-4000-8000-000000000001', 'Medical Consent / Medical Card', 3, 'child_exit_date', 'Company baseline: retain through enrollment and at least three years after care ends; extend for incidents, payer rules, or legal hold.'),
  ('00000000-0000-4000-8000-000000000001', 'Incident / Injury Report', 3, 'incident_date', 'Retain at least three years after the incident and longer while any investigation, claim, audit, or legal hold remains open.'),
  ('00000000-0000-4000-8000-000000000001', 'Timesheet / Subsidy Record', 3, 'service_period_end', 'Retain at least three years after the service period; extend for unresolved audits, reviews, appeals, or contract requirements.'),
  ('00000000-0000-4000-8000-000000000001', 'CACFP / Meal Record', 3, 'service_period_end', 'Retain at least three years and longer for unresolved audit or review findings.'),
  ('00000000-0000-4000-8000-000000000001', 'Other Child Form', 3, 'child_exit_date', 'Default child-file retention baseline; Owner/Admin must confirm the correct rule before deletion.')
on conflict (organization_id, document_type) do update
set retention_years=excluded.retention_years,
    anchor_event=excluded.anchor_event,
    description=excluded.description,
    is_active=true,
    updated_at=now();

create table if not exists public.document_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  child_id uuid references public.children(id) on delete set null,
  document_type text not null,
  original_filename text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text not null,
  encryption_algorithm text not null default 'AES-256-GCM',
  encryption_iv text not null,
  encryption_version integer not null default 1,
  retention_policy_id uuid not null references public.retention_policies(id) on delete restrict,
  retention_until date not null,
  legal_hold boolean not null default false,
  status text not null default 'Active' check (status in ('Active','Archived','Deletion Requested','Deleted')),
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_records_location_idx on public.document_records (organization_id, location_id, created_at desc);
create index if not exists document_records_retention_idx on public.document_records (status, legal_hold, retention_until);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tcs-sensitive-documents', 'tcs-sensitive-documents', false, 15728640, array['application/octet-stream'])
on conflict (id) do update
set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

alter table public.retention_policies enable row level security;
alter table public.document_records enable row level security;
revoke all on public.retention_policies from anon, authenticated;
revoke all on public.document_records from anon, authenticated;
grant select, insert, update, delete on public.retention_policies to authenticated;
grant select, insert, update, delete on public.document_records to authenticated;


drop trigger if exists retention_policies_set_updated_at on public.retention_policies;
create trigger retention_policies_set_updated_at before update on public.retention_policies
for each row execute function public.set_updated_at();
drop trigger if exists retention_policies_global_audit on public.retention_policies;
create trigger retention_policies_global_audit after insert or update or delete on public.retention_policies
for each row execute function public.audit_global_row_change();

drop policy if exists "staff read retention policies" on public.retention_policies;
create policy "staff read retention policies" on public.retention_policies for select to authenticated
using (organization_id = public.current_staff_organization_id() and public.is_approved_tcs_pilot_user());
drop policy if exists "owners manage retention policies" on public.retention_policies;
create policy "owners manage retention policies" on public.retention_policies for all to authenticated
using (organization_id = public.current_staff_organization_id() and public.is_tcs_owner())
with check (organization_id = public.current_staff_organization_id() and public.is_tcs_owner());

drop policy if exists "authorized staff read documents" on public.document_records;
create policy "authorized staff read documents" on public.document_records for select to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_access_location(location_id) and (public.is_tcs_owner() or public.is_tcs_licensee()));
drop policy if exists "authorized staff create documents" on public.document_records;
create policy "authorized staff create documents" on public.document_records for insert to authenticated
with check (organization_id = public.current_staff_organization_id() and public.can_access_location(location_id) and (public.is_tcs_owner() or public.is_tcs_licensee()));
drop policy if exists "owners update documents" on public.document_records;
create policy "owners update documents" on public.document_records for update to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_access_location(location_id) and public.is_tcs_owner())
with check (organization_id = public.current_staff_organization_id() and public.can_access_location(location_id) and public.is_tcs_owner());
drop policy if exists "owners delete documents" on public.document_records;
create policy "owners delete documents" on public.document_records for delete to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_access_location(location_id) and public.is_tcs_owner() and not legal_hold and retention_until <= current_date);

-- Audit document metadata changes too.
drop trigger if exists document_records_set_metadata on public.document_records;
create trigger document_records_set_metadata before update on public.document_records
for each row execute function public.set_updated_at();
drop trigger if exists document_records_audit on public.document_records;
create trigger document_records_audit after insert or update or delete on public.document_records
for each row execute function public.audit_location_row_change();

-- Storage object access. The server stores encrypted ciphertext at:
-- organization_uuid/location_uuid/document_uuid.enc
-- Direct browser access is denied; protected server routes decrypt authorized downloads.
drop policy if exists "tcs document storage deny direct select" on storage.objects;
create policy "tcs document storage deny direct select" on storage.objects for select to authenticated
using (bucket_id = 'tcs-sensitive-documents' and false);
drop policy if exists "tcs document storage deny direct insert" on storage.objects;
create policy "tcs document storage deny direct insert" on storage.objects for insert to authenticated
with check (bucket_id = 'tcs-sensitive-documents' and false);
drop policy if exists "tcs document storage deny direct update" on storage.objects;
create policy "tcs document storage deny direct update" on storage.objects for update to authenticated
using (bucket_id = 'tcs-sensitive-documents' and false);
drop policy if exists "tcs document storage deny direct delete" on storage.objects;
create policy "tcs document storage deny direct delete" on storage.objects for delete to authenticated
using (bucket_id = 'tcs-sensitive-documents' and false);

-- Optional purge function. It only returns records eligible for server-side purge;
-- it never deletes legal-hold or unexpired records.
create or replace function public.documents_eligible_for_purge()
returns setof public.document_records
language sql
stable
security definer
set search_path = public
as $$
  select d.* from public.document_records d
  where d.organization_id = public.current_staff_organization_id()
    and public.is_tcs_owner()
    and d.status in ('Archived','Deletion Requested')
    and not d.legal_hold
    and d.retention_until <= current_date;
$$;
revoke all on function public.documents_eligible_for_purge() from public;
grant execute on function public.documents_eligible_for_purge() to authenticated;

-- Realtime for relational operational tables.
do $$
declare t text;
begin
  foreach t in array array['children','child_location_memberships','child_schedules','daily_care_entries','weekly_menus','meal_services','shift_reports','handoff_items','incidents','kidkare_enrollments','timesheets','timesheet_submission_routes','transportation_routes','compliance_files','transportation_fee_records','enrollment_leads','digital_forms','document_records'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
