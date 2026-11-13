-- Explicit date-only decisions. No enrollment, master-route, attendance, or historical rows are rewritten.
create or replace function public.save_transport_day_stop(p_org uuid,p_actor uuid,p_route uuid,p_day date,p_action text,p_plan jsonb,p_expected_version integer)
returns integer language plpgsql security invoker set search_path=public as $$
declare actor public.staff_access; source public.transportation_routes; stop public.transportation_day_stops; related public.transportation_routes; prior public.transportation_day_stops; owner_actor boolean; licensee_actor boolean; changed integer:=0; fields jsonb; lane uuid; absence_reason text;
begin
 select * into actor from public.staff_access where user_id=p_actor and organization_id=p_org and is_active;
 if not found then raise exception 'Active staff required';end if;
 owner_actor:=lower(trim(actor.role)) in ('owner / admin','owner/admin','owner / director','administrator','admin','director','corporate / admin','corporate admin','operations admin');
 licensee_actor:=lower(trim(actor.role)) in ('location licensee','licensee','licensee/admin','licensee / admin');
 if not(owner_actor or licensee_actor) then raise exception 'Leadership access required';end if;
 if p_action not in ('save','skip','callout','restore') or p_expected_version is null or p_expected_version<0 or p_day is null then raise exception 'Invalid daily transportation action';end if;
 if p_action='callout' then
  absence_reason:=coalesce(p_plan->>'calloutReason','no_transportation');
  if absence_reason not in ('sick','no_transportation') then raise exception 'Choose Out sick or No transportation';end if;
 end if;
 if p_action in ('save','skip') and not owner_actor then raise exception 'Only administration can assign daily routes';end if;
 if p_day<(now() at time zone 'America/Los_Angeles')::date then raise exception 'Past dispatch history cannot be changed';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_day::text,0));
 select * into source from public.transportation_routes where id=p_route and organization_id=p_org;
 if not found then raise exception 'Recurring route is no longer available';end if;
 if not exists(select 1 from public.locations where id=source.location_id and organization_id=p_org and is_active) or (not owner_actor and not exists(select 1 from public.staff_location_assignments where user_id=p_actor and organization_id=p_org and location_id=source.location_id)) then raise exception 'Location not assigned';end if;
 perform 1 from public.transportation_routes where organization_id=p_org and (id=p_route or (source.child_id is not null and child_id=source.child_id)) order by id for update;
 select * into source from public.transportation_routes where id=p_route and organization_id=p_org;
 select * into stop from public.transportation_day_stops where organization_id=p_org and route_id=p_route and service_date=p_day;
 if coalesce(stop.version,0)<>p_expected_version then raise exception 'Daily route changed. Refresh before trying again';end if;
 if p_action='skip' then
  if source.record_data->>'runDate'=p_day::text and source.record_data->>'runStatus' in ('Picked Up','Arrived','Checked In','Dropped Off') then raise exception 'This trip has started or finished. Its custody history cannot be replaced with No pickup';end if;
  insert into public.transportation_day_stops(organization_id,route_id,location_id,child_id,service_date,snapshot,plan_data,is_planned,called_out,callout_reason,updated_by,updated_by_name)
  values(p_org,p_route,source.location_id,source.child_id,p_day,source.record_data,'{}',true,true,'no_transportation',p_actor,actor.full_name)
  on conflict(organization_id,route_id,service_date) do update set is_planned=true,called_out=true,callout_reason=case when transportation_day_stops.callout_reason='sick' then 'sick' else 'no_transportation' end,version=transportation_day_stops.version+1,updated_by=p_actor,updated_by_name=actor.full_name,updated_at=clock_timestamp();
  changed:=1;
 elsif p_action='save' then
  if stop.called_out and stop.callout_reason='sick' then raise exception 'Child is marked out sick. Restore transportation explicitly before selecting pickup';end if;
  if coalesce(p_plan->>'pickup','') !~* '^(([01][0-9]|2[0-3]):[0-5][0-9]|(0?[1-9]|1[0-2]):[0-5][0-9] ?(AM|PM))$' then raise exception 'Enter a valid pickup time for this date';end if;
  if jsonb_typeof(p_plan)<>'object' or exists(select 1 from jsonb_object_keys(p_plan) k where k not in ('driver','driverLaneId','school','vehicle','routeName','stopOrder','pickup','dropoff','dropoffLocation','notes','tripPeriod','pickupLocation')) then raise exception 'Invalid daily route fields';end if;
  if exists(select 1 from jsonb_each(p_plan) e where e.key<>'stopOrder' and (jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>1000)) or (p_plan?'stopOrder' and (jsonb_typeof(p_plan->'stopOrder')<>'number' or (p_plan->>'stopOrder')::numeric not between 1 and 999 or trunc((p_plan->>'stopOrder')::numeric)<>(p_plan->>'stopOrder')::numeric)) then raise exception 'Invalid daily route values';end if;
  if p_plan?'tripPeriod' and p_plan->>'tripPeriod' not in ('Morning','Afternoon') then raise exception 'Choose Morning or Afternoon';end if;
  lane:=public.transport_driver_lane(p_org,p_plan,source.location_id);if lane is not null then p_plan:=jsonb_set(p_plan,'{driverLaneId}',to_jsonb(lane::text));end if;
  if source.record_data->>'runDate'=p_day::text and source.record_data->>'runStatus' in ('Picked Up','Arrived','Checked In','Dropped Off') then raise exception 'This trip has started or finished. Its daily plan is locked';end if;
  insert into public.transportation_day_stops(organization_id,route_id,location_id,child_id,service_date,snapshot,plan_data,is_planned,updated_by,updated_by_name)
  values(p_org,p_route,source.location_id,source.child_id,p_day,source.record_data,p_plan,true,p_actor,actor.full_name)
  on conflict(organization_id,route_id,service_date) do update set plan_data=excluded.plan_data,is_planned=true,called_out=false,callout_reason=null,version=transportation_day_stops.version+1,updated_by=p_actor,updated_by_name=actor.full_name,updated_at=clock_timestamp();
  changed:=1;
 else
  if p_action='callout' and source.record_data->>'runDate'=p_day::text and source.record_data->>'runStatus' in ('Checked In','Dropped Off') then raise exception 'This trip is complete. Select a remaining trip to mark no transportation';end if;
  -- Stable child IDs group linked stops; never guess identity from a child's name.
  for related in select * from public.transportation_routes where organization_id=p_org and (id=p_route or (source.child_id is not null and child_id=source.child_id)) order by id for update loop
   if not owner_actor and not exists(select 1 from public.staff_location_assignments where user_id=p_actor and organization_id=p_org and location_id=related.location_id) then raise exception 'A linked stop is outside your location. Contact administration';end if;
   if related.record_data->>'runDate'=p_day::text and related.record_data->>'runStatus' in ('Picked Up','Arrived') then raise exception 'Child already picked up. Complete the handoff before calling out';end if;
   -- Preserve completed morning/afternoon handoffs when a later trip is cancelled.
   if related.record_data->>'runDate'=p_day::text and related.record_data->>'runStatus' in ('Checked In','Dropped Off') then continue;end if;
   select * into prior from public.transportation_day_stops where organization_id=p_org and route_id=related.id and service_date=p_day;
   insert into public.transportation_day_stops(organization_id,route_id,location_id,child_id,service_date,snapshot,called_out,callout_reason,updated_by,updated_by_name)
   values(p_org,related.id,related.location_id,related.child_id,p_day,related.record_data,p_action='callout',absence_reason,p_actor,actor.full_name)
   on conflict(organization_id,route_id,service_date) do update set called_out=excluded.called_out,callout_reason=excluded.callout_reason,version=transportation_day_stops.version+1,updated_by=p_actor,updated_by_name=actor.full_name,updated_at=clock_timestamp();
   changed:=changed+1;
  end loop;
 end if;
 insert into public.audit_log(organization_id,location_id,actor_user_id,action,table_name,metadata) values(p_org,source.location_id,p_actor,'UPDATE','transportation_day_stops',jsonb_build_object('kind','daily_transport_'||p_action,'route_id',p_route,'service_date',p_day,'changed_stops',changed,'previous_version',p_expected_version,'before',to_jsonb(stop),'callout_reason',absence_reason,'plan',case when p_action='save' then p_plan else null end));
 return changed;
