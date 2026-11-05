-- A confirmed pickup or final handoff goes to every active childcare leader in the organization.
-- The personnel lane also covers a site or regional leader whose technical account role is Employee.
create function public.is_transport_alert_leader(p_org uuid, p_user uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists (
    select 1 from public.staff_access a
    where a.organization_id=p_org and a.user_id=p_user and a.is_active and (
      public.is_tcs_owner_role_text(a.role)
      or lower(trim(a.role)) in ('location licensee','licensee','licensee/admin','licensee / admin')
      or (
        lower(trim(a.role)) in ('employee','teacher','driver','teacher in training','scanning support') and exists (
          select 1 from public.staff_lane_profiles l
          where l.organization_id=a.organization_id and l.staff_user_id=a.user_id and l.is_active
            and l.lane_level between 1 and 3 and lower(trim(coalesce(l.department,''))) <> 'maintenance'
        )
      )
    )
  );
$$;
revoke all on function public.is_transport_alert_leader(uuid,uuid) from public,anon,authenticated;
grant execute on function public.is_transport_alert_leader(uuid,uuid) to service_role;

create or replace function tcs_transport_private.record_custody() returns trigger
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
    (3,'handoff',coalesce(nullif(rec->>'droppedOffAt',''),rec->>'checkedInAt'),coalesce(nullif(prior->>'droppedOffAt',''),prior->>'checkedInAt'),coalesce(nullif(rec->>'droppedOffBy',''),rec->>'checkedInBy'))
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
      select a.user_id, scope.route_access, scope.required_confirmation,
        case when scope.destination_care then destination_site else site end as note_location
      from public.staff_access a
      cross join lateral (select
        stage.kind in ('pickup','handoff') and public.is_transport_alert_leader(a.organization_id,a.user_id) as required_confirmation,
        public.is_tcs_owner_role_text(a.role) or lower(trim(a.role)) in ('location licensee','licensee','licensee/admin','licensee / admin') or 'transportation'=any(a.permissions) as route_access,
        destination_site is not null and ('All Locations'=any(a.locations) or exists(select 1 from unnest(a.locations) loc where public.tcs_location_slug(loc)=public.tcs_location_slug(destination_site))) as destination_care,
        'All Locations'=any(a.locations) or exists(select 1 from unnest(a.locations) loc where public.tcs_location_slug(loc)=public.tcs_location_slug(site)) as origin_care
      ) scope
      where a.organization_id=new.organization_id and a.is_active and
        (scope.required_confirmation or public.is_tcs_owner_role_text(a.role) or
         (scope.route_access and exists(select 1 from public.staff_location_assignments x where x.organization_id=a.organization_id and x.user_id=a.user_id and x.location_id=new.location_id)) or
         (a.permissions && array['children_basic','daily_care','schedules','ratios']::text[] and (scope.origin_care or scope.destination_care)))
      order by a.user_id
    loop
      notice:=jsonb_build_object('id',key,'eventKey',key,'category','transportation','severity','info','title',title,'body',body,
        'href',case when recipient.route_access then '/transportation?view=all&update='||new.id::text||'-'||stage.kind||'-'||extract(epoch from happened)::text||'#transportation-status' else '/notifications' end,
        'location',recipient.note_location,'createdAt',happened,'readAt','','transportOrganizationId',new.organization_id)
        || case when recipient.required_confirmation then '{"requiredTransportConfirmation":true}'::jsonb else '{}'::jsonb end;
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

-- A concurrent settings change or mark-read request can carry an older inbox snapshot.
-- Preserve a newly committed leadership confirmation while retaining the usual 100-entry limit.
create function tcs_transport_private.retain_leadership_confirmations() returns trigger
language plpgsql security invoker set search_path='' as $$
declare rescued jsonb;
begin
  select jsonb_agg(v.item) into rescued
    from jsonb_array_elements(old.inbox) v(item)
    where v.item @> '{"requiredTransportConfirmation":true}'
      and not exists (select 1 from jsonb_array_elements(new.inbox) n(item) where n.item->>'id'=v.item->>'id');
  if rescued is not null then
    select jsonb_agg(kept.item order by kept.stamp desc nulls last,kept.idx) into new.inbox
    from (select v.item,v.item->>'createdAt' as stamp,v.idx
      from jsonb_array_elements(new.inbox||rescued) with ordinality v(item,idx)
      order by stamp desc nulls last,v.idx limit 100) kept;
  end if;
  return new;
end $$;
revoke all on function tcs_transport_private.retain_leadership_confirmations() from public,anon,authenticated;
create trigger retain_transport_leadership_confirmations before update of inbox on public.user_notification_state
for each row when (old.inbox @> '[{"requiredTransportConfirmation":true}]'::jsonb and new.inbox is distinct from old.inbox)
execute function tcs_transport_private.retain_leadership_confirmations();
