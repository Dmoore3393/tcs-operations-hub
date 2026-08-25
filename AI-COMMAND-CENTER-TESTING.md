# TCS AI Command Center — Testing Guide

Use sample information until the Supabase role and location tests are complete.

## 1. Dashboard morning briefing

1. Sign in as Danielle or Jennifer.
2. Enter at least one child schedule and one staff shift for today.
3. Open the Dashboard.
4. Confirm the local briefing immediately summarizes scheduled children, staff, and priorities.
5. Click **Ask TCS AI**.
6. Confirm the live answer only discusses information visible to that login.
7. Remove `OPENAI_API_KEY` temporarily and confirm the safe local summary still works.

## 2. Smart conflict detector

Test each warning separately:

- Schedule a child outside the selected location’s operating hours.
- Schedule a child at a location marked closed.
- Enter fewer staff than the Hub’s current ratio rule requires.
- Exceed the location capacity.
- Schedule one employee at two locations during overlapping times.
- Leave a transportation route without a driver or vehicle.
- Assign more riders than a vehicle’s passenger capacity.

Confirm the alert links open only pages included in the signed-in account’s role and permissions.

## 3. Mobile Quick Actions

1. Open the Hub on a phone or make the browser window narrow.
2. Confirm the bottom action dock appears.
3. Open the center **+** button.
4. Confirm only approved tools appear.
5. Test an Employee with different permissions and verify hidden tools stay hidden.

## 4. TCS AI Director

1. Open **AI Director**.
2. Ask it to summarize today’s urgent issues.
3. Ask it to draft the Friday schedule reminder.
4. Confirm it does not claim to save or change official records.
5. Confirm Opening and Closing Reports are described as internal only.
6. Give an Employee the **TCS AI Assistant** permission and confirm the page appears.
7. Remove that permission and confirm the page and chat endpoint are blocked.

## 5. Printable Studio

Test every printable available to the signed-in role:

- Daily Ratio Plan
- Work Plan
- Weekly Menu
- Transportation Board
- Staff Notice

For each one:

1. Change the location and confirm the colors change.
2. Enter a custom headline and supporting line.
3. Click **New Look** to rotate through four design variations.
4. Save a PNG.
5. Print or save as PDF.
6. Confirm the exported information matches the authorized live records.

## 6. Role checks

- **Owner/Admin:** all locations and all command-center tools.
- **Location Licensee:** assigned location only; no global settings or Team Access.
- **Employee:** assigned locations and only individually approved tools.
- KidKare and Timesheets must remain unavailable to standard Employees.
