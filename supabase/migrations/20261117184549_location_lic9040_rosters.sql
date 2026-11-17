-- Additive location enrollment, roster snapshots and review workflow. Existing files/uploads stay put.
create table public.child_location_enrollments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 child_id uuid not null references public.children(id), location_id uuid not null references public.locations(id),
 date_enrolled date, date_left date, state text not null default 'Enrolled' check(state in ('Enrolled','Departed','Review required')),
 source text not null default 'Staff confirmed', notes text not null default '', updated_at timestamptz not null default now(),
 unique(organization_id,child_id,location_id), check(date_left is null or date_enrolled is null or date_left>=date_enrolled)
);
create table public.location_roster_settings (
 location_id uuid primary key references public.locations(id), organization_id uuid not null references public.organizations(id),
 facility_name text not null default '', license_number text not null default '', verified_at timestamptz, verified_by uuid references auth.users(id) on delete set null,
 verification_source text not null default '', responsible_user_id uuid references auth.users(id) on delete set null,
 reminder_days integer not null default 30 check(reminder_days between 1 and 180), updated_at timestamptz not null default now()
);
create table public.location_file_templates (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), location_id uuid not null references public.locations(id),
 age_group text not null default 'All', title text not null, items jsonb not null check(jsonb_typeof(items)='array'), updated_at timestamptz not null default now(),
 unique(organization_id,location_id,age_group)
);
create table public.location_file_findings (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), location_id uuid not null references public.locations(id),
 file_id uuid not null references public.location_person_files(id), child_id uuid not null references public.children(id), item_id text not null, item_name text not null, child_name text not null default '',
 assigned_user_id uuid references auth.users(id) on delete set null, due_date date not null, correction text not null, notes text not null default '',
 status text not null default 'Open' check(status in ('Open','Awaiting review','Resolved')), verification_required boolean not null default true,
 legacy_task_id text, audited_by uuid references auth.users(id) on delete set null, audited_at timestamptz not null default now(),
 submitted_by uuid references auth.users(id) on delete set null, submitted_at timestamptz, reviewed_by uuid references auth.users(id) on delete set null, reviewed_at timestamptz,
 updated_at timestamptz not null default now(), unique(file_id,item_id)
);
create table public.location_record_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), location_id uuid not null references public.locations(id),
 child_id uuid references public.children(id), file_id uuid references public.location_person_files(id), actor_id uuid references auth.users(id) on delete set null,
 action text not null, before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);
create table public.lic9040_snapshots (
 id uuid primary key, organization_id uuid not null references public.organizations(id), location_id uuid not null references public.locations(id),
 manifest jsonb not null, storage_path text not null, encryption_iv text not null, sha256 text not null,
 created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), retain_until date not null
);
create table public.location_file_notice_keys (
 organization_id uuid not null references public.organizations(id), recipient_id uuid not null references auth.users(id) on delete cascade,
 event_key text not null, created_at timestamptz not null default now(), primary key(organization_id,recipient_id,event_key)
);
create index location_enrollments_site on public.child_location_enrollments(location_id,state);
create index location_enrollments_child on public.child_location_enrollments(child_id);
create index location_findings_assignee on public.location_file_findings(assigned_user_id,status,due_date);
create index location_findings_site on public.location_file_findings(location_id,status);
create index location_events_site on public.location_record_events(location_id,created_at);
create index lic9040_snapshots_site on public.lic9040_snapshots(location_id,created_at);

