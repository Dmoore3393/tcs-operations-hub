-- A custody confirmation, its staff inbox entries and its pending pushes commit together.
create schema if not exists tcs_transport_private;
revoke all on schema tcs_transport_private from public, anon, authenticated;

create table public.transport_custody_deliveries (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  route_id uuid not null references public.transportation_routes(id) on delete cascade,
  user_id uuid not null references public.staff_access(user_id) on delete cascade,
  event_key text not null,
  notification jsonb not null,
  created_at timestamptz not null default now(),
  claimed_until timestamptz,
  lease_id uuid,
  delivered_at timestamptz,
  unique (user_id, event_key)
);
create index transport_custody_pending on public.transport_custody_deliveries(organization_id,id) where delivered_at is null;
alter table public.transport_custody_deliveries enable row level security;
revoke all on public.transport_custody_deliveries from public, anon, authenticated;
grant select, update, delete on public.transport_custody_deliveries to service_role;

create function tcs_transport_private.record_custody() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := new.record_data;
  prior jsonb := old.record_data;
  day date; plan jsonb; stage record; recipient record; notice jsonb;
  happened timestamptz; title text; body text; key text; child text; driver text; vehicle text;
  pickup text; destination text; site text; destination_site text; actor text; recorder text;
  details text; delivery bigint; stage_rank integer;
begin
  if rec->>'runDate' is null or rec->>'runDate' !~ '^\d{4}-\d{2}-\d{2}$' then return new; end if;
  stage_rank := case rec->>'runStatus' when 'Picked Up' then 1 when 'Arrived' then 2 when 'Checked In' then 3 when 'Dropped Off' then 3 else 0 end;
  if stage_rank=0 then return new; end if;
  begin day := (rec->>'runDate')::date;
  exception when invalid_datetime_format or datetime_field_overflow then return new; end;
  select s.plan_data into plan from public.transportation_day_stops s
   where s.organization_id=new.organization_id and s.route_id=new.id and s.service_date=day;
  plan := rec || coalesce(plan,'{}'::jsonb);
  select l.name into site from public.locations l where l.id=new.location_id and l.organization_id=new.organization_id;
  child := coalesce(nullif(btrim(plan->>'child'),''),nullif(new.child_name,''),'Child on route');
  driver := coalesce(case when plan->>'coveringDate'=day::text then nullif(btrim(plan->>'coveringDriver'),'') end, nullif(btrim(plan->>'driver'),''),'Driver unassigned');
  vehicle := nullif(btrim(plan->>'vehicle'),'');
  if plan->>'tripPeriod'='Morning' then
    pickup := coalesce(nullif(plan->>'pickupLocation',''),site);
    destination := nullif(plan->>'school','');
  else
    pickup := nullif(plan->>'school','');
    destination := coalesce(nullif(plan->>'dropoffLocation',''),site);
  end if;
  pickup := coalesce(pickup,'pickup location unrecorded');
  destination := coalesce(destination,'destination unrecorded');
  select l.name into destination_site from public.locations l where l.organization_id=new.organization_id and l.slug=public.tcs_location_slug(destination);
  select a.full_name into actor from public.staff_access a where a.user_id=auth.uid() and a.organization_id=new.organization_id;
  -- One offline sync can contain all three confirmations. Keep their actual times.
  for stage in select * from (values
    (1,'pickup',rec->>'pickedUpAt',prior->>'pickedUpAt',rec->>'pickedUpBy'),
    (2,'arrival',rec->>'arrivedAt',prior->>'arrivedAt',rec->>'arrivedBy'),
    (3,'handoff',coalesce(rec->>'droppedOffAt',rec->>'checkedInAt'),coalesce(prior->>'droppedOffAt',prior->>'checkedInAt'),coalesce(rec->>'droppedOffBy',rec->>'checkedInBy'))
  ) s(rank,kind,at_value,old_value,by_name) order by rank loop
    if stage.rank>stage_rank or nullif(stage.at_value,'') is null or
      (rec->>'runDate' is not distinct from prior->>'runDate' and stage.at_value is not distinct from stage.old_value) then continue; end if;
    begin happened := stage.at_value::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then continue; end;
    if (happened at time zone 'America/Los_Angeles')::date<>day then continue; end if;
    key := 'transport-custody:'||new.id::text||':'||stage.kind||':'||extract(epoch from happened)::text;
    recorder := coalesce(actor,nullif(stage.by_name,''));
    title := child || case stage.kind when 'pickup' then ' picked up' when 'arrival' then ' arrived' else ' handed off' end;
    details := case stage.kind when 'pickup' then 'Picked up at '||pickup||'. Heading to '||destination||'.'
      when 'arrival' then 'At '||destination||'. Awaiting handoff.'
      else 'Handoff complete at '||destination||'.' end;
    body := to_char(happened at time zone 'America/Los_Angeles','Mon FMDD, FMHH12:MI AM')||' · '||driver||coalesce(' · '||vehicle,'')||'. '||details;
    if recorder is not null and recorder<>driver then body:=body||' Recorded by '||recorder||'.'; end if;

    for recipient in
      select a.user_id, scope.route_access,
        case when scope.destination_care then destination_site else site end as note_location
      from public.staff_access a
      cross join lateral (select
        public.is_tcs_owner_role_text(a.role) or lower(trim(a.role)) in ('location licensee','licensee','licensee/admin','licensee / admin') or 'transportation'=any(a.permissions) as route_access,
        destination_site is not null and ('All Locations'=any(a.locations) or exists(select 1 from unnest(a.locations) loc where public.tcs_location_slug(loc)=public.tcs_location_slug(destination_site))) as destination_care,
        'All Locations'=any(a.locations) or exists(select 1 from unnest(a.locations) loc where public.tcs_location_slug(loc)=public.tcs_location_slug(site)) as origin_care
      ) scope
      where a.organization_id=new.organization_id and a.is_active and
        (public.is_tcs_owner_role_text(a.role) or
         (scope.route_access and exists(select 1 from public.staff_location_assignments x where x.organization_id=a.organization_id and x.user_id=a.user_id and x.location_id=new.location_id)) or
         (a.permissions && array['children_basic','daily_care','schedules','ratios']::text[] and (scope.origin_care or scope.destination_care)))
      order by a.user_id
    loop
      notice:=jsonb_build_object('id',key,'eventKey',key,'category','transportation','severity','info','title',title,'body',body,
        'href',case when recipient.route_access then '/transportation?view=all&update='||new.id::text||'-'||stage.kind||'-'||extract(epoch from happened)::text||'#transportation-status' else '/notifications' end,
        'location',recipient.note_location,'createdAt',happened,'readAt','');
      insert into public.transport_custody_deliveries(organization_id,route_id,user_id,event_key,notification)
        values(new.organization_id,new.id,recipient.user_id,key,notice)
        on conflict(user_id,event_key) do nothing returning id into delivery;
      if delivery is null then continue; end if;
      insert into public.user_notification_state as n(user_id,inbox) values(recipient.user_id,jsonb_build_array(notice))
        on conflict(user_id) do update set inbox=(select coalesce(jsonb_agg(item order by idx),'[]') from
          jsonb_array_elements(excluded.inbox||n.inbox) with ordinality v(item,idx) where idx<=100), updated_at=now();
    end loop;
  end loop;
  return new;
