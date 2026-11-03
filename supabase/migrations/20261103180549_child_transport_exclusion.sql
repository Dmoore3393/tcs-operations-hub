-- Opt-out is explicit per child; this migration does not change any child records.
-- Preserve school/care details, recurring trip identities and historical handoffs.
create or replace function public.sync_child_transport_profile() returns trigger
language plpgsql security invoker set search_path=public as $$
declare prior_school text; next_school text; trip public.transportation_routes; data jsonb; follows_school boolean; care_field text;
begin
 prior_school:=coalesce(nullif(trim(old.school_name),''),trim(old.record_data#>>'{schoolAgeSupport,schoolName}'),'');
 next_school:=case when new.school_name is distinct from old.school_name then coalesce(trim(new.school_name),'')
  when new.record_data#>>'{schoolAgeSupport,schoolName}' is distinct from old.record_data#>>'{schoolAgeSupport,schoolName}' then coalesce(trim(new.record_data#>>'{schoolAgeSupport,schoolName}'),'')
  else prior_school end;
 if next_school=prior_school and new.location_id is not distinct from old.location_id and new.first_name is not distinct from old.first_name and new.last_name is not distinct from old.last_name and new.enrollment_status is not distinct from old.enrollment_status and coalesce(new.record_data->'noTransportationNeeded','false'::jsonb) is not distinct from coalesce(old.record_data->'noTransportationNeeded','false'::jsonb) then return new;end if;
 if next_school<>prior_school then
  new.school_name:=nullif(next_school,'');
  new.record_data:=new.record_data||jsonb_build_object('school',next_school,'schoolAgeSupport',(case when jsonb_typeof(new.record_data->'schoolAgeSupport')='object' then new.record_data->'schoolAgeSupport' else '{}'::jsonb end)||jsonb_build_object('schoolName',next_school));
 end if;
 for trip in select * from public.transportation_routes where organization_id=new.organization_id and child_id=new.id order by id for update loop
  if trip.record_data->>'runDate'=(now() at time zone 'America/Los_Angeles')::date::text and trip.record_data->>'runStatus' in ('Picked Up','Arrived') then
   raise exception 'This child is in transit. Complete the handoff before changing their school, care location, enrollment or transportation preference';
  end if;
  data:=trip.record_data||jsonb_build_object('child',trim(new.first_name||' '||new.last_name));
  follows_school:=coalesce(trip.school_name,'')=prior_school and coalesce(trip.school_name,'') not in ('Home Transportation','Dojo');
  if follows_school and next_school<>prior_school then
   data:=data||jsonb_build_object('school',next_school);
   if data->>'tripPeriod'='Morning' and coalesce(data->>'dropoffLocation','') in ('',prior_school) then data:=data||jsonb_build_object('dropoffLocation',next_school);end if;
   if next_school='' then data:=data||jsonb_build_object('status','Needs Review');end if;
  end if;
  if new.location_id is distinct from old.location_id then
   data:=data||jsonb_build_object('location',new.record_data->>'location');
   care_field:=case when data->>'tripPeriod'='Morning' then 'pickupLocation' else 'dropoffLocation' end;
   -- A deliberately different destination remains a per-child override.
   if coalesce(data->>care_field,'')='' or public.resolve_tcs_location_id(data->>care_field,new.organization_id)=old.location_id then
    data:=jsonb_set(data,array[care_field],to_jsonb(new.record_data->>'location'));
   end if;
  end if;
  if new.enrollment_status<>'Active' or new.record_data->'noTransportationNeeded'='true'::jsonb then data:=data||jsonb_build_object('status','Not Riding');end if;
  update public.transportation_routes set child_name=trim(new.first_name||' '||new.last_name),
   location_id=new.location_id, school_name=case when follows_school then nullif(next_school,'') else school_name end,
   route_status=coalesce(data->>'status',route_status),record_data=data where id=trip.id;
 end loop;
 return new;
end $$;
revoke all on function public.sync_child_transport_profile() from public,anon,authenticated;


-- Scoped, optimistic toggle shared by the transportation roster and saved profile.
create function public.set_child_transportation_exclusion(p_child_key text,p_excluded boolean,p_expected_excluded boolean)
returns integer language plpgsql security invoker set search_path=public as $$
declare org uuid:=public.current_staff_organization_id(); child public.children; excluded boolean; changed integer;
begin
 if auth.uid() is null or org is null or not (public.is_tcs_owner() or public.is_tcs_licensee()) then raise exception 'Administration or licensee access required';end if;
 if p_excluded is null or p_expected_excluded is null then raise exception 'Choose a transportation preference';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||':transport-school-setup',0));
 select * into child from public.children where organization_id=org and legacy_id=p_child_key for update;
 if not found or child.enrollment_status<>'Active' then raise exception 'Choose an active existing child profile';end if;
 excluded:=coalesce(child.record_data->'noTransportationNeeded'='true'::jsonb,false);
 if excluded=p_excluded then return 0;end if;
 if excluded<>p_expected_excluded then raise exception 'This child’s transportation preference changed. Refresh the children before saving';end if;
 update public.children set record_data=coalesce(record_data,'{}'::jsonb)||jsonb_build_object('noTransportationNeeded',p_excluded)
 where id=child.id and organization_id=org;
 get diagnostics changed=row_count;
 if changed<>1 then raise exception 'You cannot edit this child’s transportation preference';end if;
 return changed;
