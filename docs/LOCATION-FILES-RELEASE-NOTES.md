# Location-specific child and staff files

Requested by Danielle: leadership must maintain a separate child or staff file at each applicable care location. Do not assume everybody attends or works at every site.

## Behavior
- Files landing page separates location and Child/Staff selection. Creating a file requires an explicit person/site confirmation. No mass seeding, roster changes, schedule changes or care-membership changes.
- Owners/Admins and Licensees only, with organization and location checks in both API and database RLS. Existing leadership roles/assignments remain unchanged.
- A unique person/site folder stores its own checklist, checked/expiration dates, notes, reviewer/date, follow-up and archive flag. N/A requires a reason and is excluded from missing/expiration counts. Template applicability must be confirmed before showing Complete.
- Signed-document uploads use the existing encrypted vault and link to the exact location file. Staff and child uploads are Location Leadership confidential. New linked uploads are held for authorized retention review; a generic upload-date estimate must not silently delete personnel or exit-based records.
- Existing vault and tracking screen retained at /files/legacy. Original /files upload query parameters still open the previous screen. Previous child audits and uploads are not rewritten or marked complete.

## Checklist reconciliation
- Separate in-home and School Age Center child templates remain the shared catalogue for audits and the new location files. Stable document IDs preserve prior audit evidence.
- Keep the existing corrected in-home parent-rights/consumer-awareness forms, conditional LIC9150 and Extended Hours, and N/A behavior rather than reverting to older generated images that mixed center and home forms.
- Add PUB515 to the in-home program checklist, place PUB material with LIC/PUB forms, and place immunization evidence in supporting records. Existing center program-required labels are not newly reclassified.
- In-home personnel packet: 27-item May 27 Employee File Cheat Guide order. Its Employee Rights row used LIC9025, so the new checklist flags that source label for verification rather than presenting it as a confirmed form number.
- Center personnel packet: 30 rows and four sections from the original School Age Center Employee File Checklist image. Original wording such as TB timing is source wording, not an annual expiry algorithm. These are program packet lists, not a fresh legal-compliance certification. Confirm role/site applicability.

## Validation and limits
- TypeScript and changed-source lint passed in the isolated worktree.
- 25 tests passed across location files, existing child audits and KidKare submission regression suites. The new suite executes the migration in PGlite with synthetic role/location records and tests isolation, duplicate rejection, wrong organization/person, denied employee access, N/A and attachment scope.
- Actual React component DOM integration with a synthetic API passed explicit file creation, no file at another location, center staff template selection, separate state and preservation of unsaved notes after a conflict.
- Production migration applied; table RLS and grants verified. No real child/staff folder was created or marked complete, and no actual paperwork was uploaded for testing.
- Security advisors reported no finding on the new table/functions. Existing unrelated advisor findings remain and are not claimed resolved.
- Installed iPhone screens and Apple submission were not changed. This is a website feature; it needs a later packaged native build for the downloaded app.
- Actual signed-in device upload/download and individual location assignments require their own verification; synthetic tests do not establish those outcomes.
