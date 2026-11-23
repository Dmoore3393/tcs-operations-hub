-- audit_log.id is bigint; row_id is reserved for UUID-backed records.
-- Replace the incorrectly typed overload without touching any clock receipt.
drop function if exists public.correct_staff_clock_time(uuid,uuid,uuid,timestamptz,timestamptz,text);
-- Corrections are append-only audit receipts; original punches remain immutable.
create or replace function public.correct_staff_clock_time(p_org uuid,p_actor uuid,p_event bigint,p_expected timestamptz,p_time timestamptz,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor public.staff_access; punch public.audit_log; current_time_value timestamptz; target uuid; previous_time timestamptz; next_time timestamptz; owner_actor boolean;
begin
 select * into actor from public.staff_access where user_id=p_actor and organization_id=p_org and is_active;
 owner_actor:=lower(trim(actor.role)) in ('owner / admin','owner/admin','owner / director','administrator','admin','director','corporate / admin','corporate admin','operations admin');
 if actor.user_id is null or not (owner_actor or lower(trim(actor.role)) in ('location licensee','licensee','licensee/admin','licensee / admin')) then raise exception 'Clock corrections require administration or licensee access' using errcode='42501';end if;
 select * into punch from public.audit_log where id=p_event and organization_id=p_org and table_name='time_clock' and metadata->>'event' in ('clock_in','clock_out');
 if punch.id is null then raise exception 'Clock entry not found';end if;
 if not owner_actor and not exists(select 1 from public.locations l where l.id=punch.location_id and l.organization_id=p_org and l.name=any(actor.locations)) then raise exception 'This clock entry is outside your assigned locations' using errcode='42501';end if;
 target:=coalesce(nullif(punch.metadata->>'targetStaffUserId','')::uuid,punch.actor_user_id);
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||target::text,0));
 select (metadata->>'correctedAt')::timestamptz into current_time_value from public.audit_log where organization_id=p_org and table_name='time_clock' and metadata->>'kind'='staff_time_clock_correction' and metadata->>'eventId'=p_event::text order by occurred_at desc,id desc limit 1;
 current_time_value:=coalesce(current_time_value,punch.occurred_at);
 if p_expected is null or current_time_value<>p_expected then raise exception 'This entry changed. Refresh before correcting it again';end if;
 if p_reason is null or length(trim(p_reason))<3 or length(p_reason)>1000 then raise exception 'Enter a correction reason (3–1000 characters)';end if;
 if p_time is null or p_time>now() or (p_time at time zone 'America/Los_Angeles')::date<>(punch.occurred_at at time zone 'America/Los_Angeles')::date then raise exception 'Choose a past time on the clock entry’s original date';end if;
 with effective as (
 select a.id,coalesce((c.metadata->>'correctedAt')::timestamptz,a.occurred_at) stamp from public.audit_log a
 left join lateral (select metadata from public.audit_log where organization_id=p_org and table_name='time_clock' and metadata->>'kind'='staff_time_clock_correction' and metadata->>'eventId'=a.id::text order by occurred_at desc,id desc limit 1) c on true
 where a.organization_id=p_org and a.table_name='time_clock' and a.metadata->>'event' in ('clock_in','clock_out','break_start','break_end') and coalesce(nullif(a.metadata->>'targetStaffUserId','')::uuid,a.actor_user_id)=target and a.id<>p_event)
 select max(stamp) filter(where stamp<current_time_value),min(stamp) filter(where stamp>current_time_value) into previous_time,next_time from effective;
 if (previous_time is not null and p_time<=previous_time) or (next_time is not null and p_time>=next_time) then raise exception 'The corrected time must stay between the preceding and following clock actions';end if;
 insert into public.audit_log(organization_id,actor_user_id,action,table_name,row_id,location_id,metadata,occurred_at)
 values(p_org,p_actor,'UPDATE','time_clock',null,punch.location_id,jsonb_build_object('kind','staff_time_clock_correction','eventId',p_event,'targetStaffUserId',target,'originalAt',punch.occurred_at,'previousAt',current_time_value,'correctedAt',p_time,'reason',trim(p_reason),'correctedBy',actor.full_name),clock_timestamp());
 return jsonb_build_object('saved',true);
end $$;
revoke all on function public.correct_staff_clock_time(uuid,uuid,bigint,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.correct_staff_clock_time(uuid,uuid,bigint,timestamptz,timestamptz,text) to service_role;

notify pgrst, 'reload schema';
