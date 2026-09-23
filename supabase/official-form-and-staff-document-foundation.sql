-- TCS Operations Hub — Official Form / Staff Document Foundation
-- Lets redesigned official forms be versioned and linked to staff/child workflows
-- without mixing organizational identity, permissions, or sensitive files.

create table if not exists public.official_form_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_key text not null,
  title text not null,
  subject_type text not null
    check (subject_type in ('Child','Employee','Family','Transportation','Facility','Vehicle','Operations')),
  workflow_type text not null default 'Signature'
    check (workflow_type in ('Signature','Acknowledgment','Internal Record','Upload Only')),
  current_version integer not null default 1 check (current_version >= 1),
  description text,
  requires_signature boolean not null default false,
  requires_verification boolean not null default true,
  default_confidentiality text not null default 'Location Leadership'
    check (default_confidentiality in ('Location Leadership','Owner Only','Staff Self + Owner')),
  source_document_id uuid,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, template_key)
);

alter table public.document_records
  add column if not exists staff_user_id uuid references auth.users(id) on delete set null,
  add column if not exists document_scope text not null default 'Operations'
    check (document_scope in ('Child','Staff','Facility','Vehicle','Training','Operations','Other')),
  add column if not exists confidentiality text not null default 'Location Leadership'
    check (confidentiality in ('Location Leadership','Owner Only','Staff Self + Owner')),
  add column if not exists form_template_id uuid references public.official_form_templates(id) on delete set null,
  add column if not exists source_system text,
  add column if not exists source_reference text;

alter table public.official_form_templates
  drop constraint if exists official_form_templates_source_document_id_fkey;
alter table public.official_form_templates
  add constraint official_form_templates_source_document_id_fkey
  foreign key (source_document_id) references public.document_records(id) on delete set null;

create index if not exists document_records_staff_idx
  on public.document_records(organization_id, staff_user_id, created_at desc)
  where staff_user_id is not null;
create index if not exists document_records_template_idx
  on public.document_records(form_template_id)
  where form_template_id is not null;
create unique index if not exists document_records_source_unique_idx
  on public.document_records(organization_id, source_system, source_reference)
  where source_system is not null and source_reference is not null;
create index if not exists official_form_templates_org_active_idx
  on public.official_form_templates(organization_id, is_active, subject_type, title);

update public.document_records
set document_scope = case
  when child_id is not null then 'Child'
  when document_type = 'Training Certificate' then 'Training'
  else 'Operations'
end
where document_scope = 'Operations';

alter table public.official_form_templates enable row level security;

drop policy if exists "form templates read same organization" on public.official_form_templates;
create policy "form templates read same organization"
on public.official_form_templates
for select to authenticated
using (organization_id = (select public.current_staff_organization_id()));

revoke insert, update, delete on public.official_form_templates from authenticated;
grant select on public.official_form_templates to authenticated;
grant all on public.official_form_templates to service_role;

drop trigger if exists set_official_form_templates_updated_at on public.official_form_templates;
create trigger set_official_form_templates_updated_at
before update on public.official_form_templates
for each row execute function public.set_updated_at();

drop policy if exists "authorized staff read documents" on public.document_records;
create policy "authorized staff read documents"
on public.document_records
for select to authenticated
using (
  organization_id = (select public.current_staff_organization_id())
  and public.can_access_location(location_id)
  and (
    public.is_tcs_owner()
    or (public.is_tcs_licensee() and confidentiality = 'Location Leadership')
    or (staff_user_id = (select auth.uid()) and confidentiality = 'Staff Self + Owner')
  )
);

drop policy if exists "authorized staff create documents" on public.document_records;
create policy "authorized staff create documents"
on public.document_records
for insert to authenticated
with check (
  organization_id = (select public.current_staff_organization_id())
  and public.can_access_location(location_id)
  and (
    public.is_tcs_owner()
    or (public.is_tcs_licensee() and confidentiality = 'Location Leadership')
  )
);
