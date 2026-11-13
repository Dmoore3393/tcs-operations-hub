# Daily school pickups and selected-child drop-off

Requested by Danielle: stop automatic next-day pickup assignments; review children by school, select Needs pickup or No pickup and enter the time for the selected date; allow checked children arriving together to be handed off together.

## Release behavior
- Website Daily School Pickup Checklist groups reusable child/trip entries by school, with Afternoon / Morning / All sessions and a Pacific service date. A new date has no chosen decision or copied pickup time. Save each row explicitly. Driver/vehicle/destination details may be reused, but do not schedule a trip.
- From 2026-11-13, the live website lists waiting trips only when that date has an explicit saved pickup decision and valid time. Prior dates retain their historical recurrence display. Current-date onboard, arrived and completed trips remain visible regardless of later planning state. Existing date-specific saved plans are not deleted.
- No pickup changes only the selected trip/date. Out sick remains an explicit all-remaining-linked-trips action; restoring a sick call-out is separately confirmed. Completed and in-progress trips are protected. Planning rights remain Owner/Admin; existing location/transportation permissions and licensee call-outs remain unchanged.
- The driver screen includes Drop off selected children together. Candidates must have individual pickup and arrival recorded, a linked child, and the same reviewed driver, vehicle, trip session and destination. Nothing is preselected. The driver must confirm physically verifying every checked child has exited and been handed to the appropriate adult.
- A new SECURITY INVOKER function validates all selected rows under existing row security, locks rows, checks the reviewed arrival timestamps and group, rejects stale/duplicate/wrong-site or not-arrived selections, and records a single server timestamp in each child's own history in one transaction. Failure rolls back the entire selected batch. Existing per-child custody notifications and audits remain in place.
- Group drop-off is offered during the existing Brightwheel attendance transition. It does not check children into care or replace Brightwheel attendance. Individual pickup, emergency verification, arrival and handoff controls are retained.
- The downloaded iPhone UI is not rebuilt or submitted by this release. Staff should use the refreshed website for the new planner and selection controls. Do not assume an older packaged app enforces the new waiting-list presentation.

## Verification
- 66 focused transportation checks passed across daily planning, selected-drop-off database fixtures, drivers, child identity, connected controls, custody notifications and background notifications.
- The migration was executed on an isolated PGlite database. Tests include one-day skip, valid-time enforcement, optimistic conflicts, preservation of master/other-day records, access denial, same-timestamp selected completion, untouched unselected children, and all-or-nothing rollback.
- Actual React component workflows with a synthetic API passed school ordering, empty tomorrow, independent today/tomorrow decisions, save/reopen, arrived-only grouping, no preselection, required physical confirmation and sending exactly the checked IDs once.
- TypeScript, changed-file lint, security and app-readiness checks passed. No Safari/device rendering or signed-in production custody write was used in these tests.
- No real child, schedule, attendance, pickup or drop-off records were created or changed by testing. Deployment and migration verification are recorded separately after release.

Production schema applied as migration 20261113175806. Verified that the daily writer remains server-only, the selected-handoff function is SECURITY INVOKER, and anonymous execution is denied. Existing unrelated security-advisor findings were not altered.
