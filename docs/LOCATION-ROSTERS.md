# Location files and LIC 9040

The Files screen and leadership inspection screen use durable child-location enrollments. One child identity can have concurrent enrollments, independent checklist decisions, uploads, audit findings, and departure dates. Schedule changes and temporary absences never remove these enrollments.

Existing files and encrypted upload bytes are preserved. Backfill creates roster enrollments from active primary locations and explicit care memberships; dates are deliberately left missing for authorized confirmation. Explicit existing location files without current membership are retained as **Review required**. Legacy uploads are linked only by exact child + location + organization; unclear ownership requires intentional review. Earlier file items and audit history remain linked from Files.

Each location starts with unverified facility details. Leadership must verify the licensed facility name and nine-digit license number against its current license, and confirm missing enrollment dates. No license numbers or dates are inferred from memory. Location templates apply to new files; an explicit append action adds requirements to existing files without replacing their prior checklist or reviews.

The official CDSS LIC 9040 (10/05) source is `https://www.cdss.ca.gov/cdssweb/entres/forms/English/LIC9040.pdf`. The original is retained in `public/forms/LIC9040.pdf`; the background removes blank widgets, decrypts the empty-password template and normalizes its rotation without changing the official form artwork. Long entries continue through additional official rows and pages. Facility details repeat on each page. Preview, print, selected checklist exports and encrypted immutable dated PDF snapshots are location-scoped. Three-year retention is a minimum; no automatic deletion is scheduled.

Uploads/copies start Awaiting review. Authorized reviewers record signatures/date/correctness verification or return a specific correction. Copied bytes are newly encrypted for the receiving location, retaining source provenance. Accepted source documents do not complete the receiving file.

Audits create or reopen one finding per file/item and link an explicitly identified existing work task. Halcom resolves the unique active Latrice account; other locations use configured responsibility. Assigned staff can submit notes for review without gaining access to confidential files. Only assigned leadership can verify and close a corrected finding. New in-app contact, correction and expiration notices use persistent event keys to avoid duplicate delivery.

## Release validation

- `node --test scripts/test-location-rosters.mjs scripts/test-location-person-files.mjs scripts/test-location-file-child-links.mjs scripts/test-location-audit-entry.mjs scripts/test-child-edit-preservation.mjs scripts/test-route-access.mjs scripts/test-notification-access.mjs`
- `npx tsc --noEmit`
- `npm run build`
- Synthetic official PDFs rendered and visually inspected for long names, addresses, numbered multiple guardian contacts, date fields and page continuation.
- PGlite integration applies the existing file migration and the additive roster migration under authenticated roles. Covers new incomplete enrollment, reconciliation, independent files, departure, upload and copy review, repeat Halcom findings, staff submission, licensee review, cross-location denial, constrained shared-contact correction, immutable snapshots, and notice deduplication.

Deploy the additive migration before the application. Schedule `select tcs_files_private.scan_file_expirations()` daily using the existing database scheduler; the function is private and inaccessible to application users. Initial incomplete rosters are expected until facility settings and enrollment dates are verified. No production child contact information or real upload bytes are used in the automated tests.
