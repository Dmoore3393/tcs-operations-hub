-- TCS Operations Hub — Weekly menu image uploads
-- Keeps uploaded menu artwork private; access is issued only through authenticated staff APIs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'weekly-menu-images',
  'weekly-menu-images',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
