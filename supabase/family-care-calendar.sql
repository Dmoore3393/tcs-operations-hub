-- TCS Operations Hub — Family Care Calendar + schedule approvals
-- Adds future schedule submissions, Friday 6 PM deadline tracking, admin closures,
-- and date-specific approved care overrides that feed the Ratio Plan.

create table if not exists public.family_schedule_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  submission_weeks_ahead integer not null default 8 check (submission_weeks_ahead between 1 and 26),
  deadline_time time not null default '18:00',
  late_grace_hours integer not null default 48 check (late_grace_hours between 0 and 168),
  time_zone text not null default 'America/Los_Angeles',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.family_schedule_settings (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

create table if not exists public.care_calendar_closures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  closure_date date not null,
  title text not null default 'TCS Closed',
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists care_calendar_closures_date_idx
  on public.care_calendar_closures (organization_id, closure_date, location_id);

create table if not exists public.family_schedule_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  child_legacy_id text not null,
  week_of date not null,
  request_kind text not null default 'Initial' check (request_kind in ('Initial','Change')),
  status text not null default 'Pending'
    check (status in ('Pending','Approved','Needs Changes','Unable to Accommodate','Superseded')),
  schedule_data jsonb not null default '[]'::jsonb,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  submitted_by_email text not null,
  submitted_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  late_by_minutes integer not null default 0 check (late_by_minutes >= 0),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists family_schedule_submissions_queue_idx
  on public.family_schedule_submissions (organization_id, location_id, week_of, status, submitted_at desc);
create index if not exists family_schedule_submissions_child_idx
  on public.family_schedule_submissions (organization_id, child_id, week_of, submitted_at desc);

create table if not exists public.child_schedule_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  child_legacy_id text not null,
  service_date date not null,
  no_care boolean not null default false,
  start_time time,
  end_time time,
  note text,
  source_submission_id uuid references public.family_schedule_submissions(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    no_care
    or (start_time is not null and end_time is not null and end_time > start_time)
  ),
  unique (organization_id, child_id, service_date)
);

create index if not exists child_schedule_overrides_date_idx
  on public.child_schedule_overrides (organization_id, location_id, service_date, child_id);

drop trigger if exists family_schedule_settings_updated_at on public.family_schedule_settings;
create trigger family_schedule_settings_updated_at
before update on public.family_schedule_settings
for each row execute function public.set_updated_at();

drop trigger if exists care_calendar_closures_updated_at on public.care_calendar_closures;
create trigger care_calendar_closures_updated_at
before update on public.care_calendar_closures
for each row execute function public.set_updated_at();

drop trigger if exists family_schedule_submissions_updated_at on public.family_schedule_submissions;
create trigger family_schedule_submissions_updated_at
before update on public.family_schedule_submissions
for each row execute function public.set_updated_at();

drop trigger if exists child_schedule_overrides_updated_at on public.child_schedule_overrides;
create trigger child_schedule_overrides_updated_at
before update on public.child_schedule_overrides
for each row execute function public.set_updated_at();

alter table public.family_schedule_settings enable row level security;
alter table public.care_calendar_closures enable row level security;
alter table public.family_schedule_submissions enable row level security;
alter table public.child_schedule_overrides enable row level security;

revoke all on public.family_schedule_settings from anon, authenticated;
revoke all on public.care_calendar_closures from anon, authenticated;
revoke all on public.family_schedule_submissions from anon, authenticated;
revoke all on public.child_schedule_overrides from anon, authenticated;

grant all on public.family_schedule_settings to service_role;
grant all on public.care_calendar_closures to service_role;
grant all on public.family_schedule_submissions to service_role;
grant all on public.child_schedule_overrides to service_role;

grant select on public.care_calendar_closures to authenticated;
grant select on public.child_schedule_overrides to authenticated;

drop policy if exists care_calendar_closures_staff_select on public.care_calendar_closures;
create policy care_calendar_closures_staff_select
on public.care_calendar_closures
for select
to authenticated
using (
  organization_id = public.current_staff_organization_id()
  and public.is_active_tcs_staff()
  and (location_id is null or public.can_access_location(location_id))
);

drop policy if exists child_schedule_overrides_staff_select on public.child_schedule_overrides;
create policy child_schedule_overrides_staff_select
on public.child_schedule_overrides
for select
to authenticated
using (
  organization_id = public.current_staff_organization_id()
  and public.can_read_location_module(location_id, 'schedules')
);

do $$
begin
  alter publication supabase_realtime add table public.care_calendar_closures;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.child_schedule_overrides;
exception when duplicate_object then null;
end $$;
