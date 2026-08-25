# TCS Operations Hub — Fresh Start Setup

Use this guide because the previous Supabase project was deleted. Start with a brand-new Supabase project and this build only.

## Part 1 — Open the project on the Mac

1. Unzip the project.
2. Open the unzipped folder.
3. Right-click an empty area and choose **New Terminal at Folder**.
4. Run:

```bash
npm install
```

Do not run the Hub yet. Complete the secure setup first.

## Part 2 — Create a new Supabase project

1. Sign in to Supabase.
2. Create a new private project named **TCS Operations Hub**.
3. Save the database password in a password manager.
4. Wait for the project to finish creating.
5. Open **SQL Editor**.
6. Open `supabase/setup.sql` from this project folder.
7. Copy the entire SQL file into Supabase and click **Run** once.

This creates the fresh database, locations, user roles, invitations, relational tables, Row Level Security, audit log, and encrypted-document metadata.

## Part 3 — Create Danielle's first Owner account

1. In Supabase, open **Authentication → Users**.
2. Create Danielle's user with her real work email and a temporary secure password.
3. Return to **SQL Editor**.
4. Replace the email below and run it:

```sql
select public.grant_tcs_staff_access(
  'DANIELLES-REAL-EMAIL@example.com',
  'Danielle Moore',
  'Owner / Admin',
  array['All Locations']
);
```

After Danielle signs in, Jennifer, Licensees, Employees, and future Admins are invited by email from **Team Access** inside the Hub.

## Part 4 — Create `.env.local`

In Terminal, run:

```bash
cp .env.local.example .env.local
open -e .env.local
```

Fill in all of these values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
SUPABASE_SECRET_KEY=sb_secret_YOUR_SERVER_ONLY_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
DOCUMENT_ENCRYPTION_KEY=YOUR_BASE64_DOCUMENT_KEY
OPENAI_API_KEY=sk-proj-YOUR_OPENAI_API_KEY
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_TEXT_MODEL=gpt-5.6
```

### Where to find the Supabase values

In Supabase, open the project's **Connect** panel or **Project Settings → API Keys**.

- Copy the Project URL into `NEXT_PUBLIC_SUPABASE_URL`.
- Copy the publishable key into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Copy the server secret key into `SUPABASE_SECRET_KEY`.

Never add `NEXT_PUBLIC_` to the secret key.

### Create the document-encryption key

In Terminal, run:

```bash
openssl rand -base64 32
```

Copy the entire result into `DOCUMENT_ENCRYPTION_KEY`. Save a protected backup. Do not change or lose this key after documents are uploaded.

### Create the OpenAI API key

Create an API key in the OpenAI developer platform and paste it into `OPENAI_API_KEY`.

- Keep it server-only.
- Never prefix it with `NEXT_PUBLIC_`.
- ChatGPT subscriptions and OpenAI API billing are separate.
- The Marketing Studio uses this key to generate flyer artwork and captions.
- TCS AI Director and the Dashboard morning briefing use the same server-only key for live operational assistance.

Save `.env.local`, then close TextEdit.

## Part 5 — Configure local invitation links

In Supabase, open **Authentication → URL Configuration**.

Set the Site URL to:

```text
http://localhost:3000
```

Add this Redirect URL:

```text
http://localhost:3000/accept-invite
```

## Part 6 — Start the Hub

In Terminal, run:

```bash
npm run validate
npm run dev
```

Keep Terminal open and visit:

```text
http://localhost:3000
```

Sign in as Danielle.

## Part 7 — Test the AI Command Center and Marketing Studio

1. Open the Dashboard and confirm the morning operations summary appears.
2. Click **Ask TCS AI** and verify the live briefing works.
3. Open **AI Director** and test one schedule review and one message draft.
4. Open **Printable Studio**, create a Ratio Plan and Staff Notice, and save both as PNG files.
5. Open **Marketing Studio**.
6. Choose a location and ad goal.
7. Enter the exact headline, phone, ages, license number, funding programs, and benefits.
8. Click **Generate 3 Flyers**.
9. Select a design and use **Save Selected PNG**.
10. Test **Regenerate Designs Only** and **Rewrite Caption Only**.

The Marketing AI generates fictional childcare photography and collage art without text. The Hub overlays the exact business wording afterward so phone numbers and required details remain readable. Use `AI-COMMAND-CENTER-TESTING.md` for the full feature and role checklist.

## Part 8 — Invite one test account

Before inviting the full team:

1. Invite Jennifer as **Owner / Admin**.
2. Confirm she can create users and manage settings.
3. Invite one Licensee and confirm they only see their location.
4. Invite one Employee and confirm they only see assigned tools.
5. Confirm Employees cannot see KidKare or Timesheets.

Use sample information during this test.

## Part 9 — Put the Hub online

Deploy to Vercel so staff do not need your Terminal or local computer.

Add all environment variables from `.env.local` to the Vercel project. Change:

```env
NEXT_PUBLIC_SITE_URL=https://YOUR-REAL-VERCEL-ADDRESS
```

Then add this address in Supabase Authentication URL Configuration:

```text
https://YOUR-REAL-VERCEL-ADDRESS/accept-invite
```

Redeploy after changing environment variables.

## Before entering real information

Complete `PRODUCTION-READINESS-CHECKLIST.md`, test each role, and verify the encrypted document vault. Opening and Closing Reports remain internal and must never be shared with families.
