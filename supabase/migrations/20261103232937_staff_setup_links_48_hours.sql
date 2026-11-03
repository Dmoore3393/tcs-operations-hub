-- Staff invitations have their own 48-hour lifetime; ordinary Auth email OTPs stay unchanged.
create table public.staff_setup_links (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  organization_id uuid not null references public.organizations(id),
  auth_user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ready_at timestamptz,
  revoked_at timestamptz,
  last_exchange_at timestamptz,
  check (expires_at > created_at)
);
create index staff_setup_links_user_idx on public.staff_setup_links(auth_user_id);
create index staff_setup_links_org_idx on public.staff_setup_links(organization_id);
alter table public.staff_setup_links enable row level security;
revoke all on public.staff_setup_links from public, anon, authenticated;
grant select, insert, update, delete on public.staff_setup_links to service_role;
comment on table public.staff_setup_links is 'Server-only SHA-256 invitation proofs. No plaintext tokens. Pending active staff only; completed accounts cannot reuse them.';
