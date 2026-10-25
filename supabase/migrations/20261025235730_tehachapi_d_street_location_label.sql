-- Configuration correction only. Reuse the Tehachapi site; do not create,
-- move, update or delete children, families, staff or their assignments.
update public.locations l
set name = 'D Street (Tehachapi)',
    full_name = 'Thomason Family Childcare • D Street, Tehachapi',
    program_type = 'Family Childcare'
where l.slug = 'tehachapi'
  and l.is_active
  and exists (select 1 from public.organizations o where o.id = l.organization_id and o.name = 'Thomason Childcare Solutions')
  and (l.name, l.full_name, l.program_type) is distinct from
    ('D Street (Tehachapi)', 'Thomason Family Childcare • D Street, Tehachapi', 'Family Childcare');
