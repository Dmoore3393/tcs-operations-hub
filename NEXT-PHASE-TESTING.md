# TCS Operations Hub — Next Phase Testing

Use this checklist after the fresh Supabase setup is complete and before entering real family or employee information.

## 1. Owner/Admin test

Sign in as the Owner/Admin account.

Confirm the left menu includes:
- Transportation Fees
- Enrollment Pipeline
- Digital Forms
- Compliance Center
- Files
- Employees

On the Dashboard, confirm **Today at TCS** appears beneath the morning command center and only shows items that are relevant for the current day.

## 2. Transportation Fees

Open **Transportation Fees**.

1. Choose the week you want to review.
2. Click **Sync This Week From Routes**.
3. Confirm families scheduled for transportation appear.
4. Confirm the expected charge is calculated from the route records.
5. Confirm siblings attending the same school are grouped into one weekly fee unit.
6. Enter the amount charged and payment status.
7. Confirm mismatches show as **Needs Charge** or **Review** instead of silently appearing complete.

The dashboard should surface transportation billing when a current-week record needs attention.

## 3. Enrollment Pipeline

Open **Enrollment Pipeline**.

Create a test inquiry and move it through several stages. Confirm you can record:
- family/parent contact information
- child name
- location
- requested care
- transportation need
- funding/subsidy notes
- tour date and time
- follow-up date
- assigned staff
- notes

Confirm overdue follow-ups are easy to spot.

## 4. Digital Forms

Open **Digital Forms**.

Create a test form and move it through Draft → Ready to Send → Sent → Signed.

Confirm the page can track signature method, signature date, verifier, due date, and correction status.

**Important:** this version tracks signatures and uploaded signed copies. A true parent-facing e-signature experience should be connected when the future parent portal is built.

## 5. Compliance Center

Open **Compliance Center**.

Confirm it summarizes:
- missing files
- files expiring soon
- overdue items
- forms waiting for signature/correction
- overall file completion

Open an issue from the center and confirm it links to the correct administrative area.

## 6. Location Licensee test

Invite or use a **Location Licensee** test account assigned to only one location.

Confirm the Licensee CAN access for the assigned location:
- Transportation Fees
- Employee/Child Files
- Compliance Center
- Digital Forms
- Enrollment Pipeline
- KidKare
- local Timesheet preparation

Confirm records from other locations are not returned by Supabase.

Confirm the Licensee CANNOT access:
- Team Access
- global Settings/security controls
- location/global administration reserved for Owner/Admin

## 7. Standard Employee test

Invite or use a standard **Employee** account.

Confirm the Employee CANNOT open:
- Transportation Fees
- Files
- Employees
- Compliance Center
- Digital Forms
- Enrollment Pipeline
- KidKare
- Timesheets

If the Employee has the Children permission, confirm the Children page shows care information needed for the shift but does not show the confidential Family Information or Licensing File sections.

## 8. Final security check

In Terminal, from the project folder, run:

```bash
npm run validate
```

The production security check should report 18 location-owned tables and 16 relational client mappings.

Then run:

```bash
npm run build
npm run dev
```

Do not enter real confidential information until Owner/Admin, Licensee, and Employee permission tests all behave correctly.
