-- Authorized setup cleanup for TCS. Preserve each entry; archive only the
-- old "no audit exists" placeholders, never reviewed files or care alerts.
with changed as (
 update public.user_notification_state u
 set inbox=(select jsonb_agg(case when entry->>'eventKey' like 'child-file-audit:none:%' and coalesce(entry->>'archivedAt','')=''
   then entry||jsonb_build_object('archivedAt',now(),'archiveReason','Setup placeholder: file audit not started') else entry end order by position)
   from jsonb_array_elements(u.inbox) with ordinality as items(entry,position)),updated_at=now()
 where exists(select 1 from public.staff_access s where s.user_id=u.user_id and s.organization_id='00000000-0000-4000-8000-000000000001')
 and exists(select 1 from jsonb_array_elements(u.inbox) entry where entry->>'eventKey' like 'child-file-audit:none:%' and coalesce(entry->>'archivedAt','')='')
 returning user_id
), logged as (
 insert into public.audit_log(organization_id,actor_user_id,action,table_name,metadata)
 select '00000000-0000-4000-8000-000000000001','3b54f183-564a-40fa-87f2-3c515d526623','UPDATE','user_notification_state',jsonb_build_object('kind','archive_setup_file_reminders','affected_accounts',count(*)) from changed having count(*)>0
 returning id
)
select count(*) as accounts_cleaned from changed;
