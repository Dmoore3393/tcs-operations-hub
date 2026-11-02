-- Approval authority applies to recurring care schedules as well as calendar decisions.
create or replace function public.can_approve_child_schedules(p_location uuid)
returns boolean language sql stable security invoker set search_path=public as $$
 select public.is_approved_tcs_pilot_user() and public.can_access_location(p_location) and
 (public.is_tcs_licensee() or (public.is_tcs_owner() and exists(select 1 from public.staff_access where user_id=auth.uid() and is_active and lower(trim(full_name)) in ('danielle moore','jennifer thomason'))));
$$;
revoke all on function public.can_approve_child_schedules(uuid) from public,anon;
grant execute on function public.can_approve_child_schedules(uuid) to authenticated,service_role;
drop policy if exists "location insert" on public.child_schedules;
create policy "location insert" on public.child_schedules for insert to authenticated with check(organization_id=public.current_staff_organization_id() and public.can_approve_child_schedules(location_id));
drop policy if exists "location update" on public.child_schedules;
create policy "location update" on public.child_schedules for update to authenticated using(organization_id=public.current_staff_organization_id() and public.can_approve_child_schedules(location_id)) with check(organization_id=public.current_staff_organization_id() and public.can_approve_child_schedules(location_id));
drop policy if exists "location delete" on public.child_schedules;
create policy "location delete" on public.child_schedules for delete to authenticated using(organization_id=public.current_staff_organization_id() and public.can_approve_child_schedules(location_id));

-- Server-only, version-checked writes to the existing maintenance collection.
create or replace function public.save_maintenance_ticket(p_org uuid,p_actor uuid,p_location uuid,p_previous_location uuid,p_ticket jsonb,p_expected_version integer)
returns integer language plpgsql security invoker set search_path=public as $$
declare actor public.staff_access; board public.hub_state; previous jsonb; next_value jsonb; owner_actor boolean; manager_actor boolean; ticket_id text;
begin
 select * into actor from public.staff_access where user_id=p_actor and organization_id=p_org and is_active;
 if not found then raise exception 'Active staff required';end if;
 owner_actor:=lower(trim(actor.role)) in ('owner / admin','owner/admin','owner / director','administrator','admin','director','corporate / admin','corporate admin','operations admin');
 manager_actor:=owner_actor or lower(trim(actor.role)) in ('location licensee','licensee','licensee/admin','licensee / admin') or (lower(trim(actor.role)) in ('employee','teacher','driver','teacher in training','scanning support') and ('maintenance_manage'=any(actor.permissions) or ('health_safety'=any(actor.permissions) and not 'maintenance_view'=any(actor.permissions))));
 if not manager_actor then raise exception 'Maintenance management access required';end if;
 if not exists(select 1 from public.locations where id=p_location and organization_id=p_org and is_active) or (not owner_actor and not exists(select 1 from public.staff_location_assignments where user_id=p_actor and organization_id=p_org and location_id=p_location)) then raise exception 'Location not assigned';end if;
 ticket_id:=p_ticket->>'id';
 if jsonb_typeof(p_ticket)<>'object' or coalesce(length(ticket_id),0) not between 1 and 200 or coalesce(length(trim(p_ticket->>'title')),0) not between 1 and 200 then raise exception 'Invalid maintenance ticket';end if;
 insert into public.hub_state(organization_id,state_key,state_value,version,updated_by) values(p_org,'tcs-maintenance-tickets-v1','[]'::jsonb,0,p_actor) on conflict(organization_id,state_key) do nothing;
 select * into board from public.hub_state where organization_id=p_org and state_key='tcs-maintenance-tickets-v1' for update;
 if board.version is distinct from p_expected_version then raise exception 'Maintenance board changed';end if;
 if jsonb_typeof(board.state_value)<>'array' then raise exception 'Maintenance data requires review';end if;
 if (select count(*) from jsonb_array_elements(board.state_value) item where item->>'id'=ticket_id)>1 then raise exception 'Duplicate ticket identifiers require review';end if;
 select item into previous from jsonb_array_elements(board.state_value) item where item->>'id'=ticket_id;
 if previous is not null and not owner_actor and (p_previous_location is null or not exists(select 1 from public.staff_location_assignments where user_id=p_actor and organization_id=p_org and location_id=p_previous_location)) then raise exception 'Original location not assigned';end if;
 if previous is null then next_value:=board.state_value||jsonb_build_array(p_ticket);
 else select jsonb_agg(case when item->>'id'=ticket_id then p_ticket else item end order by position) into next_value from jsonb_array_elements(board.state_value) with ordinality as entries(item,position);end if;
 update public.hub_state set state_value=next_value,version=board.version+1,updated_by=p_actor,updated_at=clock_timestamp() where organization_id=p_org and state_key='tcs-maintenance-tickets-v1';
 insert into public.audit_log(organization_id,location_id,actor_user_id,action,table_name,metadata) values(p_org,p_location,p_actor,case when previous is null then 'CREATE' else 'UPDATE' end,'hub_state',jsonb_build_object('kind','maintenance_ticket','ticket_id',ticket_id,'before',previous,'after',p_ticket));
 return board.version+1;
end $$;
revoke all on function public.save_maintenance_ticket(uuid,uuid,uuid,uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.save_maintenance_ticket(uuid,uuid,uuid,uuid,jsonb,integer) to service_role;

-- Enforce the same authority on server-created approvals and dated care overrides.
create or replace function public.authorized_care_reviewer(p_actor uuid,p_org uuid,p_location uuid)
returns boolean language sql stable security invoker set search_path=public as $$
 select exists(select 1 from public.staff_access a join public.locations l on l.id=p_location and l.organization_id=a.organization_id and l.is_active
 where a.user_id=p_actor and a.organization_id=p_org and a.is_active and
 ((lower(trim(a.role)) in ('owner / admin','owner/admin','owner / director','administrator','admin','director','corporate / admin','corporate admin','operations admin') and lower(trim(a.full_name)) in ('danielle moore','jennifer thomason')) or
 (lower(trim(a.role)) in ('location licensee','licensee','licensee/admin','licensee / admin') and exists(select 1 from public.staff_location_assignments s where s.user_id=a.user_id and s.organization_id=p_org and s.location_id=p_location))));
$$;
revoke all on function public.authorized_care_reviewer(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.authorized_care_reviewer(uuid,uuid,uuid) to service_role;
create or replace function public.guard_care_schedule_review()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if tg_table_name='child_schedule_overrides' then
  if not public.authorized_care_reviewer(new.approved_by,new.organization_id,new.location_id) then raise exception 'Only assigned licensees, Danielle and Jennifer can approve care';end if;
 elsif new.status in ('Approved','Needs Changes','Unable to Accommodate') then
  if not public.authorized_care_reviewer(new.reviewed_by,new.organization_id,new.location_id) then raise exception 'Only assigned licensees, Danielle and Jennifer can review care requests';end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_care_schedule_review() from public,anon,authenticated;
grant execute on function public.guard_care_schedule_review() to service_role;
create trigger family_schedule_review_authority before insert or update on public.family_schedule_submissions for each row execute function public.guard_care_schedule_review();
create trigger dated_care_approval_authority before insert or update on public.child_schedule_overrides for each row execute function public.guard_care_schedule_review();
