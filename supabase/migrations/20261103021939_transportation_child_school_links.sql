-- Narrow, transactional writes: selecting riders never replaces the whole roster.
-- Invoker security retains the existing organization/location RLS policies.
create or replace function public.set_transport_child_school(p_child_key text,p_school text,p_expected_school text)
returns integer language plpgsql security invoker set search_path=public as $$
declare org uuid:=public.current_staff_organization_id(); child public.children; prior_school text; school text:=trim(p_school); changed integer;
begin
 if auth.uid() is null or org is null or not (public.is_tcs_owner() or public.is_tcs_licensee()) then raise exception 'Administration or licensee access required';end if;
 if school is null or length(school)>200 or p_expected_school is null then raise exception 'Choose a valid school';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||':transport-school-setup',0));
 select * into child from public.children where organization_id=org and legacy_id=p_child_key for update;
 if not found or child.enrollment_status<>'Active' then raise exception 'Choose an active existing child profile';end if;
 prior_school:=coalesce(nullif(trim(child.record_data#>>'{schoolAgeSupport,schoolName}'),''),nullif(trim(child.school_name),''),'');
 if prior_school<>trim(p_expected_school) then raise exception 'This child’s school changed. Refresh the children before saving';end if;
 if school<>'' and school<>prior_school and not exists(
  select 1 from public.hub_state h cross join lateral jsonb_array_elements(h.state_value) s
  where h.organization_id=org and h.state_key='tcs-schools-v2' and s->>'school'=school and s->>'status'='Active'
 ) then raise exception 'Choose an active school from the school directory';end if;
 if school=prior_school then return 0;end if;
 if exists(select 1 from public.transportation_routes r where r.organization_id=org and r.child_id=child.id
  and coalesce(r.school_name,'')=prior_school and r.record_data->>'runDate'=(now() at time zone 'America/Los_Angeles')::date::text
  and r.record_data->>'runStatus' in ('Picked Up','Arrived')) then raise exception 'This child is in transit. Complete the handoff before changing their school';end if;
 update public.children set school_name=nullif(school,''),record_data=coalesce(record_data,'{}'::jsonb)||jsonb_build_object(
  'school',school,'schoolAgeSupport',(case when jsonb_typeof(record_data->'schoolAgeSupport')='object' then record_data->'schoolAgeSupport' else '{}'::jsonb end)||jsonb_build_object('schoolName',school,'updatedAt',clock_timestamp()))
 where id=child.id and organization_id=org;
 get diagnostics changed=row_count;
 if changed<>1 then raise exception 'You cannot edit this child’s school';end if;
 -- Only ordinary trips following the previous school change; special destinations stay intact.
 -- Daily plans and their historical snapshots are deliberately not rewritten.
 update public.transportation_routes set school_name=nullif(school,''),record_data=jsonb_set(record_data,'{school}',to_jsonb(school))
 where organization_id=org and child_id=child.id and coalesce(school_name,'')=prior_school and route_status<>'Not Riding';
 return changed;
end $$;
revoke all on function public.set_transport_child_school(text,text,text) from public,anon;
grant execute on function public.set_transport_child_school(text,text,text) to authenticated;

create or replace function public.save_transport_school_routes(p_routes jsonb,p_save_schools boolean default false)
returns integer language plpgsql security invoker set search_path=public as $$
declare org uuid:=public.current_staff_organization_id(); item jsonb; child public.children; existing public.transportation_routes; school text; site uuid; data jsonb; n integer:=0; found_route boolean; allowed text[]:=array['id','childId','child','location','school','area','driver','driverLaneId','vehicle','pickup','dropoff','days','status','notes','tripPeriod','pickupLocation','pickupStopId','routeName','stopOrder','pickupArea','dropoffLocation','expectedChildSchool'];
begin
 if auth.uid() is null or org is null or not (public.is_tcs_owner() or public.is_tcs_licensee()) then raise exception 'Administration or licensee access required';end if;
 if p_routes is null or jsonb_typeof(p_routes)<>'array' or jsonb_array_length(p_routes) not between 1 and 100 then raise exception 'Choose at least one child';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||':transport-school-setup',0));
 if exists(select 1 from jsonb_array_elements(p_routes) r group by r->>'id' having count(*)>1) or exists(select 1 from jsonb_array_elements(p_routes) r group by r->>'childId' having count(*)>1) then raise exception 'Choose each child only once per school stop';end if;
 for item in select value from jsonb_array_elements(p_routes) loop
  if jsonb_typeof(item)<>'object' or exists(select 1 from jsonb_object_keys(item) k where not(k=any(allowed))) then raise exception 'Invalid school trip fields';end if;
  if coalesce(item->>'id','')!~'^[1-9][0-9]{0,15}$' or (item->>'id')::numeric>9007199254740991 then raise exception 'Invalid school trip identity';end if;
  if exists(select 1 from jsonb_each(item) e where e.key not in ('id','stopOrder') and (jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>4000)) then raise exception 'Invalid school trip values';end if;
  if item?'stopOrder' and (jsonb_typeof(item->'stopOrder')<>'number' or (item->>'stopOrder')::numeric not between 1 and 999 or trunc((item->>'stopOrder')::numeric)<>(item->>'stopOrder')::numeric) then raise exception 'Choose a valid stop order';end if;
  if coalesce(item->>'tripPeriod','Afternoon') not in ('Morning','Afternoon') or coalesce(item->>'status','Needs Review') not in ('Confirmed','Needs Review','Not Riding') then raise exception 'Invalid school trip status';end if;
  select * into child from public.children where organization_id=org and legacy_id=item->>'childId' for update;
  if not found or child.enrollment_status<>'Active' then raise exception 'Choose an active existing child profile';end if;
  select * into existing from public.transportation_routes where organization_id=org and legacy_id=item->>'id' for update;
  found_route:=found;
  if found_route and existing.child_id is not null and existing.child_id<>child.id then raise exception 'This trip belongs to another child. Add a new trip instead';end if;
  if found_route and existing.record_data->>'runDate'=(now() at time zone 'America/Los_Angeles')::date::text and existing.record_data->>'runStatus' in ('Picked Up','Arrived') then raise exception 'This child is in transit. Complete the handoff before changing the trip';end if;
  site:=public.resolve_tcs_location_id(item->>'location',org);
  if site is null then raise exception 'Choose a valid care location';end if;
  school:=trim(coalesce(item->>'school',''));
  if school='' or length(school)>200 then raise exception 'Choose a school or pickup location';end if;
  if school not in ('Home Transportation','Dojo') and school is distinct from existing.school_name and school is distinct from child.school_name and not exists(
   select 1 from public.hub_state h cross join lateral jsonb_array_elements(h.state_value) s where h.organization_id=org and h.state_key='tcs-schools-v2' and s->>'school'=school and s->>'status'='Active'
  ) then raise exception 'Choose a school from the school directory';end if;
  if p_save_schools and school not in ('Home Transportation','Dojo') then
   perform public.set_transport_child_school(child.legacy_id,school,item->>'expectedChildSchool');
  end if;
  -- Preserve current pickup and handoff history; only setup fields are accepted above.
  data:=coalesce(existing.record_data,'{}'::jsonb)||(item-'expectedChildSchool')||jsonb_build_object('childId',child.legacy_id,'child',trim(child.first_name||' '||child.last_name),'school',school);
  insert into public.transportation_routes(organization_id,location_id,child_id,legacy_id,child_name,school_name,driver_name,vehicle_name,route_status,record_data)
  values(org,site,child.id,item->>'id',trim(child.first_name||' '||child.last_name),school,data->>'driver',data->>'vehicle',coalesce(data->>'status','Needs Review'),data)
  on conflict(organization_id,legacy_id) do update set location_id=excluded.location_id,child_id=excluded.child_id,child_name=excluded.child_name,school_name=excluded.school_name,driver_name=excluded.driver_name,vehicle_name=excluded.vehicle_name,route_status=excluded.route_status,record_data=excluded.record_data;
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.save_transport_school_routes(jsonb,boolean) from public,anon;
grant execute on function public.save_transport_school_routes(jsonb,boolean) to authenticated;
