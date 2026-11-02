-- Every active employee has Transportation; care approvals and assigned sites are unchanged.
create function public.include_staff_transportation() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.is_active and lower(trim(new.role)) in ('employee','teacher','driver','teacher in training','scanning support') and not ('transportation'=any(coalesce(new.permissions,'{}'::text[]))) then new.permissions:=array_append(coalesce(new.permissions,'{}'::text[]),'transportation');end if;
 return new;
end $$;
revoke all on function public.include_staff_transportation() from public,anon,authenticated;
create trigger staff_transportation_default before insert or update on public.staff_access for each row execute function public.include_staff_transportation();
update public.staff_access set permissions=array_append(coalesce(permissions,'{}'::text[]),'transportation') where is_active and lower(trim(role)) in ('employee','teacher','driver','teacher in training','scanning support') and not ('transportation'=any(coalesce(permissions,'{}'::text[])));

-- Stable staff identity, never a fuzzy name or a caller-supplied notification recipient.
create function public.transport_driver_lane(p_org uuid,p_data jsonb,p_location uuid) returns uuid language plpgsql security invoker set search_path=public as $$
declare lane public.staff_lane_profiles; matches integer;
begin
 if coalesce(p_data->>'driverLaneId','')<>'' then
  select * into lane from public.staff_lane_profiles where organization_id=p_org and id=(p_data->>'driverLaneId')::uuid and is_active;
  if not found or lane.full_name is distinct from p_data->>'driver' then raise exception 'Choose an active driver from the staff dropdown';end if;
 else
  select count(*) into matches from public.staff_lane_profiles where organization_id=p_org and is_active and full_name=p_data->>'driver';
  if matches<>1 then return null;end if;
  select * into lane from public.staff_lane_profiles where organization_id=p_org and is_active and full_name=p_data->>'driver';
 end if;
 if lane.staff_user_id is not null and not exists(select 1 from public.staff_access a where a.user_id=lane.staff_user_id and a.organization_id=p_org and a.is_active and (lower(trim(a.role)) in ('owner / admin','owner/admin','owner / director','administrator','admin','director','corporate / admin','corporate admin','operations admin') or exists(select 1 from public.staff_location_assignments x where x.user_id=a.user_id and x.organization_id=p_org and x.location_id=p_location))) then raise exception 'The selected driver needs active Hub access to this location. Update their assigned locations in Team Access first';end if;
 return lane.id;
end $$;
revoke all on function public.transport_driver_lane(uuid,jsonb,uuid) from public,anon;
grant execute on function public.transport_driver_lane(uuid,jsonb,uuid) to authenticated,service_role;

-- Drivers can record custody events, but cannot create/delete stops or reassign drivers.
create function public.guard_transport_assignments() returns trigger language plpgsql security invoker set search_path=public as $$
declare prior public.transportation_routes; lane uuid; run_keys text[]:=array['runDate','runStatus','pickedUpAt','pickedUpBy','arrivedAt','arrivedBy','checkedInAt','checkedInBy','droppedOffAt','droppedOffBy','runHistory','coveringDriver','coveringDate'];
begin
 if auth.uid() is not null and not (public.is_tcs_owner() or public.is_tcs_licensee()) then
  select * into prior from public.transportation_routes where organization_id=new.organization_id and legacy_id=new.legacy_id;
  if not found or new.location_id is distinct from prior.location_id or (new.record_data-run_keys) is distinct from (prior.record_data-run_keys) then raise exception 'Only administration and assigned licensees can change route setup. Drivers can record pickup and handoff';end if;
 end if;
 if tg_op='INSERT' then
  -- INSERT ... ON CONFLICT also runs this guard for unchanged existing rows.
  select * into prior from public.transportation_routes where organization_id=new.organization_id and legacy_id=new.legacy_id;
 else prior:=old;end if;
 if prior.id is null or new.record_data->>'driverLaneId' is distinct from prior.record_data->>'driverLaneId' or new.record_data->>'driver' is distinct from prior.record_data->>'driver' or new.location_id is distinct from prior.location_id then lane:=public.transport_driver_lane(new.organization_id,new.record_data,new.location_id);if lane is not null then new.record_data:=jsonb_set(new.record_data,'{driverLaneId}',to_jsonb(lane::text));end if;end if;
 return new;
end $$;
revoke all on function public.guard_transport_assignments() from public,anon,authenticated;
create trigger transport_assignment_guard before insert or update on public.transportation_routes for each row execute function public.guard_transport_assignments();

