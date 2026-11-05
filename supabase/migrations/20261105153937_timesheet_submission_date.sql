-- Log an external submission independently of optional evidence or later review.
create function public.log_timesheet_submission(p_org uuid,p_actor uuid,p_site uuid,p_period text,p_type text,
  p_expected jsonb,p_date date,p_email text,p_email_only boolean) returns integer
language plpgsql security invoker set search_path=public as $$
declare r public.timesheets%rowtype; site_slug text; actor_name text; batch uuid:=gen_random_uuid(); n int:=0; total int; v jsonb; stage text;
begin
 if not public.timesheet_actor_can(p_actor,p_org,p_site,'emailBatch') or not public.timesheet_policy_applies(p_period)
    or p_type not in ('CCCC','CCRC Stage 1','CCRC Stage 2','DCFS','Respite') then raise exception 'Unauthorized timesheet batch'; end if;
 if p_email is not null and (length(p_email)>254 or p_email !~ '^[^[:space:]@,;]+@[^[:space:]@,;]+\.[^[:space:]@,;]+$') then raise exception 'Enter a valid optional email'; end if;
 if not p_email_only and (p_date is null or p_date>(now() at time zone 'America/Los_Angeles')::date) then raise exception 'Choose a submission date through today'; end if;
 select slug into strict site_slug from public.locations where id=p_site and organization_id=p_org;
 select full_name into strict actor_name from public.staff_access where user_id=p_actor and organization_id=p_org;
 perform pg_advisory_xact_lock(hashtextextended(concat(p_org,'/',p_site,'/',p_period),0));
 select count(distinct x->>'id') into total from jsonb_array_elements(p_expected) x;
 if total=0 or total<>jsonb_array_length(p_expected) then raise exception 'Refresh the batch'; end if;
 for r in select * from public.timesheets where organization_id=p_org and location_id=p_site and service_period=p_period
    and coalesce(record_data->>'timesheetType',record_data->>'fundingSource',funding_source)=p_type order by id for update loop
   if not exists(select 1 from jsonb_array_elements(p_expected) x where (x->>'id')::uuid=r.id and (x->>'updatedAt')::timestamptz=r.updated_at)
     or (r.record_data->>'submissionIssue') is not null then raise exception 'Refresh the batch or resolve its correction first';end if;
   v:=r.record_data;stage:=r.workflow_stage;
   if p_email_only then
     if nullif(v->>'emailedAt','') is null then raise exception 'Record the submission first'; end if;
     v:=v||jsonb_build_object('departmentEmail',coalesce(p_email,''));
   elsif nullif(v->>'emailedAt','') is null then
     stage:=case when site_slug='tehachapi' then 'Complete' else 'Licensee Verification' end;
     v:=v||jsonb_build_object('submittedOn',p_date,'emailedAt',p_date,'emailRecordedAt',now(),'emailedBy',actor_name,'emailedByUserId',p_actor,
       'submissionControlVersion',3,'submissionRecordedExternally',true,'workflowOwner',case when site_slug='tehachapi' then 'Jennifer' else 'Danielle' end,
       'workflowReviewer',case when site_slug='tehachapi' then '' else 'Jennifer' end,'departmentEmail',coalesce(p_email,''),'emailBatchId',batch,'stage',stage);
   else
     n:=n+1;continue; -- Preserve previously submitted forms in a mixed batch.
   end if;
   update public.timesheets set record_data=v,workflow_stage=stage,updated_by=p_actor,updated_at=clock_timestamp() where id=r.id;
   insert into public.audit_log(organization_id,location_id,actor_user_id,action,table_name,row_id,metadata)
     values(p_org,p_site,p_actor,'REVIEW','timesheets',r.id,jsonb_build_object('command_action',case when p_email_only then 'editSubmissionEmail' else 'logSubmissionDate' end,'batch_id',batch,'before',r.record_data,'after',v));
   n:=n+1;
 end loop;
 if n<>total then raise exception 'Batch membership changed';end if;
 return n;
end $$;
revoke all on function public.log_timesheet_submission(uuid,uuid,uuid,text,text,jsonb,date,text,boolean) from public,anon,authenticated;
grant execute on function public.log_timesheet_submission(uuid,uuid,uuid,text,text,jsonb,date,text,boolean) to service_role;
