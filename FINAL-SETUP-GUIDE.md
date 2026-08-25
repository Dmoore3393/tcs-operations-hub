# TCS Operations Hub — Email Invitation Setup

This build lets Danielle and Jennifer invite **Owner/Admin**, **Location Licensee**, and **Employee** accounts from **Team Access**. Invited users receive an email, create their own password, and activate their own account.

Only the very first Owner account requires one-time setup in Supabase.

## 1. Create or open the Supabase project

Use one private Supabase project for the TCS Operations Hub.

Keep public sign-up disabled. Accounts should be created only through the Hub's invitation flow.

## 2. Run the database setup

In Supabase:

1. Open **SQL Editor**.
2. Open `supabase/setup.sql` from this project.
3. Copy the entire file into the SQL Editor.
4. Run it once.

The script works on a brand-new Supabase project. It adds:

- Owner/Admin, Licensee, and Employee roles
- Individual Employee permission lists
- Invitation tracking and invite acceptance status
- Separate relational tables for all sensitive operational collections
- Required `location_id` ownership and staff-to-location assignments
- Row Level Security on every location-owned row
- Immutable auditing for create, update, review, export, and deletion
- Encrypted private document metadata, retention policies, and legal holds
- Live syncing for relational operational records

## 3. Create Danielle's first Owner account once

This is the only staff account that must be created directly in Supabase.

1. Open **Authentication → Users**.
2. Create Danielle's user with her real work email and a temporary secure password.
3. Return to **SQL Editor** and run the following after replacing the email:

```sql
select public.grant_tcs_staff_access(
  'DANIELLES-REAL-EMAIL@example.com',
  'Danielle Moore',
  'Owner / Admin',
  array['All Locations']
);
```

After Danielle signs in, Jennifer and every future user are invited from **Team Access** inside the Hub.

## 4. Add the environment variables

Copy `.env.local.example` and rename the copy `.env.local`.

Fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
SUPABASE_SECRET_KEY=sb_secret_YOUR_SERVER_ONLY_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
DOCUMENT_ENCRYPTION_KEY=PASTE_BASE64_32_BYTE_KEY_HERE
OPENAI_API_KEY=sk-proj-YOUR_OPENAI_API_KEY
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_TEXT_MODEL=gpt-5.6
```

For an older Supabase project, the legacy public anon key and service-role key variable names are also supported.

### Critical security rule

`SUPABASE_SECRET_KEY`, `DOCUMENT_ENCRYPTION_KEY`, and `OPENAI_API_KEY` are server-only.

Generate the document key once with `openssl rand -base64 32`, save a protected backup, and use the same key on every deployment.

- Never rename any server secret with `NEXT_PUBLIC_`.
- Never paste a server secret into browser code.
- Never email or text a server secret to employees.
- Add them only to `.env.local` on Danielle's development computer and to the hosting provider's protected environment-variable settings. The OpenAI key powers the Marketing Studio's AI flyer artwork and caption generation.

## 5. Configure invitation redirects

In Supabase, open **Authentication → URL Configuration**.

During local testing, allow:

```text
http://localhost:3000/accept-invite
```

After deployment, also allow the real hosted address, for example:

```text
https://YOUR-HUB-DOMAIN/accept-invite
```

Set `NEXT_PUBLIC_SITE_URL` to the same deployed Hub address and redeploy after changing it.

## 6. Configure staff invitation email delivery

Supabase can send initial test emails, but configure a custom SMTP provider before inviting the full team. This improves delivery, sender branding, and email limits.

In **Authentication → Email Templates**, customize the **Invite user** email with TCS wording. Keep the confirmation link variable provided by Supabase in the template.

Suggested subject:

```text
You’re invited to the TCS Operations Hub
```

## 7. Start the Hub locally

From Terminal inside the project folder:

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Sign in as Danielle.

## 8. Invite Jennifer

Open **Team Access** and enter:

- Jennifer's full name
- Jennifer's email
- Role: **Owner / Admin**

Owner/Admin accounts automatically receive all locations and full administrative access.

Click **Send Invitation**. Jennifer receives the email, opens the link, creates her own password, and enters the Hub.

## 9. Invite Licensees

For each Licensee:

1. Enter the name and email.
2. Select **Location Licensee**.
3. Choose exactly one assigned location.
4. Send the invitation.

Licensees cannot open Team Access, global Settings, location configuration, or another location from the selector.

## 10. Invite Employees

For each Employee:

1. Enter the name and email.
2. Select **Employee**.
3. Choose one or more assigned work locations.
4. Turn on only the operational permissions needed for that job.
5. Send the invitation.

Available Employee permissions include Daily Care, Meals, Opening/Closing Reports, Work Plans, Schedules, Ratios, Transportation, Health & Safety, and limited child-care information. **KidKare and Timesheets are not Employee permissions.** They are available only to Owner/Admin and Location Licensee accounts.

## 11. Account management inside the Hub

Danielle and Jennifer can:

- Invite any role by email
- Create additional Owner/Admin accounts
- Change roles
- Change assigned locations
- Change Employee permissions
- Pause or reactivate an account
- See invitation, acceptance, and last-sign-in status
- Send a new setup link to a pending user

No staff password is displayed or stored in Team Access.

## 12. Deploy for remote testing

`localhost` is available only on the computer running the app. To let Jennifer and the Licensees test from their own devices, deploy the project to a private hosting account such as Vercel.

Add every environment variable to the hosted project, including the server-only Supabase secret, document-encryption key, and OpenAI API key. Keep the secret key in the hosting provider's protected server-side environment settings.

After deployment:

1. Update `NEXT_PUBLIC_SITE_URL` to the hosted address.
2. Add the hosted `/accept-invite` address to Supabase's allowed redirects.
3. Redeploy.
4. Send one invitation to a test email before inviting the full team.

## Before entering real information

Opening and Closing Reports remain internal and never family-facing. Parent accounts remain disabled.

The requested relational separation, location Row Level Security, immutable audit logging, encrypted document vault, and retention controls are included in this build. Before entering live information, complete every item in `PRODUCTION-READINESS-CHECKLIST.md`, test Danielle, Jennifer, one Licensee, and one Employee account with non-sensitive records, and confirm that each role sees only the intended locations and tools.