do $$declare t text;begin
 foreach t in array array['child_location_enrollments','location_roster_settings','location_file_templates','location_file_findings','location_record_events','lic9040_snapshots','location_file_notice_keys'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach t in array array['child_location_enrollments','location_roster_settings','location_file_templates','location_file_findings'] loop
  execute format('grant select,insert,update on public.%I to authenticated',t);
  execute format('create policy leadership_location on public.%I for all to authenticated using(organization_id=public.current_staff_organization_id() and public.can_access_location(location_id) and (public.is_tcs_owner() or public.is_tcs_licensee())) with check(organization_id=public.current_staff_organization_id() and public.can_access_location(location_id) and (public.is_tcs_owner() or public.is_tcs_licensee()))',t);
 end loop;
 foreach t in array array['location_record_events','lic9040_snapshots'] loop
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy leadership_history on public.%I for select to authenticated using(organization_id=public.current_staff_organization_id() and public.can_access_location(location_id) and (public.is_tcs_owner() or public.is_tcs_licensee()))',t);
 end loop;
end $$;
create policy assigned_file_tasks_read on public.location_file_findings for select to authenticated using(organization_id=public.current_staff_organization_id() and assigned_user_id=auth.uid());
create policy assigned_file_tasks_submit on public.location_file_findings for update to authenticated using(organization_id=public.current_staff_organization_id() and assigned_user_id=auth.uid()) with check(organization_id=public.current_staff_organization_id() and assigned_user_id=auth.uid());
-- Location enrollment grants access to the shared identity, never another location's documents.
create policy enrolled_identity_read on public.children for select to authenticated using(
 organization_id=public.current_staff_organization_id() and (public.is_tcs_owner() or public.is_tcs_licensee()) and exists(
 select 1 from public.child_location_enrollments e where e.child_id=children.id and e.organization_id=children.organization_id and public.can_access_location(e.location_id))
);

create schema if not exists tcs_files_private;
revoke all on schema tcs_files_private from public,anon,authenticated;
create function tcs_files_private.capture_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.location_record_events(organization_id,location_id,child_id,file_id,actor_id,action,before_data,after_data)
 values(new.organization_id,new.location_id,nullif(to_jsonb(new)->>'child_id','')::uuid,
 case when tg_table_name='location_person_files' then nullif(to_jsonb(new)->>'id','')::uuid else nullif(coalesce(to_jsonb(new)->>'file_id',to_jsonb(new)->>'location_file_id'),'')::uuid end,
 auth.uid(),tg_table_name||':'||tg_op,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));return new;
end $$;
revoke all on function tcs_files_private.capture_event() from public,anon,authenticated;
do $$declare t text;begin foreach t in array array['child_location_enrollments','location_roster_settings','location_file_templates','location_file_findings','location_person_files'] loop execute format('create trigger location_record_history after insert or update on public.%I for each row execute function tcs_files_private.capture_event()',t);end loop;end $$;

create function tcs_files_private.capture_membership() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.child_location_enrollments(organization_id,child_id,location_id,source)
 select new.organization_id,new.child_id,new.location_id,'Existing care membership - enrollment date requires review'
 from public.children c where c.id=new.child_id and c.organization_id=new.organization_id and c.enrollment_status='Active'
 on conflict(organization_id,child_id,location_id) do nothing;return new;
end $$;
revoke all on function tcs_files_private.capture_membership() from public,anon,authenticated;
create trigger location_enrollment_membership after insert on public.child_location_memberships for each row execute function tcs_files_private.capture_membership();
insert into public.child_location_enrollments(organization_id,child_id,location_id,source)
select c.organization_id,c.id,m.location_id,'Backfilled care membership - enrollment date requires review' from public.children c join public.child_location_memberships m on m.child_id=c.id and m.organization_id=c.organization_id where c.enrollment_status='Active'
union select organization_id,id,location_id,'Backfilled primary enrollment - enrollment date requires review' from public.children where enrollment_status='Active'
on conflict(organization_id,child_id,location_id) do nothing;
-- Never infer enrollment from an unassigned document. Existing explicit files are retained for review.
insert into public.child_location_enrollments(organization_id,child_id,location_id,state,source)
select organization_id,child_id,location_id,'Review required','Existing location file - confirm current enrollment' from public.location_person_files where child_id is not null
on conflict(organization_id,child_id,location_id) do nothing;

