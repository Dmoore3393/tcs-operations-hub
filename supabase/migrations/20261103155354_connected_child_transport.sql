-- Keep existing child identity, school and default care stops together.
-- No child rows, assignments or historical dispatch snapshots are backfilled.
create function public.sync_child_transport_profile() returns trigger
language plpgsql security invoker set search_path=public as $$
declare prior_school text; next_school text; trip public.transportation_routes; data jsonb; follows_school boolean; care_field text;
begin
 prior_school:=coalesce(nullif(trim(old.school_name),''),trim(old.record_data#>>'{schoolAgeSupport,schoolName}'),'');
 next_school:=case when new.school_name is distinct from old.school_name then coalesce(trim(new.school_name),'')
  when new.record_data#>>'{schoolAgeSupport,schoolName}' is distinct from old.record_data#>>'{schoolAgeSupport,schoolName}' then coalesce(trim(new.record_data#>>'{schoolAgeSupport,schoolName}'),'')
  else prior_school end;
 if next_school=prior_school and new.location_id is not distinct from old.location_id and new.first_name is not distinct from old.first_name and new.last_name is not distinct from old.last_name and new.enrollment_status is not distinct from old.enrollment_status then return new;end if;
 if next_school<>prior_school then
  new.school_name:=nullif(next_school,'');
  new.record_data:=new.record_data||jsonb_build_object('school',next_school,'schoolAgeSupport',(case when jsonb_typeof(new.record_data->'schoolAgeSupport')='object' then new.record_data->'schoolAgeSupport' else '{}'::jsonb end)||jsonb_build_object('schoolName',next_school));
 end if;
 for trip in select * from public.transportation_routes where organization_id=new.organization_id and child_id=new.id order by id for update loop
  if trip.record_data->>'runDate'=(now() at time zone 'America/Los_Angeles')::date::text and trip.record_data->>'runStatus' in ('Picked Up','Arrived') then
   raise exception 'This child is in transit. Complete the handoff before changing their school, care location or enrollment';
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
  if new.enrollment_status<>'Active' then data:=data||jsonb_build_object('status','Not Riding');end if;
  update public.transportation_routes set child_name=trim(new.first_name||' '||new.last_name),
   location_id=new.location_id, school_name=case when follows_school then nullif(next_school,'') else school_name end,
   route_status=coalesce(data->>'status',route_status),record_data=data where id=trip.id;
 end loop;
 return new;
end $$;
revoke all on function public.sync_child_transport_profile() from public,anon,authenticated;
create trigger children_transport_profile before update on public.children for each row execute function public.sync_child_transport_profile();
