-- Server-owned daily ledger. Existing route, school, attendance and custody history is retained.
-- The application validates role/location/driver authorization, then uses a compare-and-swap
-- transaction. No authenticated client may read or write the underlying organization documents.
create table public.transport_accountability_days (
 organization_id uuid not null references public.organizations(id), service_date date not null,
 document jsonb not null default '{"trips":[],"closedAt":""}'::jsonb,
 version integer not null default 0, updated_at timestamptz not null default now(),
 primary key(organization_id,service_date), check(jsonb_typeof(document->'trips')='array')
);
create table public.transport_accountability_settings (
 organization_id uuid primary key references public.organizations(id), document jsonb not null,
 version integer not null default 1, updated_at timestamptz not null default now()
);
create table public.transport_accountability_events (
 id bigint generated always as identity primary key, organization_id uuid not null references public.organizations(id),
 service_date date not null, actor_id uuid references auth.users(id) on delete set null, action text not null,
 reason text not null default '', before_data jsonb not null, after_data jsonb not null,
 created_at timestamptz not null default now()
);
create index transport_accountability_events_day on public.transport_accountability_events(organization_id,service_date,id);
create table public.transport_accountability_outbox (
 id bigint generated always as identity primary key, organization_id uuid not null references public.organizations(id),
 recipient_id uuid not null references auth.users(id), event_key text not null, notification jsonb not null,
 created_at timestamptz not null default now(), delivered_at timestamptz, lease_until timestamptz,
 unique(organization_id,recipient_id,event_key)
);
create index transport_accountability_outbox_pending on public.transport_accountability_outbox(organization_id,id) where delivered_at is null;
alter table public.transport_accountability_days enable row level security;
alter table public.transport_accountability_settings enable row level security;
alter table public.transport_accountability_events enable row level security;
alter table public.transport_accountability_outbox enable row level security;
revoke all on public.transport_accountability_days,public.transport_accountability_settings,public.transport_accountability_events,public.transport_accountability_outbox from public,anon,authenticated;
grant all on public.transport_accountability_days,public.transport_accountability_settings,public.transport_accountability_events,public.transport_accountability_outbox to service_role;
revoke all on sequence public.transport_accountability_events_id_seq,public.transport_accountability_outbox_id_seq from public,anon,authenticated;
grant usage,select on sequence public.transport_accountability_events_id_seq,public.transport_accountability_outbox_id_seq to service_role;

create function public.commit_transport_accountability(p_org uuid,p_day date,p_actor uuid,p_action text,p_reason text,p_version integer,p_document jsonb,p_notices jsonb,p_settings_version integer)
returns integer language plpgsql security invoker set search_path=public as $$
declare prior jsonb; current_version integer; item jsonb;
begin
 if not exists(select 1 from public.staff_access where organization_id=p_org and user_id=p_actor and is_active) then raise exception 'Active staff required';end if;
 if jsonb_typeof(p_document->'trips') is distinct from 'array' or jsonb_typeof(p_notices) is distinct from 'array' then raise exception 'Invalid transportation document';end if;
 perform pg_advisory_xact_lock(hashtextextended('transport-settings:'||p_org::text,0));
 if coalesce((select version from public.transport_accountability_settings where organization_id=p_org),0)<>p_settings_version then raise exception 'School settings changed. Refresh and review before continuing';end if;
 perform pg_advisory_xact_lock(hashtextextended('transport-accountability:'||p_org::text||':'||p_day::text,0));
 select document,version into prior,current_version from public.transport_accountability_days where organization_id=p_org and service_date=p_day for update;
 if coalesce(current_version,0)<>p_version then raise exception 'Transportation changed. Refresh and review before continuing';end if;
 insert into public.transport_accountability_days(organization_id,service_date,document,version) values(p_org,p_day,p_document,1)
 on conflict(organization_id,service_date) do update set document=excluded.document,version=transport_accountability_days.version+1,updated_at=clock_timestamp();
 insert into public.transport_accountability_events(organization_id,service_date,actor_id,action,reason,before_data,after_data) values(p_org,p_day,p_actor,p_action,coalesce(p_reason,''),coalesce(prior,'{}'),p_document);
 for item in select value from jsonb_array_elements(p_notices) loop
  if exists(select 1 from public.staff_access where organization_id=p_org and user_id=(item->>'recipient')::uuid and is_active) then
   insert into public.transport_accountability_outbox(organization_id,recipient_id,event_key,notification) values(p_org,(item->>'recipient')::uuid,item->>'key',item->'notification') on conflict do nothing;
   insert into public.user_notification_state as n(user_id,inbox) values((item->>'recipient')::uuid,jsonb_build_array(item->'notification'))
   on conflict(user_id) do update set inbox=case when exists(select 1 from jsonb_array_elements(n.inbox) x where x->>'eventKey'=item->>'key') then n.inbox else jsonb_build_array(item->'notification')||n.inbox end;
  end if;
 end loop;
 return coalesce(current_version,0)+1;
