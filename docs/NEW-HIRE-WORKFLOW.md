# New-Hire Onboarding

Open Employees → New-Hire Onboarding, or search New-Hire in the phone's Tools menu. The page is /staff-onboarding. TCS branding, current staff roles, Training Center and 30/60/90 Check-Ins are retained.

## Start a hire

An Owner/Admin or Location Licensee can create a record for an assigned active location before a Hub account exists. Enter name, role, start date, supervisor, and optional email. The 22-step checklist covers before start, first day, first week and 30/60/90-day follow-up. Due dates are planning defaults, not legal clearance or a guarantee of eligibility.

Link an approved active Hub account from the selected location now or later. Creating or linking a record does not create an account, send an invitation, change permissions or send any message. Owners continue using Team Access for invitations. An employee sees only a record explicitly linked to their own account.

## Follow up and verify

Every step has a task owner, date, status, completion note, optional proof expiry and separate submission/verification history. Employees can submit their own pending steps; leadership verifies them or records a reason they do not apply. Employees cannot verify or waive their own steps. Verification with expired proof is rejected. Expired proof and overdue steps appear in the summary and attention filter.

The Training Center link opens the existing training assignment/proof tools. Create 30/60/90 reviews uses the existing check-in API and the hire's actual start date and linked staff account; it does not invent a second review process. Opening a new checklist alone does not automatically assign training, award rewards, or create check-ins. Leadership chooses those actions explicitly.

Leaders can edit basic hire details, change location within their access, and optionally reset only pending step dates after a start-date change. Submitted/verified dates are preserved. A linked account must remain assigned to the destination. All record edits use version checks, so a stale save cannot replace another person's update.

Final checklist review requires every item to be verified or explicitly not applicable, with unexpired proof. It records a human review; it does not authorize employment or independent supervision. Later item/detail/link changes clear that review. Archive/restore preserves the record, with uniqueness safeguards against duplicate active emails/accounts.

## Data boundaries

The initially empty staff_onboarding_plans table is organization/location scoped through the authenticated server API; direct public/staff client access is revoked and RLS explicitly denies it. Owners manage their organization; licensees manage assigned locations; employees read/submit only their linked record. No existing staff or family records are modified by installation. The application role has no DELETE or TRUNCATE grant. Audit entries record the verified actor, item statuses, owners/dates and review state in the same transaction. An audit failure rolls back the change.

Keep identity, health and employment documents in restricted employee storage. This checklist tracks completion and follow-up and has no document-upload fields. Users are instructed to keep Social Security numbers, medical details and document images out of notes. Drafts remain in component memory; no HR data is stored in browser-local storage.

## Validation

Synthetic-only helper/API/database checks cover due dates, invalid dates, cross-location/organization query scopes, employee isolation, verifier permissions, account linkage, version conflicts, archive history, default service-role grants, audit rollback and WebViews without crypto.randomUUID. Browser fixtures use the actual page with an isolated in-memory synthetic API: phone creation, employee submission, leadership verification and blocked incomplete review passed, without horizontal page overflow.

## Phone check

1. Refresh the website, sign into Staff Hub and open Tools → New-Hire Onboarding.
2. Leadership chooses New hire; review the generated dates and task owners.
3. Link an approved account when ready. The employee's own view permits submission; leadership verifies completion.
4. Use Training Center and Create 30/60/90 reviews when appropriate. Review the overdue/expired summaries and archive completed records when desired.

The website release does not replace Apple's previously submitted app. Bundled iPhone screens need their own native build and device checks.
