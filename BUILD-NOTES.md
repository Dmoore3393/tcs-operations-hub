# Build Notes — Relational Production Hardening

## Added

- Separate relational tables for children, child-location memberships, schedules, daily care, menus, meal services, opening/closing reports, handoffs, incidents, KidKare, Timesheets, Timesheet submission routing, and transportation routes
- Required `location_id` on every location-owned operational row
- Derived multi-location child memberships and per-location schedule fragments
- Row Level Security based on active staff-to-location assignments
- Company-wide Owner/Admin access
- Location-limited Licensee access
- Permission-limited Employee access
- KidKare and Timesheets removed from Employee permissions and dashboards
- Immutable create/update/delete audit triggers
- Audited review and export actions
- Owner-only Audit Log page and CSV export
- AES-256-GCM encrypted document upload/download routes
- Private ciphertext-only Supabase Storage bucket
- Retention policies, legal holds, retention eligibility, and protected deletion
- Assigned-location dashboard filtering
- Existing invitation, role assignment, and account acceptance flow retained

## Important

The entire `supabase/setup.sql` file includes both the account/invitation foundation and production-hardening migration. Run that file for a new installation. `supabase/production-hardening.sql` is included separately for an existing TCS email-invitation database.


## Fresh Marketing Rebuild

- Replaced the SVG-only ad template with an OpenAI-powered background generator.
- Generates three different childcare flyer backgrounds per request.
- Adds exact TCS text with three distinct poster layouts after image generation.
- Added regenerate-design-only and rewrite-caption-only actions.
- Added the user-provided flyer as a private in-app style reference.
- Marketing Studio is Owner/Admin-only.
- Added fresh Supabase + OpenAI setup instructions.
## Dashboard Banner Update

- Added the approved split younger-child / school-age AI image as the main dashboard hero banner.
- Added location-colored banner accents and responsive layout behavior.
- Added permission-aware quick actions for Children, Ratios, Opening/Closing Reports, and TCS AI.
- Added time-of-day greeting, current date, active location, and program type inside the banner.


## AI Command Center Upgrade

- Added an AI Morning Command Center to the Dashboard with local and live OpenAI modes.
- Added a smart conflict detector for operating hours, ratios, capacity, overlapping staff assignments, transportation readiness, vehicle capacity, files, and urgent work plans.
- Added a permission-aware mobile Quick Actions dock.
- Rebuilt AI Director around the signed-in user’s authorized operations snapshot.
- Added an Employee permission switch for TCS AI Assistant.
- Added a central Printable Studio with four visual variations and PNG/print export.
- Added printable types for Daily Ratio Plans, Work Plans, Weekly Menus, Staff Notices, and Transportation Boards.
- Added role-aware dashboard cards, tools, alert links, and source-data visibility.

## Version 5.0 — Operations Next Phase

Added:
- Today at TCS role-aware dashboard timeline
- Transportation Fee audit with route-based weekly calculations and same-school sibling grouping
- Enrollment Pipeline / tour follow-up CRM
- Digital Forms signature-status workflow
- Compliance Center for missing, expiring, and signature-needed records
- Dashboard alerts for transportation billing and overdue enrollment follow-ups
- Owner/Admin company-wide access and Location Licensee assigned-location access to the new administrative sections
- Standard Employee blocking for transportation billing, confidential files, compliance, enrollment, and digital forms
- Employee care-only child view that hides family/licensing-file sections
- Four new location-owned Supabase tables with RLS, audit triggers, relational sync, and realtime publication

Validation: TypeScript, ESLint, and the production security verifier pass. The full `next build` cannot complete in this Linux workspace because the internal package mirror does not provide the Next.js Linux SWC binary; run `npm run build` on the target Mac after `npm install`.
