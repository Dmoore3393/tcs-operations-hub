-- Transportation writers run as the signed-in caller and need this lookup.
-- Use the caller's existing locations RLS instead of granting a definer bypass.
alter function public.resolve_tcs_location_id(text,uuid) security invoker;
revoke execute on function public.resolve_tcs_location_id(text,uuid) from public,anon;
grant execute on function public.resolve_tcs_location_id(text,uuid) to authenticated,service_role;
