# Consolidated roster contacts

The November 1 Brightwheel report repeats student rows for combinations of parent and emergency contacts. A separate reviewed CSV was prepared outside the repository, keeping one row per exact name and supplied birthday. All child fields were identical within each source group; source-row references and every distinct contact tuple were retained. Missing birthdays remain blank and must be reviewed. No status or subsidy program is inferred from missing data, and no real import was committed.

The importer supports numbered Parent 3–10 contacts and Emergency Contact 2–10 fields in a consolidated file. Parent 1/2 remain the existing editable profile fields; emergency contact 2 uses the existing editor fields. Additional contacts are retained in child JSON and shown on the detail page. Contact import does not create Parent Portal grants. The original report still requires consolidation; automatic merging of repeated CSV rows is not enabled.

Student status is recognized as an enrollment-status header. A stale Active source row does not reactivate an existing Archived/Inactive Hub profile. An unknown last care date is not fabricated; current status and prior-month timesheet eligibility must be reviewed separately. The cleaned copy is explicitly pending status and funding review, not a committed roster.
