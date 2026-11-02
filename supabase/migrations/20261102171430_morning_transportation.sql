-- Morning school drop-offs and afternoon pickups keep separate route identities.
-- Existing access checks, version locks, and notification recipients are preserved.
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
  if jsonb_typeof(p_plan)<>'object' or exists(select 1 from jsonb_object_keys(p_plan) k where k not in ('driver','driverLaneId','school','vehicle','routeName','stopOrder','pickup','dropoff','dropoffLocation','notes','tripPeriod','pickupLocation')) then raise exception 'Invalid daily route fields';end if;
  if exists(select 1 from jsonb_each(p_plan) e where e.key<>'stopOrder' and (jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>1000)) or (p_plan?'stopOrder' and (jsonb_typeof(p_plan->'stopOrder')<>'number' or (p_plan->>'stopOrder')::numeric not between 1 and 999 or trunc((p_plan->>'stopOrder')::numeric)<>(p_plan->>'stopOrder')::numeric)) then raise exception 'Invalid daily route values';end if;
  if p_plan?'tripPeriod' and p_plan->>'tripPeriod' not in ('Morning','Afternoon') then raise exception 'Choose Morning or Afternoon';end if;
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

create or replace function public.queue_transport_assignment_notice() returns trigger language plpgsql security invoker set search_path=public as $$
declare data jsonb; previous jsonb; lane uuid; actor uuid; route uuid; day date; fields text[]:=array['driver','driverLaneId','school','vehicle','pickup','dropoff','dropoffLocation','days','routeName','status','childId','child','tripPeriod','pickupLocation'];
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
 values(new.organization_id,route,new.location_id,lane,day,actor,'transport-assignment:'||txid_current()::text||':'||lane::text||':'||coalesce(day::text,'recurring')||':'||md5(coalesce(data->>'tripPeriod','Afternoon')||':'||coalesce(data->>'pickupLocation','')||':'||coalesce(data->>'school','')||':'||coalesce(data->>'routeName','')||':'||coalesce(data->>'pickup','')||':'||new.location_id::text));
 return new;
end $$;

create or replace function public.deliver_transport_assignment_notices(p_org uuid,p_recipient uuid default null,p_actor uuid default null) returns table(user_id uuid,notification jsonb) language plpgsql security invoker set search_path=public as $$
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
  note:=jsonb_build_object('id',job.id::text,'category','transportation','severity','attention','title','Your route assignment','body',left(coalesce(data->>'tripPeriod','Afternoon')||' • '||coalesce(data->>'routeName','Transportation')||' • '||coalesce(data->>'school','Pickup')||' • '||coalesce(job.service_date::text,data->>'days','Recurring')||' • Pickup '||coalesce(data->>'pickup','not set')||' • '||coalesce(data->>'vehicle','Vehicle not set'),260),'href','/transportation'||case when job.service_date is null then '' else '?routeDate='||job.service_date::text end,'location',loc,'createdAt',now(),'readAt','','eventKey',job.event_key);
  insert into public.user_notification_state as n(user_id,inbox,preferences) values(target,'[]','{}') on conflict on constraint user_notification_state_pkey do nothing;
  select n.inbox into pending from public.user_notification_state n where n.user_id=target for update;
  if not exists(select 1 from jsonb_array_elements(pending) v where v->>'eventKey'=job.event_key) then
   update public.user_notification_state n set inbox=(select coalesce(jsonb_agg(v.value order by v.ordinality),'[]'::jsonb) from jsonb_array_elements(jsonb_build_array(note)||pending) with ordinality v where v.ordinality<=100),updated_at=now() where n.user_id=target;
   user_id:=target;notification:=note;return next;
  end if;
  update public.transport_assignment_notices set processed_at=now() where id=job.id;
 end loop;
end $$;
