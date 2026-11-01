create or replace function public.timesheet_policy_applies(p_period text)
returns boolean language plpgsql immutable security invoker set search_path=public as $$
declare service_month date;
begin
 service_month:=to_date('01 '||p_period,'DD FMMonth YYYY');
 return to_char(service_month,'FMMonth YYYY')=p_period and service_month>=date '2026-10-01';
exception when others then return false;
end $$;
revoke all on function public.timesheet_policy_applies(text) from public,anon,authenticated;
grant execute on function public.timesheet_policy_applies(text) to service_role;
-- Responsibility changes are authorized by TCS: Danielle processes, Jennifer reviews.
create or replace function public.timesheet_actor_can(p_actor uuid,p_org uuid,p_location uuid,p_action text)
returns boolean language plpgsql stable security invoker set search_path=public as $$
declare n text; r text;
begin
  select lower(trim(full_name)),lower(trim(role)) into n,r from public.staff_access where user_id=p_actor and organization_id=p_org and is_active;
  if not found or r not in ('owner / admin','owner/admin','owner / director','administrator','admin','director','corporate / admin','corporate admin','operations admin') then return false; end if;
  if not exists(select 1 from public.locations where id=p_location and organization_id=p_org and is_active) then return false; end if;
  return case
    when p_action in ('DANIELLE_DIRECT_INTAKE','FORM_SIGNED','SIGNATURE_UNCHECKED','TIMESHEET_FILLED_FROM_CERTIFICATE','scanBatch','emailBatch','SET_TYPE','approveBatch') then n='danielle moore'
    when p_action='verifyBatch' then n='jennifer thomason'
    when p_action in ('setDeadline','reopenBatch','receiptBatch','flagBatch') then n in ('danielle moore','jennifer thomason')
    else false end;
end $$;
revoke all on function public.timesheet_actor_can(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.timesheet_actor_can(uuid,uuid,uuid,text) to service_role;

create or replace function public.record_timesheet_controlled_batch(
  p_organization_id uuid,p_location_id uuid,p_service_period text,p_type text,p_actor_id uuid,
  p_action text,p_batch_id uuid,p_updates jsonb,p_route_id uuid,p_route_updated_at timestamptz
) returns integer language plpgsql security invoker set search_path=public as $$
declare item jsonb; r public.timesheets; route public.timesheet_submission_routes; n integer; next_data jsonb; proof_field text; proof_type text; current_workflow boolean;
begin
  current_workflow := public.timesheet_policy_applies(p_service_period);
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
    if p_action='emailBatch' and ((not current_workflow and nullif(r.record_data->>'licenseeApprovalFingerprint','') is null) or lower(next_data->>'departmentEmail')<>lower(route.department_email)) then raise exception 'Approval or recipient mismatch'; end if;
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


-- Atomic inbox append: preserve other notifications and deduplicate scheduled scans.
create or replace function public.append_timesheet_alert(p_org uuid,p_user uuid,p_event_key text,p_notification jsonb,p_seed_inbox jsonb default '[]'::jsonb,p_seed_preferences jsonb default '{}'::jsonb)
returns boolean language plpgsql security invoker set search_path=public as $$
declare current_inbox jsonb; prefs jsonb; next_inbox jsonb;
begin
  if current_user<>'service_role' then raise exception 'Server access required'; end if;
  if p_event_key not like 'timesheet-alert:%' or p_notification->>'eventKey' is distinct from p_event_key or p_notification->>'href' is distinct from '/timesheets' then raise exception 'Invalid timesheet notification'; end if;
  if not exists(select 1 from public.staff_access where user_id=p_user and organization_id=p_org and is_active and lower(trim(full_name)) in ('danielle moore','jennifer thomason') and lower(trim(role)) in ('owner / admin','owner/admin')) then raise exception 'Timesheet leadership recipient required'; end if;
  insert into public.user_notification_state(user_id,inbox,preferences) values(p_user,case when jsonb_typeof(p_seed_inbox)='array' then p_seed_inbox else '[]'::jsonb end,case when jsonb_typeof(p_seed_preferences)='object' then p_seed_preferences else '{}'::jsonb end) on conflict(user_id) do nothing;
  select inbox,preferences into current_inbox,prefs from public.user_notification_state where user_id=p_user for update;
  if exists(select 1 from jsonb_array_elements(current_inbox) item where item->>'eventKey'=p_event_key) then return false; end if;
  select coalesce(jsonb_agg(item order by position),'[]'::jsonb) into next_inbox from jsonb_array_elements(jsonb_build_array(p_notification)||current_inbox) with ordinality as entries(item,position) where position<=100;
  update public.user_notification_state set inbox=next_inbox,updated_at=now() where user_id=p_user;
  return true;
end $$;
revoke all on function public.append_timesheet_alert(uuid,uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.append_timesheet_alert(uuid,uuid,text,jsonb,jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';
