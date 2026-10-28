-- New, initially empty records. No existing staff, family, account or assignment changes.
create table public.staff_onboarding_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  location_id uuid not null references public.locations(id),
  staff_user_id uuid references auth.users(id) on delete set null,
  full_name text not null check(length(full_name) between 1 and 160),
  email text not null default '', job_title text not null,
  start_date date not null, supervisor text not null,
  items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 100),
  status text not null default 'Active' check(status in ('Active','Archived')),
  reviewed_at timestamptz, reviewed_by text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index staff_onboarding_location_idx on public.staff_onboarding_plans(organization_id,location_id,status,start_date desc);
create unique index staff_onboarding_active_account on public.staff_onboarding_plans(organization_id,staff_user_id) where status='Active' and staff_user_id is not null;
create unique index staff_onboarding_active_email on public.staff_onboarding_plans(organization_id,lower(email)) where status='Active' and email<>'';
alter table public.staff_onboarding_plans enable row level security;
-- All reads and writes go through the server's authenticated, scoped API.
revoke all on public.staff_onboarding_plans from public,anon,authenticated;
create policy staff_onboarding_no_direct_client_access on public.staff_onboarding_plans for all to authenticated using(false) with check(false);
grant select,insert,update on public.staff_onboarding_plans to service_role;
create function public.stamp_staff_onboarding() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin new.updated_at=clock_timestamp();return new;end;
$$;
create trigger staff_onboarding_stamp before update on public.staff_onboarding_plans for each row execute function public.stamp_staff_onboarding();
create function public.audit_staff_onboarding() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  insert into public.audit_log(organization_id,location_id,actor_user_id,action,table_name,row_id,metadata)
  values(new.organization_id,new.location_id,new.updated_by,case when tg_op='INSERT' then 'CREATE' else 'UPDATE' end,'staff_onboarding_plans',new.id,
    jsonb_build_object('kind','staff_onboarding','status',new.status,'reviewedAt',new.reviewed_at,'items',
      (select jsonb_agg(jsonb_build_object('id',x->>'id','status',x->>'status','verifiedBy',x->>'verifiedBy','owner',x->>'owner','dueDate',x->>'dueDate','expiresOn',x->>'expiresOn')) from jsonb_array_elements(new.items) x)));
  return new;
end;
$$;
create trigger staff_onboarding_audit after insert or update on public.staff_onboarding_plans for each row execute function public.audit_staff_onboarding();
revoke all on function public.stamp_staff_onboarding(),public.audit_staff_onboarding() from public,anon,authenticated;
grant execute on function public.stamp_staff_onboarding(),public.audit_staff_onboarding() to service_role;
