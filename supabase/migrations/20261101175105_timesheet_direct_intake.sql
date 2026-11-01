create or replace function public.timesheet_actor_can(p_actor uuid,p_org uuid,p_location uuid,p_action text)
returns boolean language plpgsql stable security invoker set search_path=public as $$
declare s public.staff_access; loc text; n text; owner_access boolean; collector boolean;
begin
  select * into s from public.staff_access where user_id=p_actor and organization_id=p_org and is_active;
  if not found then return false; end if;
  owner_access := lower(trim(s.role)) in ('owner / admin','owner/admin','owner / director','administrator','admin','director','corporate / admin','corporate admin','operations admin');
  if not owner_access and lower(trim(s.role)) not in ('location licensee','licensee','licensee/admin','licensee / admin') then return false; end if;
  select slug into loc from public.locations where id=p_location and organization_id=p_org and is_active;
  if not found then return false; end if;
  n := lower(s.full_name);
  collector := case loc
    when '33rd-street' then n ~ '\mnathaly\M'
    when '42nd-street' then n ~ '\mdynasty\M'
    when 'halcom' then n ~ '\mlatrice\M'
    when 'division' then n ~ '\mdanielle\M'
    when 'tehachapi' then n ~ '\m(jennifer|jen|noah)\M'
    when '21st-street' then n ~ '\mheather\M' else false end;
  collector := collector and (owner_access or exists(select 1 from public.staff_location_assignments where user_id=p_actor and organization_id=p_org and location_id=p_location));
  return case
    when p_action='DANIELLE_DIRECT_INTAKE' then owner_access and n ~ '\mdanielle\M'
    when p_action in ('approveBatch','verifyBatch','FORM_SIGNED','SIGNATURE_UNCHECKED') then collector
    when p_action in ('scanBatch','TIMESHEET_FILLED_FROM_CERTIFICATE') then n ~ '\mdanielle\M'
    when p_action='emailBatch' then n ~ '\m(jennifer|jen)\M'
    when p_action in ('DYNASTY_ACCOUNTED','DYNASTY_CORRECTION','PERSONAL_HANDOFF_TO_DANIELLE') then n ~ '\mdynasty\M'
    when p_action='SET_TYPE' then collector or n ~ '\m(dynasty|danielle|jennifer|jen)\M'
    when p_action in ('setDeadline','reopenBatch','receiptBatch') then owner_access or n ~ '\m(danielle|jennifer|jen)\M'
    when p_action='flagBatch' then collector or owner_access or n ~ '\m(dynasty|danielle|jennifer|jen|anthony|tony)\M'
    else false end;
end $$;
revoke all on function public.timesheet_actor_can(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.timesheet_actor_can(uuid,uuid,uuid,text) to service_role;

