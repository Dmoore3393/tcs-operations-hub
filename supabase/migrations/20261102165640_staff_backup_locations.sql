-- Main location stays in staff_access.locations. Backup scope uses the existing assignment table.
create or replace function public.sync_staff_location_assignments_for_user(p_user_id uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare v_staff public.staff_access; v_name text; v_slug text;
begin
 select * into v_staff from public.staff_access where user_id=p_user_id;
 if not found then return;end if;
 delete from public.staff_location_assignments where user_id=p_user_id;
 if not v_staff.is_active then return;end if;
 if public.is_tcs_owner_role_text(v_staff.role) or lower(trim(v_staff.role)) in ('location licensee','licensee','licensee/admin','licensee / admin','employee','teacher','driver','teacher in training','scanning support') or 'All Locations'=any(v_staff.locations) then
  insert into public.staff_location_assignments(organization_id,user_id,location_id) select v_staff.organization_id,v_staff.user_id,l.id from public.locations l where l.organization_id=v_staff.organization_id and l.is_active on conflict do nothing;return;
 end if;
 foreach v_name in array coalesce(v_staff.locations,array[]::text[]) loop
  v_slug:=public.tcs_location_slug(v_name);
  if v_slug is not null then insert into public.staff_location_assignments(organization_id,user_id,location_id) select v_staff.organization_id,v_staff.user_id,l.id from public.locations l where l.organization_id=v_staff.organization_id and l.slug=v_slug and l.is_active on conflict do nothing;end if;
 end loop;
end $$;
revoke all on function public.sync_staff_location_assignments_for_user(uuid) from public,anon,authenticated;
grant execute on function public.sync_staff_location_assignments_for_user(uuid) to service_role;
-- The existing staff_access trigger calls this writer after invitations and access edits.
do $$ declare staff_id uuid;begin
 for staff_id in select user_id from public.staff_access where is_active and lower(trim(role)) in ('location licensee','licensee','licensee/admin','licensee / admin','employee','teacher','driver','teacher in training','scanning support') loop perform public.sync_staff_location_assignments_for_user(staff_id);end loop;
end $$;
-- Newly opened locations are available for staff backup without changing anyone's main assignment.
create function public.assign_open_site_staff_backup() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.is_active then
  insert into public.staff_location_assignments(organization_id,user_id,location_id) select new.organization_id,a.user_id,new.id from public.staff_access a where a.organization_id=new.organization_id and a.is_active and lower(trim(a.role)) in ('location licensee','licensee','licensee/admin','licensee / admin','employee','teacher','driver','teacher in training','scanning support') on conflict do nothing;
 end if;return new;
end $$;
revoke all on function public.assign_open_site_staff_backup() from public,anon,authenticated;
create trigger locations_staff_backup after insert or update of is_active on public.locations for each row execute function public.assign_open_site_staff_backup();
