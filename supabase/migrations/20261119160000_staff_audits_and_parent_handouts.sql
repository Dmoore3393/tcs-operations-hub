-- Extend the existing location workflow; no records/uploads are moved or replaced.
alter table public.location_file_findings alter column child_id drop not null;
alter table public.location_file_findings add column staff_lane_id uuid references public.staff_lane_profiles(id);
alter table public.location_file_findings add constraint location_finding_one_person check ((child_id is not null)::int+(staff_lane_id is not null)::int=1);
create function tcs_files_private.parent_handout(p_name text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(p_name !~* 'acknowledg|signature|signed|receipt' and p_name ~* '(LIC[[:space:]]*(995E|995F|9212)([^[:alnum:]]|$)|PUB[[:space:]]*(515|271)([^[:alnum:]]|$)|^Family Handbook$)',false)
$$;
revoke all on function tcs_files_private.parent_handout(text) from public,anon;
grant execute on function tcs_files_private.parent_handout(text) to service_role;
create function tcs_files_private.validate_parent_delivery() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from jsonb_array_elements(new.items) i where i->>'status'='Given to parent' and (new.child_id is null or not tcs_files_private.parent_handout(i->>'name') or coalesce(i->>'dateChecked','')='')) then raise exception 'Record delivery only for parent handouts, with the date given; retain signed acknowledgments separately';end if;
 return new;
end $$;
revoke all on function tcs_files_private.validate_parent_delivery() from public,anon,authenticated;
create trigger location_file_parent_delivery before insert or update of items on public.location_person_files for each row execute function tcs_files_private.validate_parent_delivery();
create or replace function public.audit_location_child_file(p_file uuid,p_due date,p_assignee uuid,p_notes text) returns integer language plpgsql security definer set search_path='' as $$
declare f public.location_person_files; i jsonb; n integer:=0; assignee uuid; site_name text; matched integer; legacy_id text;
begin
 select * into f from public.location_person_files where id=p_file and organization_id=public.current_staff_organization_id() for update;
 if f.id is null or not public.is_tcs_owner() or not public.can_access_location(f.location_id) then raise exception 'Danielle/administration must audit an accessible child or staff location file';end if;
 select name into site_name from public.locations where id=f.location_id;
 select responsible_user_id into assignee from public.location_roster_settings where location_id=f.location_id;
 assignee:=coalesce(p_assignee,assignee);
 if lower(site_name) like '%halcom%' then
  select (array_agg(user_id))[1],count(*) into assignee,matched from public.staff_access where organization_id=f.organization_id and is_active and lower(full_name) in ('latrice moore','miss latrice','latrice');
  if matched<>1 then raise exception 'Confirm the unique Miss Latrice staff account before assigning Halcom corrections';end if;
 end if;
 if assignee is null or not exists(select 1 from public.staff_access where user_id=assignee and organization_id=f.organization_id and is_active) then raise exception 'Configure the responsible person; Halcom corrections belong to Miss Latrice';end if;
 if p_due is null then raise exception 'A correction due date is required';end if;
 for i in select value from jsonb_array_elements(f.items) loop
  if i->>'status' in ('Missing','Not Checked','Correction needed') or (i->>'status'='On File' and coalesce(i->>'tracksExpiration','true')<>'false' and nullif(i->>'expirationDate','') is not null and (i->>'expirationDate')::date<(now() at time zone 'America/Los_Angeles')::date) then
   legacy_id:=null;
   select task->>'id' into legacy_id from public.hub_state h cross join lateral jsonb_array_elements(h.state_value) task where h.organization_id=f.organization_id and h.state_key='tcs-work-tasks' and task->>'locationFileId'=f.id::text and task->>'checklistItemId'=i->>'id' and coalesce(task->>'completed','false')<>'true' limit 1;
   insert into public.location_file_findings(organization_id,location_id,file_id,child_id,staff_lane_id,item_id,item_name,assigned_user_id,due_date,correction,notes,audited_by,legacy_task_id)
   values(f.organization_id,f.location_id,f.id,f.child_id,f.staff_lane_id,i->>'id',i->>'name',assignee,p_due,coalesce(nullif(i->>'note',''),'Provide and verify '||(i->>'name')),coalesce(p_notes,''),auth.uid(),legacy_id)
   on conflict(file_id,item_id) do update set legacy_task_id=coalesce(location_file_findings.legacy_task_id,excluded.legacy_task_id),correction=excluded.correction,status=case when location_file_findings.status='Resolved' then 'Open' else location_file_findings.status end,audited_by=auth.uid(),audited_at=clock_timestamp();n:=n+1;
  end if;
 end loop;
 update public.location_person_files set reviewed_by=(select full_name from public.staff_access where user_id=auth.uid()),review_date=(now() at time zone 'America/Los_Angeles')::date where id=f.id;
 return n;
