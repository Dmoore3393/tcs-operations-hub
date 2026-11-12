# Hub reliability improvements — website release

## Scope
Danielle approved the website review improvements. This release connects independent child/staff location files to Compliance and Inspection Mode; prevents unavailable or empty data from displaying a 100% readiness result; adds explicit unsaved-work protection; unifies mobile/desktop role-filtered navigation; clarifies the file destination; and adds invitation/setup and version/sync status.

## User-facing behavior
- File-checklist completion is calculated per person and site by stable database IDs. Active primary/care memberships with no file show File not started. No all-location enrollment or automatic document completion is inferred. Archived/withdrawn child records remain stored but are not active readiness counts. Staff are assessed only where an explicit staff folder exists.
- Loading, failure and no records are distinct from completion. Missing, unchecked, expired and due-soon are distinct; N/A with a reason is excluded. This score is not licensing certification. Historical audits, emergency records, immunization and signature tools remain linked separately.
- Shared form modals warn on editing/close/cancel/navigation. Reports provide explicit Save draft and leave; location-file editors provide explicit save-and-leave. Failed saves retain entries. No automatic report submission or persistence of sensitive drafts to browser storage. Browser/OS termination and every possible custom navigation path are not claimed covered.
- Both navigation surfaces consume the same 64-tool catalogue after permissions filtering. Existing staff roles and location access remain unchanged.
- File selectors follow a changed global location, show both context labels, and name the save destination. Authorized deep links target the specific location folder.
- Team Access shows setup completion, email-request timestamps and latest-link expiry/revocation. Inbox delivery is honestly untracked. Owners may explicitly create/copy a private 48-hour link for an active, pending, identity-verified account. It does not send email or SMS. Secret is never included in audit metadata; failed activation/audit revokes the undelivered link.
- Version & sync status is available at the staff-page footer. It distinguishes website and native screen releases and shows only observed sync operations in the current tab. It does not claim universal synchronization or a published App Store update.

## Verification
115 focused regression/API/model tests passed, TypeScript passed, security/app-readiness checks passed, and changed/new-source lint had zero errors (four warnings). Twelve actual React/jsdom interaction checks passed with isolated fixture APIs: unsaved note preservation, cancel/discard, failed saves, global/file location alignment, failed/empty compliance, draft-only saving, mobile Families search and version status. The exact committed source was compared against the tested files by Git blob hashes.

No real child/staff record, permission, care schedule, report/custody state, or staff invitation was changed during tests. No actual emails or texts were sent. No schema migration was needed.

## Limits
This is a website release, not a new signed iPhone package. The Apple submission and installed app were not changed. Physical-device and live signed-in upload/save behavior were not exercised. Chromium integration could not complete in the isolated environment; jsdom tests are not visual browser tests. The broader existing lint backlog is not claimed fixed. Personal favorites and automatic crash-recovery drafts are not part of this release.

A temporary branch-only checksum-verified preparation workflow was used to transfer exact reviewed source and rerun checks. It is removed from the final release tree; the ongoing privacy/security workflow retains the regression coverage.