end $$;

-- Keep the existing server-only writer; direct client writes remain blocked by RLS/grants.
revoke all on function public.save_transport_day_stop(uuid,uuid,uuid,date,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.save_transport_day_stop(uuid,uuid,uuid,date,text,jsonb,integer) to service_role;

-- One explicit selection, one timestamp, one atomic transaction, with the driver's normal RLS.
create function public.confirm_selected_transport_dropoffs(p_day date,p_stops jsonb,p_group jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare org uuid:=public.current_staff_organization_id(); actor text; item jsonb; source public.transportation_routes; effective jsonb; group_value jsonb; destination text; driver text; lane text; completed timestamptz:=clock_timestamp(); changed integer:=0; seen_children uuid[]:='{}'; history jsonb;
begin
 if auth.uid() is null or org is null then raise exception 'Active staff required';end if;
 select full_name into actor from public.staff_access where user_id=auth.uid() and organization_id=org and is_active;
 if actor is null then raise exception 'Active staff required';end if;
 if not (public.is_tcs_owner() or public.is_tcs_licensee() or exists(select 1 from public.staff_access where user_id=auth.uid() and organization_id=org and is_active and 'transportation'=any(permissions))) then raise exception 'Transportation access required';end if;
 if p_day is distinct from (now() at time zone 'America/Los_Angeles')::date then raise exception 'Drop-offs can only be confirmed for today';end if;
 if jsonb_typeof(p_stops) is distinct from 'array' or jsonb_array_length(p_stops) not between 1 and 30 or jsonb_typeof(p_group) is distinct from 'array' or jsonb_array_length(p_group)<>5 then raise exception 'Select between 1 and 30 arrived children at one destination';end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_stops))<>jsonb_array_length(p_stops) then raise exception 'Select each trip only once';end if;
 -- Same ordering as daily planning prevents concurrent cancellation/handoff races.
 perform pg_advisory_xact_lock(hashtextextended(org::text||':'||p_day::text,0));
 perform 1 from public.transportation_routes r where r.organization_id=org and r.legacy_id in (select value->>'id' from jsonb_array_elements(p_stops)) order by r.id for update;
 for item in select value from jsonb_array_elements(p_stops) order by value->>'id' loop
  select * into source from public.transportation_routes where organization_id=org and legacy_id=item->>'id' for update;
  if not found then raise exception 'A selected trip is no longer available. Refresh and review the selection';end if;
  if source.child_id is null or source.child_id=any(seen_children) then raise exception 'Each selected trip must have a different linked child';end if;
  seen_children:=array_append(seen_children,source.child_id);
  if source.record_data->>'runDate' is distinct from p_day::text or source.record_data->>'runStatus' is distinct from 'Arrived' or nullif(source.record_data->>'arrivedAt','') is null or source.record_data->>'arrivedAt' is distinct from item->>'arrivedAt' or nullif(source.record_data->>'pickedUpAt','') is null or nullif(source.record_data->>'droppedOffAt','') is not null or nullif(source.record_data->>'checkedInAt','') is not null then raise exception 'A selected trip changed or is not awaiting handoff. Refresh and review the selection';end if;
  if (source.record_data->>'arrivedAt')::timestamptz>completed or (source.record_data->>'pickedUpAt')::timestamptz>(source.record_data->>'arrivedAt')::timestamptz then raise exception 'Pickup and arrival times must be valid before handoff';end if;
  select source.record_data||coalesce(s.plan_data,'{}') into effective from (select 1) stub left join public.transportation_day_stops s on s.organization_id=org and s.route_id=source.id and s.service_date=p_day;
  destination:=case when effective->>'tripPeriod'='Morning' then effective->>'school' else coalesce(nullif(effective->>'dropoffLocation',''),effective->>'location') end;
  driver:=case when effective->>'coveringDate'=p_day::text then nullif(btrim(effective->>'coveringDriver'),'') end;
  lane:=case when driver is not null then '' else coalesce(effective->>'driverLaneId','') end;
  driver:=coalesce(driver,btrim(effective->>'driver'),'');
  group_value:=jsonb_build_array(case when effective->>'tripPeriod'='Morning' then 'Morning' else 'Afternoon' end,lane,driver,coalesce(btrim(effective->>'vehicle'),''),lower(btrim(coalesce(destination,''))));
  if driver='' or coalesce(btrim(effective->>'vehicle'),'')='' or coalesce(btrim(destination),'')='' or group_value is distinct from p_group then raise exception 'Selected children must share the reviewed driver, vehicle, session and destination';end if;
  history:=case when jsonb_typeof(source.record_data->'runHistory')='array' then source.record_data->'runHistory' else '[]'::jsonb end;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into history from jsonb_array_elements(history) with ordinality h(value,ord) where ord>greatest(jsonb_array_length(history)-249,0);
  update public.transportation_routes set record_data=source.record_data||jsonb_build_object('runStatus','Dropped Off','droppedOffAt',completed,'droppedOffBy',actor,'runHistory',history||jsonb_build_array(jsonb_build_object('date',p_day,'status','Dropped Off','at',completed,'by',actor,'location',destination))) where id=source.id and organization_id=org;
  if not found then raise exception 'You cannot confirm this trip';end if;
  changed:=changed+1;
 end loop;
 return changed;
end $$;
revoke all on function public.confirm_selected_transport_dropoffs(date,jsonb,jsonb) from public,anon;
grant execute on function public.confirm_selected_transport_dropoffs(date,jsonb,jsonb) to authenticated;
