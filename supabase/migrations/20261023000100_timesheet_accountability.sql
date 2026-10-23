-- Deploy before the matching application release. No existing paperwork or history is deleted.
-- The app's verified command handlers are the only operational write path.
revoke insert, update, delete, truncate, references, trigger on public.timesheets, public.timesheet_submission_routes from anon, authenticated;

create or replace function public.guard_timesheet_controlled_write()
returns trigger language plpgsql security invoker set search_path=public as $$
declare r jsonb;
begin
  -- Also blocks legacy SECURITY DEFINER collection-import paths with an end-user JWT.
  if current_user in ('anon','authenticated') or
    coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' in ('anon','authenticated') then
    raise exception 'Use the controlled Timesheet Command Center';
  end if;
  r := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_table_name='timesheets' then
    -- Inserts, reclassification and batch commits share the same lock: no phantom members.
    perform pg_advisory_xact_lock(hashtextextended(concat(r->>'organization_id','/',r->>'location_id','/',r->>'service_period'),0));
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists timesheets_controlled_writes on public.timesheets;
create trigger timesheets_controlled_writes before insert or update or delete on public.timesheets for each row execute function public.guard_timesheet_controlled_write();
drop trigger if exists timesheet_routes_controlled_writes on public.timesheet_submission_routes;
create trigger timesheet_routes_controlled_writes before insert or update or delete on public.timesheet_submission_routes for each row execute function public.guard_timesheet_controlled_write();

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

create or replace function public.record_timesheet_controlled_action(
  p_organization_id uuid,p_row_id uuid,p_actor_id uuid,p_expected_updated_at timestamptz,
  p_action text,p_record jsonb,p_funding_source text,p_stage text
) returns void language plpgsql security invoker set search_path=public as $$
declare r public.timesheets;
begin
  select * into r from public.timesheets where id=p_row_id and organization_id=p_organization_id;
  if not found or not public.timesheet_actor_can(p_actor_id,p_organization_id,r.location_id,p_action) then raise exception 'Unauthorized timesheet action'; end if;
  perform pg_advisory_xact_lock(hashtextextended(concat(p_organization_id,'/',r.location_id,'/',r.service_period),0));
  select * into r from public.timesheets where id=p_row_id and organization_id=p_organization_id for update;
  if not found or r.updated_at is distinct from p_expected_updated_at then raise exception 'Timesheet changed'; end if;
  update public.timesheets set record_data=p_record,workflow_stage=p_stage,funding_source=p_funding_source,updated_by=p_actor_id,updated_at=clock_timestamp() where id=r.id;
  insert into public.audit_log(organization_id,location_id,actor_user_id,action,table_name,row_id,metadata)
    values(p_organization_id,r.location_id,p_actor_id,'REVIEW','timesheets',r.id,jsonb_build_object('command_action',p_action,'before',r.record_data,'after',p_record));
