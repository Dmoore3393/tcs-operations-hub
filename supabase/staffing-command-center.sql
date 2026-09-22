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
  source_key text,
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
  revision integer not null default 1,
  needs_republish boolean not null default false,
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
create unique index if not exists staff_activity_source_key_uidx
  on public.staff_activity_intervals(organization_id, source_key)
  where source_key is not null;
create index if not exists child_attendance_location_date_idx on public.child_attendance_sessions(location_id, attendance_date, status);
create unique index if not exists child_attendance_one_session_per_day_idx
  on public.child_attendance_sessions(organization_id, child_id, attendance_date)
  where child_id is not null;
create index if not exists staffing_rules_location_effective_idx on public.staffing_rules(location_id, effective_from, effective_to) where is_active;
create index if not exists schedule_publications_location_week_idx on public.schedule_publications(location_id, week_of);

create table if not exists public.staff_schedule_publication_shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id()
    references public.organizations(id) on delete cascade,
  publication_id uuid not null references public.schedule_publications(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  source_shift_id uuid references public.staff_shifts(id) on delete set null,
  user_id uuid references public.staff_access(user_id) on delete set null,
  staff_name text not null,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  position_label text,
  notes text,
  revision integer not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create unique index if not exists staff_schedule_snapshot_source_uidx
  on public.staff_schedule_publication_shifts(publication_id, revision, source_shift_id)
  where source_shift_id is not null;
create index if not exists staff_schedule_snapshot_user_week_idx
  on public.staff_schedule_publication_shifts(user_id, shift_date, revision);
create index if not exists staff_schedule_snapshot_publication_idx
  on public.staff_schedule_publication_shifts(publication_id, revision);
create index if not exists staff_schedule_snapshot_location_idx
  on public.staff_schedule_publication_shifts(location_id, shift_date);

alter table public.staff_shifts enable row level security;
alter table public.staff_activity_intervals enable row level security;
alter table public.child_attendance_sessions enable row level security;
alter table public.staffing_rules enable row level security;
alter table public.schedule_publications enable row level security;
alter table public.staff_schedule_publication_shifts enable row level security;

create policy "staff shifts read" on public.staff_shifts for select to authenticated
using (
  organization_id = public.current_staff_organization_id()
  and (
    public.can_read_location_module(location_id, 'schedules')
    or (user_id = auth.uid() and public.can_access_location(location_id))
  )
);
create policy "staff shifts insert" on public.staff_shifts for insert to authenticated
with check (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'schedules'));
create policy "staff shifts update" on public.staff_shifts for update to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'schedules'))
with check (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'schedules'));
create policy "staff shifts delete" on public.staff_shifts for delete to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'schedules'));

create policy "staff activity read" on public.staff_activity_intervals for select to authenticated
using (
  organization_id = public.current_staff_organization_id()
  and (
    public.can_read_location_module(location_id, 'schedules')
    or public.can_read_location_module(location_id, 'transportation')
  )
);
create policy "staff activity insert" on public.staff_activity_intervals for insert to authenticated
with check (
  organization_id = public.current_staff_organization_id()
  and (
    public.can_write_location_module(location_id, 'schedules')
    or (activity_type = 'Transportation' and public.can_write_location_module(location_id, 'transportation'))
  )
);
create policy "staff activity update" on public.staff_activity_intervals for update to authenticated
using (
  organization_id = public.current_staff_organization_id()
  and (
    public.can_write_location_module(location_id, 'schedules')
    or (activity_type = 'Transportation' and public.can_write_location_module(location_id, 'transportation'))
  )
)
with check (
  organization_id = public.current_staff_organization_id()
  and (
    public.can_write_location_module(location_id, 'schedules')
    or (activity_type = 'Transportation' and public.can_write_location_module(location_id, 'transportation'))
  )
);
create policy "staff activity delete" on public.staff_activity_intervals for delete to authenticated
using (
  organization_id = public.current_staff_organization_id()
  and (
    public.can_write_location_module(location_id, 'schedules')
    or (activity_type = 'Transportation' and public.can_write_location_module(location_id, 'transportation'))
  )
);

