-- Schedule publication and its recipient alerts commit together. No browser follow-up is needed.
create schema if not exists tcs_schedule_private;
revoke all on schema tcs_schedule_private from public,anon,authenticated;
create table tcs_schedule_private.notice_keys (
 publication_id uuid not null references public.schedule_publications(id) on delete cascade,
 revision integer not null, user_id uuid not null references auth.users(id) on delete cascade,
 primary key(publication_id,revision,user_id)
);
create function tcs_schedule_private.queue_publication(p_publication uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p record; recipient record; notice jsonb; k text; inserted uuid; team boolean;
begin
 select s.*,l.name as location_name,l.slug as location_slug into p
 from public.schedule_publications s join public.locations l on l.id=s.location_id and l.organization_id=s.organization_id
 where s.id=p_publication and s.status='Published';
 if not found then return;end if;
 for recipient in
  select a.* from public.staff_access a where a.organization_id=p.organization_id and a.is_active and (
   exists(select 1 from public.staff_schedule_publication_shifts sh where sh.publication_id=p.id and sh.organization_id=p.organization_id and sh.user_id=a.user_id and sh.revision in (p.revision,p.revision-1))
   or (lower(a.role) like '%licensee%' and cardinality(a.locations)=1 and exists(select 1 from unnest(a.locations) x where regexp_replace(lower(x),'[^a-z0-9]','','g') in (regexp_replace(lower(p.location_name),'[^a-z0-9]','','g'),regexp_replace(lower(p.location_slug),'[^a-z0-9]','','g'))))
  )
 loop
  inserted:=null;
  insert into tcs_schedule_private.notice_keys values(p.id,p.revision,recipient.user_id) on conflict do nothing returning user_id into inserted;
  if inserted is null then continue;end if;
  team:=lower(recipient.role) like '%licensee%' and cardinality(recipient.locations)=1 and exists(select 1 from unnest(recipient.locations) x where regexp_replace(lower(x),'[^a-z0-9]','','g') in (regexp_replace(lower(p.location_name),'[^a-z0-9]','','g'),regexp_replace(lower(p.location_slug),'[^a-z0-9]','','g')));
  k:='staff-schedule:'||p.id||':r'||p.revision;
  notice:=jsonb_build_object('id',k,'eventKey',k,'category','schedule','severity','attention',
   'title',case when team then 'Team schedule published' else 'Your schedule is published' end,
   'body','Week of '||p.week_of||' is ready. Open The Hub to review revision '||p.revision||'.',
   'href',(case when team then '/staff-schedules' else '/my-schedule' end)||'?week='||p.week_of,
   'location','All Locations','createdAt',now(),'readAt','');
  insert into public.user_notification_state as s(user_id,inbox) values(recipient.user_id,jsonb_build_array(notice))
  on conflict(user_id) do update set inbox=(select coalesce(jsonb_agg(item order by idx),'[]'::jsonb) from jsonb_array_elements(jsonb_build_array(notice)||s.inbox) with ordinality v(item,idx) where idx<=100),updated_at=clock_timestamp();
 end loop;
end $$;
revoke all on function tcs_schedule_private.queue_publication(uuid) from public,anon,authenticated;
-- Preserve all current publication authorization, snapshot and revision behavior.
do $$
declare definition text; marker text:=E'  return query\n  select v_publication_id, v_revision, v_shift_count, v_unlinked_count;';
begin
 definition:=pg_get_functiondef('public.publish_staff_schedule(uuid,date,text)'::regprocedure);
 if position(marker in definition)=0 then raise exception 'Unexpected schedule publication function; no change applied';end if;
 definition:=replace(definition,marker,E'  perform tcs_schedule_private.queue_publication(v_publication_id);\n'||marker);
 execute definition;
end $$;