end $$;
revoke all on function public.record_timesheet_controlled_action(uuid,uuid,uuid,timestamptz,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.record_timesheet_controlled_action(uuid,uuid,uuid,timestamptz,text,jsonb,text,text) to service_role;

create or replace function public.record_timesheet_controlled_batch(
  p_organization_id uuid,p_location_id uuid,p_service_period text,p_type text,p_actor_id uuid,
  p_action text,p_batch_id uuid,p_updates jsonb,p_route_id uuid,p_route_updated_at timestamptz
) returns integer language plpgsql security invoker set search_path=public as $$
declare item jsonb; r public.timesheets; route public.timesheet_submission_routes; n integer; next_data jsonb; proof_field text; proof_type text;
begin
  if p_action not in ('scanBatch','approveBatch','emailBatch','verifyBatch','receiptBatch','flagBatch','reopenBatch','setDeadline') or
     (p_type not in ('CCRC Stage 1','CCRC Stage 2','CCCC','DCFS','Respite') and not (p_type='CCRC' and p_action in ('flagBatch','reopenBatch','setDeadline'))) or
     jsonb_typeof(p_updates)<>'array' or jsonb_array_length(p_updates)=0 or
     not public.timesheet_actor_can(p_actor_id,p_organization_id,p_location_id,p_action) then raise exception 'Unauthorized or invalid batch'; end if;
  if p_action in ('approveBatch','emailBatch') then
    select * into route from public.timesheet_submission_routes where id=p_route_id and organization_id=p_organization_id and location_id=p_location_id and funding_source=p_type for share;
    if not found or route.updated_at is distinct from p_route_updated_at or coalesce((route.record_data->>'routingVerified')::boolean,false)=false then raise exception 'Route changed or is not verified'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(concat(p_organization_id,'/',p_location_id,'/',p_service_period),0));
  perform 1 from public.timesheets where organization_id=p_organization_id and location_id=p_location_id and service_period=p_service_period for update;
  select count(*) into n from public.timesheets where organization_id=p_organization_id and location_id=p_location_id and service_period=p_service_period
    and coalesce(record_data->>'timesheetType',record_data->>'fundingSource',funding_source)=p_type;
  if n<>jsonb_array_length(p_updates) or (select count(distinct value->>'id') from jsonb_array_elements(p_updates))<>n then raise exception 'Batch membership changed'; end if;
  for item in select value from jsonb_array_elements(p_updates) loop
    select * into r from public.timesheets where id=(item->>'id')::uuid and organization_id=p_organization_id and location_id=p_location_id and service_period=p_service_period;
    if not found or r.updated_at is distinct from (item->>'expected_updated_at')::timestamptz or coalesce(r.record_data->>'timesheetType',r.record_data->>'fundingSource',r.funding_source)<>p_type then raise exception 'Batch record changed'; end if;
    next_data:=item->'record_data';
    if p_action='verifyBatch' and r.record_data->>'emailedByUserId'=p_actor_id::text then raise exception 'Sender cannot verify their own submission'; end if;
    if p_action='emailBatch' and (nullif(r.record_data->>'licenseeApprovalFingerprint','') is null or lower(next_data->>'departmentEmail')<>lower(route.department_email)) then raise exception 'Approval or recipient mismatch'; end if;
    proof_field:=case p_action when 'scanBatch' then 'scanDocumentId' when 'emailBatch' then 'emailEvidenceDocumentId' when 'receiptBatch' then 'receiptDocumentId' else null end;
    proof_type:=case p_action when 'scanBatch' then 'Timesheet Batch Scan' when 'emailBatch' then 'Timesheet Sent Email Proof' when 'receiptBatch' then 'Timesheet Agency Receipt' else null end;
    if proof_field is not null and not exists(select 1 from public.document_records where id=nullif(next_data->>proof_field,'')::uuid and organization_id=p_organization_id and location_id=p_location_id and document_type=proof_type and status='Active') then raise exception 'Invalid submission evidence'; end if;
    if p_action='reopenBatch' then
      next_data:=next_data || jsonb_build_object('submissionHistory',coalesce(r.record_data->'submissionHistory','[]'::jsonb)||jsonb_build_array(jsonb_build_object('reopenedAt',clock_timestamp(),'reopenedBy',p_actor_id,'previous',r.record_data-'submissionHistory')));
    end if;
    update public.timesheets set record_data=next_data,workflow_stage=item->>'workflow_stage',updated_by=p_actor_id,updated_at=clock_timestamp() where id=r.id;
    insert into public.audit_log(organization_id,location_id,actor_user_id,action,table_name,row_id,metadata)
      values(p_organization_id,p_location_id,p_actor_id,'REVIEW','timesheets',r.id,jsonb_build_object('command_action',p_action,'batch_id',p_batch_id,'before',r.record_data,'after',next_data));
  end loop;
  return n;
end $$;
revoke all on function public.record_timesheet_controlled_batch(uuid,uuid,text,text,uuid,text,uuid,jsonb,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.record_timesheet_controlled_batch(uuid,uuid,text,text,uuid,text,uuid,jsonb,uuid,timestamptz) to service_role;

-- End-user access to the old RPC stays blocked. Retain the existing service-role
-- grant while the current server drains requests during deployment.
revoke all on function public.record_timesheet_submission_batch(uuid,uuid,text,text,uuid,text,uuid,jsonb) from public,anon,authenticated;
-- Notify PostgREST after the transaction commits.
notify pgrst, 'reload schema';
