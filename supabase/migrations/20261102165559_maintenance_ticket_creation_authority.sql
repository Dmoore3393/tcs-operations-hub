-- Licensees and administration create tickets; authorized maintenance staff update existing work.
create or replace function public.save_maintenance_ticket(p_org uuid,p_actor uuid,p_location uuid,p_previous_location uuid,p_ticket jsonb,p_expected_version integer)
returns integer language plpgsql security invoker set search_path=public as $$
declare actor public.staff_access; board public.hub_state; previous jsonb; next_value jsonb; owner_actor boolean; manager_actor boolean; ticket_id text;
begin
 select * into actor from public.staff_access where user_id=p_actor and organization_id=p_org and is_active;
 if not found then raise exception 'Active staff required';end if;
 owner_actor:=lower(trim(actor.role)) in ('owner / admin','owner/admin','owner / director','administrator','admin','director','corporate / admin','corporate admin','operations admin');
 manager_actor:=owner_actor or lower(trim(actor.role)) in ('location licensee','licensee','licensee/admin','licensee / admin') or (lower(trim(actor.role)) in ('employee','teacher','driver','teacher in training','scanning support') and 'maintenance_manage'=any(actor.permissions));
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
 if previous is null and not (owner_actor or lower(trim(actor.role)) in ('location licensee','licensee','licensee/admin','licensee / admin')) then raise exception 'Only licensees and administration can create maintenance tickets';end if;
 if previous is not null and not owner_actor and (p_previous_location is null or not exists(select 1 from public.staff_location_assignments where user_id=p_actor and organization_id=p_org and location_id=p_previous_location)) then raise exception 'Original location not assigned';end if;
 if previous is null then next_value:=board.state_value||jsonb_build_array(p_ticket);
 else select jsonb_agg(case when item->>'id'=ticket_id then p_ticket else item end order by position) into next_value from jsonb_array_elements(board.state_value) with ordinality as entries(item,position);end if;
 update public.hub_state set state_value=next_value,version=board.version+1,updated_by=p_actor,updated_at=clock_timestamp() where organization_id=p_org and state_key='tcs-maintenance-tickets-v1';
 insert into public.audit_log(organization_id,location_id,actor_user_id,action,table_name,metadata) values(p_org,p_location,p_actor,case when previous is null then 'CREATE' else 'UPDATE' end,'hub_state',jsonb_build_object('kind','maintenance_ticket','ticket_id',ticket_id,'before',previous,'after',p_ticket));
 return board.version+1;
end $$;
revoke all on function public.save_maintenance_ticket(uuid,uuid,uuid,uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.save_maintenance_ticket(uuid,uuid,uuid,uuid,jsonb,integer) to service_role;