end $$;
create or replace function tcs_files_private.validate_finding() returns trigger language plpgsql security definer set search_path='' as $$
declare i jsonb; latest_review text;
begin
 if tg_op='UPDATE' then
  if (new.organization_id,new.location_id,new.file_id,new.child_id,new.staff_lane_id,new.item_id) is distinct from (old.organization_id,old.location_id,old.file_id,old.child_id,old.staff_lane_id,old.item_id) then raise exception 'A finding cannot be moved';end if;
  if not(public.is_tcs_owner() or public.is_tcs_licensee()) then
   if old.assigned_user_id is distinct from auth.uid() or new.status<>'Awaiting review' or (to_jsonb(new)-array['status','notes','submitted_at','submitted_by','updated_at']) is distinct from (to_jsonb(old)-array['status','notes','submitted_at','submitted_by','updated_at']) then raise exception 'Submit your correction for review; only location leadership may close it';end if;
  end if;
  if new.status='Awaiting review' then new.submitted_by:=auth.uid();new.submitted_at:=clock_timestamp();end if;
  if new.status='Resolved' and old.status<>'Resolved' then
   select value into i from public.location_person_files f cross join lateral jsonb_array_elements(f.items) where f.id=new.file_id and value->>'id'=new.item_id;
   select review_status into latest_review from public.document_records where location_file_id=new.file_id and checklist_item_id=new.item_id order by created_at desc,id desc limit 1;
   if (i->>'status' not in ('N/A','Given to parent') and latest_review in ('Awaiting review','Correction required')) then raise exception 'Review the latest submitted document before closing the finding';end if;
   if i is null or not ((i->>'status'='On File' and (i->>'tracksExpiration'='false' or coalesce(i->>'expirationDate','')='' or (i->>'expirationDate')::date>=(now() at time zone 'America/Los_Angeles')::date)) or i->>'status'='N/A' or (i->>'status'='Given to parent' and tcs_files_private.parent_handout(i->>'name') and coalesce(i->>'dateChecked','')<>'')) or btrim(new.notes)='' then raise exception 'Review the corrected checklist item and document verification before closing this finding';end if;
   new.reviewed_by:=auth.uid();new.reviewed_at:=clock_timestamp();
  end if;
 end if;
 if not exists(select 1 from public.location_person_files f where f.id=new.file_id and f.child_id is not distinct from new.child_id and f.staff_lane_id is not distinct from new.staff_lane_id and f.location_id=new.location_id and f.organization_id=new.organization_id) then raise exception 'Finding must match this person/location file';end if;
 select person_name into new.child_name from public.location_person_files where id=new.file_id;
 new.updated_at:=clock_timestamp();return new;
