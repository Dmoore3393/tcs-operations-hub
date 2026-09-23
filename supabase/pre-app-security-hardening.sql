-- TCS Operations Hub — Pre-App Security Hardening
-- Removes anonymous access to SECURITY DEFINER functions, keeps only the
-- authenticated RPCs required by RLS/client workflows, locks internal helpers
-- to service_role, and makes intentionally server-only tables explicit.

alter function public.tcs_module_for_table(text) set search_path = public;

revoke execute on function public.can_access_hub_state_key(text) from public, anon;
revoke execute on function public.can_access_location(uuid) from public, anon;
revoke execute on function public.can_read_child(uuid,text) from public, anon;
revoke execute on function public.can_read_hub_state_key(text) from public, anon;
revoke execute on function public.can_read_location_module(uuid,text) from public, anon;
revoke execute on function public.can_write_child(uuid) from public, anon;
revoke execute on function public.can_write_hub_state_key(text) from public, anon;
revoke execute on function public.can_write_location_module(uuid,text) from public, anon;
revoke execute on function public.current_staff_location_ids() from public, anon;
revoke execute on function public.current_staff_organization_id() from public, anon;
revoke execute on function public.current_staff_permissions() from public, anon;
revoke execute on function public.current_staff_role() from public, anon;
revoke execute on function public.has_staff_permission(text) from public, anon;
revoke execute on function public.is_active_tcs_staff() from public, anon;
revoke execute on function public.is_approved_tcs_pilot_user() from public, anon;
revoke execute on function public.is_tcs_admin() from public, anon;
revoke execute on function public.is_tcs_employee() from public, anon;
revoke execute on function public.is_tcs_licensee() from public, anon;
revoke execute on function public.is_tcs_owner() from public, anon;
revoke execute on function public.performance_team_members(uuid) from public, anon;
revoke execute on function public.publish_staff_schedule(uuid,date,text) from public, anon;
revoke execute on function public.record_audit_event(text,text,uuid,uuid,jsonb) from public, anon;

grant execute on function public.can_access_hub_state_key(text) to authenticated, service_role;
grant execute on function public.can_access_location(uuid) to authenticated, service_role;
grant execute on function public.can_read_child(uuid,text) to authenticated, service_role;
grant execute on function public.can_read_hub_state_key(text) to authenticated, service_role;
grant execute on function public.can_read_location_module(uuid,text) to authenticated, service_role;
grant execute on function public.can_write_child(uuid) to authenticated, service_role;
grant execute on function public.can_write_hub_state_key(text) to authenticated, service_role;
grant execute on function public.can_write_location_module(uuid,text) to authenticated, service_role;
grant execute on function public.current_staff_location_ids() to authenticated, service_role;
grant execute on function public.current_staff_organization_id() to authenticated, service_role;
grant execute on function public.current_staff_permissions() to authenticated, service_role;
grant execute on function public.current_staff_role() to authenticated, service_role;
grant execute on function public.has_staff_permission(text) to authenticated, service_role;
grant execute on function public.is_active_tcs_staff() to authenticated, service_role;
grant execute on function public.is_approved_tcs_pilot_user() to authenticated, service_role;
grant execute on function public.is_tcs_admin() to authenticated, service_role;
grant execute on function public.is_tcs_employee() to authenticated, service_role;
grant execute on function public.is_tcs_licensee() to authenticated, service_role;
grant execute on function public.is_tcs_owner() to authenticated, service_role;
grant execute on function public.performance_team_members(uuid) to authenticated, service_role;
grant execute on function public.publish_staff_schedule(uuid,date,text) to authenticated, service_role;
grant execute on function public.record_audit_event(text,text,uuid,uuid,jsonb) to authenticated, service_role;

revoke execute on function public.audit_global_row_change() from public, anon, authenticated;
revoke execute on function public.audit_hub_state_change() from public, anon, authenticated;
revoke execute on function public.audit_location_row_change() from public, anon, authenticated;
revoke execute on function public.documents_eligible_for_purge() from public, anon, authenticated;
revoke execute on function public.prevent_audit_log_mutation() from public, anon, authenticated;
revoke execute on function public.prevent_relational_hub_state_write() from public, anon, authenticated;
revoke execute on function public.refresh_child_location_membership(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.refresh_child_membership_trigger() from public, anon, authenticated;
revoke execute on function public.refresh_child_primary_membership_trigger() from public, anon, authenticated;
revoke execute on function public.resolve_tcs_location_id(text,uuid) from public, anon, authenticated;
revoke execute on function public.sync_staff_location_assignments_for_user(uuid) from public, anon, authenticated;
revoke execute on function public.sync_staff_location_assignments_trigger() from public, anon, authenticated;

grant execute on function public.audit_global_row_change() to service_role;
grant execute on function public.audit_hub_state_change() to service_role;
grant execute on function public.audit_location_row_change() to service_role;
grant execute on function public.documents_eligible_for_purge() to service_role;
grant execute on function public.prevent_audit_log_mutation() to service_role;
grant execute on function public.prevent_relational_hub_state_write() to service_role;
grant execute on function public.refresh_child_location_membership(uuid,uuid) to service_role;
grant execute on function public.refresh_child_membership_trigger() to service_role;
grant execute on function public.refresh_child_primary_membership_trigger() to service_role;
grant execute on function public.resolve_tcs_location_id(text,uuid) to service_role;
grant execute on function public.sync_staff_location_assignments_for_user(uuid) to service_role;
grant execute on function public.sync_staff_location_assignments_trigger() to service_role;

drop policy if exists "organizations server only" on public.organizations;
create policy "organizations server only" on public.organizations
for all to anon, authenticated using (false) with check (false);

drop policy if exists "staff invitations server only" on public.staff_invitations;
create policy "staff invitations server only" on public.staff_invitations
for all to anon, authenticated using (false) with check (false);

drop policy if exists "clock exception approvers server only" on public.staff_clock_exception_approvers;
create policy "clock exception approvers server only" on public.staff_clock_exception_approvers
for all to anon, authenticated using (false) with check (false);

drop policy if exists "clock exceptions server only" on public.staff_clock_exceptions;
create policy "clock exceptions server only" on public.staff_clock_exceptions
for all to anon, authenticated using (false) with check (false);