create function public.ensure_location_roster_files(p_location uuid,p_home jsonb,p_center jsonb) returns integer language plpgsql security invoker set search_path=public as $$
declare org uuid:=public.current_staff_organization_id(); site public.locations; e record; chosen jsonb; packet text; n integer:=0;
begin
 if not(public.is_tcs_owner() or public.is_tcs_licensee()) or not public.can_access_location(p_location) then raise exception 'Assigned location leadership required';end if;
 select * into site from public.locations where id=p_location and organization_id=org;
 if not found then raise exception 'Location unavailable';end if;
 packet:=case when lower(site.program_type) like '%school%age%' then 'School Age Center' else 'In-Home' end;
 for e in select en.*,c.first_name,c.last_name,c.age_group from public.child_location_enrollments en join public.children c on c.id=en.child_id where en.organization_id=org and en.location_id=p_location and en.state='Enrolled' loop
  select items into chosen from public.location_file_templates where organization_id=org and location_id=p_location and age_group in ('All',e.age_group) order by (age_group=e.age_group) desc limit 1;
  chosen:=coalesce(chosen,case when packet='School Age Center' then p_center else p_home end);
  insert into public.location_person_files(organization_id,location_id,child_id,person_name,template,items) values(org,p_location,e.child_id,e.first_name||' '||e.last_name,packet,chosen) on conflict do nothing;
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.ensure_location_roster_files(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.ensure_location_roster_files(uuid,jsonb,jsonb) to authenticated,service_role;

alter table public.document_records add column checklist_item_id text, add column copied_from_document_id uuid references public.document_records(id), add column review_status text not null default 'Unreviewed legacy' check(review_status in ('Unreviewed legacy','Awaiting review','Accepted','Correction required')), add column review_note text not null default '', add column reviewed_by uuid references auth.users(id) on delete set null, add column reviewed_at timestamptz;
-- Only unique, explicit child/location ownership is mapped. No bytes or prior reviews are changed.
update public.document_records d set location_file_id=f.id from public.location_person_files f where d.location_file_id is null and d.child_id=f.child_id and d.location_id=f.location_id and d.organization_id=f.organization_id and d.document_scope='Child';
create function tcs_files_private.document_review() returns trigger language plpgsql security invoker set search_path='' as $$
declare f public.location_person_files; item jsonb; next_status text;
begin
 if tg_op='UPDATE' and old.location_file_id is not null and new.location_file_id is distinct from old.location_file_id then raise exception 'Keep retained uploads in their original location file; create an intentional copy instead';end if;
 if new.location_file_id is null then return new;end if;
 select * into f from public.location_person_files where id=new.location_file_id for update;
 if f.child_id is null then return new;end if;
 if tg_op='INSERT' and new.storage_path<>new.organization_id::text||'/'||new.location_id::text||'/'||new.id::text||'.enc' then raise exception 'Uploaded bytes must use this document/location storage path';end if;
 if tg_op='UPDATE' and (new.organization_id,new.location_id,new.storage_path,new.encryption_iv,new.sha256,new.size_bytes) is distinct from (old.organization_id,old.location_id,old.storage_path,old.encryption_iv,old.sha256,old.size_bytes) then raise exception 'Retained document bytes cannot be replaced';end if;
 if tg_op='UPDATE' and old.child_id is not null and new.child_id is distinct from old.child_id then raise exception 'An existing document cannot be reassigned to another child';end if;
 if f.id is null or f.location_id<>new.location_id or f.child_id is distinct from new.child_id or f.organization_id<>new.organization_id then raise exception 'Document must match this child and location';end if;
 if tg_op='UPDATE' and old.copied_from_document_id is distinct from new.copied_from_document_id then raise exception 'Copy provenance is immutable';end if;
 if new.copied_from_document_id is not null and not exists(select 1 from public.document_records s where s.id=new.copied_from_document_id and s.organization_id=new.organization_id and s.child_id=new.child_id and public.can_access_location(s.location_id)) then raise exception 'Source copy must be accessible and belong to the same child';end if;
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
revoke all on function tcs_files_private.document_review() from public,anon,authenticated;
create trigger location_document_review before insert or update on public.document_records for each row execute function tcs_files_private.document_review();

create function public.audit_location_child_file(p_file uuid,p_due date,p_assignee uuid,p_notes text) returns integer language plpgsql security definer set search_path='' as $$
declare f public.location_person_files; i jsonb; n integer:=0; assignee uuid; site_name text; matched integer; legacy_id text;
begin
 select * into f from public.location_person_files where id=p_file and organization_id=public.current_staff_organization_id() for update;
 if f.id is null or f.child_id is null or not public.is_tcs_owner() or not public.can_access_location(f.location_id) then raise exception 'Danielle/administration must audit an accessible child location file';end if;
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
   insert into public.location_file_findings(organization_id,location_id,file_id,child_id,item_id,item_name,assigned_user_id,due_date,correction,notes,audited_by,legacy_task_id)
   values(f.organization_id,f.location_id,f.id,f.child_id,i->>'id',i->>'name',assignee,p_due,coalesce(nullif(i->>'note',''),'Provide and verify '||(i->>'name')),coalesce(p_notes,''),auth.uid(),legacy_id)
   on conflict(file_id,item_id) do update set legacy_task_id=coalesce(location_file_findings.legacy_task_id,excluded.legacy_task_id),correction=excluded.correction,status=case when location_file_findings.status='Resolved' then 'Open' else location_file_findings.status end,audited_by=auth.uid(),audited_at=clock_timestamp();n:=n+1;
  end if;
 end loop;
 update public.location_person_files set reviewed_by=(select full_name from public.staff_access where user_id=auth.uid()),review_date=(now() at time zone 'America/Los_Angeles')::date where id=f.id;
 return n;
end $$;
revoke all on function public.audit_location_child_file(uuid,date,uuid,text) from public,anon;
grant execute on function public.audit_location_child_file(uuid,date,uuid,text) to authenticated,service_role;
create function tcs_files_private.validate_finding() returns trigger language plpgsql security invoker set search_path='' as $$
declare i jsonb; latest_review text;
begin
 if tg_op='UPDATE' then
  if (new.organization_id,new.location_id,new.file_id,new.child_id,new.item_id) is distinct from (old.organization_id,old.location_id,old.file_id,old.child_id,old.item_id) then raise exception 'A finding cannot be moved';end if;
  if not(public.is_tcs_owner() or public.is_tcs_licensee()) then
   if old.assigned_user_id is distinct from auth.uid() or new.status<>'Awaiting review' or (to_jsonb(new)-array['status','notes','submitted_at','submitted_by','updated_at']) is distinct from (to_jsonb(old)-array['status','notes','submitted_at','submitted_by','updated_at']) then raise exception 'Submit your correction for review; only location leadership may close it';end if;
  end if;
  if new.status='Awaiting review' then new.submitted_by:=auth.uid();new.submitted_at:=clock_timestamp();end if;
  if new.status='Resolved' and old.status<>'Resolved' then
   select value into i from public.location_person_files f cross join lateral jsonb_array_elements(f.items) where f.id=new.file_id and value->>'id'=new.item_id;
   select review_status into latest_review from public.document_records where location_file_id=new.file_id and checklist_item_id=new.item_id order by created_at desc,id desc limit 1;
   if (i->>'status'<>'N/A' and latest_review in ('Awaiting review','Correction required')) then raise exception 'Review the latest submitted document before closing the finding';end if;
   if i is null or not ((i->>'status'='On File' and (i->>'tracksExpiration'='false' or coalesce(i->>'expirationDate','')='' or (i->>'expirationDate')::date>=(now() at time zone 'America/Los_Angeles')::date)) or (i->>'status'='N/A' and btrim(i->>'note')<>'')) or btrim(new.notes)='' then raise exception 'Review the corrected checklist item and document verification before closing this finding';end if;
   new.reviewed_by:=auth.uid();new.reviewed_at:=clock_timestamp();
  end if;
 end if;
 if not exists(select 1 from public.location_person_files f where f.id=new.file_id and f.child_id=new.child_id and f.location_id=new.location_id and f.organization_id=new.organization_id) then raise exception 'Finding must match this child/location file';end if;
 select person_name into new.child_name from public.location_person_files where id=new.file_id;
 new.updated_at:=clock_timestamp();return new;
end $$;
revoke all on function tcs_files_private.validate_finding() from public,anon,authenticated;
create trigger location_finding_validate before insert or update on public.location_file_findings for each row execute function tcs_files_private.validate_finding();

create function tcs_files_private.validate_enrollment() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.children where id=new.child_id and organization_id=new.organization_id) or not exists(select 1 from public.locations where id=new.location_id and organization_id=new.organization_id) then raise exception 'Child and location must belong to this organization';end if;
 if tg_op='UPDATE' and (new.organization_id,new.child_id,new.location_id) is distinct from (old.organization_id,old.child_id,old.location_id) then raise exception 'Enrollment identity and location are immutable';end if;
 if (new.state='Departed') is distinct from (new.date_left is not null) then raise exception 'A departure needs its own location-specific date left';end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
