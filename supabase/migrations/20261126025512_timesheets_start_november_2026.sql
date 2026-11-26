-- Tracking starts with November service; preserve all original timesheet records and evidence.
create function public.timesheet_tracking_applies(p_period text) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare service_month date;
begin
 service_month:=to_date('01 '||p_period,'DD FMMonth YYYY');
 return coalesce(to_char(service_month,'FMMonth YYYY')=p_period and service_month>=date '2026-11-01',false);
exception when others then return false;
end $$;
revoke all on function public.timesheet_tracking_applies(text) from public,anon,authenticated;
grant execute on function public.timesheet_tracking_applies(text) to service_role;
-- Enforce the cutoff even while older clients / cron versions are finishing a request.
do $$
declare definition text; marker text:='  if p_event_key not like';
begin
 definition:=pg_get_functiondef('public.append_timesheet_alert(uuid,uuid,text,jsonb,jsonb,jsonb)'::regprocedure);
 if position(marker in definition)=0 then raise exception 'Unexpected timesheet alert function; no change applied';end if;
 definition:=replace(definition,marker,E'  if not public.timesheet_tracking_applies(split_part(p_event_key,'':'' ,3)) then return false;end if;\n'||marker);
 execute definition;
end $$;
-- Archive superseded reminders rather than marking historical forms submitted.
update public.user_notification_state s set inbox=(
 select coalesce(jsonb_agg(case when item->>'eventKey' like 'timesheet-alert:%'
  and not public.timesheet_tracking_applies(split_part(item->>'eventKey',':',3))
  then item||jsonb_build_object('archivedAt',clock_timestamp(),'archiveReason','Hub tracking starts with November 2026') else item end order by pos),'[]'::jsonb)
 from jsonb_array_elements(s.inbox) with ordinality entries(item,pos)
),updated_at=clock_timestamp()
where exists(select 1 from jsonb_array_elements(s.inbox) item where item->>'eventKey' like 'timesheet-alert:%'
 and not public.timesheet_tracking_applies(split_part(item->>'eventKey',':',3)) and coalesce(item->>'archivedAt','')='');
update public.notification_push_queue set status='suppressed',lease_until=null,last_error='Hub tracking starts with November 2026',updated_at=clock_timestamp()
where event_key like 'timesheet-alert:%' and not public.timesheet_tracking_applies(split_part(event_key,':',3)) and status in ('pending','no_device','sending');