create or replace function public.save_transport_day_stop(p_org uuid,p_actor uuid,p_route uuid,p_day date,p_action text,p_plan jsonb,p_expected_version integer)
returns integer language plpgsql security invoker set search_path=public as $$
declare actor public.staff_access; source public.transportation_routes; stop public.transportation_day_stops; related public.transportation_routes; prior public.transportation_day_stops; owner_actor boolean; licensee_actor boolean; changed integer:=0; fields jsonb; lane uuid;
begin
 select * into actor from public.staff_access where user_id=p_actor and organization_id=p_org and is_active;
 if not found then raise exception 'Active staff required';end if;
 owner_actor:=lower(trim(actor.role)) in ('owner / admin','owner/admin','owner / director','administrator','admin','director','corporate / admin','corporate admin','operations admin');
 licensee_actor:=lower(trim(actor.role)) in ('location licensee','licensee','licensee/admin','licensee / admin');
 if not(owner_actor or licensee_actor) then raise exception 'Leadership access required';end if;
 if p_action not in ('save','callout','restore') or p_expected_version is null or p_expected_version<0 or p_day is null then raise exception 'Invalid daily transportation action';end if;
 if p_action='save' and not owner_actor then raise exception 'Only administration can assign daily routes';end if;
 if p_day<(now() at time zone 'America/Los_Angeles')::date then raise exception 'Past dispatch history cannot be changed';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_day::text,0));
 select * into source from public.transportation_routes where id=p_route and organization_id=p_org;
 if not found then raise exception 'Recurring route is no longer available';end if;
 if not exists(select 1 from public.locations where id=source.location_id and organization_id=p_org and is_active) or (not owner_actor and not exists(select 1 from public.staff_location_assignments where user_id=p_actor and organization_id=p_org and location_id=source.location_id)) then raise exception 'Location not assigned';end if;
 perform 1 from public.transportation_routes where organization_id=p_org and (id=p_route or (source.child_id is not null and child_id=source.child_id)) order by id for update;
 select * into source from public.transportation_routes where id=p_route and organization_id=p_org;
 select * into stop from public.transportation_day_stops where organization_id=p_org and route_id=p_route and service_date=p_day;
 if coalesce(stop.version,0)<>p_expected_version then raise exception 'Daily route changed. Refresh before trying again';end if;
 if p_action='save' then
  if jsonb_typeof(p_plan)<>'object' or exists(select 1 from jsonb_object_keys(p_plan) k where k not in ('driver','driverLaneId','school','vehicle','routeName','stopOrder','pickup','dropoff','dropoffLocation','notes')) then raise exception 'Invalid daily route fields';end if;
  if exists(select 1 from jsonb_each(p_plan) e where e.key<>'stopOrder' and (jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>1000)) or (p_plan?'stopOrder' and (jsonb_typeof(p_plan->'stopOrder')<>'number' or (p_plan->>'stopOrder')::numeric not between 1 and 999 or trunc((p_plan->>'stopOrder')::numeric)<>(p_plan->>'stopOrder')::numeric)) then raise exception 'Invalid daily route values';end if;
  lane:=public.transport_driver_lane(p_org,p_plan,source.location_id);if lane is not null then p_plan:=jsonb_set(p_plan,'{driverLaneId}',to_jsonb(lane::text));end if;
  if source.record_data->>'runDate'=p_day::text and source.record_data->>'runStatus' in ('Picked Up','Arrived') then raise exception 'Child already picked up. Complete the handoff before changing dispatch';end if;
  insert into public.transportation_day_stops(organization_id,route_id,location_id,child_id,service_date,snapshot,plan_data,is_planned,updated_by,updated_by_name)
  values(p_org,p_route,source.location_id,source.child_id,p_day,source.record_data,p_plan,true,p_actor,actor.full_name)
  on conflict(organization_id,route_id,service_date) do update set plan_data=excluded.plan_data,is_planned=true,version=transportation_day_stops.version+1,updated_by=p_actor,updated_by_name=actor.full_name,updated_at=clock_timestamp();
  changed:=1;
 else
  -- Stable child IDs group linked stops; never guess identity from a child's name.
  for related in select * from public.transportation_routes where organization_id=p_org and (id=p_route or (source.child_id is not null and child_id=source.child_id)) order by id for update loop
   if not owner_actor and not exists(select 1 from public.staff_location_assignments where user_id=p_actor and organization_id=p_org and location_id=related.location_id) then raise exception 'A linked stop is outside your location. Contact administration';end if;
   if related.record_data->>'runDate'=p_day::text and related.record_data->>'runStatus' in ('Picked Up','Arrived') then raise exception 'Child already picked up. Complete the handoff before calling out';end if;
   select * into prior from public.transportation_day_stops where organization_id=p_org and route_id=related.id and service_date=p_day;
   insert into public.transportation_day_stops(organization_id,route_id,location_id,child_id,service_date,snapshot,called_out,updated_by,updated_by_name)
   values(p_org,related.id,related.location_id,related.child_id,p_day,related.record_data,p_action='callout',p_actor,actor.full_name)
   on conflict(organization_id,route_id,service_date) do update set called_out=excluded.called_out,version=transportation_day_stops.version+1,updated_by=p_actor,updated_by_name=actor.full_name,updated_at=clock_timestamp();
   changed:=changed+1;
  end loop;
 end if;
 insert into public.audit_log(organization_id,location_id,actor_user_id,action,table_name,metadata) values(p_org,source.location_id,p_actor,'UPDATE','transportation_day_stops',jsonb_build_object('kind','daily_transport_'||p_action,'route_id',p_route,'service_date',p_day,'changed_stops',changed,'previous_version',p_expected_version,'before',to_jsonb(stop),'plan',case when p_action='save' then p_plan else null end));
 return changed;
