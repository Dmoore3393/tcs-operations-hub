create table public.notification_push_queue (
 id bigint generated always as identity primary key,user_id uuid not null references auth.users(id),event_key text not null,
 notification jsonb not null,status text not null default 'pending' check(status in ('pending','sending','accepted','no_device','suppressed')),
 lease_id uuid,lease_until timestamptz,attempts integer not null default 0,next_attempt_at timestamptz not null default now(),
 accepted_devices integer not null default 0,last_error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(user_id,event_key)
);
alter table public.notification_push_queue enable row level security;
revoke all on public.notification_push_queue from public,anon,authenticated;
grant all on public.notification_push_queue to service_role;
grant usage,select on sequence public.notification_push_queue_id_seq to service_role;
create index on public.notification_push_queue(status,next_attempt_at);
create function public.queue_inbox_pushes() returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb; k text;
begin
 for item in select value from jsonb_array_elements(new.inbox) loop
  k:=coalesce(nullif(item->>'eventKey',''),item->>'id');
  if k is null or coalesce(item->>'readAt','')<>'' or coalesce(item->>'archivedAt','')<>'' then continue;end if;
  if tg_op='UPDATE' and exists(select 1 from jsonb_array_elements(old.inbox) prior where coalesce(nullif(prior->>'eventKey',''),prior->>'id')=k) then continue;end if;
  insert into public.notification_push_queue(user_id,event_key,notification) values(new.user_id,k,item) on conflict(user_id,event_key) do nothing;
 end loop;return new;
end $$;
revoke all on function public.queue_inbox_pushes() from public,anon,authenticated;
create trigger inbox_phone_push_queue after insert or update of inbox on public.user_notification_state for each row execute function public.queue_inbox_pushes();
create function public.claim_hub_push(p_user uuid,p_key text,p_notification jsonb) returns uuid language plpgsql set search_path='' as $$
declare lease uuid:=gen_random_uuid(); claimed uuid;
begin
 insert into public.notification_push_queue(user_id,event_key,notification) values(p_user,p_key,p_notification) on conflict(user_id,event_key) do nothing;
 update public.notification_push_queue set status='sending',lease_id=lease,lease_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now()
 where user_id=p_user and event_key=p_key and ((status in ('pending','no_device') and next_attempt_at<=now()) or (status='sending' and lease_until<now())) returning lease_id into claimed;
 return claimed;
end $$;
revoke all on function public.claim_hub_push(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.claim_hub_push(uuid,text,jsonb) to service_role;
-- Work Plan assignments also create an inbox notice, keyed to the assigned account and task.
create function public.work_task_assignment_notice() returns trigger language plpgsql security definer set search_path='' as $$
declare task jsonb; person public.staff_access; k text; notice jsonb; prior jsonb;
begin
 if new.state_key<>'tcs-work-tasks' or jsonb_typeof(new.state_value)<>'array' then return new;end if;
 for task in select value from jsonb_array_elements(new.state_value) loop
  if task->>'completed'='true' then continue;end if;
  prior:=null;
  if tg_op='UPDATE' then select value into prior from jsonb_array_elements(old.state_value) where value->>'id'=task->>'id';end if;
  if prior is not null and prior->>'owner'=task->>'owner' and prior->>'title'=task->>'title' and prior->>'dueAt' is not distinct from task->>'dueAt' and prior->>'due' is not distinct from task->>'due' then continue;end if;
  -- Exact unique active names only: ambiguous / group labels must never notify the wrong person.
  if (select count(*) from public.staff_access where organization_id=new.organization_id and is_active and lower(trim(full_name))=lower(trim(task->>'owner')))<>1 then continue;end if;
  select * into person from public.staff_access where organization_id=new.organization_id and is_active and lower(trim(full_name))=lower(trim(task->>'owner'));
  k:='work-task:'||(task->>'id')||':'||md5(coalesce(task->>'owner','')||coalesce(task->>'title','')||coalesce(task->>'dueAt',task->>'due',''));
  notice:=jsonb_build_object('id',k,'eventKey',k,'category','system','severity','attention','title','Staff task assigned or updated','body',task->>'title'||' · Due '||coalesce(task->>'due','See task'),'href','/work-plans','location',case when task->>'location'='All Sites' then 'All Locations' else task->>'location' end,'createdAt',clock_timestamp(),'readAt','');
  insert into public.user_notification_state as s(user_id,inbox) values(person.user_id,jsonb_build_array(notice)) on conflict(user_id) do update set inbox=jsonb_build_array(notice)||s.inbox,updated_at=clock_timestamp() where not s.inbox @> jsonb_build_array(jsonb_build_object('eventKey',k));
 end loop;return new;
end $$;
revoke all on function public.work_task_assignment_notice() from public,anon,authenticated;
create trigger work_task_assignment_phone_notice after insert or update of state_value on public.hub_state for each row execute function public.work_task_assignment_notice();
