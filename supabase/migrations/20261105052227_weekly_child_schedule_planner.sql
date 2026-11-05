-- A dated plan replaces the child's whole day. Existing approved family rows
-- continue to use start_time/end_time when planner_status is null.
alter table public.child_schedule_overrides
  add column planner_status text check (planner_status in ('scheduled','no-care','pending')),
  add column care_blocks jsonb check (care_blocks is null or jsonb_typeof(care_blocks) = 'array');

-- A staff member must be able to see every site on a multi-site plan.
create policy "Read transferred care within assigned sites" on public.child_schedule_overrides
as restrictive for select to authenticated using (
  not exists (select 1 from jsonb_array_elements(care_blocks) b
    where not public.can_read_location_module((b->>'locationId')::uuid,'schedules'))
);

create table public.child_schedule_school_notes (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  service_date date not null,
  no_school text not null default '',
  minimum_day text not null default '',
  updated_at timestamptz not null default now(),
  primary key (organization_id,location_id,service_date)
);
alter table public.child_schedule_school_notes enable row level security;
revoke all on public.child_schedule_school_notes from public, anon, authenticated;
grant select on public.child_schedule_school_notes to authenticated;
grant all on public.child_schedule_school_notes to service_role;
create policy "Read school notes at assigned sites" on public.child_schedule_school_notes
for select to authenticated using (organization_id = (select public.current_staff_organization_id())
  and public.can_read_location_module(location_id,'schedules'));
alter publication supabase_realtime add table public.child_schedule_school_notes;

-- The authenticated API supplies the verified actor. The database rechecks the
-- school, home and destination sites and commits the selected dates together.
create function public.save_child_planner_days(p_org uuid, p_actor uuid, p_child uuid,
  p_dates jsonb, p_status text, p_blocks jsonb, p_note text)
returns void language plpgsql security invoker set search_path = public as $$
declare
  child public.children%rowtype;
  existing public.child_schedule_overrides%rowtype;
  entry jsonb;
  block jsonb;
  day_date date;
  week_start date;
  first_time time;
  last_time time;
  previous_end text;
  ordered_blocks jsonb;
