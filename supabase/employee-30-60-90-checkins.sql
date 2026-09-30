-- TCS Operations Hub — Employee 30/60/90 Check-In System
-- Structured onboarding check-ins with employee reflection, leadership review,
-- private leadership notes, and employee acknowledgment.

create table if not exists public.staff_checkin_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  staff_user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  start_date date not null,
  manager_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'Active' check (status in ('Active','Completed','Paused')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, staff_user_id, start_date)
);

create index if not exists staff_checkin_plans_org_staff_idx
  on public.staff_checkin_plans (organization_id, staff_user_id, status, start_date desc);

create table if not exists public.staff_checkins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.staff_checkin_plans(id) on delete cascade,
  staff_user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  milestone_days integer not null check (milestone_days in (30,60,90)),
  due_date date not null,
  status text not null default 'Upcoming'
    check (status in ('Upcoming','Employee Submitted','Leadership Draft','Review Shared','Completed')),
  employee_proud_of text,
  employee_support_needed text,
  employee_questions text,
  employee_goal text,
  employee_submitted_at timestamptz,
  leadership_strengths text,
  leadership_focus text,
  leadership_support text,
  leadership_next_goal text,
  leadership_ratings jsonb not null default '{}'::jsonb,
  leadership_private_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_shared_at timestamptz,
  employee_acknowledged_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, milestone_days)
);

create index if not exists staff_checkins_due_idx
  on public.staff_checkins (organization_id, due_date, status, location_id);

create index if not exists staff_checkins_staff_idx
  on public.staff_checkins (organization_id, staff_user_id, milestone_days, due_date);

drop trigger if exists staff_checkin_plans_updated_at on public.staff_checkin_plans;
create trigger staff_checkin_plans_updated_at
before update on public.staff_checkin_plans
for each row execute function public.set_updated_at();

drop trigger if exists staff_checkins_updated_at on public.staff_checkins;
create trigger staff_checkins_updated_at
before update on public.staff_checkins
for each row execute function public.set_updated_at();

alter table public.staff_checkin_plans enable row level security;
alter table public.staff_checkins enable row level security;

revoke all on public.staff_checkin_plans from anon, authenticated;
revoke all on public.staff_checkins from anon, authenticated;

grant all on public.staff_checkin_plans to service_role;
grant all on public.staff_checkins to service_role;
