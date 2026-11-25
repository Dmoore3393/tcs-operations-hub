-- Actual punch, required explanation, location notice and durable phone queue commit together.
create table public.clock_schedule_reviews (
 event_id bigint primary key references public.audit_log(id),
 organization_id uuid not null, location_id uuid not null references public.locations(id),
 staff_user_id uuid not null,staff_name text not null,location_name text not null,
 event text not null check(event in ('clock_in','clock_out')),occurred_at timestamptz not null,
 reasons jsonb not null check(jsonb_typeof(reasons)='array' and jsonb_array_length(reasons)>0),
 explanation text,explained_by uuid,explained_by_name text,explained_at timestamptz,
 check((explanation is null and explained_by is null and explained_at is null) or
       (length(trim(explanation)) between 1 and 2000 and explained_by is not null and explained_at is not null))
);
alter table public.clock_schedule_reviews enable row level security;
revoke all on public.clock_schedule_reviews from public,anon,authenticated;
grant select,insert,update on public.clock_schedule_reviews to service_role;
create index clock_schedule_reviews_pending on public.clock_schedule_reviews(organization_id,location_id,occurred_at) where explained_at is null;
create schema if not exists tcs_clock_private;
revoke all on schema tcs_clock_private from public,anon,authenticated;
create function tcs_clock_private.queue_schedule_review() returns trigger
language plpgsql security definer set search_path='' as $$
declare site record;recipient record;notice jsonb;k text;
begin
 if new.action<>'CREATE' or new.table_name<>'time_clock' or new.metadata->>'kind'<>'staff_time_clock'
    or new.metadata->>'event' not in ('clock_in','clock_out') or new.location_id is null then return new;end if;
 if jsonb_typeof(new.metadata->'scheduleReview') is distinct from 'array' then return new;end if;
 if jsonb_array_length(new.metadata->'scheduleReview')=0 then return new;end if;
 select * into site from public.locations where id=new.location_id and organization_id=new.organization_id;
 if not found then raise exception 'Clock review location is unavailable';end if;
 insert into public.clock_schedule_reviews(event_id,organization_id,location_id,staff_user_id,staff_name,location_name,event,occurred_at,reasons)
 values(new.id,new.organization_id,new.location_id,(new.metadata->>'targetStaffUserId')::uuid,coalesce(new.metadata->>'targetStaffName','TCS Staff'),coalesce(new.metadata->>'location',site.name),new.metadata->>'event',new.occurred_at,new.metadata->'scheduleReview');
 -- Raw saved assignments are authoritative; temporary backup access must not notify other licensees.
 for recipient in select a.user_id from public.staff_access a where a.organization_id=new.organization_id and a.is_active and (
  public.is_tcs_owner_role_text(a.role) or
  (lower(a.role) like '%licensee%' and cardinality(a.locations)=1 and exists(select 1 from unnest(a.locations) x where regexp_replace(lower(x),'[^a-z0-9]','','g') in (
   regexp_replace(lower(site.name),'[^a-z0-9]','','g'),regexp_replace(lower(site.slug),'[^a-z0-9]','','g'),regexp_replace(lower(site.full_name),'[^a-z0-9]','','g'),regexp_replace(lower(new.metadata->>'location'),'[^a-z0-9]','','g')))))
 loop
  k:='clock-review:'||new.id;
  notice:=jsonb_build_object('id',k,'eventKey',k,'category','system','severity','attention','title','Clock schedule explanation required',
   'body','A saved clock action at '||coalesce(new.metadata->>'location',site.name)||' needs a location explanation. Open the Time Clock to add a note.',
   'href','/time-clock#schedule-reviews','location',coalesce(new.metadata->>'location',site.name),'createdAt',now(),'readAt','');
  insert into public.user_notification_state as s(user_id,inbox) values(recipient.user_id,jsonb_build_array(notice)) on conflict(user_id)
  do update set inbox=(select coalesce(jsonb_agg(item order by idx),'[]'::jsonb) from jsonb_array_elements(jsonb_build_array(notice)||s.inbox) with ordinality v(item,idx) where idx<=100),updated_at=clock_timestamp();
 end loop;
 return new;
end $$;
revoke all on function tcs_clock_private.queue_schedule_review() from public,anon,authenticated;
create trigger clock_schedule_review_notice after insert on public.audit_log for each row execute function tcs_clock_private.queue_schedule_review();
-- Service-only operation; actor identity comes from server-verified Auth, never request metadata.
create function public.explain_clock_schedule_review(p_org uuid,p_actor uuid,p_event bigint,p_note text) returns void
language plpgsql set search_path='' as $$
declare actor public.staff_access; review public.clock_schedule_reviews;site public.locations;
begin
 select * into actor from public.staff_access where user_id=p_actor and organization_id=p_org and is_active;
 if not found then raise exception 'Active leadership access required' using errcode='42501';end if;
 select * into review from public.clock_schedule_reviews where event_id=p_event and organization_id=p_org for update;
 if not found then raise exception 'Clock review not found';end if;
 select * into site from public.locations where id=review.location_id and organization_id=p_org;
 if not public.is_tcs_owner_role_text(actor.role) and not (lower(actor.role) like '%licensee%' and cardinality(actor.locations)=1 and exists(select 1 from unnest(actor.locations) x where regexp_replace(lower(x),'[^a-z0-9]','','g') in (
 regexp_replace(lower(site.name),'[^a-z0-9]','','g'),regexp_replace(lower(site.slug),'[^a-z0-9]','','g'),regexp_replace(lower(site.full_name),'[^a-z0-9]','','g'),regexp_replace(lower(review.location_name),'[^a-z0-9]','','g')))) then
  raise exception 'Only administration or this location licensee can explain this flag' using errcode='42501';end if;
 if p_note is null or length(trim(p_note)) not between 1 and 2000 then raise exception 'Enter an explanation (up to 2000 characters)';end if;
 if review.explained_at is not null then raise exception 'This flag already has an explanation. Refresh the list';end if;
 update public.clock_schedule_reviews set explanation=trim(p_note),explained_by=p_actor,explained_by_name=actor.full_name,explained_at=clock_timestamp() where event_id=p_event;
end $$;
revoke all on function public.explain_clock_schedule_review(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.explain_clock_schedule_review(uuid,uuid,bigint,text) to service_role;
