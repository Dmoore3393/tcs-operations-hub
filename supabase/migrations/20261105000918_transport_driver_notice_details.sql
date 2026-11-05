-- Use the saved stop details when a driver is assigned or a child's plans change.
create index if not exists transport_assignment_event_lookup
on public.transport_assignment_notices(organization_id,event_key) where event_kind='assignment';
create or replace function public.deliver_transport_assignment_notices(p_org uuid,p_recipient uuid default null,p_actor uuid default null)
returns table(user_id uuid,notification jsonb) language plpgsql security invoker set search_path=public as $$
declare job public.transport_assignment_notices; target uuid; data jsonb; note jsonb; loc text; pending jsonb;
 stop public.transportation_day_stops; title text; body text;
 driver text; origin text; rider_count integer; schedule text;
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
  driver:=coalesce(nullif(data->>'driver',''),'Assigned driver');
  origin:=case when data->>'tripPeriod'='Morning' then coalesce(nullif(data->>'pickupLocation',''),data->>'location') else data->>'school' end;
  schedule:=coalesce(to_char(job.service_date,'Dy Mon FMDD'),nullif(data->>'days',''),'Recurring')||' · '||coalesce(nullif(data->>'pickup',''),'time pending')||' · '||coalesce(nullif(origin,''),'pickup location pending');
  if job.event_kind='callout' then
   title:='Transportation cancelled';
   body:=coalesce(data->>'child','A child on your route')||' · Do not pick up. '||schedule||'. Driver: '||driver||'.';
  elsif job.event_kind='restore' then
   title:='Transportation restored';
   body:=coalesce(data->>'child','A child on your route')||' is back on '||driver||'’s route. '||schedule||'.';
  else
   -- The assignment key groups children added to the same driver's stop together.
   select count(distinct q.route_id) into rider_count
    from public.transport_assignment_notices q
    join public.transportation_routes r on r.id=q.route_id and r.organization_id=q.organization_id
    left join public.transportation_day_stops s on s.route_id=q.route_id and s.organization_id=q.organization_id and s.service_date=q.service_date
    cross join lateral (select r.record_data||coalesce(s.plan_data,'{}'::jsonb) item) live
    where q.event_kind='assignment' and q.organization_id=job.organization_id and q.event_key=job.event_key and q.lane_id=job.lane_id
     and live.item->>'status' is distinct from 'Not Riding' and not coalesce(s.called_out,false)
     and (case when q.service_date::text=live.item->>'coveringDate' and nullif(live.item->>'coveringDriver','') is not null
            then live.item->>'coveringDriver'=driver
            when nullif(live.item->>'driverLaneId','') is not null then live.item->>'driverLaneId'=job.lane_id::text
            else live.item->>'driver'=driver end);
   title:='Your route assignment';
   body:=coalesce(data->>'tripPeriod','Afternoon')||' · '||schedule||'. '||driver||coalesce(' · '||nullif(data->>'vehicle',''),'')||'. '||rider_count||case when rider_count=1 then ' rider.' else ' riders.' end;
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
revoke all on function public.deliver_transport_assignment_notices(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.deliver_transport_assignment_notices(uuid,uuid,uuid) to service_role;
