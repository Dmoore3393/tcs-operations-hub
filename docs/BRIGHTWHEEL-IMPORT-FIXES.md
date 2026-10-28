# Brightwheel import corrections

The owner stopped the first roster import at preview; those children were not saved. This release performs no roster cleanup or real-family edits.

- The active-only filter excludes Inactive, Not enrolled, Withdrawn and Archived. Unknown status values require review.
- Matching uses Brightwheel/student identifiers, then normalized names and birthdays from existing database columns or legacy JSON fields. Conflicting identifiers or multiple definite matches are held.
- A matching name with a missing/different existing birthday needs an explicit compatible existing-profile choice or confirmation that this is a separate child. It is never silently added.
- Repeated children in one CSV, and rows targeting the same existing child, cannot both import. Keep one CSV row and preview again.
- Rows have unique positional keys, so one row's choices cannot replace another row's choices.
- Preview reads only. Commit requires a current preview; changed children or access require a refresh. The server-only database function checks organization/location privileges and the snapshot inside a short transaction. A save/audit failure rolls the entire batch back.
- Existing child UUIDs, legacy IDs, attendance, family access/messages and unrelated record fields are preserved. New imported profiles start with Missing Documents rather than claiming document review is complete. Parent invitations remain off.
- Requests time out with a visible error. If a save response is lost, refresh Preview before retrying so the latest database state is used.

## Phone check

Open Children → Import Brightwheel Roster, choose the CSV and preview. Check the excluded-inactive count, D Street option, and any amber identity-review choices. Confirm counts and location/funding before selecting Import. Preview does not save children. Tests use synthetic records; the owner's actual roster has not been imported.

## Next native package

Build number 5 is prepared in the Xcode project to include the latest screens, communications improvements and import review. The build script derives its archive name from the actual Xcode build setting. Compilation, Simulator/device results and archive/upload status must be recorded separately; changing this setting does not create an archive or replace Apple's prior build.
