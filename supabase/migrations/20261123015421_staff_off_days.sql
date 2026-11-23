-- Off is a published schedule entry with zero hours, never a coverage interval.
alter table public.staff_shifts drop constraint staff_shifts_check;
alter table public.staff_shifts add constraint staff_shifts_check check (
 (position_label='Off' and start_time='00:00'::time and end_time='00:00'::time)
 or (position_label is distinct from 'Off' and end_time>start_time)
);
alter table public.staff_schedule_publication_shifts drop constraint staff_schedule_publication_shifts_check;
alter table public.staff_schedule_publication_shifts add constraint staff_schedule_publication_shifts_check check (
 (position_label='Off' and start_time='00:00'::time and end_time='00:00'::time)
 or (position_label is distinct from 'Off' and end_time>start_time)
);
