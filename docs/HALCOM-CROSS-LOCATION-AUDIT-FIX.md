# Halcom cross-location child audit fix

Request: Danielle cannot complete a Halcom file audit for a child whose main enrollment is at another location.

## Root cause
The Child File Audits route still loaded and saved global child-level audits and filtered children by their primary location. The newer Files route used independent location_person_files records, so the original audit entry point had not been connected to that workflow.

## Change
- Child File Audits now opens the same location-file editor as Files, in child-audit mode.
- Staff select the audit location, then any child visible under existing role/organization/location authorization. The picker does not filter by the target site's primary roster.
- With All Locations selected, an explicit target is required instead of silently choosing the first location or the child's main site.
- Start/open reuses an existing person/site file and does not duplicate it. Deep links retain child identity and explicit file location.
- Modal title, confirmation and save button name the target site. A successful save confirms that site.
- Existing older audits remain in a separate read-only history page, with their original recorded checklist rows, dates, notes and reviewer. No historic evidence is silently copied to another location.
- The file editor warns before discarding unsaved changes. Browser unload protection is best-effort and is not claimed to work for every mobile app-close scenario.
- Returned data is scoped to the signed-in account and stale loads are ignored. Permission policies and database schema are not changed.

## Validation
In an isolated React DOM integration using the actual route, panel, form controls and modal, with synthetic API responses only:
1. A synthetic child whose primary enrollment is 33rd appears in the Halcom audit picker.
2. Creating, saving and reopening a Halcom audit preserves the other-site file byte-for-byte and leaves the child's primary enrollment unchanged.
3. Selecting 33rd opens that existing file, not the Halcom file.
4. Repeated start/open does not create duplicate site files.
5. Child deep links require/retain an explicit target from All Locations and honor explicit fileLocation.
6. Declining discard keeps an unsaved draft open.
7. A simulated save conflict preserves entered notes.
8. The standard Files screen still opens the 30-row center staff template; older history remains read-only.
9. An employee view does not fetch the confidential file data.

TypeScript, changed-file lint, existing location-file/child-audit/route-access regression tests and separate security/app-readiness checks were run. Existing full-repository lint issues are not represented as resolved. The source-entry guard tests are in scripts/test-location-audit-entry.mjs and supplement—not replace—the rendered tests and the PGlite location-isolation suite.

No real child audit, enrollment, care assignment, uploaded document or parent permission was changed for testing. No production database migration is included. The installed iPhone package and the existing Apple submission are unchanged; this fixes the website entry point.

The broader improvement batch discussed earlier is not included in this targeted fix.