revoke all on function tcs_files_private.validate_enrollment() from public,anon,authenticated;
create trigger location_enrollment_validate before insert or update on public.child_location_enrollments for each row execute function tcs_files_private.validate_enrollment();
-- Assigned staff submit notes, without receiving access to confidential location-file contents.
alter function tcs_files_private.validate_finding() security definer;

create function tcs_files_private.notice(p_org uuid,p_location uuid,p_key text,p_title text,p_body text,p_recipient uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare recipient record; inserted uuid; notice jsonb;
begin
 for recipient in select distinct s.user_id,s.role from public.staff_access s where s.organization_id=p_org and s.is_active and (
 (p_recipient is not null and s.user_id=p_recipient) or (p_recipient is null and (
 lower(s.role) in ('owner / admin','owner/admin','administrator','admin','owner / director') or
 (lower(s.role) in ('location licensee','licensee') and exists(select 1 from public.staff_location_assignments a where a.user_id=s.user_id and a.location_id=p_location)) or
 s.user_id=(select responsible_user_id from public.location_roster_settings where location_id=p_location)))) loop
  inserted:=null;
  insert into public.location_file_notice_keys(organization_id,recipient_id,event_key) values(p_org,recipient.user_id,p_key) on conflict do nothing returning recipient_id into inserted;
  if inserted is not null then
   notice:=jsonb_build_object('id',p_key,'eventKey',p_key,'category','system','severity','attention','title',p_title,'body',p_body,'href',case when lower(recipient.role) in ('employee','staff') then '/work-plans' else '/files?fileLocation='||p_location::text end,'location',(select name from public.locations where id=p_location),'createdAt',clock_timestamp(),'readAt','');
   insert into public.user_notification_state as s(user_id,inbox) values(recipient.user_id,jsonb_build_array(notice)) on conflict(user_id) do update set inbox=jsonb_build_array(notice)||s.inbox,updated_at=clock_timestamp();
  end if;
 end loop;
end $$;
revoke all on function tcs_files_private.notice(uuid,uuid,text,text,text,uuid) from public,anon,authenticated;
create function tcs_files_private.contact_changes() returns trigger language plpgsql security definer set search_path='' as $$
declare e record;
begin
 if (new.first_name,new.last_name,new.date_of_birth,new.record_data->'homeAddress',new.record_data->'primaryGuardian',new.record_data->'phone',new.record_data->'secondaryGuardian',new.record_data->'secondaryGuardianPhone',new.record_data->'additionalGuardianContacts',new.record_data->'medicalProvider',new.record_data->'medicalProviderPhone') is not distinct from (old.first_name,old.last_name,old.date_of_birth,old.record_data->'homeAddress',old.record_data->'primaryGuardian',old.record_data->'phone',old.record_data->'secondaryGuardian',old.record_data->'secondaryGuardianPhone',old.record_data->'additionalGuardianContacts',old.record_data->'medicalProvider',old.record_data->'medicalProviderPhone') then return new;end if;
 for e in select * from public.child_location_enrollments where child_id=new.id and state='Enrolled' loop
  perform tcs_files_private.notice(new.organization_id,e.location_id,'location-contact:'||new.id::text||':'||coalesce(new.record_data->>'contactsChangedAt',new.updated_at::text)||':'||e.location_id::text,'Shared child contact information changed',new.first_name||' '||new.last_name||': review current roster contacts at this location. Saved PDF snapshots remain unchanged.');
  insert into public.location_record_events(organization_id,location_id,child_id,actor_id,action,before_data,after_data) values(new.organization_id,e.location_id,new.id,auth.uid(),'Shared profile correction',jsonb_build_object('profile_updated_at',old.updated_at),jsonb_build_object('profile_updated_at',new.updated_at));
 end loop;return new;
end $$;
revoke all on function tcs_files_private.contact_changes() from public,anon,authenticated;
create trigger location_roster_shared_contact_changes after update on public.children for each row execute function tcs_files_private.contact_changes();
create function tcs_files_private.finding_notice() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or new.status is distinct from old.status then
  perform tcs_files_private.notice(new.organization_id,new.location_id,'file-task:'||new.id::text||':'||new.status||':'||new.updated_at::text,'Child file correction: '||new.status,new.item_name||' - '||new.correction,new.assigned_user_id);
 end if;return new;
end $$;
revoke all on function tcs_files_private.finding_notice() from public,anon,authenticated;
create trigger location_finding_notice after insert or update on public.location_file_findings for each row execute function tcs_files_private.finding_notice();

create function tcs_files_private.scan_file_expirations() returns integer language plpgsql security definer set search_path='' as $$
declare r record; item jsonb; expires date; n integer:=0; category text;
begin
 for r in select f.*,coalesce(s.reminder_days,30) as reminder_days from public.location_person_files f left join public.location_roster_settings s on s.location_id=f.location_id where not f.archived and f.child_id is not null loop
  for item in select value from jsonb_array_elements(r.items) loop
   if item->>'status'<>'On File' or item->>'tracksExpiration'='false' or coalesce(item->>'expirationDate','')='' then continue;end if;
   begin expires:=(item->>'expirationDate')::date;exception when others then continue;end;
   if expires<=(now() at time zone 'America/Los_Angeles')::date+r.reminder_days then
    category:=case when expires<(now() at time zone 'America/Los_Angeles')::date then 'Expired' else 'Expiring soon' end;
    perform tcs_files_private.notice(r.organization_id,r.location_id,'file-expiry:'||r.id::text||':'||(item->>'id')||':'||expires::text||':'||category,category||' child file document',r.person_name||': '||(item->>'name')||' expires '||expires::text);n:=n+1;
   end if;
  end loop;
 end loop;return n;
end $$;
revoke all on function tcs_files_private.scan_file_expirations() from public,anon,authenticated;
-- Snapshot bytes and manifests are immutable; retention is a minimum, never a deletion schedule.
create function tcs_files_private.immutable_roster_snapshot() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Dated LIC 9040 snapshots are immutable and retained; create a new version';end $$;
revoke all on function tcs_files_private.immutable_roster_snapshot() from public,anon,authenticated;
create trigger lic9040_immutable before update or delete on public.lic9040_snapshots for each row execute function tcs_files_private.immutable_roster_snapshot();
create function tcs_files_private.capture_child_enrollments() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.enrollment_status='Active' then
  insert into public.child_location_enrollments(organization_id,child_id,location_id,source)
  select new.organization_id,new.id,new.location_id,'Primary enrollment - confirm local enrollment date'
  union select new.organization_id,new.id,m.location_id,'Care membership - confirm local enrollment date' from public.child_location_memberships m where m.child_id=new.id and m.organization_id=new.organization_id
  on conflict(organization_id,child_id,location_id) do nothing;
 end if;return new;
end $$;
revoke all on function tcs_files_private.capture_child_enrollments() from public,anon,authenticated;
create trigger capture_new_child_location_enrollment after insert or update of enrollment_status,location_id on public.children for each row execute function tcs_files_private.capture_child_enrollments();
create function tcs_files_private.validate_location_setting() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.locations where id=new.location_id and organization_id=new.organization_id) then raise exception 'Location belongs to a different organization';end if;
 if tg_op='UPDATE' and (new.organization_id,new.location_id) is distinct from (old.organization_id,old.location_id) then raise exception 'Location record cannot be moved';end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