create policy "child attendance read" on public.child_attendance_sessions for select to authenticated
using (
  organization_id = public.current_staff_organization_id()
  and (public.can_read_location_module(location_id, 'daily_care') or public.can_read_location_module(location_id, 'schedules'))
);
create policy "child attendance insert" on public.child_attendance_sessions for insert to authenticated
with check (
  organization_id = public.current_staff_organization_id()
  and (public.can_write_location_module(location_id, 'daily_care') or public.can_write_location_module(location_id, 'schedules'))
);
create policy "child attendance update" on public.child_attendance_sessions for update to authenticated
using (
  organization_id = public.current_staff_organization_id()
  and (public.can_write_location_module(location_id, 'daily_care') or public.can_write_location_module(location_id, 'schedules'))
)
with check (
  organization_id = public.current_staff_organization_id()
  and (public.can_write_location_module(location_id, 'daily_care') or public.can_write_location_module(location_id, 'schedules'))
);
create policy "child attendance delete" on public.child_attendance_sessions for delete to authenticated
using (
  organization_id = public.current_staff_organization_id()
  and (public.can_write_location_module(location_id, 'daily_care') or public.can_write_location_module(location_id, 'schedules'))
);

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
using (
  organization_id = public.current_staff_organization_id()
  and public.can_access_location(location_id)
);
create policy "schedule publications insert" on public.schedule_publications for insert to authenticated
with check (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'schedules'));
create policy "schedule publications update" on public.schedule_publications for update to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'schedules'))
with check (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'schedules'));
create policy "schedule publications delete" on public.schedule_publications for delete to authenticated
using (organization_id = public.current_staff_organization_id() and public.can_write_location_module(location_id, 'schedules'));

create table if not exists public.staff_schedule_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_staff_organization_id()
    references public.organizations(id) on delete cascade,
  publication_id uuid not null references public.schedule_publications(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  revision integer not null,
  acknowledged_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  unique (publication_id, user_id, revision)
);

create index if not exists staff_schedule_ack_user_idx
  on public.staff_schedule_acknowledgements(user_id, acknowledged_at desc);
create index if not exists staff_schedule_ack_location_idx
  on public.staff_schedule_acknowledgements(location_id, acknowledged_at desc);

alter table public.staff_schedule_acknowledgements enable row level security;

create policy "published shift snapshots read" on public.staff_schedule_publication_shifts
for select to authenticated
using (
  organization_id = public.current_staff_organization_id()
  and (
    user_id = auth.uid()
    or public.can_read_location_module(location_id, 'schedules')
  )
);

create policy "published shift snapshots insert" on public.staff_schedule_publication_shifts
for insert to authenticated
with check (
  organization_id = public.current_staff_organization_id()
  and public.can_write_location_module(location_id, 'schedules')
);

create policy "published shift snapshots delete" on public.staff_schedule_publication_shifts
for delete to authenticated
using (
  organization_id = public.current_staff_organization_id()
  and public.can_write_location_module(location_id, 'schedules')
);

create policy "schedule acknowledgements read" on public.staff_schedule_acknowledgements
for select to authenticated
using (
  organization_id = public.current_staff_organization_id()
  and (
    user_id = auth.uid()
    or public.can_read_location_module(location_id, 'schedules')
  )
);

create policy "schedule acknowledgements insert" on public.staff_schedule_acknowledgements
for insert to authenticated
with check (
  organization_id = public.current_staff_organization_id()
  and user_id = auth.uid()
  and public.can_access_location(location_id)
);

create policy "schedule acknowledgements delete" on public.staff_schedule_acknowledgements
for delete to authenticated
using (
  organization_id = public.current_staff_organization_id()
  and (
    user_id = auth.uid()
    or public.can_write_location_module(location_id, 'schedules')
  )
);

grant select, insert, update, delete on public.staff_shifts, public.staff_activity_intervals, public.child_attendance_sessions, public.staffing_rules, public.schedule_publications to authenticated;
grant select, insert, delete on public.staff_schedule_acknowledgements to authenticated;
grant all on public.staff_schedule_acknowledgements to service_role;
grant select, insert, delete on public.staff_schedule_publication_shifts to authenticated;
grant all on public.staff_schedule_publication_shifts to service_role;
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
create trigger audit_staff_schedule_acknowledgements after insert or delete on public.staff_schedule_acknowledgements for each row execute function public.audit_location_row_change();
create trigger audit_staff_schedule_publication_shifts after insert or delete on public.staff_schedule_publication_shifts for each row execute function public.audit_location_row_change();

