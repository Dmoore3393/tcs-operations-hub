# TCS Operations Hub — AI Command Center Build

This build is the shared employee and licensee operations system for Thomason Childcare Solutions.

## Account roles

- **Owner/Admin:** Danielle, Jennifer, and any future full administrator invited by them
- **Location Licensee:** one assigned location with operational administrative access
- **Employee:** assigned locations plus individually selected classroom/operations permissions

All users except the first Owner are invited by email from **Team Access** and create their own passwords.

KidKare and Timesheets are limited to Owner/Admin and Location Licensee accounts. Standard Employee accounts cannot be granted access.


## AI command center

- Dashboard morning briefing with a safe local fallback and optional live OpenAI response
- Smart schedule, operating-hours, ratio, capacity, staffing, route, vehicle, file, and work-plan alerts
- Phone-friendly Quick Actions that follow each employee’s permissions
- TCS AI Director for summaries, drafts, checklists, and next-step planning
- Printable Studio for ratio plans, work plans, weekly menus, staff notices, and transportation boards
- Role- and location-aware data access throughout the new tools

Use `AI-COMMAND-CENTER-TESTING.md` after setup.

## Production security included

- Relational, location-owned operational tables
- `location_id` on every location-owned row
- Row Level Security using assigned locations and role/permission checks
- Company-wide Owner/Admin access
- Immutable audit log for create, update, review, export, and deletion actions
- AES-256-GCM encrypted private document storage
- Retention dates, legal holds, and controlled deletion
- Email invitations for Owner/Admin, Licensee, and Employee accounts

Start with `FINAL-SETUP-GUIDE.md` and then use `PRODUCTION-READINESS-CHECKLIST.md` before entering real information.

## Local commands

```bash
npm install
npm run dev
```

Validation:

```bash
npm run validate
```

## Critical secret rule

Do not commit `.env.local`. Never expose `SUPABASE_SECRET_KEY` or `DOCUMENT_ENCRYPTION_KEY` in browser code or with a `NEXT_PUBLIC_` prefix.


## AI Marketing Studio

The Marketing Studio now generates three bold flyer variations at a time. OpenAI creates text-free fictional childcare photography and collage backgrounds; the Hub overlays exact TCS headlines, phone numbers, age ranges, license information, funding programs, benefits, and calls to action. This avoids the common misspelled-text problem in fully generated image posters.

Set `OPENAI_API_KEY` in `.env.local` and the hosted environment. Start with `START-HERE-FRESH-SETUP.md`.

## Next Phase (v5)

This build adds Today at TCS, transportation-fee auditing, Enrollment Pipeline, Digital Forms tracking, and a Compliance Center. Administrative data is protected by role and location: Owner/Admin has company-wide access, Location Licensees are restricted to assigned locations, and standard Employees do not receive the new confidential admin sections.
