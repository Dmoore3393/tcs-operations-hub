-- Retain historical approvals when account deletion clears an auth-user foreign key.
create or replace function public.guard_care_schedule_review()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if tg_op='UPDATE' then
  if tg_table_name='child_schedule_overrides' then
   if new.approved_by is null and old.approved_by is not null and (to_jsonb(new)-'approved_by'-'updated_at') is not distinct from (to_jsonb(old)-'approved_by'-'updated_at') then return new;end if;
  else
   if new.reviewed_by is null and old.reviewed_by is not null and (to_jsonb(new)-'reviewed_by'-'updated_at') is not distinct from (to_jsonb(old)-'reviewed_by'-'updated_at') then return new;end if;
  end if;
 end if;
 if tg_table_name='child_schedule_overrides' then
  if not public.authorized_care_reviewer(new.approved_by,new.organization_id,new.location_id) then raise exception 'Only assigned licensees, Danielle and Jennifer can approve care';end if;
 elsif new.status in ('Approved','Needs Changes','Unable to Accommodate') then
  if not public.authorized_care_reviewer(new.reviewed_by,new.organization_id,new.location_id) then raise exception 'Only assigned licensees, Danielle and Jennifer can review care requests';end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_care_schedule_review() from public,anon,authenticated;
grant execute on function public.guard_care_schedule_review() to service_role;