create or replace function public.mark_staff_schedule_publication_dirty()
returns trigger
language plpgsql
security definer
set search_path = public
as $
declare
  v_location_id uuid;
  v_shift_date date;
  v_org_id uuid;
  v_week_of date;
begin
  v_location_id := coalesce(new.location_id, old.location_id);
  v_shift_date := coalesce(new.shift_date, old.shift_date);
  v_org_id := coalesce(new.organization_id, old.organization_id);
  v_week_of := date_trunc('week', v_shift_date::timestamp)::date;

  update public.schedule_publications
  set needs_republish = true,
      updated_at = now()
  where organization_id = v_org_id
    and location_id = v_location_id
    and week_of = v_week_of
    and status = 'Published';

  return coalesce(new, old);
end;
$;

create trigger mark_staff_schedule_publication_dirty
after insert or update or delete on public.staff_shifts
for each row execute function public.mark_staff_schedule_publication_dirty();

create or replace function public.publish_staff_schedule(
  p_location_id uuid,
  p_week_of date,
  p_notes text default null
)
returns table (
  publication_id uuid,
  revision integer,
  shift_count integer,
  unlinked_shift_count integer
)
language plpgsql
security definer
set search_path = public
as $
declare
  v_org_id uuid;
  v_publication_id uuid;
  v_revision integer;
  v_shift_count integer;
  v_unlinked_count integer;
  v_existing public.schedule_publications%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_org_id := public.current_staff_organization_id();
  if v_org_id is null then
    raise exception 'No active TCS staff organization';
  end if;

  if not public.can_write_location_module(p_location_id, 'schedules') then
    raise exception 'You do not have permission to publish this location schedule';
  end if;

  select count(*)::integer,
         count(*) filter (where user_id is null)::integer
    into v_shift_count, v_unlinked_count
  from public.staff_shifts
  where organization_id = v_org_id
    and location_id = p_location_id
    and shift_date between p_week_of and p_week_of + 6
    and status <> 'Cancelled';

  if v_shift_count = 0 then
    raise exception 'Add at least one staff shift before publishing this week';
  end if;

  select *
    into v_existing
  from public.schedule_publications
  where organization_id = v_org_id
    and location_id = p_location_id
    and week_of = p_week_of
  order by case when status = 'Published' then 0 else 1 end, updated_at desc
  limit 1
  for update;

  v_revision := coalesce(v_existing.revision, 0) + 1;

  update public.staff_shifts
  set status = 'Published',
      updated_by = auth.uid(),
      updated_at = now()
  where organization_id = v_org_id
    and location_id = p_location_id
    and shift_date between p_week_of and p_week_of + 6
    and status <> 'Cancelled';

  if v_existing.id is null then
    insert into public.schedule_publications (
      organization_id, location_id, week_of, status, revision,
      needs_republish, published_at, published_by, notes,
      created_by, updated_by
    )
    values (
      v_org_id, p_location_id, p_week_of, 'Published', v_revision,
      false, now(), auth.uid(),
      coalesce(p_notes, 'Published from Staffing Command Center • revision ' || v_revision),
      auth.uid(), auth.uid()
    )
    returning id into v_publication_id;
  else
    update public.schedule_publications
    set status = 'Published',
        revision = v_revision,
        needs_republish = false,
        published_at = now(),
        published_by = auth.uid(),
        notes = coalesce(p_notes, 'Published from Staffing Command Center • revision ' || v_revision),
        updated_by = auth.uid(),
        updated_at = now()
    where id = v_existing.id
    returning id into v_publication_id;
  end if;

  insert into public.staff_schedule_publication_shifts (
    organization_id, publication_id, location_id, source_shift_id, user_id,
    staff_name, shift_date, start_time, end_time, position_label, notes, revision
  )
  select
    v_org_id, v_publication_id, s.location_id, s.id, s.user_id,
    s.staff_name, s.shift_date, s.start_time, s.end_time, s.position_label, s.notes, v_revision
  from public.staff_shifts s
  where s.organization_id = v_org_id
    and s.location_id = p_location_id
    and s.shift_date between p_week_of and p_week_of + 6
    and s.status = 'Published';

  return query
  select v_publication_id, v_revision, v_shift_count, v_unlinked_count;
end;
$;

grant execute on function public.publish_staff_schedule(uuid, date, text) to authenticated;
revoke execute on function public.publish_staff_schedule(uuid, date, text) from anon;
