create table public.account_deletion_requests (
 id uuid primary key default gen_random_uuid(),
 requester_id uuid unique,
 requester_email text,
 organization_ids uuid[] not null,
 status text not null default 'Pending' check(status in ('Pending','In Review','Completed')),
 requested_at timestamptz not null default now(),
 due_at timestamptz not null default (now() + interval '30 days'),
 reviewed_by uuid,
 completed_at timestamptz,
 retention_summary text not null default ''
);
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon,authenticated;
grant select,insert,update,delete on public.account_deletion_requests to service_role;
create index account_deletion_requests_status_due_idx on public.account_deletion_requests(status,due_at);
comment on table public.account_deletion_requests is 'Server-only, authenticated account deletion requests. Submission does not delete childcare records. Completion requires removal of the account and non-retained personal data.';
