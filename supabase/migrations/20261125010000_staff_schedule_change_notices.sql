-- Private administration notices; the published schedule retains its existing workflow.
create table public.staff_schedule_changes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,
 location_id uuid not null references public.locations(id),department text not null default '',
 staff_user_id uuid not null,staff_name text not null,start_date date not null,end_date date not null,
 is_off boolean not null default false,start_time time,end_time time,reason text not null,
 submitted_by uuid not null,submitted_by_name text not null,submitted_at timestamptz not null default now(),
 status text not null default 'Pending' check(status in ('Pending','Completed','Cancelled')),
 resolved_by uuid,resolved_by_name text,resolved_at timestamptz,resolution_note text,
 check(end_date>=start_date and end_date-start_date<=366),
 check(length(trim(reason)) between 3 and 2000),
 check((is_off and start_time is null and end_time is null) or (not is_off and start_time is not null and end_time is not null and end_time>start_time))
);
alter table public.staff_schedule_changes enable row level security;
revoke all on public.staff_schedule_changes from anon,authenticated;
grant all on public.staff_schedule_changes to service_role;
create index staff_schedule_changes_org_date on public.staff_schedule_changes(organization_id,submitted_at desc);
create function public.resolve_staff_schedule_change(p_org uuid,p_actor uuid,p_id uuid,p_status text,p_note text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare actor public.staff_access;
begin
 select * into actor from public.staff_access where organization_id=p_org and user_id=p_actor and is_active;
 if actor.user_id is null or not public.is_tcs_owner_role_text(actor.role) then raise exception 'Only administration can close schedule changes' using errcode='42501';end if;
 if p_status not in ('Completed','Cancelled') or p_status is null then raise exception 'Choose completed or cancelled';end if;
 if p_note is null or length(trim(p_note))<3 or length(p_note)>2000 then raise exception 'Enter a closeout note';end if;
 update public.staff_schedule_changes set status=p_status,resolved_by=p_actor,resolved_by_name=actor.full_name,resolved_at=now(),resolution_note=trim(p_note) where organization_id=p_org and id=p_id and status='Pending';
 if not found then raise exception 'This notice changed or is unavailable. Refresh the list';end if;
end $$;
revoke all on function public.resolve_staff_schedule_change(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.resolve_staff_schedule_change(uuid,uuid,uuid,text,text) to service_role;
-- Alert administration without exposing the private reason in the notification preview.
create function public.notify_staff_schedule_change() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare recipient record; notice jsonb;
begin
 for recipient in select user_id from public.staff_access where organization_id=new.organization_id and is_active and public.is_tcs_owner_role_text(role)
 loop
  notice:=jsonb_build_object('id','schedule-change:'||new.id,'eventKey','schedule-change:'||new.id,'category','schedule','severity','attention','title','Staff schedule change submitted','body',new.staff_name||' · '||new.start_date||case when new.end_date<>new.start_date then ' through '||new.end_date else '' end,'href','/staff-schedules#schedule-changes','location','All Locations','createdAt',now(),'readAt','');
  insert into public.user_notification_state as s(user_id,inbox) values(recipient.user_id,jsonb_build_array(notice))
  on conflict(user_id) do update set inbox=(select coalesce(jsonb_agg(item order by idx),'[]'::jsonb) from jsonb_array_elements(jsonb_build_array(notice)||s.inbox) with ordinality v(item,idx) where idx<=100),updated_at=clock_timestamp();
 end loop;
 return new;
end $$;
revoke all on function public.notify_staff_schedule_change() from public,anon,authenticated;
create trigger staff_schedule_change_notice after insert on public.staff_schedule_changes for each row execute function public.notify_staff_schedule_change();
