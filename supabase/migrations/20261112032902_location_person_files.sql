-- Explicit person/location file assignments. No roster, schedule or permission changes.
create table public.location_person_files (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 location_id uuid not null references public.locations(id) on delete restrict,
 child_id uuid references public.children(id) on delete restrict,
 staff_lane_id uuid references public.staff_lane_profiles(id) on delete restrict,
 person_name text not null check (length(person_name) between 1 and 250),
 template text not null check (template in ('In-Home','School Age Center')),
 items jsonb not null default '[]'::jsonb check (jsonb_typeof(items)='array' and jsonb_array_length(items)<=100),
 notes text not null default '' check (length(notes)<=6000),
 reviewed_by text not null default '' check (length(reviewed_by)<=160),
 review_date date,
 follow_up text not null default '' check (length(follow_up)<=4000),
 template_confirmed boolean not null default false,
 archived boolean not null default false,
 created_by uuid references auth.users(id) on delete set null,
 updated_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check ((child_id is not null)::int + (staff_lane_id is not null)::int=1)
);
create unique index location_person_files_child_site on public.location_person_files(organization_id,location_id,child_id) where child_id is not null;
create unique index location_person_files_staff_site on public.location_person_files(organization_id,location_id,staff_lane_id) where staff_lane_id is not null;
create index location_person_files_location on public.location_person_files(location_id);
create index location_person_files_child on public.location_person_files(child_id) where child_id is not null;
create index location_person_files_staff on public.location_person_files(staff_lane_id) where staff_lane_id is not null;
create index location_person_files_created_by on public.location_person_files(created_by);
create index location_person_files_updated_by on public.location_person_files(updated_by);
alter table public.location_person_files enable row level security;
revoke all on public.location_person_files from public,anon,authenticated;
grant select,insert,update on public.location_person_files to authenticated;
grant all on public.location_person_files to service_role;
create policy location_files_read on public.location_person_files for select to authenticated using (
 organization_id=public.current_staff_organization_id() and public.can_access_location(location_id)
 and (public.is_tcs_owner() or public.is_tcs_licensee())
);
create policy location_files_insert on public.location_person_files for insert to authenticated with check (
 organization_id=public.current_staff_organization_id() and public.can_access_location(location_id)
 and (public.is_tcs_owner() or public.is_tcs_licensee())
);
create policy location_files_update on public.location_person_files for update to authenticated using (
 organization_id=public.current_staff_organization_id() and public.can_access_location(location_id)
 and (public.is_tcs_owner() or public.is_tcs_licensee())
) with check (
 organization_id=public.current_staff_organization_id() and public.can_access_location(location_id)
 and (public.is_tcs_owner() or public.is_tcs_licensee())
);
create function public.validate_location_person_file() returns trigger language plpgsql security invoker set search_path=public as $$
declare expected_name text;
begin
 if tg_op='UPDATE' and (new.organization_id,new.location_id,new.child_id,new.staff_lane_id,new.template) is distinct from (old.organization_id,old.location_id,old.child_id,old.staff_lane_id,old.template) then
  raise exception 'A location file cannot be moved to a different person, location or template.' using errcode='23514';
 end if;
 if not exists(select 1 from public.locations where id=new.location_id and organization_id=new.organization_id) then
  raise exception 'Location does not belong to this organization or is unavailable.' using errcode='23514';
 end if;
 if new.child_id is not null then
  select trim(first_name||' '||last_name) into expected_name from public.children where id=new.child_id and organization_id=new.organization_id;
 else
  select full_name into expected_name from public.staff_lane_profiles where id=new.staff_lane_id and organization_id=new.organization_id;
 end if;
 if expected_name is null then raise exception 'Person is not available to this organization/account.' using errcode='23514'; end if;
 new.person_name=expected_name;
 if tg_op='INSERT' then new.created_by=auth.uid();new.created_at=now(); else new.created_by=old.created_by;new.created_at=old.created_at; end if;
 new.updated_by=auth.uid();new.updated_at=clock_timestamp();
 return new;
end $$;
revoke all on function public.validate_location_person_file() from public,anon,authenticated;
create trigger location_person_files_validate before insert or update on public.location_person_files for each row execute function public.validate_location_person_file();
create trigger location_person_files_audit after insert or update or delete on public.location_person_files for each row execute function public.audit_location_row_change();
comment on table public.location_person_files is 'Leadership-only, explicitly assigned child/staff file checklists per location. Does not grant care membership, portal access, or personnel access.';

-- Vault records can belong to a specific location/person file. Existing uploads are untouched.
alter table public.document_records add column location_file_id uuid references public.location_person_files(id) on delete restrict;
create index document_records_location_file on public.document_records(location_file_id) where location_file_id is not null;
create function public.validate_document_location_file() returns trigger language plpgsql security invoker set search_path='' as $$
declare f public.location_person_files;
begin
 if new.location_file_id is null then return new; end if;
 select * into f from public.location_person_files where id=new.location_file_id;
 if not found or f.organization_id<>new.organization_id or f.location_id<>new.location_id or f.child_id is distinct from new.child_id then
  raise exception 'Document must match the authorized person and location file.' using errcode='23514';
 end if;
 if tg_op='INSERT' and f.archived then raise exception 'Reopen the archived file before uploading.' using errcode='23514'; end if;
 if new.document_scope <> (case when f.child_id is null then 'Staff' else 'Child' end) or new.confidentiality<>'Location Leadership' then
  raise exception 'Location-file uploads are leadership-only and must retain their person scope.' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function public.validate_document_location_file() from public,anon,authenticated;
create trigger document_records_location_file_check before insert or update of location_file_id,organization_id,location_id,child_id,document_scope,confidentiality on public.document_records for each row execute function public.validate_document_location_file();