end $$;
revoke all on function public.save_transport_day_stop(uuid,uuid,uuid,date,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.save_transport_day_stop(uuid,uuid,uuid,date,text,jsonb,integer) to service_role;

-- Transactional outbox. Saving a stop queues the notice atomically; failed saves queue nothing.
create table public.transport_assignment_notices(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 route_id uuid not null references public.transportation_routes(id) on delete cascade,
 location_id uuid not null references public.locations(id),
 lane_id uuid not null references public.staff_lane_profiles(id) on delete cascade,
 service_date date,
 actor_id uuid references auth.users(id) on delete set null,
 event_key text not null,
 created_at timestamptz not null default now(),
 processed_at timestamptz
);
create index transport_notices_pending_idx on public.transport_assignment_notices(organization_id,created_at) where processed_at is null;
create index transport_notices_route_idx on public.transport_assignment_notices(route_id);
create index transport_notices_location_idx on public.transport_assignment_notices(location_id);
create index transport_notices_lane_idx on public.transport_assignment_notices(lane_id);
create index transport_notices_actor_idx on public.transport_assignment_notices(actor_id);
alter table public.transport_assignment_notices enable row level security;
revoke all on public.transport_assignment_notices from anon,authenticated;
grant insert on public.transport_assignment_notices to authenticated;
grant all on public.transport_assignment_notices to service_role;
create policy transport_notices_enqueue on public.transport_assignment_notices for insert to authenticated with check(
 pg_trigger_depth()>0 and organization_id=(select public.current_staff_organization_id()) and actor_id=(select auth.uid()) and ((select public.is_tcs_owner()) or (select public.is_tcs_licensee())) and public.can_access_location(location_id)
);
create function public.queue_transport_assignment_notice() returns trigger language plpgsql security invoker set search_path=public as $$
declare data jsonb; previous jsonb; lane uuid; actor uuid; route uuid; day date; fields text[]:=array['driver','driverLaneId','school','vehicle','pickup','dropoff','dropoffLocation','days','routeName','status','childId','child'];
begin
 if tg_table_name='transportation_routes' then
  data:=new.record_data;route:=new.id;actor:=auth.uid();
  if tg_op='UPDATE' then previous:=old.record_data;end if;
 else
  if not new.is_planned or new.called_out then return new;end if;
  data:=new.snapshot||new.plan_data;route:=new.route_id;day:=new.service_date;actor:=new.updated_by;
  if tg_op='UPDATE' and old.is_planned then previous:=old.snapshot||old.plan_data;end if;
 end if;
 if data->>'status'='Not Riding' then return new;end if;
 if previous is not null and not exists(select 1 from unnest(fields) k where data->k is distinct from previous->k) then return new;end if;
 lane:=public.transport_driver_lane(new.organization_id,data,new.location_id);if lane is null then return new;end if;
 insert into public.transport_assignment_notices(organization_id,route_id,location_id,lane_id,service_date,actor_id,event_key)
 values(new.organization_id,route,new.location_id,lane,day,actor,'transport-assignment:'||txid_current()::text||':'||lane::text||':'||coalesce(day::text,'recurring')||':'||md5(coalesce(data->>'school','')||':'||coalesce(data->>'routeName','')||':'||coalesce(data->>'pickup','')||':'||new.location_id::text));
 return new;
end $$;
revoke all on function public.queue_transport_assignment_notice() from public,anon,authenticated;
create trigger transport_assignment_notice after insert or update on public.transportation_routes for each row execute function public.queue_transport_assignment_notice();
create trigger transport_day_assignment_notice after insert or update on public.transportation_day_stops for each row execute function public.queue_transport_assignment_notice();

-- Server only. Append under row locks, dedupe one school stop saved for several children.
create function public.deliver_transport_assignment_notices(p_org uuid,p_recipient uuid default null,p_actor uuid default null) returns table(user_id uuid,notification jsonb) language plpgsql security invoker set search_path=public as $$
declare job public.transport_assignment_notices; target uuid; data jsonb; current_lane uuid; note jsonb; loc text; pending jsonb;
begin
 for job in select q.* from public.transport_assignment_notices q join public.staff_lane_profiles l on l.id=q.lane_id and l.is_active join public.staff_access a on a.user_id=l.staff_user_id and a.organization_id=q.organization_id and a.is_active where q.organization_id=p_org and q.processed_at is null and (p_recipient is null or a.user_id=p_recipient) and (p_actor is null or q.actor_id=p_actor) order by q.created_at,q.id limit 100 for update of q skip locked loop
  select r.record_data into data from public.transportation_routes r where r.id=job.route_id;
  if job.service_date is not null then
   select s.snapshot||s.plan_data into data from public.transportation_day_stops s where s.organization_id=job.organization_id and s.route_id=job.route_id and s.service_date=job.service_date and s.is_planned and not s.called_out;
  end if;
  -- Old reassignment notices must never reach a replaced driver.
  select l.staff_user_id into target from public.staff_lane_profiles l join public.staff_access a on a.user_id=l.staff_user_id and a.organization_id=job.organization_id and a.is_active where l.id=job.lane_id and l.is_active and (coalesce(data->>'driverLaneId','')=l.id::text or (coalesce(data->>'driverLaneId','')='' and data->>'driver'=l.full_name)) and (lower(trim(a.role)) in ('owner / admin','owner/admin','owner / director','administrator','admin','director','corporate / admin','corporate admin','operations admin') or exists(select 1 from public.staff_location_assignments x where x.user_id=a.user_id and x.organization_id=job.organization_id and x.location_id=job.location_id));
  if target is null or data is null or data->>'status'='Not Riding' or (job.service_date is not null and job.service_date<(now() at time zone 'America/Los_Angeles')::date) then update public.transport_assignment_notices set processed_at=now() where id=job.id;continue;end if;
  select name into loc from public.locations where id=job.location_id;
  note:=jsonb_build_object('id',job.id::text,'category','transportation','severity','attention','title','Your route assignment','body',left(coalesce(data->>'routeName','Transportation')||' • '||coalesce(data->>'school','Pickup')||' • '||coalesce(job.service_date::text,data->>'days','Recurring')||' • Pickup '||coalesce(data->>'pickup','not set')||' • '||coalesce(data->>'vehicle','Vehicle not set'),260),'href','/transportation'||case when job.service_date is null then '' else '?routeDate='||job.service_date::text end,'location',loc,'createdAt',now(),'readAt','','eventKey',job.event_key);
  insert into public.user_notification_state as n(user_id,inbox,preferences) values(target,'[]','{}') on conflict on constraint user_notification_state_pkey do nothing;
  select n.inbox into pending from public.user_notification_state n where n.user_id=target for update;
  if not exists(select 1 from jsonb_array_elements(pending) v where v->>'eventKey'=job.event_key) then
   update public.user_notification_state n set inbox=(select coalesce(jsonb_agg(v.value order by v.ordinality),'[]'::jsonb) from jsonb_array_elements(jsonb_build_array(note)||pending) with ordinality v where v.ordinality<=100),updated_at=now() where n.user_id=target;
   user_id:=target;notification:=note;return next;
  end if;
  update public.transport_assignment_notices set processed_at=now() where id=job.id;
 end loop;
end $$;
revoke all on function public.deliver_transport_assignment_notices(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.deliver_transport_assignment_notices(uuid,uuid,uuid) to service_role;

-- Removing a recurring stop remains a leadership action, even for direct API clients.
drop policy "location delete" on public.transportation_routes;
create policy "location delete" on public.transportation_routes for delete to authenticated using(organization_id=(select public.current_staff_organization_id()) and ((select public.is_tcs_owner()) or (select public.is_tcs_licensee())) and public.can_access_location(location_id));

