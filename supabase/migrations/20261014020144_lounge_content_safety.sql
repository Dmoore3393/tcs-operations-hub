create table public.lounge_blocks (
 organization_id uuid not null references public.organizations(id),
 user_id uuid not null references auth.users(id) on delete cascade,
 blocked_user_id uuid not null,
 blocked_name text not null,
 created_at timestamptz not null default now(),
 primary key (organization_id,user_id,blocked_user_id),
 check(user_id<>blocked_user_id)
);
create table public.lounge_reports (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 reporter_id uuid references auth.users(id) on delete set null,
 post_id text not null,
 post_author text not null,
 post_message text not null,
 reason text not null check(length(reason) between 3 and 1000),
 status text not null default 'Pending' check(status in ('Pending','Hidden','Reviewed')),
 created_at timestamptz not null default now(),
 reviewed_by uuid,
 reviewed_at timestamptz,
 unique(organization_id,reporter_id,post_id)
);
create index lounge_reports_queue_idx on public.lounge_reports(organization_id,status,created_at);
alter table public.lounge_blocks enable row level security;
alter table public.lounge_reports enable row level security;
revoke all on public.lounge_blocks,public.lounge_reports from anon,authenticated;
grant select,insert,update,delete on public.lounge_blocks,public.lounge_reports to service_role;
-- The feed must go through its authenticated safety API, including for owners.
-- Preserve the existing helpers and all other keys' access rules.
do $$
declare f text; definition text;
begin
 foreach f in array array['public.can_read_hub_state_key(text)','public.can_write_hub_state_key(text)'] loop
  definition:=pg_get_functiondef(f::regprocedure);
  definition:=replace(definition,E'begin\n',E'begin\n  if p_state_key = ''tcs-employee-lounge-shoutouts-v1'' then return false; end if;\n');
  execute definition;
 end loop;
end $$;
