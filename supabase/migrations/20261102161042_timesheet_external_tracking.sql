-- Track external scanning/email without creating documents or altering completion facts.
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
    if proof_field is not null then
      if current_workflow and coalesce(next_data->(case p_action when 'scanBatch' then 'scanRecordedExternally' when 'emailBatch' then 'submissionRecordedExternally' else 'receiptRecordedExternally' end),'false'::jsonb)='true'::jsonb then
        if p_action='scanBatch' and (nullif(next_data->>'scannedAt','') is null or next_data->>'scanRecordedByUserId' is distinct from p_actor_id::text or next_data->'scanQualityChecked' is distinct from 'true'::jsonb or nullif(next_data->>'completedAt','') is null) then raise exception 'Confirm external scanning with actor, completion and timestamp';end if;
        if p_action='emailBatch' and (nullif(next_data->>'scannedAt','') is null or nullif(next_data->>'emailedAt','') is null or (next_data->>'emailedAt')::timestamptz>now()+interval '2 minutes' or next_data->>'emailedByUserId' is distinct from p_actor_id::text or next_data->'attachmentConfirmed' is distinct from 'true'::jsonb or lower(coalesce(next_data->>'departmentEmail','')) is distinct from lower(route.department_email)) then raise exception 'Confirm external submission with the correct recipient, attachments, actor and timestamp';end if;
        if p_action='receiptBatch' and (length(coalesce(next_data->>'agencyReceiptReference',''))<3 or nullif(next_data->>'agencyReceiptAt','') is null or next_data->>'agencyReceiptByUserId' is distinct from p_actor_id::text) then raise exception 'Confirm external agency acknowledgment with reference and actor';end if;
      elsif not exists(select 1 from public.document_records where id=nullif(next_data->>proof_field,'')::uuid and organization_id=p_organization_id and location_id=p_location_id and document_type=proof_type and status='Active') then raise exception 'Invalid submission evidence';end if;
    end if;
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



create or replace function public.change_timesheet_assignment(
 p_org uuid,p_actor uuid,p_row uuid,p_expected_form timestamptz,p_expected_child timestamptz,
 p_care uuid,p_funding uuid,p_type text,p_scope text
) returns void language plpgsql security invoker set search_path=public as $$
declare r public.timesheets; c public.children; care public.locations; funding public.locations;
 next_data jsonb; child_data jsonb; changed boolean; lock_id uuid; due text; service_month date;
