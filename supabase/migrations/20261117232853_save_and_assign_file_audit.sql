-- Save the current checklist and link its correction tasks in one transaction.
-- If assignment fails, neither the checklist nor the task changes are committed.
create function public.save_and_assign_location_child_audit(p_file uuid,p_expected timestamptz,p_changes jsonb,p_due date)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.location_person_files; findings integer;
begin
 if not public.is_tcs_owner() then raise exception 'Audit leadership required';end if;
 select * into f from public.location_person_files where id=p_file and organization_id=public.current_staff_organization_id() for update;
 if f.id is null or f.child_id is null or not public.can_access_location(f.location_id) then raise exception 'Accessible child location file required';end if;
 if f.updated_at is distinct from p_expected then raise exception 'This file changed. Refresh before saving and assigning corrections';end if;
 if p_due is null or coalesce((p_changes->>'archived')::boolean,false) then raise exception 'Choose a correction due date and keep the child file active';end if;
 if jsonb_typeof(p_changes->'items') is distinct from 'array' or jsonb_array_length(p_changes->'items') not between 1 and 100 then raise exception 'Keep between 1 and 100 checklist items';end if;
 if exists(select 1 from jsonb_array_elements(f.items) i where not exists(select 1 from jsonb_array_elements(p_changes->'items') j where j->>'id'=i->>'id')) then raise exception 'Keep existing checklist items; mark N/A with a reason instead of deleting them';end if;
 if exists(select 1 from jsonb_array_elements(p_changes->'items') i where i->>'status'='N/A' and btrim(coalesce(i->>'note',''))='') then raise exception 'Add a reason for each N/A item';end if;
 update public.location_person_files set items=p_changes->'items',notes=coalesce(p_changes->>'notes',''),reviewed_by=coalesce(p_changes->>'reviewed_by',''),review_date=nullif(p_changes->>'review_date','')::date,follow_up=coalesce(p_changes->>'follow_up',''),template_confirmed=coalesce((p_changes->>'template_confirmed')::boolean,false),archived=false where id=f.id;
 findings:=public.audit_location_child_file(f.id,p_due,null,'Saved audit and assigned corrections together');
 select * into f from public.location_person_files where id=f.id;
 return jsonb_build_object('file',to_jsonb(f),'findings',findings);
end $$;
revoke all on function public.save_and_assign_location_child_audit(uuid,timestamptz,jsonb,date) from public,anon;
grant execute on function public.save_and_assign_location_child_audit(uuid,timestamptz,jsonb,date) to authenticated,service_role;
