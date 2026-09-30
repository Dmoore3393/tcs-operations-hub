-- TCS Operations Hub — Family Matters, weekly child check-ins, and child photos
-- Secure server-mediated family engagement features. Parent Portal invitations are not affected.

create table if not exists public.family_matters_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  category text not null default 'Thank You'
    check (category in ('Reminder','Policy','Thank You','Closure','Schedule Notice','Fun Message')),
  title text not null,
  message text not null,
  emoji text,
  start_date date not null default current_date,
  end_date date,
  is_pinned boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create index if not exists family_matters_posts_window_idx
  on public.family_matters_posts (organization_id, is_active, start_date, end_date, location_id);

create table if not exists public.child_weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  child_id uuid not null references public.children(id) on delete cascade,
  child_legacy_id text not null,
  week_of date not null,
  title text not null default 'This Week at TCS',
  message text not null,
  highlights jsonb not null default '[]'::jsonb,
  status text not null default 'Published' check (status in ('Draft','Published')),
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, child_id, week_of)
);

create index if not exists child_weekly_checkins_parent_idx
  on public.child_weekly_checkins (organization_id, child_id, status, week_of desc);

create table if not exists public.child_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  child_id uuid not null references public.children(id) on delete cascade,
  child_legacy_id text not null,
  media_kind text not null default 'Daily Photo' check (media_kind in ('Profile','Daily Photo')),
  service_date date not null default current_date,
  caption text,
  object_path text not null,
  mime_type text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  visible_to_family boolean not null default true,
  photo_consent_verified boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists child_media_child_date_idx
  on public.child_media (organization_id, child_id, media_kind, service_date desc, created_at desc);

create unique index if not exists child_media_one_profile_idx
  on public.child_media (organization_id, child_id)
  where media_kind = 'Profile';

drop trigger if exists family_matters_posts_updated_at on public.family_matters_posts;
create trigger family_matters_posts_updated_at
before update on public.family_matters_posts
for each row execute function public.set_updated_at();

drop trigger if exists child_weekly_checkins_updated_at on public.child_weekly_checkins;
create trigger child_weekly_checkins_updated_at
before update on public.child_weekly_checkins
for each row execute function public.set_updated_at();

alter table public.family_matters_posts enable row level security;
alter table public.child_weekly_checkins enable row level security;
alter table public.child_media enable row level security;

revoke all on public.family_matters_posts from anon, authenticated;
revoke all on public.child_weekly_checkins from anon, authenticated;
revoke all on public.child_media from anon, authenticated;

grant all on public.family_matters_posts to service_role;
grant all on public.child_weekly_checkins to service_role;
grant all on public.child_media to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'child-media',
  'child-media',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
