-- TCS Operations Hub — Time Off Blackouts + Attendance Accountability
-- Mirrors additive production changes applied to the existing TCS Supabase project.

create table if not exists public.staff_attendance_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  late_tracking_enabled boolean not null default false,
  late_grace_minutes integer check (late_grace_minutes is null or late_grace_minutes >= 0),
  early_departure_tracking_enabled boolean not null default false,
  early_departure_grace_minutes integer check (early_departure_grace_minutes is null or early_departure_grace_minutes >= 0),
  no_show_tracking_enabled boolean not null default false,
  no_show_after_minutes integer check (no_show_after_minutes is null or no_show_after_minutes >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.time_off_blackouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id()
    references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  title text not null,
  reason text,
  start_date date not null,
  end_date date not null,
  block_requests boolean not null default true,
  notes text,
  is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.time_off_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id()
    references public.organizations(id) on delete cascade,
  staff_user_id uuid not null references public.staff_access(user_id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  request_scope text not null default 'All Assigned Locations'
    check (request_scope in ('All Assigned Locations','Specific Location')),
  request_type text not null default 'Time Off'
    check (request_type in ('Time Off','Vacation','Unpaid','Appointment','Other')),
  start_date date not null,
  end_date date not null,
  all_day boolean not null default true,
  start_time time,
  end_time time,
  reason text,
  status text not null default 'Pending'
    check (status in ('Pending','Approved','Denied','Cancelled')),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (
    all_day = true
    or (
      start_date = end_date
      and start_time is not null
      and end_time is not null
      and end_time > start_time
    )
  ),
  check (
    (request_scope = 'All Assigned Locations' and location_id is null)
    or (request_scope = 'Specific Location' and location_id is not null)
  )
);

create index if not exists time_off_blackouts_org_dates_idx
  on public.time_off_blackouts(organization_id, start_date, end_date) where is_active;
create index if not exists time_off_blackouts_location_dates_idx
  on public.time_off_blackouts(location_id, start_date, end_date) where is_active and location_id is not null;
create index if not exists time_off_requests_staff_dates_idx
  on public.time_off_requests(staff_user_id, start_date, end_date);
create index if not exists time_off_requests_status_dates_idx
  on public.time_off_requests(organization_id, status, start_date, end_date);
create index if not exists time_off_requests_location_dates_idx
  on public.time_off_requests(location_id, start_date, end_date) where location_id is not null;

alter table public.staff_attendance_settings enable row level security;
alter table public.time_off_blackouts enable row level security;
alter table public.time_off_requests enable row level security;

-- Mutations are intentionally server-API only; authenticated clients receive SELECT access only.
revoke insert, update, delete on public.time_off_blackouts from authenticated;
revoke insert, update, delete on public.time_off_requests from authenticated;
revoke insert, update, delete on public.staff_attendance_settings from authenticated;
grant select on public.time_off_blackouts, public.time_off_requests, public.staff_attendance_settings to authenticated;
grant all on public.time_off_blackouts, public.time_off_requests, public.staff_attendance_settings to service_role;