begin
  select * into child from public.children where id=p_child and organization_id=p_org
    and enrollment_status <> 'Archived' for update;
  if not found or not public.authorized_care_reviewer(p_actor,p_org,child.location_id) then
    raise exception 'You cannot change this child’s schedule.' using errcode='42501';
  end if;
  if p_status is null or p_status not in ('scheduled','no-care','pending')
    or jsonb_typeof(p_blocks) is distinct from 'array' or jsonb_typeof(p_dates) is distinct from 'array'
    or jsonb_array_length(p_dates) not between 1 and 7 or length(coalesce(p_note,'')) > 500
    or jsonb_array_length(p_blocks) > 12
    or (p_status='scheduled') <> (jsonb_array_length(p_blocks)>0) then
    raise exception 'Choose dates and enter hours for scheduled care.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(b order by b->>'start', b->>'end'),'[]') into ordered_blocks from jsonb_array_elements(p_blocks) b;
  for block in select value from jsonb_array_elements(ordered_blocks) loop
    if coalesce(block->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(block->>'end','') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
      or block->>'end' <= block->>'start' or block->>'start' < previous_end then
      raise exception 'Enter complete, non-overlapping care times in order.' using errcode='22023';
    end if;
    if not public.authorized_care_reviewer(p_actor,p_org,(block->>'locationId')::uuid) then
      raise exception 'Choose an assigned active location for every care block.' using errcode='42501';
    end if;
    previous_end := block->>'end';
  end loop;
  first_time := (ordered_blocks->0->>'start')::time;
  last_time := (ordered_blocks->-1->>'end')::time;
  for entry in select value from jsonb_array_elements(p_dates) order by value->>'date' loop
    day_date := (entry->>'date')::date;
    if day_date is null or (week_start is not null and date_trunc('week',day_date)::date <> week_start) then
      raise exception 'Choose dates within a single week.' using errcode='22023';
    end if;
    week_start := date_trunc('week',day_date)::date;
    select * into existing from public.child_schedule_overrides where organization_id=p_org
      and child_id=p_child and service_date=day_date for update;
    if found and (not public.authorized_care_reviewer(p_actor,p_org,existing.location_id)
      or exists (select 1 from jsonb_array_elements(existing.care_blocks) b
        where not public.authorized_care_reviewer(p_actor,p_org,(b->>'locationId')::uuid))) then
      raise exception 'You cannot change this dated plan.' using errcode='42501';
    end if;
    -- Replaying a successful save is safe, including after a lost connection.
    if existing.planner_status=p_status and existing.care_blocks=ordered_blocks
      and coalesce(existing.note,'')=coalesce(p_note,'') then continue; end if;
    if existing.updated_at is distinct from (entry->>'version')::timestamptz then
      raise exception 'This schedule has changed. Reopen the child’s current plan and try again.' using errcode='40001';
    end if;
    if exists (select 1 from public.care_calendar_closures c where c.organization_id=p_org and c.closure_date=day_date
      and p_status='scheduled' and (c.location_id is null or exists (
        select 1 from jsonb_array_elements(ordered_blocks) b where (b->>'locationId')::uuid=c.location_id))) then
      raise exception 'A selected location is closed on %. Choose another date or location.',day_date using errcode='22023';
    end if;
    insert into public.child_schedule_overrides (organization_id,location_id,child_id,child_legacy_id,
      service_date,no_care,start_time,end_time,note,source_submission_id,approved_by,approved_at,planner_status,care_blocks)
    values (p_org,child.location_id,p_child,child.legacy_id,day_date,p_status<>'scheduled',first_time,last_time,
      nullif(p_note,''),null,p_actor,now(),p_status,ordered_blocks)
    on conflict (organization_id,child_id,service_date) do update set location_id=excluded.location_id,
      no_care=excluded.no_care,start_time=excluded.start_time,end_time=excluded.end_time,note=excluded.note,
      source_submission_id=null,approved_by=p_actor,approved_at=now(),planner_status=p_status,care_blocks=ordered_blocks
    where child_schedule_overrides.updated_at=(entry->>'version')::timestamptz;
    if not found then raise exception 'This schedule has changed. Reopen the current plan.' using errcode='40001'; end if;
  end loop;
end $$;
revoke all on function public.save_child_planner_days(uuid,uuid,uuid,jsonb,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_child_planner_days(uuid,uuid,uuid,jsonb,text,jsonb,text) to service_role;

-- Family approvals also replace the entire day. Protect an existing transfer
-- when a reviewer only has access to the family's submitting site.
create function public.guard_previous_planner_sites() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if old.planner_status is not null and new.approved_by is not null and
      (not public.authorized_care_reviewer(new.approved_by,old.organization_id,old.location_id)
       or exists (select 1 from jsonb_array_elements(old.care_blocks) b
         where not public.authorized_care_reviewer(new.approved_by,old.organization_id,(b->>'locationId')::uuid))) then
    raise exception 'You cannot replace a dated plan outside your assigned sites.' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_previous_planner_sites() from public,anon,authenticated;
create trigger protect_previous_planner_sites before update on public.child_schedule_overrides
  for each row execute function public.guard_previous_planner_sites();

-- Save a recurring template without synchronizing or deleting anyone else's
-- templates. Older imported children have a text legacy_id and no JSON id.
create function public.save_child_planner_template(p_org uuid,p_actor uuid,p_child uuid,p_days jsonb,p_version timestamptz)
returns void language plpgsql security invoker set search_path=public as $$
declare
  child public.children%rowtype;
  home public.locations%rowtype;
  site public.locations%rowtype;
  child_key text;
  identity jsonb;
  current_version timestamptz;
  item jsonb;
  fragment jsonb;
  keep_ids uuid[] := '{}';
begin
  select * into child from public.children where id=p_child and organization_id=p_org and enrollment_status<>'Archived' for update;
  if not found or not public.authorized_care_reviewer(p_actor,p_org,child.location_id) then
    raise exception 'You cannot edit this child’s usual hours.' using errcode='42501';
  end if;
  select * into home from public.locations where id=child.location_id;
  identity := coalesce(nullif(child.record_data->'id','null'::jsonb), to_jsonb(child.legacy_id));
  child_key := coalesce(child.record_data->>'id',child.legacy_id);
  select max(s.updated_at) into current_version from public.child_schedules s where s.organization_id=p_org
    and (s.child_id=p_child or (s.child_id is null and s.record_data->>'childId' in(child_key,child.legacy_id)));
  if current_version is distinct from p_version then
    raise exception 'Usual hours have changed. Reopen the current schedule.' using errcode='40001';
  end if;
  if exists(select 1 from public.child_schedules s where s.organization_id=p_org
    and (s.child_id=p_child or (s.child_id is null and s.record_data->>'childId' in(child_key,child.legacy_id)))
    and not public.authorized_care_reviewer(p_actor,p_org,s.location_id)) then
    raise exception 'You cannot change a schedule outside your assigned sites.' using errcode='42501';
  end if;
  item := jsonb_build_object('childId',identity,'defaultLocation',home.name,'ageGroup',child.age_group,
    'childName',concat_ws(' ',child.first_name,child.last_name),'days',p_days);
  if exists(select 1 from jsonb_each(p_days) d cross join lateral jsonb_array_elements(d.value->'blocks') b
    where not exists(select 1 from public.locations l where l.organization_id=p_org and l.is_active
      and l.slug=public.tcs_location_slug(b->>'location') and public.authorized_care_reviewer(p_actor,p_org,l.id))) then
    raise exception 'Choose an assigned site for every care block.' using errcode='42501';
  end if;
  for site in select l.* from public.locations l where l.organization_id=p_org and l.is_active
    and (l.id=home.id or l.slug in(select slug from public.tcs_schedule_location_slugs(item))) loop
    fragment := public.tcs_schedule_for_location(item,site.slug,site.name);
    insert into public.child_schedules(organization_id,location_id,child_id,legacy_id,child_name,age_group,
      is_primary,weekly_schedule,record_data,updated_by)
    values(p_org,site.id,p_child,child_key||':'||site.slug,item->>'childName',child.age_group,site.id=home.id,
      fragment->'days',fragment,p_actor)
    on conflict(organization_id,legacy_id) do update set child_id=p_child,location_id=site.id,
      child_name=excluded.child_name,age_group=excluded.age_group,is_primary=excluded.is_primary,
      weekly_schedule=excluded.weekly_schedule,record_data=excluded.record_data,updated_by=p_actor,updated_at=now()
    where child_schedules.child_id is null or child_schedules.child_id=p_child;
    if not found then raise exception 'This schedule is linked to another child.' using errcode='40001'; end if;
    keep_ids := array_append(keep_ids,site.id);
  end loop;
  delete from public.child_schedules s where s.organization_id=p_org and
    (s.child_id=p_child or (s.child_id is null and s.record_data->>'childId' in(child_key,child.legacy_id)))
    and (not s.location_id=any(keep_ids) or s.legacy_id<>child_key||':'||(select slug from public.locations where id=s.location_id));
end $$;
revoke all on function public.save_child_planner_template(uuid,uuid,uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.save_child_planner_template(uuid,uuid,uuid,jsonb,timestamptz) to service_role;
