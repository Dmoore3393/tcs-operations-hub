# Daily transportation accountability

The enrollment roster, not reusable route membership, supplies every expected school-age child. Each child has independent morning and afternoon decisions. Blank entries remain unresolved. Existing child, school, vehicle and route records supply planning details; they do not authorize a daily trip.

## Operating workflow

- Danielle: review all children, save decisions and documented exceptions, complete assignments, publish ready changes, monitor exceptions, reconcile the day.
- Driver: acknowledge each affected assignment or revision, physically confirm each pickup, mark arrival, wait for receiving staff, physically sweep the vehicle after every route handoff is complete.
- Receiving staff: open `/transportation-arrivals`, choose the location where they are working, and confirm each child physically received. An assigned driver cannot substitute for the receiving employee.
- Outside TCS: the driver records the receiving adult's name and verifies authorization. This does not replace the program's underlying authorized-pickup records or Brightwheel care attendance.

School calendars support recurring minimum weekdays, school-wide date overrides, holidays/closures, and grade/classroom/child-specific schedules. Dismissal and planned pickup are separate. Calendar changes flag previously saved dismissal times for Danielle's review and republishing.

A school report that a parent collected a child is a problem, not a confirmed cancellation. Only Danielle can resolve it by confirming whereabouts, the responsible adult, and the verification source. A cancellation then requires a documented decision, publication and acknowledgment.

## Deployment and cutover

This branch is deliberately inactive until the database, background scheduler and staff-role checks are ready. `TCS_TRANSPORT_ACCOUNTABILITY=true` selects the new screens. A dated row in `transport_accountability_rollout` must also exist. Danielle can prepare the selected future service date before operational cutover; staff retain the existing workflow until that date. Do not activate halfway through an operating day: legacy custody records are retained as history, not automatically relabeled as new-ledger confirmations.

1. Apply the generated migration `20261117180754_transport_accountability.sql`. It adds server-only tables and private trigger guards; existing operational records are retained.
2. Deploy this source with the flag off. Verify the existing workflow still opens. Set `TCS_TRANSPORT_PLANNER_EMAIL` to Danielle's active staff-access email (default `youngmoore19@gmail.com`). The account must also have Owner/Admin access.
3. Configure a reliable per-minute caller for `/api/cron/transportation`, using the dedicated server-side `TRANSPORT_CRON_SECRET` (with `CRON_SECRET` retained as a fallback). The current Vercel Hobby project must not be given a per-minute Vercel cron declaration. The optional SQL below uses Supabase Cron, pg_net and Vault instead. Do not put the secret in source control, URLs or job text.
4. Before the first trip on the chosen service date, ensure no legacy route is in custody. Insert the organization, start date and activating administrator into `transport_accountability_rollout`, then enable the server flag and redeploy. For an environment mismatch the workflow gate fails closed.
5. Danielle opens the plan, configures authorized backup leadership, verifies school calendars and driver account links, reviews every child, and publishes. Missing driver, backup driver, school/dismissal, seating, location, destination, vehicle, route or valid pickup/arrival times blocks trip readiness. Publishing ready rows leaves unresolved children visible.
6. Verify signed-in Danielle, driver, receiving employee and location-licensee sessions. Test background notifications with all app windows closed. Confirm native push delivery on an actual staff device before treating alerts as verified in production.

The migration's cutoff guards block legacy daily decisions and custody RPCs, including stale clients calling the database directly. Reusable route setup remains available. Cutover is organization scoped; do not activate the global server flag for an unrelated organization without its dated rollout row.

## Optional Supabase background scheduler

Run through the authorized database administrator after the endpoint is deployed. Store the dedicated TRANSPORT_CRON_SECRET in Vault under `tcs_transport_cron_secret` using a secure parameterized administrative operation. No secret value belongs in this file.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'tcs-transportation-alerts', '* * * * *',
  $job$
  select net.http_get(
    url := 'https://thetcshub.com/api/cron/transportation',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name='tcs_transport_cron_secret')),
    timeout_milliseconds := 10000
  );
  $job$
);
```

Confirm successful HTTP responses using `net._http_response`, and verify `cron.job_run_details`. Transport scans retain unsent deliveries for retry. Unique recipient/event keys prevent repeated in-app alerts; native push tags coalesce retry deliveries. As with external push providers generally, exactly-once physical device display is not guaranteed after a response is lost.

## Data and permission model

The server verifies an active staff session and organization. Danielle's registered account controls daily plans and calendars. Driver actions use stable staff account IDs; existing lane IDs map through `staff_lane_profiles.staff_user_id`. An ambiguous name is left unassigned. Location licensees see assigned locations; receiving staff confirm only assigned destinations. The organization day documents are not exposed to anonymous or authenticated database clients. Historical trips survive enrollment archival and transfers; transfers generate a review exception.

Every write uses an atomic day-version compare-and-swap, audit entry and notification outbox transaction. A stale request must refresh. An in-flight action says it is awaiting server confirmation. Offline or unconfirmed actions are never displayed as transmitted; urgent updates require a direct call to Danielle or backup leadership. Offline confirmations are not silently replayed into a changed plan.

Routine completed trips collapse out of the main view and remain available through “Show completed routine trips.” Daily Summary retains late pickups, unresolved plans, open problems, unacknowledged revisions, unconfirmed handoffs and missing sweeps. Day closure rejects unresolved items. Reopening requires Danielle's documented reason.

## Verification

Run `node --test scripts/test-transport-accountability.mjs` for enrollment, AM/PM separation, calendars/overrides, partial publication, individual pickup counts, parent-pickup reports, published destination changes, replacement-driver acknowledgment, receiving permissions, vehicle sweeps, transfers, conflicts, alerts, database transactions, deduplication, client isolation and settings concurrency. The existing transportation and notification suites remain regression checks.

Local production compilation and synthetic database tests do not verify live staff sessions, push-provider delivery, or a deployed cron job. These remain release checks until their observed results are recorded.
