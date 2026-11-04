-- Call-outs use the existing transactional driver inbox + server push path.
-- Do not backfill historical cancellations or send anything during migration.
alter table public.transport_assignment_notices
 add column event_kind text not null default 'assignment' check(event_kind in ('assignment','callout','restore')),
 add column day_version integer;

-- Match the daily route screen so a linked, unscheduled trip does not alert a driver.
create function public.transport_scheduled_on_date(p_days text,p_day date)
returns boolean language plpgsql immutable security invoker set search_path=public as $$
declare names text[]:=array['sun','mon','tue','wed','thu','fri','sat'];
 value text:=lower(coalesce(p_days,'')); weekday integer:=extract(dow from p_day)::integer;
 span text[]; start_day integer; end_day integer;
begin
 value:=translate(value,'–—','--');
 value:=replace(replace(replace(replace(replace(replace(replace(value,'monday','mon'),'tuesday','tue'),'wednesday','wed'),'thursday','thu'),'friday','fri'),'saturday','sat'),'sunday','sun');
 if trim(value)='' or value~'every\s*day|daily|all days' then return true;end if;
 if value~'weekdays|m-f' and weekday between 1 and 5 then return true;end if;
 if value~'weekends' and weekday in (0,6) then return true;end if;
 for span in select regexp_matches(value,'(sun|mon|tue|wed|thu|fri|sat)\s*-\s*(sun|mon|tue|wed|thu|fri|sat)','g') loop
  start_day:=array_position(names,span[1])-1;end_day:=array_position(names,span[2])-1;
  if (start_day<=end_day and weekday between start_day and end_day) or (start_day>end_day and (weekday>=start_day or weekday<=end_day)) then return true;end if;
 end loop;
 value:=regexp_replace(value,'(sun|mon|tue|wed|thu|fri|sat)\s*-\s*(sun|mon|tue|wed|thu|fri|sat)','','g');
 return position(names[weekday+1] in value)>0;
end $$;
revoke all on function public.transport_scheduled_on_date(text,date) from public,anon;
grant execute on function public.transport_scheduled_on_date(text,date) to authenticated,service_role;

create or replace function public.queue_transport_assignment_notice()
returns trigger language plpgsql security invoker set search_path=public as $$
declare data jsonb; previous jsonb; lane uuid; actor uuid; route uuid; day date;
 kind text:='assignment'; revision integer; identity text; key text;
 fields text[]:=array['driver','driverLaneId','school','vehicle','pickup','dropoff','dropoffLocation','days','routeName','status','childId','child','tripPeriod','pickupLocation'];
begin
 if tg_table_name='transportation_routes' then
  data:=new.record_data;route:=new.id;actor:=auth.uid();
  if tg_op='UPDATE' then previous:=old.record_data;end if;
 else
  route:=new.route_id;day:=new.service_date;actor:=new.updated_by;revision:=new.version;
  select r.record_data into data from public.transportation_routes r where r.id=route and r.organization_id=new.organization_id;
  data:=data||new.plan_data;
  if new.called_out then
   kind:='callout';
   if tg_op='UPDATE' and old.called_out and new.plan_data->'driverLaneId' is not distinct from old.plan_data->'driverLaneId' and new.plan_data->'driver' is not distinct from old.plan_data->'driver' then return new;end if;
  elsif tg_op='UPDATE' and old.called_out then
   kind:='restore';
  else
   if not new.is_planned then return new;end if;
   if tg_op='UPDATE' and old.is_planned then previous:=old.snapshot||old.plan_data;end if;
  end if;
  if not new.is_planned and not public.transport_scheduled_on_date(data->>'days',day) then return new;end if;
  if kind<>'assignment' and data->>'runDate'=day::text and data->>'runStatus' in ('Picked Up','Arrived','Checked In','Dropped Off') then return new;end if;
  identity:=coalesce(new.child_id::text,route::text);
  -- An explicitly covering driver receives the date-specific change, if uniquely linked.
  if data->>'coveringDate'=day::text and coalesce(data->>'coveringDriver','')<>'' then
   data:=(data-'driverLaneId')||jsonb_build_object('driver',data->>'coveringDriver');
  end if;
 end if;
 if data is null or data->>'status'='Not Riding' then return new;end if;
 if kind='assignment' and previous is not null and not exists(select 1 from unnest(fields) k where data->k is distinct from previous->k) then return new;end if;
 lane:=public.transport_driver_lane(new.organization_id,data,new.location_id);if lane is null then return new;end if;
 key:='transport-'||kind||':'||txid_current()::text||':'||lane::text||':'||coalesce(day::text,'recurring')||':'||
  case when kind='assignment' then md5(coalesce(data->>'tripPeriod','Afternoon')||':'||coalesce(data->>'pickupLocation','')||':'||coalesce(data->>'school','')||':'||coalesce(data->>'routeName','')||':'||coalesce(data->>'pickup','')||':'||new.location_id::text) else identity end;
 insert into public.transport_assignment_notices(organization_id,route_id,location_id,lane_id,service_date,actor_id,event_key,event_kind,day_version)
 values(new.organization_id,route,new.location_id,lane,day,actor,key,kind,revision);
 return new;
end $$;

