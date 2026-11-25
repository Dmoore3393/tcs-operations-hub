-- A complete manual shift is saved atomically, retaining the administrator receipt.
create or replace function public.add_staff_worked_hours(p_org uuid,p_actor uuid,p_staff uuid,p_location uuid,p_start timestamptz,p_end timestamptz,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor public.staff_access; staff public.staff_access; entry record; opened timestamptz; receipt jsonb; entered_at timestamptz:=clock_timestamp();
begin
 select * into actor from public.staff_access where organization_id=p_org and user_id=p_actor and is_active;
 if actor.user_id is null or not public.is_tcs_owner_role_text(actor.role) then raise exception 'Only administration can add worked hours' using errcode='42501';end if;
 select * into staff from public.staff_access where organization_id=p_org and user_id=p_staff and is_active;
 if staff.user_id is null then raise exception 'Choose an active employee in this organization';end if;
 if not exists(select 1 from public.locations where organization_id=p_org and id=p_location and is_active) then raise exception 'Choose an active work location';end if;
 if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end) or p_end<=p_start or p_end>now() or p_end-p_start>interval '24 hours' then raise exception 'Enter actual past times, with clock-out after clock-in and no more than 24 hours per entry';end if;
 if p_reason is null or length(trim(p_reason))<3 or length(p_reason)>1000 then raise exception 'Enter a reason (3–1000 characters)';end if;
 -- Same staff lock as clock-time corrections; simultaneous manual saves serialize.
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||p_staff::text,0));
 for entry in
  select a.metadata->>'event' event,coalesce((c.metadata->>'correctedAt')::timestamptz,a.occurred_at) stamp
  from public.audit_log a
  left join lateral (select metadata from public.audit_log where organization_id=p_org and table_name='time_clock' and metadata->>'kind'='staff_time_clock_correction' and metadata->>'eventId'=a.id::text order by occurred_at desc,id desc limit 1) c on true
  where a.organization_id=p_org and a.table_name='time_clock' and a.metadata->>'event' in ('clock_in','clock_out','break_start','break_end') and coalesce(nullif(a.metadata->>'targetStaffUserId','')::uuid,a.actor_user_id)=p_staff
  order by stamp,a.id
 loop
  if entry.stamp>p_start and entry.stamp<p_end then raise exception 'These hours overlap existing clock activity. Review or correct the existing entries';end if;
  if entry.event='clock_in' then
   if entry.stamp=p_start then raise exception 'A clock-in already exists at this time';end if;
   opened:=entry.stamp;
  elsif entry.event='clock_out' then
   if entry.stamp=p_end then raise exception 'A clock-out already exists at this time';end if;
   if opened is not null and opened<p_end and entry.stamp>p_start then raise exception 'These hours overlap an existing shift';end if;
   opened:=null;
  end if;
 end loop;
 if opened is not null and opened<p_end then raise exception 'These hours overlap an open shift. Complete or correct that shift first';end if;
 receipt:=jsonb_build_object('clockSource','Manual Entry','manualEntry',true,'manualEntryId',gen_random_uuid(),'targetStaffUserId',p_staff,'targetStaffName',staff.full_name,'performedByUserId',p_actor,'performedByName',actor.full_name,'enteredAt',entered_at,'reason',trim(p_reason));
 insert into public.audit_log(organization_id,actor_user_id,action,table_name,row_id,location_id,metadata,occurred_at)
 values(p_org,p_actor,'CREATE','time_clock',null,p_location,receipt||jsonb_build_object('event','clock_in'),p_start),
       (p_org,p_actor,'CREATE','time_clock',null,p_location,receipt||jsonb_build_object('event','clock_out'),p_end);
 return jsonb_build_object('saved',true,'minutes',extract(epoch from (p_end-p_start))/60);
end $$;
revoke all on function public.add_staff_worked_hours(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.add_staff_worked_hours(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text) to service_role;
