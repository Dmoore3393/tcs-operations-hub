# TCS Operations Hub — Production Readiness Checklist

Complete this checklist before entering real child, family, medical, employee, Timesheet, or subsidy information.

## Database and secrets

- [ ] Run the complete `supabase/setup.sql` successfully.
- [ ] Confirm all relational tables exist in Supabase Table Editor.
- [ ] Confirm Row Level Security is enabled on every operational table.
- [ ] Add the Supabase URL and publishable key.
- [ ] Add the server-only Supabase secret key.
- [ ] Generate and securely back up the 32-byte document encryption key.
- [ ] Add all environment variables to the hosted deployment and redeploy.

## Accounts and access tests

- [ ] Danielle can view every location, Settings, Team Access, Audit Log, KidKare, and Timesheets.
- [ ] Jennifer can view every location and has the same Owner/Admin controls.
- [ ] A test Licensee is locked to one assigned location.
- [ ] The test Licensee can use KidKare and the location Timesheet workflow but cannot access Team Access, global Settings, Audit Log, or another location.
- [ ] A test Employee sees only assigned locations and selected operational permissions.
- [ ] The test Employee cannot see or open KidKare or Timesheets.
- [ ] Direct URL attempts to unauthorized pages show the access-denied screen.
- [ ] Database requests made by unauthorized roles are rejected by Row Level Security.

## Location-row tests

- [ ] Create a sample child at one location and confirm another Licensee cannot see the child.
- [ ] Give a sample child schedule blocks at two locations and confirm each Licensee sees only the appropriate location schedule fragment.
- [ ] Test location separation for Daily Care, Meals, Reports, Incidents, KidKare, Timesheets, and Routes.
- [ ] Confirm Owner/Admin accounts can see the company-wide view.

## Audit tests

- [ ] Create, edit, and delete a sample operational record and confirm CREATE, UPDATE, and DELETE audit entries.
- [ ] Review a report or incident and confirm a REVIEW audit entry.
- [ ] Export a ratio, report, work plan, Timesheet action, document, or audit CSV and confirm an EXPORT entry.
- [ ] Confirm no account can edit or delete audit entries.

## Encrypted document tests

- [ ] Upload a non-sensitive test PDF through the document vault.
- [ ] Confirm Supabase Storage contains an `.enc` ciphertext object rather than the readable file.
- [ ] Download through the Hub and confirm the original file opens.
- [ ] Confirm the download created an EXPORT audit entry.
- [ ] Confirm a Licensee sees documents only for the assigned location.
- [ ] Confirm a standard Employee cannot access the document vault.
- [ ] Confirm deletion is blocked before the retention date and while legal hold is active.
- [ ] Review and approve the company retention policies before uploading live forms.

## Operational launch

- [ ] Configure custom SMTP and send a test invitation.
- [ ] Enable MFA for Danielle and Jennifer.
- [ ] Configure protected backups and verify restore instructions.
- [ ] Confirm devices use passcodes, automatic locks, and no shared logins.
- [ ] Train Licensees and Employees using sample records first.
- [ ] Enter live information only after all checks pass.


## AI Marketing Studio

- [ ] `OPENAI_API_KEY` is stored only as a server-side secret.
- [ ] The OpenAI API account has billing and image-model access configured.
- [ ] A low-quality test flyer generates successfully before using medium/high quality.
- [ ] Phone, license, ages, funding programs, and location details are reviewed before posting.
- [ ] Generated images contain fictional children and are not presented as photos of enrolled children.
- [ ] Marketing access is limited to Owner/Admin accounts.
