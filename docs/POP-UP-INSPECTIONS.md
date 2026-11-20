# Private pop-up inspections

Route: /pop-up-inspections. Pilot access is restricted to the active, verified staff IDs for Danielle Moore, Heather Graham and Jennifer Thomason. Other owners do not inherit access. The menu, route and API enforce this restriction; the two dedicated database tables have RLS enabled and no anon/authenticated grants. Records are not stored in broadly shared hub state, tasks or notifications.

Each visit has its own location, date, inspector names, checklist snapshot, item notes, urgent flags, overall notes and private follow-up plan. Drafts can be saved without completing notes. Every item must be reviewed or marked N/A before finalization. Completed records cannot be overwritten. Version checks prevent simultaneous reviewers from silently overwriting one another; every save records actor, timestamp and before/after snapshots.

## California checklist basis

Source review: November 18, 2026. This is a summarized internal readiness checklist, not a reproduction of every regulatory provision or a CDSS-issued inspection / grade.

CDSS CARE Tools index:
https://cdss.ca.gov/inforesources/cdss-programs/community-care-licensing/inspection-process-project/care-tools

The actual Family Child Care Homes Standard Tool and School-Age Standard Tool spreadsheets were downloaded and reviewed alongside LIC 126 / LIC 125 entrance checklists and LIC 311D / LIC 311A records lists. Each generated item stores its reference and source URL in the visit snapshot. A separate template applies to family child care homes and school-age centers; the location’s configured program suggests the starting template. Reviewers can change templates before finalization, with an explicit warning that item answers are replaced. Infant checks appear only in the home template and may be marked N/A. Elementary-school exceptions in child health / immunization records are called out.

As of November 19, new checklists focus on observations during the visit. Detailed child/employee file reviews (contacts, signed receipts, health records, training documentation and enrollment roster reconciliation) remain in the separate Files audits. Operational attendance, supervision, visible postings, emergency readiness and infant sleep observations remain in the visit checklist. Existing saved inspection snapshots are unchanged.

Checklist links live in src/lib/pop-up-inspections.ts. Future revisions affect new visits only. Additional local items may be added to a visit and are identified as Additional checks.

## Internal grade

Meets = 1, Needs improvement = 0.5, Needs correction = 0. N/A and unreviewed are excluded from the provisional percentage. All items must be reviewed for completion. All-N/A visits have no numeric score. 90–100% Strong, 75–89% Follow-up needed, below 75% Needs attention. Urgent concerns remain visible regardless of percentage. These are internal thresholds, not licensing citation classifications.

No staff notifications or public task creation is performed, preserving unannounced visit confidentiality. The private follow-up plan can record responsible people and target dates.

## Validation

scripts/test-popup-inspections.mjs exercises exact-identity permissions, scoring, template scope, URL validation, database version conflicts, save history, immutable completion and direct-client denials.
scripts/test-route-access.mjs includes other-owner denial, nested path enforcement and Heather’s access independent of broad role permissions.

## Released results and correction tasks (November 19)
Completed private visits now offer Release results & assign corrections. Leadership selects an active licensee assigned to that location and a due date. Release is atomic and idempotent: it saves one immutable checklist snapshot and one task per correction / urgent item. The original score is never rewritten. Overall visit notes and private follow-up are excluded; item observations are shared deliberately at release.

Licensees use Inspection Results & Corrections under Staff & planning. Results use saved location assignments, not temporary backup access to all sites. The server enforces location scope for reading, downloads and task submissions. Other staff and other owners cannot access these reports. Tasks also appear through Work Plans. Licensees submit correction notes; Danielle, Heather or Jen verify and close, or return with an explanation. Version checks prevent stale updates. Release, submissions and reviews have append-only history. Releasing does not email or message anyone externally.

Download PDF / Print report produces a multipage PDF with facility/date, internal final grade, full checklist results, correction checkboxes, responsible person, deadline and current verification progress. The PDF uses an embedded Unicode font, wraps long entries, and repeats facility/date and page numbers. Private draft/history APIs remain restricted to the original three reviewers.

Migration: 20261119190000_inspection_results.sql. The three release/correction/history tables have no anon/authenticated grants; service-only APIs enforce the account and location boundary.

November 20: released inspection results create one deduplicated recipient inbox alert, now connected to the shared durable phone-push queue. Private notes are never included in the alert. The queue covers newly saved inbox notifications and Work Plan assignments as well as existing push-enabled flows. Existing direct delivery and queued retries claim the same recipient/event lease to avoid double sends. Provider acceptance is recorded separately from device registration, permission, read state and actual user receipt. A protected worker is invoked by Supabase cron every minute, including while the app is closed. Device permission, user opt-out and quiet hours remain respected; no-device and provider failures stay visible for retry rather than being counted as delivery.
