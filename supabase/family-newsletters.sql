-- TCS Operations Hub — Family Newsletters
-- Private monthly newsletter library for Parent Portal families.

create table if not exists public.family_newsletters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  newsletter_month date not null,
  title text not null,
  summary text,
  object_path text not null,
  mime_type text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  is_published boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (date_trunc('month', newsletter_month)::date = newsletter_month)
);

create index if not exists family_newsletters_parent_idx
  on public.family_newsletters (organization_id, is_published, newsletter_month desc, location_id);

drop trigger if exists family_newsletters_updated_at on public.family_newsletters;
create trigger family_newsletters_updated_at
before update on public.family_newsletters
for each row execute function public.set_updated_at();

alter table public.family_newsletters enable row level security;
revoke all on public.family_newsletters from anon, authenticated;
grant all on public.family_newsletters to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'family-newsletters',
  'family-newsletters',
  false,
  15728640,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
