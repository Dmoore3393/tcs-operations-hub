-- Existing route screens save only changed records, with optimistic concurrency.
-- Omitting a row can never delete a newly assigned route or another child's history.
create function public.patch_transport_records(p_changes jsonb) returns integer
language plpgsql security invoker set search_path=public as $$
declare org uuid:=public.current_staff_organization_id(); item jsonb; prior public.transportation_routes; data jsonb; site uuid; changed integer:=0;
begin
 if auth.uid() is null or org is null then raise exception 'Active staff required';end if;
 if p_changes is null or jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes)>500 then raise exception 'Invalid transportation changes';end if;
 for item in select value from jsonb_array_elements(p_changes) order by value->>'id' loop
  if jsonb_typeof(item->'before') is distinct from 'object' or jsonb_typeof(item->'after') is distinct from 'object' or coalesce(item->>'id','')='' then raise exception 'Invalid trip record';end if;
  select * into prior from public.transportation_routes where organization_id=org and legacy_id=item->>'id' for update;
  if not found then raise exception 'This trip is no longer available. Refresh transportation';end if;
  data:=item->'after';
  if prior.record_data=data then continue;end if;
  if prior.record_data is distinct from item->'before' then raise exception 'This trip changed on another screen. Refresh transportation and review it before trying again';end if;
  if data->>'id' is distinct from prior.legacy_id or data->>'childId' is distinct from prior.record_data->>'childId' then raise exception 'Use school trip setup to change a linked child';end if;
  site:=public.resolve_tcs_location_id(data->>'location',org);
  if site is null then raise exception 'Choose a valid care location';end if;
  update public.transportation_routes set location_id=site,child_name=data->>'child',school_name=data->>'school',driver_name=data->>'driver',vehicle_name=data->>'vehicle',route_status=coalesce(data->>'status','Needs Review'),record_data=data
  where id=prior.id and organization_id=org;
  if not found then raise exception 'You cannot change this trip';end if;
  changed:=changed+1;
 end loop;
 return changed;
end $$;
revoke all on function public.patch_transport_records(jsonb) from public,anon;
grant execute on function public.patch_transport_records(jsonb) to authenticated;
