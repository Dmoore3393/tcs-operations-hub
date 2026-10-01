-- TCS Operations Hub — nutrition rule profile permissions
-- Meal staff can read/write location nutrition rule profiles.

create or replace function public.can_read_hub_state_key(p_state_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_approved_tcs_pilot_user() then return false; end if;
  if public.is_tcs_relational_state_key(p_state_key) then return public.is_tcs_owner(); end if;
  if public.is_tcs_owner() then return true; end if;

  if public.is_tcs_licensee() then
    return p_state_key <> 'tcs-settings';
  end if;
  if not public.is_tcs_employee() then return false; end if;

  return case
    when p_state_key = 'tcs-work-tasks' then public.has_staff_permission('work_plans')
    when p_state_key in ('tcs-schools-v2', 'tcs-vehicles-v2', 'tcs-vehicle-readiness-v2') then public.has_staff_permission('transportation')
    when p_state_key in ('tcs-location-hours-v2', 'tcs-shifts') then public.has_staff_permission('ratios')
    when p_state_key in ('tcs-food-presets-v1', 'tcs-nutrition-rules-v1') then public.has_staff_permission('meals') or public.has_staff_permission('daily_care')
    else false
  end;
end;
$$;

create or replace function public.can_write_hub_state_key(p_state_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_approved_tcs_pilot_user() then return false; end if;
  if public.is_tcs_relational_state_key(p_state_key) then return false; end if;
  if public.is_tcs_owner() then return true; end if;

  if public.is_tcs_licensee() then
    return p_state_key not in (
      'tcs-settings','tcs-locations-v2','tcs-location-hours-v2',
      'tcs-schools-v2','tcs-vehicles-v2','tcs-timesheet-department-routes-v1'
    );
  end if;
  if not public.is_tcs_employee() then return false; end if;

  return case
    when p_state_key = 'tcs-work-tasks' then public.has_staff_permission('work_plans')
    when p_state_key = 'tcs-vehicle-readiness-v2' then public.has_staff_permission('transportation')
    when p_state_key in ('tcs-food-presets-v1', 'tcs-nutrition-rules-v1') then public.has_staff_permission('meals')
    else false
  end;
end;
$$;
