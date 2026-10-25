-- Additive only: no existing staff, family, child, message or operational rows
-- are edited. Empty team tables become populated only by signed-in staff actions.
create table public.hub_team_threads (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  location_id uuid references public.locations(id),
  title text not null check (length(trim(title)) between 1 and 160),
  body text not null check (length(trim(body)) between 1 and 5000),
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  pinned boolean not null default false,
  requires_ack boolean not null default false,
  created_at timestamptz not null default now()
);
create index hub_team_threads_org_created_idx on public.hub_team_threads(organization_id, created_at desc, id desc);
create index hub_team_threads_location_idx on public.hub_team_threads(location_id);
create index hub_team_threads_author_idx on public.hub_team_threads(author_id);

create table public.hub_team_replies (
  id uuid primary key,
  thread_id uuid not null references public.hub_team_threads(id),
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  body text not null check (length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index hub_team_replies_thread_idx on public.hub_team_replies(thread_id, created_at);
create index hub_team_replies_author_idx on public.hub_team_replies(author_id);

create table public.hub_team_receipts (
  thread_id uuid not null references public.hub_team_threads(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  staff_name text not null,
  read_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  primary key (thread_id, user_id)
);
create index hub_team_receipts_user_idx on public.hub_team_receipts(user_id);

alter table public.hub_team_threads enable row level security;
alter table public.hub_team_replies enable row level security;
alter table public.hub_team_receipts enable row level security;
revoke all on public.hub_team_threads, public.hub_team_replies, public.hub_team_receipts from anon, authenticated;
grant select, insert on public.hub_team_threads, public.hub_team_replies to authenticated;
grant update(pinned) on public.hub_team_threads to authenticated;
grant select, insert, update on public.hub_team_receipts to authenticated;
grant all on public.hub_team_threads, public.hub_team_replies, public.hub_team_receipts to service_role;

create policy hub_team_threads_read on public.hub_team_threads for select to authenticated using (
  (select public.is_approved_tcs_pilot_user()) and organization_id = (select public.current_staff_organization_id())
  and (location_id is null or public.can_access_location(location_id))
);
create policy hub_team_threads_post on public.hub_team_threads for insert to authenticated with check (
  (select public.is_approved_tcs_pilot_user()) and organization_id = (select public.current_staff_organization_id())
  and author_id = (select auth.uid())
  and author_name = (select sa.full_name from public.staff_access sa where sa.user_id = (select auth.uid()) and sa.is_active)
  and (
    (location_id is null and (select public.is_tcs_owner()))
    or (location_id is not null and public.can_access_location(location_id)
      and exists(select 1 from public.locations l where l.id=location_id and l.organization_id=hub_team_threads.organization_id and l.is_active))
  )
  and (not (pinned or requires_ack) or (select public.is_tcs_owner()) or (select public.is_tcs_licensee()))
);
create policy hub_team_threads_pin on public.hub_team_threads for update to authenticated using (
  organization_id = (select public.current_staff_organization_id())
  and ((select public.is_tcs_owner()) or ((select public.is_tcs_licensee()) and location_id is not null and public.can_access_location(location_id)))
) with check (
  organization_id = (select public.current_staff_organization_id())
  and ((select public.is_tcs_owner()) or ((select public.is_tcs_licensee()) and location_id is not null and public.can_access_location(location_id)))
);
create policy hub_team_replies_read on public.hub_team_replies for select to authenticated using (
  exists(select 1 from public.hub_team_threads t where t.id=thread_id)
);
create policy hub_team_replies_post on public.hub_team_replies for insert to authenticated with check (
  author_id = (select auth.uid())
  and author_name = (select sa.full_name from public.staff_access sa where sa.user_id=(select auth.uid()) and sa.is_active)
  and exists(select 1 from public.hub_team_threads t where t.id=thread_id)
);
create policy hub_team_receipts_read on public.hub_team_receipts for select to authenticated using (
  exists(select 1 from public.hub_team_threads t where t.id=thread_id)
  and (user_id=(select auth.uid()) or (select public.is_tcs_owner()) or ((select public.is_tcs_licensee()) and exists(select 1 from public.hub_team_threads t where t.id=thread_id and t.location_id is not null)))
);
create policy hub_team_receipts_insert on public.hub_team_receipts for insert to authenticated with check (
  user_id=(select auth.uid())
  and staff_name = (select sa.full_name from public.staff_access sa where sa.user_id=(select auth.uid()) and sa.is_active)
  and exists(select 1 from public.hub_team_threads t where t.id=thread_id)
);
create policy hub_team_receipts_update on public.hub_team_receipts for update to authenticated using (
  user_id=(select auth.uid()) and exists(select 1 from public.hub_team_threads t where t.id=thread_id)
) with check (
  user_id=(select auth.uid())
  and staff_name = (select sa.full_name from public.staff_access sa where sa.user_id=(select auth.uid()) and sa.is_active)
  and exists(select 1 from public.hub_team_threads t where t.id=thread_id)
);

-- Invoker permissions and RLS apply throughout. Opening a conversation records
-- only what was visible; reading never clears or implies an acknowledgment.
create function public.hub_read_team_thread(p_thread uuid, p_ack boolean, p_seen_at timestamptz)
returns void language plpgsql security invoker set search_path=public as $$
declare v_name text;
begin
  select full_name into v_name from public.staff_access where user_id=auth.uid() and is_active;
  if v_name is null or not exists(select 1 from public.hub_team_threads where id=p_thread) then
    raise exception 'Conversation access is required';
  end if;
  insert into public.hub_team_receipts(thread_id,user_id,staff_name,read_at,acknowledged_at)
  values(p_thread,auth.uid(),v_name,least(coalesce(p_seen_at,now()),now()),case when p_ack then now() else null end)
  on conflict(thread_id,user_id) do update set
    read_at=greatest(hub_team_receipts.read_at,excluded.read_at),
    acknowledged_at=coalesce(hub_team_receipts.acknowledged_at,excluded.acknowledged_at);
end;
$$;
revoke all on function public.hub_read_team_thread(uuid,boolean,timestamptz) from public, anon;
grant execute on function public.hub_read_team_thread(uuid,boolean,timestamptz) to authenticated;

-- Server-only, invoker function. APIs verify the staff location or guardian's
-- individual permissions before calling. Locks one child and changes only the
-- message array; concurrent sends and unrelated record edits cannot overwrite it.
create function public.hub_update_family_messages(
  p_child uuid, p_actor uuid, p_message jsonb default null,
  p_read_ids text[] default null, p_read_direction text default null
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_record jsonb; v_messages jsonb; v_org uuid; v_location uuid;
begin
  select record_data,organization_id,location_id into v_record,v_org,v_location
    from public.children where id=p_child for update;
  if not found then raise exception 'Child conversation is unavailable'; end if;
  if v_record ? 'familyMessages' and jsonb_typeof(v_record->'familyMessages') <> 'array' then
    raise exception 'This conversation needs an administrator review';
  end if;
  v_messages=coalesce(v_record->'familyMessages','[]'::jsonb);
  if p_message is not null then
    if jsonb_typeof(p_message)<>'object' or coalesce(p_message->>'id','')='' or coalesce(trim(p_message->>'body'),'')=''
      or length(p_message->>'body')>5000 or length(p_message->>'subject')>160
      or coalesce(p_message->>'direction','') not in ('Family to TCS','TCS to Family') then raise exception 'Invalid family message'; end if;
    if exists(select 1 from jsonb_array_elements(v_messages) m where m->>'id'=p_message->>'id') then return v_messages; end if;
    v_messages=v_messages || jsonb_build_array(p_message);
  elsif p_read_ids is not null then
    if coalesce(p_read_direction,'') not in ('Family to TCS','TCS to Family') then raise exception 'Invalid message direction'; end if;
    select coalesce(jsonb_agg(case when m->>'id'=any(p_read_ids) and m->>'direction'=p_read_direction and coalesce(m->>'readAt','')=''
      then m || jsonb_build_object('readAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) else m end order by ordinal),'[]'::jsonb)
      into v_messages from jsonb_array_elements(v_messages) with ordinality as messages(m,ordinal);
  else raise exception 'A message or read action is required'; end if;
  update public.children set record_data=jsonb_set(v_record,'{familyMessages}',v_messages),updated_by=p_actor where id=p_child;
  insert into public.audit_log(organization_id,location_id,actor_user_id,action,table_name,row_id,metadata)
    values(v_org,v_location,p_actor,'UPDATE','children',p_child,jsonb_build_object('kind',case when p_message is null then 'family_message_read' else 'family_message_sent' end));
  return v_messages;
end;
$$;
revoke all on function public.hub_update_family_messages(uuid,uuid,jsonb,text[],text) from public, anon, authenticated;
grant execute on function public.hub_update_family_messages(uuid,uuid,jsonb,text[],text) to service_role;
