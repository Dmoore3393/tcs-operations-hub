# Production Role & Security Testing

Use only non-sensitive sample records until every test below passes on the hosted deployment.

## Owner/Admin test — Danielle and Jennifer

- [ ] Danielle signs in and can view all locations.
- [ ] Danielle can open Team Access, Settings, Locations, Audit Log, KidKare, and Timesheets.
- [ ] Danielle invites Jennifer as Owner/Admin.
- [ ] Jennifer accepts the email invitation and creates her own password.
- [ ] Jennifer has the same company-wide Owner/Admin access, including account roles, location colors/capacities, and security settings.
- [ ] Danielle or Jennifer can pause/reactivate a test account and resend a pending invitation.

## Location Licensee test

- [ ] Invite a test Licensee and assign exactly one location.
- [ ] Confirm the location selector is locked to the assigned location.
- [ ] Confirm Team Access, global Settings, Locations configuration, and Audit Log are unavailable.
- [ ] Confirm another location's children and operational records are unavailable.
- [ ] Confirm the Licensee can use KidKare for the assigned location.
- [ ] Confirm the Licensee can complete only the location-preparation portion of the Timesheet workflow in the interface.

## Employee test

- [ ] Invite a test Employee and assign one or more locations.
- [ ] Select a small permission set.
- [ ] Confirm only the selected operational tools appear.
- [ ] Confirm KidKare and Timesheets never appear and direct URL attempts are denied.
- [ ] Confirm Employee database requests for KidKare and Timesheet rows are rejected by Row Level Security.
- [ ] Add and remove an Employee permission and confirm access updates after refresh/sign-in.

## Relational location separation

- [ ] Create a sample child at Location A and confirm Location B's Licensee cannot see the child.
- [ ] Give one sample child schedule blocks at two locations and confirm each Licensee sees only the correct schedule fragment.
- [ ] Repeat location-separation checks for Daily Care, Meals, Reports, Incidents, KidKare, Timesheets, and Routes.
- [ ] Confirm Owner/Admin accounts retain the company-wide view.

## Audit log

- [ ] Create, edit, and delete a sample record and verify CREATE, UPDATE, and DELETE events.
- [ ] Review a report or incident and verify a REVIEW event.
- [ ] Export a report/document and verify an EXPORT event.
- [ ] Confirm no authenticated user can update or delete audit rows.

## Encrypted documents

- [ ] Upload a non-sensitive test PDF through the document vault.
- [ ] Confirm Supabase Storage contains ciphertext with an `.enc` object name.
- [ ] Download through the Hub and confirm the original file opens.
- [ ] Confirm the download produces an EXPORT audit event.
- [ ] Confirm Licensee access is limited to the assigned location.
- [ ] Confirm standard Employees cannot access the vault.
- [ ] Confirm early deletion and legal-hold deletion are blocked.

## Internal-only records

- [ ] Opening and Closing Reports remain labeled internal only.
- [ ] No parent/family accounts or parent-facing report routes exist.