revoke all on function tcs_files_private.validate_location_setting() from public,anon,authenticated;
create trigger validate_roster_location before insert or update on public.location_roster_settings for each row execute function tcs_files_private.validate_location_setting();
create trigger validate_template_location before insert or update on public.location_file_templates for each row execute function tcs_files_private.validate_location_setting();

create function tcs_files_private.mark_contact_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (new.first_name,new.last_name,new.date_of_birth,new.record_data->'homeAddress',new.record_data->'primaryGuardian',new.record_data->'phone',new.record_data->'secondaryGuardian',new.record_data->'secondaryGuardianPhone',new.record_data->'additionalGuardianContacts',new.record_data->'medicalProvider',new.record_data->'medicalProviderPhone') is distinct from (old.first_name,old.last_name,old.date_of_birth,old.record_data->'homeAddress',old.record_data->'primaryGuardian',old.record_data->'phone',old.record_data->'secondaryGuardian',old.record_data->'secondaryGuardianPhone',old.record_data->'additionalGuardianContacts',old.record_data->'medicalProvider',old.record_data->'medicalProviderPhone') then
  new.record_data:=new.record_data||jsonb_build_object('contactsChangedAt',case when new.record_data->>'contactsVerifiedAt' is distinct from old.record_data->>'contactsVerifiedAt' then new.record_data->>'contactsVerifiedAt' else clock_timestamp()::text end);
 end if;return new;
