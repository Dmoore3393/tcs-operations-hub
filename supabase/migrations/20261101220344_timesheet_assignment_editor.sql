-- Authorized Timesheets editor; preserves other months and all unrelated child fields.
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
  if changed and (nullif(r.record_data->>'scanDocumentId','') is not null or nullif(r.record_data->>'emailedAt','') is not null or nullif(r.record_data->>'emailedByJenniferAt','') is not null or nullif(r.record_data->>'licenseeApprovalFingerprint','') is not null or r.workflow_stage='Complete') then raise exception 'Reopen the submitted batch first'; end if;
  next_data:=coalesce(r.record_data,'{}'::jsonb)||jsonb_build_object('location',coalesce(funding.full_name,funding.name),'careLocation',coalesce(care.full_name,care.name),'careLocationId',p_care,'fundingLocationId',p_funding,'timesheetType',p_type,'fundingSource',p_type,'updatedAt',clock_timestamp());
  if changed then
   next_data:=next_data||jsonb_build_object('certificateVerified',false,'completedAt','','completedBy','','department','','departmentEmail','','approvedRouteRevision','','licenseeApprovalFingerprint','','licenseeApprovedAt','');
   next_data:=next_data||jsonb_build_object('stage',case when nullif(next_data->>'directReviewAt','') is not null or nullif(next_data->>'dynastyHandedToDanielleAt','') is not null then 'Danielle Fill Out' else 'Location Sign-Off' end);
  end if;
  if public.timesheet_policy_applies(r.service_period) then
   service_month:=to_date('01 '||r.service_period,'DD FMMonth YYYY');
   due:=case when p_type in ('CCRC Stage 1','CCCC','DCFS') then to_char(service_month+interval '1 month','YYYY-MM-DD') when p_type='CCRC Stage 2' then to_char(service_month+interval '1 month 4 days','YYYY-MM-DD') when p_type='Respite' and r.funding_source='Respite' then coalesce(next_data->>'submissionDueDate','') else '' end;
   next_data:=next_data||jsonb_build_object('submissionControlVersion',3,'workflowOwner','Danielle','workflowReviewer','Jennifer','submissionDueDate',due);
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