end $$;
revoke all on function tcs_transport_private.record_custody() from public, anon, authenticated;
create trigger transport_confirmed_custody after update of record_data on public.transportation_routes
for each row when (new.record_data is distinct from old.record_data)
execute function tcs_transport_private.record_custody();

create function public.claim_transport_custody_pushes(p_org uuid,p_lease uuid,p_limit integer default 32)
returns table(id bigint,user_id uuid,notification jsonb)
language sql security invoker set search_path='' as $$
  with pending as (
    select q.id from public.transport_custody_deliveries q where q.organization_id=p_org and q.delivered_at is null
      and (q.claimed_until is null or q.claimed_until<now())
      and q.created_at>now()-interval '1 day'
      and not exists (select 1 from public.transport_custody_deliveries earlier
        where earlier.organization_id=q.organization_id and earlier.user_id=q.user_id and earlier.id<q.id
          and earlier.delivered_at is null and earlier.created_at>now()-interval '1 day')
    order by q.id limit least(greatest(p_limit,1),64) for update skip locked
  ) update public.transport_custody_deliveries q set lease_id=p_lease,claimed_until=now()+interval '2 minutes'
    from pending where q.id=pending.id returning q.id,q.user_id,q.notification;
$$;
revoke all on function public.claim_transport_custody_pushes(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.claim_transport_custody_pushes(uuid,uuid,integer) to service_role;