end $$;
revoke all on function tcs_files_private.mark_contact_revision() from public,anon,authenticated;
create trigger mark_contact_revision before update on public.children for each row execute function tcs_files_private.mark_contact_revision();
create function tcs_files_private.sync_shared_child_name() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.first_name,new.last_name) is distinct from (old.first_name,old.last_name) then update public.location_person_files set person_name=btrim(new.first_name||' '||new.last_name) where child_id=new.id and organization_id=new.organization_id;end if;return new;
end $$;
revoke all on function tcs_files_private.sync_shared_child_name() from public,anon,authenticated;
create trigger sync_shared_child_file_name after update of first_name,last_name on public.children for each row execute function tcs_files_private.sync_shared_child_name();

create trigger location_document_history after insert or update on public.document_records for each row when (new.location_file_id is not null) execute function tcs_files_private.capture_event();

-- Assigned licensees review only their location's leadership-visible child documents.
create policy location_licensee_document_review on public.document_records for update to authenticated
 using(organization_id=public.current_staff_organization_id() and public.is_tcs_licensee() and public.can_access_location(location_id) and confidentiality='Location Leadership' and (document_scope='Child' or child_id is not null))
 with check(organization_id=public.current_staff_organization_id() and public.is_tcs_licensee() and public.can_access_location(location_id) and confidentiality='Location Leadership' and document_scope='Child');

