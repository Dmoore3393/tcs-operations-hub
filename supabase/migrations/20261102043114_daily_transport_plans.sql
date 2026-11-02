-- Date-specific dispatch plans and call-outs; recurring routes are never rewritten.
create table public.transportation_day_stops (
 organization_id uuid not null references public.organizations(id),
 route_id uuid not null,
 location_id uuid not null references public.locations(id),
 child_id uuid,
 service_date date not null,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 plan_data jsonb not null default '{}'::jsonb check(jsonb_typeof(plan_data)='object'),
 is_planned boolean not null default false,
 called_out boolean not null default false,
 version integer not null default 1,
 updated_by uuid references auth.users(id) on delete set null,
 updated_by_name text not null,
 updated_at timestamptz not null default now(),
 primary key(organization_id,route_id,service_date)
);
create index transportation_day_stops_location_date_idx on public.transportation_day_stops(location_id,service_date);
create index transportation_day_stops_child_date_idx on public.transportation_day_stops(child_id,service_date);
create index transportation_day_stops_actor_idx on public.transportation_day_stops(updated_by);
alter table public.transportation_day_stops enable row level security;
revoke all on public.transportation_day_stops from anon,authenticated;
grant select on public.transportation_day_stops to authenticated;
grant all on public.transportation_day_stops to service_role;
create policy transportation_day_stops_read on public.transportation_day_stops for select to authenticated using(
 organization_id=(select public.current_staff_organization_id()) and (select public.is_approved_tcs_pilot_user()) and public.can_access_location(location_id)
 and ((select public.is_tcs_owner()) or (select public.is_tcs_licensee()) or exists(select 1 from public.staff_access where user_id=(select auth.uid()) and is_active and 'transportation'=any(permissions)))
);

create function public.save_transport_day_stop(p_org uuid,p_actor uuid,p_route uuid,p_day date,p_action text,p_plan jsonb,p_expected_version integer)
returns integer language plpgsql security invoker set search_path=public as $$
declare actor public.staff_access; source public.transportation_routes; stop public.transportation_day_stops; related public.transportation_routes; prior public.transportation_day_stops; owner_actor boolean; licensee_actor boolean; changed integer:=0; fields jsonb;
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
  if jsonb_typeof(p_plan)<>'object' or exists(select 1 from jsonb_object_keys(p_plan) k where k not in ('driver','vehicle','routeName','stopOrder','pickup','dropoff','dropoffLocation','notes')) then raise exception 'Invalid daily route fields';end if;
  if exists(select 1 from jsonb_each(p_plan) e where e.key<>'stopOrder' and (jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>1000)) or (p_plan?'stopOrder' and (jsonb_typeof(p_plan->'stopOrder')<>'number' or (p_plan->>'stopOrder')::numeric not between 1 and 999 or trunc((p_plan->>'stopOrder')::numeric)<>(p_plan->>'stopOrder')::numeric)) then raise exception 'Invalid daily route values';end if;
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

-- A stale driver screen must not pick up a child after a saved call-out.
create function public.guard_transport_called_out_pickup() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.record_data->>'runStatus'='Picked Up' and (old.record_data->>'runStatus' is distinct from 'Picked Up' or old.record_data->>'runDate' is distinct from new.record_data->>'runDate') and exists(
  select 1 from public.transportation_day_stops where organization_id=new.organization_id and route_id=new.id and service_date::text=new.record_data->>'runDate' and called_out
 ) then raise exception 'This child is called out for this date. Refresh the route before pickup';end if;
 return new;
end $$;
revoke all on function public.guard_transport_called_out_pickup() from public,anon,authenticated;
grant execute on function public.guard_transport_called_out_pickup() to service_role;
create trigger transport_called_out_pickup before update on public.transportation_routes for each row execute function public.guard_transport_called_out_pickup();

-- Route setup keeps an explicit child identity; ambiguous typed names never group call-outs.
create function public.link_transport_child_identity() returns trigger language plpgsql security invoker set search_path=public as $$
declare linked uuid; matches integer;
begin
 if coalesce(new.record_data->>'childId','')<>'' then
  select id into linked from public.children where organization_id=new.organization_id and legacy_id=new.record_data->>'childId';
  if linked is null then raise exception 'Choose an existing child profile for this route';end if;
 else
  select count(*),(array_agg(id))[1] into matches,linked from public.children where organization_id=new.organization_id and location_id=new.location_id and lower(trim(first_name||' '||last_name))=lower(trim(new.record_data->>'child'));
  if matches<>1 then linked:=null;end if;
 end if;
 new.child_id:=linked;return new;
end $$;
revoke all on function public.link_transport_child_identity() from public,anon,authenticated;
grant execute on function public.link_transport_child_identity() to service_role;
create trigger transport_child_identity before insert or update on public.transportation_routes for each row execute function public.link_transport_child_identity();