create or replace function public.deliver_transport_assignment_notices(p_org uuid,p_recipient uuid default null,p_actor uuid default null)
returns table(user_id uuid,notification jsonb) language plpgsql security invoker set search_path=public as $$
declare job public.transport_assignment_notices; target uuid; data jsonb; note jsonb; loc text; pending jsonb;
 stop public.transportation_day_stops; title text; body text;
begin
 for job in select q.* from public.transport_assignment_notices q
  join public.staff_lane_profiles l on l.id=q.lane_id and l.is_active
  join public.staff_access a on a.user_id=l.staff_user_id and a.organization_id=q.organization_id and a.is_active
  where q.organization_id=p_org and q.processed_at is null
   and (p_recipient is null or a.user_id=p_recipient) and (p_actor is null or q.actor_id=p_actor)
  order by q.created_at,q.id limit 100 for update of q skip locked loop
  select r.record_data into data from public.transportation_routes r where r.id=job.route_id and r.organization_id=job.organization_id;
  if job.service_date is not null then
   select * into stop from public.transportation_day_stops s where s.organization_id=job.organization_id and s.route_id=job.route_id and s.service_date=job.service_date;
   data:=data||stop.plan_data;
   -- Reversed or superseded changes must never tell a driver to follow an old plan.
   if stop.route_id is null
    or (job.event_kind='assignment' and (not stop.is_planned or stop.called_out))
    or (job.event_kind='callout' and not stop.called_out)
    or (job.event_kind='restore' and stop.called_out)
    or (not stop.is_planned and not public.transport_scheduled_on_date(data->>'days',job.service_date))
    or (job.event_kind<>'assignment' and data->>'runDate'=job.service_date::text and data->>'runStatus' in ('Picked Up','Arrived','Checked In','Dropped Off'))
    or (job.event_kind in ('callout','restore') and exists(select 1 from public.transport_assignment_notices newer where newer.route_id=job.route_id and newer.service_date=job.service_date and newer.event_kind in ('callout','restore') and newer.day_version>job.day_version)) then
    update public.transport_assignment_notices set processed_at=now() where id=job.id;continue;
   end if;
   if data->>'coveringDate'=job.service_date::text and coalesce(data->>'coveringDriver','')<>'' then
    data:=(data-'driverLaneId')||jsonb_build_object('driver',data->>'coveringDriver');
   end if;
  end if;
  select l.staff_user_id into target from public.staff_lane_profiles l
   join public.staff_access a on a.user_id=l.staff_user_id and a.organization_id=job.organization_id and a.is_active
   where l.id=job.lane_id and l.organization_id=job.organization_id and l.is_active
    and (coalesce(data->>'driverLaneId','')=l.id::text or (coalesce(data->>'driverLaneId','')='' and data->>'driver'=l.full_name))
    and (lower(trim(a.role)) in ('owner / admin','owner/admin','owner / director','administrator','admin','director','corporate / admin','corporate admin','operations admin') or exists(select 1 from public.staff_location_assignments x where x.user_id=a.user_id and x.organization_id=job.organization_id and x.location_id=job.location_id));
  if target is null or data is null or data->>'status'='Not Riding' or (job.service_date is not null and job.service_date<(now() at time zone 'America/Los_Angeles')::date) then
   update public.transport_assignment_notices set processed_at=now() where id=job.id;continue;
  end if;
  select name into loc from public.locations where id=job.location_id;
  if job.event_kind='callout' then
   title:='Transportation cancelled';
   body:=coalesce(data->>'child','A child on your route')||' • No transportation on '||job.service_date::text||'. Do not pick up. Open your route for the updated stops.';
  elsif job.event_kind='restore' then
   title:='Transportation restored';
   body:=coalesce(data->>'child','A child on your route')||' • Back on your route for '||job.service_date::text||'. Open your route for pickup details.';
  else
   title:='Your route assignment';
   body:=coalesce(data->>'tripPeriod','Afternoon')||' • '||coalesce(data->>'routeName','Transportation')||' • '||coalesce(data->>'school','Pickup')||' • '||coalesce(job.service_date::text,data->>'days','Recurring')||' • Pickup '||coalesce(data->>'pickup','not set')||' • '||coalesce(data->>'vehicle','Vehicle not set');
  end if;
  note:=jsonb_build_object('id',job.id::text,'category','transportation','severity','attention','title',title,'body',left(body,260),'href','/transportation'||case when job.service_date is null then '' else '?routeDate='||job.service_date::text end,'location',loc,'createdAt',now(),'readAt','','eventKey',job.event_key);
  insert into public.user_notification_state as n(user_id,inbox,preferences) values(target,'[]','{}') on conflict on constraint user_notification_state_pkey do nothing;
  select n.inbox into pending from public.user_notification_state n where n.user_id=target for update;
  if not exists(select 1 from jsonb_array_elements(pending) v where v->>'eventKey'=job.event_key) then
   update public.user_notification_state n set inbox=(select coalesce(jsonb_agg(v.value order by v.ordinality),'[]'::jsonb) from jsonb_array_elements(jsonb_build_array(note)||pending) with ordinality v where v.ordinality<=100),updated_at=now() where n.user_id=target;
   user_id:=target;notification:=note;return next;
  end if;
  update public.transport_assignment_notices set processed_at=now() where id=job.id;
 end loop;
end $$;
revoke all on function public.queue_transport_assignment_notice() from public,anon,authenticated;
revoke all on function public.deliver_transport_assignment_notices(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.deliver_transport_assignment_notices(uuid,uuid,uuid) to service_role;