end $$;
revoke all on function public.commit_transport_accountability(uuid,date,uuid,text,text,integer,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function public.commit_transport_accountability(uuid,date,uuid,text,text,integer,jsonb,jsonb,integer) to service_role;

-- A short lease allows retries after a crashed request without concurrent duplicate dispatch.
create function public.claim_transport_accountability_notices(p_org uuid)
returns setof public.transport_accountability_outbox language sql security invoker set search_path=public as $$
 update public.transport_accountability_outbox set lease_until=clock_timestamp()+interval '90 seconds'
 where id in (select id from public.transport_accountability_outbox where organization_id=p_org and delivered_at is null and (lease_until is null or lease_until<clock_timestamp()) order by id for update skip locked limit 100) returning *
$$;
revoke all on function public.claim_transport_accountability_notices(uuid) from public,anon,authenticated;
grant execute on function public.claim_transport_accountability_notices(uuid) to service_role;

create function public.save_transport_accountability_settings(p_org uuid,p_actor uuid,p_version integer,p_document jsonb,p_day date)
returns integer language plpgsql security invoker set search_path=public as $$
declare prior jsonb; v integer;
begin
 if not exists(select 1 from public.staff_access where organization_id=p_org and user_id=p_actor and is_active) then raise exception 'Active staff required';end if;
 perform pg_advisory_xact_lock(hashtextextended('transport-settings:'||p_org::text,0));
 select document,version into prior,v from public.transport_accountability_settings where organization_id=p_org for update;
 if coalesce(v,0)<>p_version then raise exception 'Settings changed. Refresh before trying again';end if;
 insert into public.transport_accountability_settings(organization_id,document) values(p_org,p_document) on conflict(organization_id) do update set document=excluded.document,version=transport_accountability_settings.version+1,updated_at=clock_timestamp();
 insert into public.transport_accountability_events(organization_id,service_date,actor_id,action,reason,before_data,after_data) values(p_org,p_day,p_actor,'settings','School calendars and alert configuration updated',coalesce(prior,'{}'),p_document);
 return coalesce(v,0)+1;
end $$;
revoke all on function public.save_transport_accountability_settings(uuid,uuid,integer,jsonb,date) from public,anon,authenticated;
grant execute on function public.save_transport_accountability_settings(uuid,uuid,integer,jsonb,date) to service_role;

create function public.queue_transport_accountability_notices(p_org uuid,p_notices jsonb)
returns integer language plpgsql security invoker set search_path=public as $$
declare item jsonb; count_added integer:=0; inserted bigint;
begin
 for item in select value from jsonb_array_elements(p_notices) loop
  if exists(select 1 from public.staff_access where organization_id=p_org and user_id=(item->>'recipient')::uuid and is_active) then
   inserted:=null;
   insert into public.transport_accountability_outbox(organization_id,recipient_id,event_key,notification) values(p_org,(item->>'recipient')::uuid,item->>'key',item->'notification') on conflict do nothing returning id into inserted;
   if inserted is not null then
    insert into public.user_notification_state as n(user_id,inbox) values((item->>'recipient')::uuid,jsonb_build_array(item->'notification')) on conflict(user_id) do update set inbox=jsonb_build_array(item->'notification')||n.inbox,updated_at=clock_timestamp();
    count_added:=count_added+1;
   end if;
  end if;
 end loop;
 return count_added;
end $$;
revoke all on function public.queue_transport_accountability_notices(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.queue_transport_accountability_notices(uuid,jsonb) to service_role;

-- Cutover is explicit and dated. These guards also stop stale clients using the old RPCs directly.
create table public.transport_accountability_rollout (
 organization_id uuid primary key references public.organizations(id), enabled_from date not null,
 activated_by uuid references auth.users(id) on delete set null, activated_at timestamptz not null default now()
);
alter table public.transport_accountability_rollout enable row level security;
revoke all on public.transport_accountability_rollout from public,anon,authenticated;
grant all on public.transport_accountability_rollout to service_role;
create schema if not exists tcs_transport_private;
create function tcs_transport_private.guard_legacy_transport_accountability() returns trigger
language plpgsql security definer set search_path='' as $$
declare cutoff date; changed_custody boolean;
begin
 select enabled_from into cutoff from public.transport_accountability_rollout where organization_id=new.organization_id;
 if cutoff is null then return new;end if;
 if tg_table_name='transportation_day_stops' then
  if new.service_date>=cutoff then raise exception 'Use the daily transportation ledger after cutover';end if;
 else
  if (now() at time zone 'America/Los_Angeles')::date<cutoff then return new;end if;
  select exists(select 1 from jsonb_object_keys(new.record_data||old.record_data) k where k ~ '^(run|pickedUp|arrived|checkedIn|droppedOff|covering)' and new.record_data->k is distinct from old.record_data->k) into changed_custody;
  if changed_custody then raise exception 'Use the daily transportation ledger for custody and reassignment after cutover';end if;
 end if;
 return new;
end $$;
revoke all on function tcs_transport_private.guard_legacy_transport_accountability() from public,anon,authenticated;
-- No EXECUTE grant is needed: PostgreSQL invokes a trigger on the table owner's behalf.
create trigger legacy_transport_day_cutover before insert or update on public.transportation_day_stops for each row execute function tcs_transport_private.guard_legacy_transport_accountability();
create trigger legacy_transport_custody_cutover before update on public.transportation_routes for each row execute function tcs_transport_private.guard_legacy_transport_accountability();
