# Brightwheel staff import — November 1, 2026

The authorized one-time import stores 20 export records in `staff_personnel_imports`. Fifteen exact, unique name matches link to existing directory IDs; five unmatched or spelling-different records remain unlinked for identity review. No fuzzy matching is applied. Source records without a directory match do not create an active employee or login.

The owner-only API `/api/staff-personnel` serves the private records view at `/employees/personnel`. The table denies anon/authenticated access, has RLS enabled, and permits server SELECT/INSERT/UPDATE only. It includes confidential export fields and must never be joined into the all-staff directory response or stored in browser persistence. The export itself and import SQL containing personnel values are not committed.

The import leaves approved job titles, reporting lines, locations, account permissions, directory names and active status unchanged. The four previously added staff remain present, and departed staff remain inactive. Blank values do not erase previously imported values on repeat import. Records use organization plus normalized source name as a retry key; a future name change requires manual identity review. No invitations or notifications are sent.

This is a one-time data import and a private records viewer, not a reusable CSV upload feature. Future CSVs need the same duplicate checks and explicit identity review. No new onboarding plans are fabricated without assigned location and start date.
