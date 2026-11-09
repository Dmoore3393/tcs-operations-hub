-- Shared training materials use direct, resumable uploads to a private bucket.
-- Only authenticated server routes issue scoped upload and download URLs.
create table public.training_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  training_id text not null check (training_id ~ '^training-[a-zA-Z0-9-]{1,100}$'),
  kind text not null check (kind in ('content','certificate')),
  filename text not null check (length(filename) between 1 and 240),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  storage_path text not null unique,
  status text not null default 'pending' check (status in ('pending','ready')),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint training_asset_type check (
    (kind = 'content' and mime_type in ('video/mp4','application/pdf','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'))
    or (kind = 'certificate' and size_bytes <= 15728640 and mime_type in ('application/pdf','image/png','image/jpeg'))
  )
);
create index training_assets_training_idx on public.training_assets(organization_id,training_id);
create index training_assets_uploader_idx on public.training_assets(uploaded_by);
alter table public.training_assets enable row level security;
revoke all on public.training_assets from public, anon, authenticated;
grant all on public.training_assets to service_role;
create policy "Server manages training assets" on public.training_assets for all to service_role using (true) with check (true);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('training-assets','training-assets',false,52428800,array[
  'video/mp4','application/pdf','application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation','image/png','image/jpeg'
]) on conflict (id) do nothing;
