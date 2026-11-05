-- One staff selection and one report per request, even if two sites submit together.
create or replace function public.create_shift_report_with_staff(p_request_id uuid, p_report jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  org uuid := public.current_staff_organization_id();
  loc uuid := public.resolve_tcs_location_id(p_report->>'location', org);
  staff_id uuid := (p_report->>'completedByStaffId')::uuid;
  staff_name text;
  initials text := upper(trim(p_report->>'initials'));
  report_key text := 'report-' || p_request_id;
  handoff_key text := 'handoff-' || p_request_id;
  report_status text := p_report->>'status';
  pickup text := trim(p_report->>'pickupInformation');
  saved_id uuid;
  payload jsonb;
begin
  if auth.uid() is null or org is null or loc is null or not public.can_write_location_module(loc, 'reports') then
    raise exception 'Shift report access is required.' using errcode = '42501';
  end if;
  if p_request_id is null or coalesce(p_report->>'type', '') not in ('Opening', 'Closing')
    or coalesce(report_status, '') not in ('Draft', 'Submitted') or nullif(p_report->>'date', '') is null then
    raise exception 'Choose a report type, date, and location.';
  end if;
  select full_name into staff_name from public.staff_lane_profiles
    where organization_id = org and id = staff_id and is_active;
  if nullif(trim(staff_name), '') is null or coalesce(initials, '') !~ '^[A-Z]{2,4}$' then
    raise exception 'Choose a staff member and enter their initials before saving.';
  end if;

  payload := (p_report - array['id','completedBy','submittedAt','reviewedBy','reviewerInitials','reviewedAt'])
    || jsonb_build_object('id', report_key, 'completedBy', staff_name, 'completedByStaffId', staff_id, 'initials', initials);
  if report_status = 'Submitted' then
    payload := payload || jsonb_build_object('submittedAt', now());
  end if;
  insert into public.shift_reports
    (organization_id, location_id, legacy_id, report_date, report_type, status, completed_by, staff_initials, record_data)
    values (org, loc, report_key, (payload->>'date')::date, payload->>'type', report_status, staff_name, initials, payload)
    on conflict (organization_id, legacy_id) do nothing returning id into saved_id;
  if saved_id is null then
    -- A retry after a lost response must not duplicate the report or claim edited notes were saved.
    if not exists (
      select 1 from public.shift_reports r where r.organization_id = org and r.legacy_id = report_key
        and r.created_by = auth.uid() and (r.status = report_status or (r.status = 'Reviewed' and report_status = 'Submitted'))
        and r.record_data - array['submittedAt','completedBy','status','reviewedBy','reviewerInitials','reviewedAt']
          = payload - array['submittedAt','completedBy','status']
    ) then
      raise exception 'A different version was already saved. Check Report History.';
    end if;
    return;
  end if;
  if report_status = 'Submitted' and pickup <> '' then
    insert into public.handoff_items
      (organization_id, location_id, source_report_id, legacy_id, handoff_date, category, priority, completed, record_data)
      values (org, loc, saved_id, handoff_key, (payload->>'date')::date, 'Pickup Information', 'Important', false,
        jsonb_build_object('id', handoff_key, 'sourceReportId', report_key, 'location', payload->>'location',
          'date', payload->>'date', 'category', 'Pickup Information', 'details', pickup, 'priority', 'Important',
          'completed', false, 'completedByInitials', ''));
  end if;
end;
$$;

-- Reviews and pickup handoffs change only the selected row and preserve its original author.
create or replace function public.review_shift_report(p_report_id text, p_initials text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  org uuid := public.current_staff_organization_id();
  initials text := upper(trim(p_initials));
  saved public.shift_reports;
begin
  if coalesce(initials, '') !~ '^[A-Z]{2,4}$' then raise exception 'Enter staff initials before saving.'; end if;
  update public.shift_reports set status = 'Reviewed', reviewed_by = auth.uid(), reviewed_at = now(),
    record_data = record_data || jsonb_build_object('status', 'Reviewed', 'reviewedBy', 'Director / Licensee',
      'reviewerInitials', initials, 'reviewedAt', now())
    where organization_id = org and legacy_id = p_report_id and status = 'Submitted' returning * into saved;
  if found then
    perform public.record_audit_event('REVIEW','shift_reports',saved.id,saved.location_id,
      jsonb_build_object('reportType',saved.report_type,'reportDate',saved.report_date,'reviewerInitials',initials));
  elsif not exists (select 1 from public.shift_reports where organization_id = org and legacy_id = p_report_id and status = 'Reviewed') then
    raise exception 'This report could not be reviewed.';
  end if;
end;
$$;

create or replace function public.complete_shift_report_handoff(p_handoff_id text, p_initials text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  org uuid := public.current_staff_organization_id();
  initials text := upper(trim(p_initials));
begin
  if coalesce(initials, '') !~ '^[A-Z]{2,4}$' then raise exception 'Enter staff initials before saving.'; end if;
  update public.handoff_items set completed = true,
    record_data = record_data || jsonb_build_object('completed', true, 'completedByInitials', initials, 'completedAt', now())
    where organization_id = org and legacy_id = p_handoff_id and not completed;
  if not found and not exists (select 1 from public.handoff_items where organization_id = org and legacy_id = p_handoff_id and completed) then
    raise exception 'This handoff could not be completed.';
  end if;
end;
$$;

revoke all on function public.create_shift_report_with_staff(uuid, jsonb), public.review_shift_report(text, text), public.complete_shift_report_handoff(text, text) from public, anon;
grant execute on function public.create_shift_report_with_staff(uuid, jsonb), public.review_shift_report(text, text), public.complete_shift_report_handoff(text, text) to authenticated;
