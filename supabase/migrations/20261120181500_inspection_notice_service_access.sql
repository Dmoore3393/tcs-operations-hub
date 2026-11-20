-- release_inspection is an invoker RPC used by the trusted server role.
grant usage on schema tcs_files_private to service_role;
grant execute on function tcs_files_private.notify_inspection_release(uuid,uuid) to service_role;
