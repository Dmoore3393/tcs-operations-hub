-- Leadership confirmation can close legacy periods without inventing per-child submission evidence.
create table public.timesheet_period_confirmations (
 organization_id uuid not null references public.organizations(id),service_period text not null,
 submitted_on_time boolean not null,confirmed_by uuid not null,confirmed_at timestamptz not null default now(),reason text not null,
 primary key(organization_id,service_period)
);
alter table public.timesheet_period_confirmations enable row level security;
revoke all on public.timesheet_period_confirmations from anon,authenticated;
grant all on public.timesheet_period_confirmations to service_role;
-- Guard the existing deployed worker as well as the updated application scanner.
do $$ declare definition text; begin
 select pg_get_functiondef('public.append_timesheet_alert(uuid,uuid,text,jsonb,jsonb,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'  insert into public.user_notification_state(user_id,inbox,preferences)',
 '  if exists(select 1 from public.timesheet_period_confirmations c where c.organization_id=p_org and c.submitted_on_time and split_part(p_event_key,'':'',3)=c.service_period) then return false; end if;
  insert into public.user_notification_state(user_id,inbox,preferences)');
 execute definition;
end $$;