begin
 if coalesce(p_scope,'') not in ('both','form','profile') or
    (coalesce(p_type,'') not in ('CCRC Stage 1','CCRC Stage 2','CCCC','DCFS','Respite') and not (p_scope='profile' and p_type='Cash Pay')) then raise exception 'Invalid assignment'; end if;
 select * into r from public.timesheets where id=p_row and organization_id=p_org;
 if not found or not public.timesheet_actor_can(p_actor,p_org,r.location_id,'SET_TYPE') then raise exception 'Unauthorized assignment'; end if;
 select * into care from public.locations where id=p_care and organization_id=p_org and is_active;
 if not found then raise exception 'Invalid care location'; end if;
 select * into funding from public.locations where id=p_funding and organization_id=p_org and is_active;
 if not found then raise exception 'Invalid funding location'; end if;
 -- Coordinate both affected batches with submission writes, in deterministic order.
 for lock_id in select distinct value from unnest(array[r.location_id,p_funding]) value order by value loop
  perform pg_advisory_xact_lock(hashtextextended(concat(p_org,'/',lock_id,'/',r.service_period),0));
 end loop;
 select * into r from public.timesheets where id=p_row and organization_id=p_org for update;
 if not found or r.updated_at is distinct from p_expected_form then raise exception 'Timesheet changed'; end if;
 select * into c from public.children where id=r.child_id and organization_id=p_org for update;
 if not found or c.updated_at is distinct from p_expected_child then raise exception 'Child changed'; end if;
 changed:=r.location_id is distinct from p_funding or r.funding_source is distinct from p_type or coalesce(nullif(r.record_data->>'careLocationId','')::uuid,c.location_id) is distinct from p_care;
 if p_scope in ('both','form') then
  if changed and (nullif(r.record_data->>'scanDocumentId','') is not null or nullif(r.record_data->>'scannedAt','') is not null or nullif(r.record_data->>'emailedAt','') is not null or nullif(r.record_data->>'emailedByJenniferAt','') is not null or nullif(r.record_data->>'licenseeApprovalFingerprint','') is not null or r.workflow_stage='Complete') then raise exception 'Reopen the submitted batch first'; end if;
  next_data:=coalesce(r.record_data,'{}'::jsonb)||jsonb_build_object('location',coalesce(funding.full_name,funding.name),'careLocation',coalesce(care.full_name,care.name),'careLocationId',p_care,'fundingLocationId',p_funding,'timesheetType',p_type,'fundingSource',p_type,'updatedAt',clock_timestamp());
  if changed then
   next_data:=next_data||jsonb_build_object('certificateVerified',false,'completedAt','','completedBy','','department','','departmentEmail','','approvedRouteRevision','','licenseeApprovalFingerprint','','licenseeApprovedAt','');
   next_data:=next_data||jsonb_build_object('stage',case when nullif(next_data->>'directReviewAt','') is not null or nullif(next_data->>'dynastyHandedToDanielleAt','') is not null then 'Danielle Fill Out' else 'Location Sign-Off' end);
  end if;
  if public.timesheet_policy_applies(r.service_period) then
   service_month:=to_date('01 '||r.service_period,'DD FMMonth YYYY');
   due:=case when p_type in ('CCRC Stage 1','CCCC','DCFS') then to_char(service_month+interval '1 month','YYYY-MM-DD') when p_type='CCRC Stage 2' then to_char(service_month+interval '1 month 4 days','YYYY-MM-DD') when p_type='Respite' and r.funding_source='Respite' then coalesce(next_data->>'submissionDueDate','') else '' end;
   next_data:=next_data||jsonb_build_object('submissionControlVersion',3,'workflowOwner',case when funding.slug='tehachapi' then 'Jennifer' else 'Danielle' end,'workflowReviewer',case when funding.slug='tehachapi' then '' else 'Jennifer' end,'submissionDueDate',due);
  end if;
  update public.timesheets set location_id=p_funding,funding_source=p_type,record_data=next_data,workflow_stage=coalesce(next_data->>'stage',r.workflow_stage),updated_by=p_actor,updated_at=clock_timestamp() where id=r.id;
  insert into public.audit_log(organization_id,location_id,actor_user_id,action,table_name,row_id,metadata) values(p_org,p_funding,p_actor,'UPDATE','timesheets',r.id,jsonb_build_object('command_action','CHANGE_ASSIGNMENT','scope',p_scope,'before',jsonb_build_object('location_id',r.location_id,'record_data',r.record_data),'after',jsonb_build_object('location_id',p_funding,'record_data',next_data)));
 end if;
 if p_scope in ('both','profile') then
  child_data:=coalesce(c.record_data,'{}'::jsonb)||jsonb_build_object('location',coalesce(care.full_name,care.name),'attendanceLocation',coalesce(care.full_name,care.name),'attendanceLocationId',p_care,'attendanceLocationSource','Timesheets assignment editor','subsidy',p_type,'fundingLocation',coalesce(funding.full_name,funding.name),'fundingLocationId',p_funding);
  update public.children set location_id=p_care,record_data=child_data,updated_at=clock_timestamp() where id=c.id;
  insert into public.audit_log(organization_id,location_id,actor_user_id,action,table_name,row_id,metadata) values(p_org,p_care,p_actor,'UPDATE','children',c.id,jsonb_build_object('command_action','TIMESHEET_ASSIGNMENT_PROFILE','before',jsonb_build_object('location_id',c.location_id,'record_data',c.record_data),'after',jsonb_build_object('location_id',p_care,'record_data',child_data)));
 end if;
end $$;
revoke all on function public.change_timesheet_assignment(uuid,uuid,uuid,timestamptz,timestamptz,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.change_timesheet_assignment(uuid,uuid,uuid,timestamptz,timestamptz,uuid,uuid,text,text) to service_role;
