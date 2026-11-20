-- A single transactional inbox notice per released inspection and recipient.
create or replace function tcs_files_private.notify_inspection_release(p_inspection uuid,p_recipient uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.inspection_releases; n integer; inserted uuid; notice jsonb; event_key text;
begin
 select * into r from public.inspection_releases where id=p_inspection;
 if r.id is null or not exists(select 1 from public.staff_access where user_id=p_recipient and organization_id=r.organization_id and is_active and lower(role) in ('location licensee','licensee','licensee/admin','licensee / admin')) then raise exception 'Released inspection and active licensee required';end if;
 select count(*) into n from public.inspection_corrections where inspection_id=r.id and assigned_user_id=p_recipient;
 if exists(select 1 from public.inspection_corrections where inspection_id=r.id) and n=0 then raise exception 'Recipient is not assigned this inspection';end if;
 event_key:='inspection-results:'||r.id::text;
 insert into public.location_file_notice_keys(organization_id,recipient_id,event_key) values(r.organization_id,p_recipient,event_key)
 on conflict do nothing returning recipient_id into inserted;
 if inserted is null then return;end if;
 notice:=jsonb_build_object('id',event_key,'eventKey',event_key,'category','system','severity','attention',
  'title',r.location_name||' inspection results ready',
  'body','Your '||r.inspection_date::text||' inspection results are available with '||n::text||' correction task(s). Open the results to review your final grade, correction deadlines and PDF report.',
  'href','/inspection-results','location',r.location_name,'createdAt',clock_timestamp(),'readAt','');
 insert into public.user_notification_state as s(user_id,inbox) values(p_recipient,jsonb_build_array(notice))
 on conflict(user_id) do update set inbox=jsonb_build_array(notice)||s.inbox,updated_at=clock_timestamp();
end $$;
revoke all on function tcs_files_private.notify_inspection_release(uuid,uuid) from public,anon,authenticated;
create or replace function public.release_inspection(p_org uuid,p_actor uuid,p_id uuid,p_assignee uuid,p_due date)
returns void language plpgsql set search_path=public as $$
declare visit pop_up_inspections; person staff_access; site locations; item jsonb; doc jsonb;
begin
 if p_actor not in ('3b54f183-564a-40fa-87f2-3c515d526623'::uuid,'50abd10b-2b24-47d4-ade2-8b0031530aac'::uuid,'71b134f9-cb66-43ed-8c45-f71d85de21df'::uuid) or not exists(select 1 from staff_access where user_id=p_actor and organization_id=p_org and is_active) then raise exception 'Private inspection access required';end if;
 perform pg_advisory_xact_lock(hashtextextended('release-inspection:'||p_id::text,0));
 select * into visit from pop_up_inspections where id=p_id and organization_id=p_org and status='completed';
 if visit.id is null then raise exception 'Complete and save the inspection first';end if;
 if exists(select 1 from inspection_releases where id=p_id) then
  if exists(select 1 from inspection_corrections where inspection_id=p_id and assigned_user_id=p_assignee) then perform tcs_files_private.notify_inspection_release(p_id,p_assignee);end if;
  return;end if;
 select * into person from staff_access where user_id=p_assignee and organization_id=p_org and is_active and lower(role) in ('location licensee','licensee','licensee/admin','licensee / admin');
 if person.user_id is null or p_due is null then raise exception 'Choose an active licensee and correction due date';end if;
 select * into site from locations where id=visit.location_id and organization_id=p_org;
 doc:=visit.document||jsonb_build_object('notes','','followUp','');
 insert into inspection_releases(id,organization_id,location_id,location_name,inspection_date,document,released_by) values(p_id,p_org,visit.location_id,site.name,visit.inspection_date,doc,p_actor);
 for item in select value from jsonb_array_elements(doc->'items') loop
  if item->>'rating' in ('partial','needs_attention') or item->>'urgent'='true' then
   insert into inspection_corrections(inspection_id,item_id,item_name,correction,urgent,assigned_user_id,assignee_name,due_date)
   values(p_id,item->>'id',item->>'label',coalesce(nullif(item->>'notes',''),item->>'label'),coalesce((item->>'urgent')::boolean,false),p_assignee,person.full_name,p_due);
  end if;
 end loop;
 insert into inspection_result_history(inspection_id,actor_id,action,after_data) values(p_id,p_actor,'Released results and assigned corrections',jsonb_build_object('document',doc,'assignee',p_assignee,'due',p_due));
 perform tcs_files_private.notify_inspection_release(p_id,p_assignee);
end $$;
