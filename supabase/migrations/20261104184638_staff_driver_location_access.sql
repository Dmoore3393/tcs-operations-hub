-- Route validation needs only driver eligibility, not another staff member's
-- private account row. Keep staff_access RLS and every saved permission intact.
create table public.transport_driver_access (
 user_id uuid primary key references public.staff_access(user_id) on delete cascade,
 organization_id uuid not null references public.organizations(id),
 all_locations boolean not null default false,
 location_ids uuid[] not null default '{}'
);
create index transport_driver_access_organization_idx on public.transport_driver_access(organization_id);
alter table public.transport_driver_access enable row level security;
revoke all on public.transport_driver_access from anon,authenticated;
grant select on public.transport_driver_access to authenticated;
grant all on public.transport_driver_access to service_role;
create policy transport_driver_access_read on public.transport_driver_access for select to authenticated using (
 organization_id=(select public.current_staff_organization_id())
 and (select public.is_approved_tcs_pilot_user())
 and ((select public.is_tcs_owner()) or (select public.is_tcs_licensee()) or exists(
  select 1 from public.staff_access a where a.user_id=(select auth.uid()) and a.is_active and 'transportation'=any(a.permissions)
 ))
);

create function public.refresh_transport_driver_access(p_user uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare account public.staff_access;
begin
 select * into account from public.staff_access where user_id=p_user;
 if not found or not account.is_active then
  delete from public.transport_driver_access where user_id=p_user;return;
 end if;
 insert into public.transport_driver_access(user_id,organization_id,all_locations,location_ids)
 values(account.user_id,account.organization_id,
  lower(trim(account.role)) in ('owner / admin','owner/admin','owner / director','administrator','admin','director','corporate / admin','corporate admin','operations admin'),
  array(select x.location_id from public.staff_location_assignments x where x.user_id=account.user_id and x.organization_id=account.organization_id order by x.location_id))
 on conflict(user_id) do update set organization_id=excluded.organization_id,all_locations=excluded.all_locations,location_ids=excluded.location_ids;
end $$;
revoke all on function public.refresh_transport_driver_access(uuid) from public,anon,authenticated;
grant execute on function public.refresh_transport_driver_access(uuid) to service_role;

-- Reuse the existing trusted account-sync trigger, preserving its security mode.
-- This also covers active/paused accounts that have zero location assignments.
create or replace function public.sync_staff_location_assignments_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform public.sync_staff_location_assignments_for_user(new.user_id);
 perform public.refresh_transport_driver_access(new.user_id);
 return new;
end $$;
revoke all on function public.sync_staff_location_assignments_trigger() from public,anon,authenticated;

-- Assignment writes are service-only (or inside the existing trusted sync).
create function public.refresh_transport_driver_assignment_access()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if tg_op='DELETE' then
  perform public.refresh_transport_driver_access(old.user_id);return old;
 end if;
 if tg_op='UPDATE' and old.user_id is distinct from new.user_id then perform public.refresh_transport_driver_access(old.user_id);end if;
 perform public.refresh_transport_driver_access(new.user_id);return new;
end $$;
revoke all on function public.refresh_transport_driver_assignment_access() from public,anon,authenticated;
create trigger staff_assignments_transport_access after insert or update or delete on public.staff_location_assignments
 for each row execute function public.refresh_transport_driver_assignment_access();

-- Populate only the safe eligibility projection. No staff, location assignment,
-- department, role, maintenance access, or notification preference is changed.
do $$ declare staff_id uuid;begin
 for staff_id in select user_id from public.staff_access loop perform public.refresh_transport_driver_access(staff_id);end loop;
end $$;

create or replace function public.transport_driver_lane(p_org uuid,p_data jsonb,p_location uuid)
returns uuid language plpgsql security invoker set search_path=public as $$
declare lane public.staff_lane_profiles; matches integer;
begin
 if coalesce(p_data->>'driverLaneId','')<>'' then
  select * into lane from public.staff_lane_profiles where organization_id=p_org and id=(p_data->>'driverLaneId')::uuid and is_active;
  if not found or lane.full_name is distinct from p_data->>'driver' then raise exception 'Choose an active driver from the staff dropdown';end if;
 else
  select count(*) into matches from public.staff_lane_profiles where organization_id=p_org and is_active and full_name=p_data->>'driver';
  if matches<>1 then return null;end if;
  select * into lane from public.staff_lane_profiles where organization_id=p_org and is_active and full_name=p_data->>'driver';
 end if;
 if lane.staff_user_id is not null and not exists(
  select 1 from public.transport_driver_access a where a.user_id=lane.staff_user_id and a.organization_id=p_org
   and (a.all_locations or p_location=any(a.location_ids))
 ) then raise exception 'The selected driver needs active Hub access to this location. Update their assigned locations in Team Access first';end if;
 return lane.id;
end $$;
revoke all on function public.transport_driver_lane(uuid,jsonb,uuid) from public,anon;
grant execute on function public.transport_driver_lane(uuid,jsonb,uuid) to authenticated,service_role;