end $$;
revoke all on function public.set_child_transportation_exclusion(text,boolean,boolean) from public,anon;
grant execute on function public.set_child_transportation_exclusion(text,boolean,boolean) to authenticated;

-- Also enforce the preference for stale tabs, route patches and direct API writes.
-- The name sorts after transport_child_identity, so legacy route links are resolved.
create function public.guard_child_transport_exclusion() returns trigger
language plpgsql security invoker set search_path=public as $$
declare excluded boolean;
begin
 select coalesce(record_data->'noTransportationNeeded'='true'::jsonb,false) into excluded from public.children
 where id=new.child_id and organization_id=new.organization_id for share;
 if excluded and (coalesce(new.route_status,'')<>'Not Riding' or coalesce(new.record_data->>'status','')<>'Not Riding'
  or (new.record_data->>'runDate'=(now() at time zone 'America/Los_Angeles')::date::text and new.record_data->>'runStatus' in ('Picked Up','Arrived'))) then
  raise exception 'Transportation is turned off for this child. Uncheck No school / no pickup needed before adding a trip';
 end if;
 return new;
end $$;
revoke all on function public.guard_child_transport_exclusion() from public,anon,authenticated;
create trigger transport_z_exclusion_guard before insert or update on public.transportation_routes for each row execute function public.guard_child_transport_exclusion();

-- An old daily-planner tab must not schedule a child after their checkbox is saved.
create function public.guard_day_transport_exclusion() returns trigger
language plpgsql security invoker set search_path=public as $$
declare excluded boolean;
begin
 if new.service_date<(now() at time zone 'America/Los_Angeles')::date or not new.is_planned or new.called_out then return new;end if;
 select coalesce(c.record_data->'noTransportationNeeded'='true'::jsonb,false) into excluded
 from public.children c join public.transportation_routes r on r.child_id=c.id and r.organization_id=c.organization_id
 where r.id=new.route_id and r.organization_id=new.organization_id for share of c;
 if excluded then raise exception 'Transportation is turned off for this child. Uncheck No school / no pickup needed before adding a trip';end if;
 return new;
end $$;
revoke all on function public.guard_day_transport_exclusion() from public,anon,authenticated;
create trigger transport_day_exclusion_guard before insert or update on public.transportation_day_stops for each row execute function public.guard_day_transport_exclusion();
