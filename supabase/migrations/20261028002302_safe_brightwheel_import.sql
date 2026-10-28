-- Installation changes no child, family, staff or assignment records.
-- Only the authenticated server may invoke this transaction after preview/review.
create or replace function public.hub_import_brightwheel_roster(
  p_actor uuid, p_organization uuid, p_snapshot jsonb, p_rows jsonb
) returns jsonb language plpgsql security invoker
set search_path = public, pg_temp
set lock_timeout = '3s'
as $$
declare
  staff public.staff_access%rowtype;
  owner_access boolean;
  permitted uuid[];
  item jsonb;
  payload jsonb;
  target uuid;
  destination uuid;
  inserted_count integer := 0;
  updated_count integer := 0;
  affected integer;
begin
  if current_user <> 'service_role' then raise exception 'Server access required' using errcode='42501'; end if;
  if jsonb_typeof(p_snapshot) is distinct from 'array' or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 1000 then
    raise exception 'Invalid import batch' using errcode='22023';
  end if;
  select * into staff from public.staff_access where user_id=p_actor and organization_id=p_organization and is_active for share;
  if not found then raise exception 'Active staff access required' using errcode='42501'; end if;
  owner_access := lower(trim(staff.role)) = any(array['owner / admin','owner/admin','owner / director','administrator','admin','director','corporate / admin','corporate admin','operations admin']);
  if not owner_access and lower(trim(staff.role)) <> all(array['location licensee','licensee','licensee/admin','licensee / admin']) then
    raise exception 'Roster import access required' using errcode='42501';
  end if;
  select array_agg(l.id) into permitted from public.locations l where l.organization_id=p_organization and l.is_active and
    (owner_access or exists(select 1 from public.staff_location_assignments a where a.user_id=p_actor and a.location_id=l.id));
  -- Serialize the short save transaction with every child writer, including manual
  -- edits. A snapshot check inside this lock closes the preview/save race; no new
  -- uniqueness rule is imposed on real families who may legitimately share names.
  lock table public.children in share row exclusive mode;
  if (select count(*) from public.children where organization_id=p_organization and location_id=any(permitted)) <> jsonb_array_length(p_snapshot)
    or exists(select 1 from public.children c where c.organization_id=p_organization and c.location_id=any(permitted) and not exists(
      select 1 from jsonb_array_elements(p_snapshot) s where (s->>'id')::uuid=c.id and (s->>'updatedAt')::timestamptz=c.updated_at
    )) then
    raise exception 'Roster changed; refresh preview' using errcode='40001';
  end if;
  if exists(select 1 from jsonb_array_elements(p_rows) x where nullif(x->>'targetId','') is not null group by x->>'targetId' having count(*)>1) then
    raise exception 'Repeated update target' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    payload := item->'payload'; target := nullif(item->>'targetId','')::uuid;
    destination := (payload->>'location_id')::uuid;
    if permitted is null or destination is null or not(destination=any(permitted)) then raise exception 'Location access required' using errcode='42501'; end if;
    if coalesce(payload->>'first_name','')='' or coalesce(payload->>'last_name','')='' or coalesce(payload->>'legacy_id','')='' or nullif(payload->>'date_of_birth','') is null
      or payload->>'enrollment_status' <> all(array['Active','Pending','Archived']) then raise exception 'Missing child details' using errcode='22023'; end if;
    if target is null then
      insert into public.children(organization_id,location_id,legacy_id,first_name,last_name,date_of_birth,age_group,enrollment_status,attendance_status,guardian_name,record_data,created_by,updated_by)
      values(p_organization,destination,payload->>'legacy_id',payload->>'first_name',payload->>'last_name',(payload->>'date_of_birth')::date,payload->>'age_group',payload->>'enrollment_status',payload->>'attendance_status',payload->>'guardian_name',payload->'record_data',p_actor,p_actor);
      inserted_count := inserted_count+1;
    else
      update public.children set location_id=destination, first_name=payload->>'first_name',last_name=payload->>'last_name',date_of_birth=(payload->>'date_of_birth')::date,
        age_group=payload->>'age_group',enrollment_status=payload->>'enrollment_status',guardian_name=payload->>'guardian_name',record_data=payload->'record_data',updated_by=p_actor
      where id=target and organization_id=p_organization and location_id=any(permitted) and legacy_id=payload->>'legacy_id';
      get diagnostics affected = row_count;
      if affected<>1 then raise exception 'Roster changed; refresh preview' using errcode='40001'; end if;
      updated_count := updated_count+1;
    end if;
  end loop;
  insert into public.audit_log(organization_id,actor_user_id,action,table_name,row_id,metadata)
    values(p_organization,p_actor,'INSERT','children',null,jsonb_build_object('kind','brightwheel_roster_import','inserted',inserted_count,'updated',updated_count,'parentInvitationsSent',0));
  return jsonb_build_object('inserted',inserted_count,'updated',updated_count);
end;
$$;
revoke all on function public.hub_import_brightwheel_roster(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.hub_import_brightwheel_roster(uuid,uuid,jsonb,jsonb) to service_role;
