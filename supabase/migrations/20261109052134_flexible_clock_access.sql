-- Managed only by trusted server administration. Existing settings are read-only
-- to authenticated staff; do not grant client writes to this access list.
alter table public.staff_attendance_settings
  add column if not exists flexible_clock_user_ids uuid[] not null default '{}'::uuid[];

comment on column public.staff_attendance_settings.flexible_clock_user_ids is
  'Specific active Owner/Admin accounts authorized for unscheduled personal clocking. Does not grant access to other staff accounts.';