end $$;
create or replace function tcs_files_private.document_review() returns trigger language plpgsql security invoker set search_path='' as $$
declare f public.location_person_files; source_file public.location_person_files; item jsonb; next_status text;
begin
 if tg_op='UPDATE' and old.location_file_id is not null and new.location_file_id is distinct from old.location_file_id then raise exception 'Keep retained uploads in their original location file; create an intentional copy instead';end if;
 if new.location_file_id is null then return new;end if;
 select * into f from public.location_person_files where id=new.location_file_id for update;
 if tg_op='INSERT' and new.storage_path<>new.organization_id::text||'/'||new.location_id::text||'/'||new.id::text||'.enc' then raise exception 'Uploaded bytes must use this document/location storage path';end if;
 if tg_op='UPDATE' and (new.organization_id,new.location_id,new.storage_path,new.encryption_iv,new.sha256,new.size_bytes) is distinct from (old.organization_id,old.location_id,old.storage_path,old.encryption_iv,old.sha256,old.size_bytes) then raise exception 'Retained document bytes cannot be replaced';end if;
 if tg_op='UPDATE' and old.child_id is not null and new.child_id is distinct from old.child_id then raise exception 'An existing document cannot be reassigned to another child';end if;
 if f.id is null or f.location_id<>new.location_id or f.child_id is distinct from new.child_id or f.organization_id<>new.organization_id then raise exception 'Document must match this person and location';end if;
 if tg_op='UPDATE' and old.copied_from_document_id is distinct from new.copied_from_document_id then raise exception 'Copy provenance is immutable';end if;
 if new.copied_from_document_id is not null and not exists(select 1 from public.document_records s where s.id=new.copied_from_document_id and s.organization_id=new.organization_id and ((f.child_id is not null and s.child_id=f.child_id) or (f.staff_lane_id is not null and exists(select 1 from public.location_person_files sf where sf.id=s.location_file_id and sf.staff_lane_id=f.staff_lane_id))) and public.can_access_location(s.location_id)) then raise exception 'Source copy must be accessible and belong to the same person';end if;
 if tg_op='INSERT' then new.review_status:='Awaiting review';new.reviewed_at:=null;new.reviewed_by:=null;end if;
 if new.checklist_item_id is not null then
  select value into item from jsonb_array_elements(f.items) where value->>'id'=new.checklist_item_id;
  if item is null then raise exception 'Choose an existing item in this location file';end if;
 end if;
 if tg_op='UPDATE' and new.review_status is distinct from old.review_status then
  if not(public.is_tcs_owner() or public.is_tcs_licensee()) or not public.can_access_location(new.location_id) then raise exception 'Location reviewer required';end if;
  if new.review_status='Correction required' and btrim(new.review_note)='' then raise exception 'Explain the correction needed';end if;
  if new.review_status='Accepted' and btrim(new.review_note)='' then raise exception 'Confirm signatures, dates and correctness in the review note';end if;
  new.reviewed_by:=auth.uid();new.reviewed_at:=clock_timestamp();
 end if;
 next_status:=case new.review_status when 'Accepted' then 'On File' when 'Correction required' then 'Correction needed' else 'Awaiting review' end;
 if new.checklist_item_id is not null and (tg_op='INSERT' or new.review_status is distinct from old.review_status or new.checklist_item_id is distinct from old.checklist_item_id) then
  update public.location_person_files set items=(select jsonb_agg(case when value->>'id'=new.checklist_item_id then value||jsonb_build_object('status',next_status,'dateChecked',case when next_status='On File' then (now() at time zone 'America/Los_Angeles')::date::text else '' end,'note',new.review_note) else value end order by ord) from jsonb_array_elements(items) with ordinality a(value,ord)),template_confirmed=false where id=f.id;
 end if;
 return new;
end $$;
-- Save the current checklist and link its correction tasks in one transaction.
-- If assignment fails, neither the checklist nor the task changes are committed.
create or replace function public.save_and_assign_location_child_audit(p_file uuid,p_expected timestamptz,p_changes jsonb,p_due date)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.location_person_files; findings integer;
begin
 if not public.is_tcs_owner() then raise exception 'Audit leadership required';end if;
 select * into f from public.location_person_files where id=p_file and organization_id=public.current_staff_organization_id() for update;
 if f.id is null or not public.can_access_location(f.location_id) then raise exception 'Accessible child or staff location file required';end if;
 if f.updated_at is distinct from p_expected then raise exception 'This file changed. Refresh before saving and assigning corrections';end if;
 if p_due is null or coalesce((p_changes->>'archived')::boolean,false) then raise exception 'Choose a correction due date and keep the location file active';end if;
 if jsonb_typeof(p_changes->'items') is distinct from 'array' or jsonb_array_length(p_changes->'items') not between 1 and 100 then raise exception 'Keep between 1 and 100 checklist items';end if;
 if exists(select 1 from jsonb_array_elements(f.items) i where not exists(select 1 from jsonb_array_elements(p_changes->'items') j where j->>'id'=i->>'id')) then raise exception 'Keep existing checklist items; mark N/A instead of deleting them';end if;
 update public.location_person_files set items=p_changes->'items',notes=coalesce(p_changes->>'notes',''),reviewed_by=coalesce(p_changes->>'reviewed_by',''),review_date=nullif(p_changes->>'review_date','')::date,follow_up=coalesce(p_changes->>'follow_up',''),template_confirmed=coalesce((p_changes->>'template_confirmed')::boolean,false),archived=false where id=f.id;
 findings:=public.audit_location_child_file(f.id,p_due,null,'Saved audit and assigned corrections together');
 select * into f from public.location_person_files where id=f.id;
 return jsonb_build_object('file',to_jsonb(f),'findings',findings);
end $$;
create or replace function tcs_files_private.finding_notice() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or new.status is distinct from old.status then
  perform tcs_files_private.notice(new.organization_id,new.location_id,'file-task:'||new.id::text||':'||new.status||':'||new.updated_at::text,(case when new.staff_lane_id is null then 'Child file correction: ' else 'Employee file correction: ' end)||new.status,new.item_name||' - '||new.correction,new.assigned_user_id);
 end if;return new;
end $$;
