-- New tracking only; no enrollment, meal, child, or attendance records are changed.
create table public.kidkare_daily_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  service_date date not null check (extract(isodow from service_date) between 1 and 5),
  status text not null check (status in ('Submitted', 'Closed / no care', 'Not submitted')),
  revision integer not null default 1 check (revision > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_by_name text not null,
  updated_at timestamptz not null default now(),
  unique (organization_id, location_id, service_date)
);
create index kidkare_daily_submissions_location_date_idx on public.kidkare_daily_submissions(location_id, service_date);
create index kidkare_daily_submissions_updated_by_idx on public.kidkare_daily_submissions(updated_by);
alter table public.kidkare_daily_submissions enable row level security;
revoke all on public.kidkare_daily_submissions from anon;
grant select, insert, update on public.kidkare_daily_submissions to authenticated;
create policy "kidkare daily read" on public.kidkare_daily_submissions for select to authenticated
  using (organization_id = (select public.current_staff_organization_id()) and public.can_read_location_module(location_id, 'kidkare'));
create policy "kidkare daily insert" on public.kidkare_daily_submissions for insert to authenticated
  with check (organization_id = (select public.current_staff_organization_id()) and public.can_write_location_module(location_id, 'kidkare'));
create policy "kidkare daily update" on public.kidkare_daily_submissions for update to authenticated
  using (organization_id = (select public.current_staff_organization_id()) and public.can_write_location_module(location_id, 'kidkare'))
  with check (organization_id = (select public.current_staff_organization_id()) and public.can_write_location_module(location_id, 'kidkare'));

create function public.validate_kidkare_submission() returns trigger language plpgsql security invoker set search_path = public as $$
declare v_today date := (now() at time zone 'America/Los_Angeles')::date;
begin
  if auth.uid() is null or not (public.is_tcs_owner() or public.is_tcs_licensee()) then raise exception 'KidKare leadership access required'; end if;
  if new.service_date > v_today then raise exception 'Future days cannot be marked submitted'; end if;
  if not exists(select 1 from public.locations where id=new.location_id and organization_id=new.organization_id and program_type='Family Childcare'
    and (is_active or new.service_date < date_trunc('month',v_today)::date)) then raise exception 'Choose an in-home location; closed homes are for past months only'; end if;
  if tg_op='UPDATE' and (new.id,new.organization_id,new.location_id,new.service_date) is distinct from (old.id,old.organization_id,old.location_id,old.service_date) then raise exception 'A submission cannot be moved to another home or date'; end if;
  new.revision := case when tg_op='INSERT' then 1 else old.revision+1 end;
  new.updated_by := auth.uid();
  select full_name into new.updated_by_name from public.staff_access where user_id=auth.uid() and is_active;
  if new.updated_by_name is null then raise exception 'Active staff access required'; end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
revoke all on function public.validate_kidkare_submission() from public, anon;
create trigger kidkare_daily_validate before insert or update on public.kidkare_daily_submissions for each row execute function public.validate_kidkare_submission();
create trigger kidkare_daily_audit after insert or update on public.kidkare_daily_submissions for each row execute function public.audit_location_row_change();

create function public.save_kidkare_submission(p_location_id uuid, p_service_date date, p_status text, p_expected_revision integer)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_org uuid := public.current_staff_organization_id(); v_row public.kidkare_daily_submissions;
begin
  if auth.uid() is null or v_org is null or not (public.is_tcs_owner() or public.is_tcs_licensee()) or not public.can_write_location_module(p_location_id,'kidkare') then raise exception 'KidKare access to this location is required'; end if;
  if p_expected_revision is null or p_expected_revision < 0 then raise exception 'Refresh the checklist before saving'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_org::text||p_location_id::text||p_service_date::text,0));
  select * into v_row from public.kidkare_daily_submissions where organization_id=v_org and location_id=p_location_id and service_date=p_service_date for update;
  if coalesce(v_row.revision,0) <> p_expected_revision then raise exception 'This day changed on another device. Refresh the checklist and try again.'; end if;
  if v_row.id is null then
    insert into public.kidkare_daily_submissions(organization_id,location_id,service_date,status,updated_by_name)
      values(v_org,p_location_id,p_service_date,p_status,'') returning * into v_row;
  elsif v_row.status is distinct from p_status then
    update public.kidkare_daily_submissions set status=p_status where id=v_row.id returning * into v_row;
  end if;
  return to_jsonb(v_row);
end $$;
revoke all on function public.save_kidkare_submission(uuid,date,text,integer) from public, anon;
grant execute on function public.save_kidkare_submission(uuid,date,text,integer) to authenticated;

-- Monthly evidence stays in the existing encrypted document vault.
create index document_records_kidkare_month_idx on public.document_records(organization_id,source_reference,location_id)
  where document_type='KidKare Claim Confirmation' and status='Active';
