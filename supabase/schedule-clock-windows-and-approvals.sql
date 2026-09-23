-- TCS Operations Hub — Scheduled Clock Windows + Shift Exception Approvals
-- Production rules: staff may clock in up to 4 minutes before a published shift.
-- The normal clock-out window ends 4 minutes after shift end.
-- Actual clock-out is always preserved; unapproved extra worked time is sent to leadership review.

alter table public.staff_attendance_settings
  add column if not exists enforce_schedule_clocking boolean not null default true,
  add column if not exists early_clock_in_window_minutes integer not null default 4
    check (early_clock_in_window_minutes >= 0),
  add column if not exists late_clock_out_window_minutes integer not null default 4
    check (late_clock_out_window_minutes >= 0),
  add column if not exists flag_scheduled_hours_overage boolean not null default true;

create table if not exists public.staff_clock_exception_approvers (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.staff_access(user_id) on delete cascade,
  approval_scope text not null check (approval_scope in ('General','Maintenance')),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id, approval_scope)
);

create table if not exists public.staff_clock_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  staff_user_id uuid not null references public.staff_access(user_id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  shift_id uuid references public.staff_shifts(id) on delete set null,
  work_date date not null,
  approval_scope text not null default 'General'
    check (approval_scope in ('General','Maintenance')),
  approved_start_time time,
  approved_end_time time,
  reason text not null,
  status text not null default 'Approved'
    check (status in ('Approved','Revoked')),
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (approved_start_time is not null or approved_end_time is not null),
  check (
    approved_start_time is null
    or approved_end_time is null
    or approved_end_time > approved_start_time
  )
);

create index if not exists staff_clock_exceptions_staff_date_idx
  on public.staff_clock_exceptions(staff_user_id, work_date, status);
create index if not exists staff_clock_exceptions_location_date_idx
  on public.staff_clock_exceptions(location_id, work_date, status);

alter table public.staff_clock_exception_approvers enable row level security;
alter table public.staff_clock_exceptions enable row level security;

revoke all on public.staff_clock_exception_approvers from anon, authenticated;
revoke all on public.staff_clock_exceptions from anon, authenticated;
grant all on public.staff_clock_exception_approvers to service_role;
grant all on public.staff_clock_exceptions to service_role;

drop trigger if exists set_staff_clock_exception_approvers_updated_at on public.staff_clock_exception_approvers;
create trigger set_staff_clock_exception_approvers_updated_at
before update on public.staff_clock_exception_approvers
for each row execute function public.set_updated_at();

drop trigger if exists set_staff_clock_exceptions_updated_at on public.staff_clock_exceptions;
create trigger set_staff_clock_exceptions_updated_at
before update on public.staff_clock_exceptions
for each row execute function public.set_updated_at();

drop trigger if exists audit_staff_clock_exceptions on public.staff_clock_exceptions;
create trigger audit_staff_clock_exceptions
after insert or update or delete on public.staff_clock_exceptions
for each row execute function public.audit_location_row_change();

-- Danielle Moore and Jennifer Thomason are the named general approvers.
insert into public.staff_clock_exception_approvers
  (organization_id, user_id, approval_scope, is_active, created_by)
select organization_id, user_id, 'General', true, user_id
from public.staff_access
where lower(full_name) in ('danielle moore','jennifer thomason')
  and is_active = true
on conflict (organization_id, user_id, approval_scope)
do update set is_active = true, updated_at = now();

-- Tony is intentionally not seeded until his authenticated Hub staff account exists.
-- Once present, assign him as the Maintenance approver through the Time Off & Availability UI.

insert into public.staff_performance_event_types
  (organization_id, code, label, category, description, suggested_points, requires_review, is_active, sort_order)
select id, 'unapproved_shift_overage', 'Unapproved Shift Overage', 'Accountability',
       'Actual clocked time exceeded the published scheduled hours without an approved exception.',
       0, true, true, 75
from public.organizations
on conflict (organization_id, code)
do update set
  label = excluded.label,
  category = excluded.category,
  description = excluded.description,
  requires_review = true,
  is_active = true,
  sort_order = excluded.sort_order;

update public.staff_attendance_settings
set enforce_schedule_clocking = true,
    early_clock_in_window_minutes = 4,
    late_clock_out_window_minutes = 4,
    flag_scheduled_hours_overage = true,
    updated_at = now();