-- A narrow shared-contact correction avoids granting access to another site's private files.
create function public.correct_location_child_contacts(p_child uuid,p_location uuid,p_expected timestamptz,p_values jsonb,p_verify boolean,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare c public.children; revised jsonb; allowed jsonb;
begin
 if not(public.is_tcs_owner() or public.is_tcs_licensee()) or not public.can_access_location(p_location) or btrim(coalesce(p_reason,''))='' then raise exception 'Assigned location leadership and correction source required';end if;
 if not exists(select 1 from public.child_location_enrollments where child_id=p_child and location_id=p_location and organization_id=public.current_staff_organization_id()) then raise exception 'Child is not enrolled at this location';end if;
 select * into c from public.children where id=p_child and organization_id=public.current_staff_organization_id() for update;
 if c.id is null or c.updated_at is distinct from p_expected then return false;end if;
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into allowed from jsonb_each(p_values) where key=any(array['firstName','lastName','dateOfBirth','homeAddress','primaryGuardian','phone','secondaryGuardian','secondaryGuardianPhone','additionalGuardianContacts','medicalProvider','medicalProviderPhone']);
 revised:=c.record_data||allowed||jsonb_build_object('contactCorrectionReason',p_reason);
 if p_verify then revised:=revised||jsonb_build_object('contactsVerifiedAt',clock_timestamp(),'contactsVerifiedBy',auth.uid(),'contactsVerificationSource',p_reason);end if;
 update public.children set first_name=coalesce(allowed->>'firstName',c.first_name),last_name=coalesce(allowed->>'lastName',c.last_name),date_of_birth=case when allowed ? 'dateOfBirth' then nullif(allowed->>'dateOfBirth','')::date else c.date_of_birth end,record_data=revised,updated_at=clock_timestamp() where id=c.id;
 return true;
end $$;
revoke all on function public.correct_location_child_contacts(uuid,uuid,timestamptz,jsonb,boolean,text) from public,anon;
grant execute on function public.correct_location_child_contacts(uuid,uuid,timestamptz,jsonb,boolean,text) to authenticated,service_role;
