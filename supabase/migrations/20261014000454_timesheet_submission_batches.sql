-- Atomic, server-only recording of a complete location/program/month batch.
create or replace function public.record_timesheet_submission_batch(
  p_organization_id uuid, p_location_id uuid, p_service_period text, p_type text,
  p_actor_id uuid, p_action text, p_batch_id uuid, p_updates jsonb
) returns integer language plpgsql security invoker set search_path = public as $$
declare
  item jsonb;
  current_row public.timesheets;
  total integer := 0;
  group_count integer;
begin
  if p_action not in ('scanBatch', 'emailBatch') or p_type not in ('CCRC Stage 1','CCRC Stage 2','CCCC','DCFS','Respite')
     or jsonb_typeof(p_updates) <> 'array' or jsonb_array_length(p_updates) = 0 then
    raise exception 'Invalid batch';
  end if;
  if not exists (select 1 from public.staff_access where user_id=p_actor_id and organization_id=p_organization_id and is_active
    and case when p_action='scanBatch' then lower(full_name) ~ '\mdanielle\M' else lower(full_name) ~ '\m(jennifer|jen)\M' end) then
    raise exception 'Unauthorized batch actor';
  end if;
  -- Serializes membership and state validation with other batch submissions.
  perform pg_advisory_xact_lock(hashtextextended(concat(p_organization_id,p_location_id,p_service_period,p_type),0));
  perform 1 from public.timesheets where organization_id=p_organization_id and location_id=p_location_id and service_period=p_service_period for update;
  select count(*) into group_count from public.timesheets
  where organization_id=p_organization_id and location_id=p_location_id and service_period=p_service_period
    and case
      when lower(coalesce(record_data->>'timesheetType',record_data->>'fundingSource',funding_source)) in ('ccrc1','ccrc 1') or lower(coalesce(record_data->>'timesheetType',record_data->>'fundingSource',funding_source)) like '%ccrc%stage%1%' then 'CCRC Stage 1'
      when lower(coalesce(record_data->>'timesheetType',record_data->>'fundingSource',funding_source)) in ('ccrc2','ccrc 2') or lower(coalesce(record_data->>'timesheetType',record_data->>'fundingSource',funding_source)) like '%ccrc%stage%2%' then 'CCRC Stage 2'
      when lower(coalesce(record_data->>'timesheetType',record_data->>'fundingSource',funding_source)) = 'cccc' then 'CCCC'
      when lower(coalesce(record_data->>'timesheetType',record_data->>'fundingSource',funding_source)) = 'dcfs' then 'DCFS'
      when lower(coalesce(record_data->>'timesheetType',record_data->>'fundingSource',funding_source)) like '%respite%' then 'Respite'
      else 'CCRC' end = p_type;
  if group_count <> jsonb_array_length(p_updates) or (select count(distinct value->>'id') from jsonb_array_elements(p_updates)) <> group_count then
    raise exception 'Batch membership changed';
  end if;
  for item in select value from jsonb_array_elements(p_updates) loop
    select * into current_row from public.timesheets where id=(item->>'id')::uuid and organization_id=p_organization_id and location_id=p_location_id and service_period=p_service_period;
    if not found or current_row.updated_at is distinct from (item->>'expected_updated_at')::timestamptz then
      raise exception 'Batch record changed';
    end if;
    if coalesce(current_row.record_data->>'timesheetType',current_row.record_data->>'fundingSource',current_row.funding_source) <> p_type then
      -- API provides canonical types; reject ambiguous legacy forms until classified.
      raise exception 'Batch type mismatch; classify before submitting';
    end if;
    if coalesce((item->>'changed')::boolean,false) then
      update public.timesheets set record_data=item->'record_data',workflow_stage=item->>'workflow_stage',updated_by=p_actor_id,updated_at=now() where id=current_row.id;
      insert into public.audit_log(organization_id,location_id,actor_user_id,action,table_name,row_id,metadata)
      values(p_organization_id,p_location_id,p_actor_id,'REVIEW','timesheets',current_row.id,jsonb_build_object('command_action',p_action,'batch_id',p_batch_id,'timesheet_type',p_type,'service_period',p_service_period));
      total := total + 1;
    end if;
  end loop;
  return total;
end $$;
revoke all on function public.record_timesheet_submission_batch(uuid,uuid,text,text,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_timesheet_submission_batch(uuid,uuid,text,text,uuid,text,uuid,jsonb) to service_role;
