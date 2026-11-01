-- Private personnel imports. Never exposed through the general staff directory.
create table public.staff_personnel_imports (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 lane_id uuid references public.staff_lane_profiles(id),
 source_name text not null,
 source_key text not null,
 details jsonb not null check (jsonb_typeof(details) = 'object'),
 imported_at timestamptz not null default now(),
 unique (organization_id, source_key)
);
alter table public.staff_personnel_imports enable row level security;
revoke all on public.staff_personnel_imports from public, anon, authenticated, service_role;
grant select, insert, update on public.staff_personnel_imports to service_role;
create index staff_personnel_imports_lane on public.staff_personnel_imports(organization_id,lane_id);
