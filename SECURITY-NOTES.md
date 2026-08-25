# TCS Operations Hub — Production Security Notes

## Account roles

- **Owner/Admin:** Danielle and Jennifer. Company-wide access, Team Access, security, settings, all locations, KidKare, and the complete Timesheet workflow.
- **Location Licensee:** one assigned location. Location operations plus KidKare and the Licensee portion of Timesheets. No Team Access, global security, or other-location records.
- **Employee:** one or more assigned work locations plus individually selected classroom/operations permissions.
- **Parent/family accounts:** disabled.

KidKare and Timesheets are administrative-role tools. They are never available as Employee permission switches, do not appear on an Employee dashboard, and are denied to Employee accounts by database Row Level Security even if an old profile still contains a legacy permission value.

## Relational location separation

The following operational collections are stored in separate relational tables rather than organization-wide JSON documents:

- Children and child-to-location memberships
- Child schedules
- Daily-care entries
- Weekly menus and meal-service records
- Opening/closing reports and handoff items
- Incidents and health/safety records
- KidKare enrollment records
- Timesheets and Timesheet submission routing
- Transportation routes

Every location-owned row has a required `location_id`. Row Level Security checks the signed-in user's active location assignments for every row. A child who attends more than one location receives derived child-location memberships, and each location sees only the schedule fragments and operational records tied to that location.

Owner/Admin accounts retain company-wide access. Location Licensees are restricted to their assigned site. Employee access requires both a location assignment and the specific operational permission.

## Immutable audit log

Database triggers automatically create audit entries for `CREATE`, `UPDATE`, and `DELETE` operations on relational operational records and protected configuration records. Review and export actions are recorded through the audited server/database function.

Audit entries include the organization, location when applicable, acting user, table, row, timestamp, and before/after metadata. Authenticated users cannot insert directly into, update, or delete the audit log. Only Owner/Admin accounts can view it.

## Encrypted document vault

Forms and medical cards must be uploaded only through the encrypted document vault.

- Files are encrypted server-side with **AES-256-GCM** before storage.
- The private Supabase bucket contains ciphertext only.
- Direct browser reads/writes to the bucket are denied.
- Authorized downloads pass through a protected server route, are decrypted in memory, and create an `EXPORT` audit event.
- Each file has a SHA-256 checksum, retention policy, retention date, legal-hold flag, status, uploader, location, and optional child link.
- Deletion is blocked before the retention date and while legal hold is active.

The `DOCUMENT_ENCRYPTION_KEY` must be a protected base64-encoded 32-byte server secret. Keep a secure offline backup. Losing it makes encrypted documents unreadable.

## Retention controls

The setup includes editable company baselines for child files, medical documents, incidents, Timesheet/subsidy records, CACFP records, and other child forms. The default is at least three years from the applicable anchor event, with longer retention when an audit, investigation, appeal, claim, contract requirement, or legal hold remains open.

Danielle or Jennifer should review retention settings with the applicable licensing, food-program, subsidy, insurance, and legal requirements before authorizing destruction. The Hub never automatically destroys a file merely because its date has arrived; it identifies records eligible for an Owner/Admin-controlled purge workflow.

## Server-only secrets

Store these only in protected server environment variables:

```env
SUPABASE_SECRET_KEY=...
DOCUMENT_ENCRYPTION_KEY=...
```

Never use a `NEXT_PUBLIC_` prefix for either value. The browser receives only the Supabase URL and publishable key.

## Required operating controls

- Custom SMTP for reliable invitations
- Multi-factor authentication for Danielle and Jennifer
- No shared accounts
- Device passcodes, automatic screen locks, and short inactivity timeouts
- Immediate account suspension when employment or assignments end
- Routine role/location review by Danielle or Jennifer
- Protected hosting project and environment variables
- Tested database backups and encryption-key backup
- Test each role with non-sensitive data before entering live records
