# Apple readiness fixes — updated October 25, 2026

The app remains The Hub by Thomason Childcare Solutions. Existing account deletion,
family demo access, green/gator branding, and earned-only rewards are preserved.

## Phone checks after the web release

1. In a Safari Private tab, open `/privacy`, `/support`, and `/terms`. Each must
   show its full text while signed out. Repeat with JavaScript disabled if needed.
2. Find Privacy, Terms, Support, and Account & Privacy in the login and portal footers.
   Terms are a starter draft with explicit legal-review notes; have TCS counsel review them.
3. Use the existing Apple review staff login, select Division, and open Children,
   Employees, Transportation, Meals, Attendance, Time Clock, and Health & Safety.
   Examples are marked Demo/Synthetic and isolated in the existing review organization.
4. Confirm text uses Geist/sans-serif. Parent Portal prose is 18px; smaller app text
   and all form controls have a 16px floor. Form controls and buttons have a 44px height floor.
5. Tap an email/password field on iPhone; the page should not automatically zoom.
6. Dashboard has one greeting, based on the device's time, updating on foreground/minute changes.
7. Student Store has one search field. Search a product; the visible list must filter.
8. Meals shows either data or a recoverable error. With the connection blocked,
   loading times out after 12 seconds. Restore the connection and choose Try again.
9. Public page titles contain The Hub once. Doodles remain behind welcome text.
10. `/robots.txt` disallows all paths except the four exact public routes.
    `/sitemap.xml` lists only `/`, `/privacy`, `/terms`, and `/support`.

## Demo data

`supabase/app-review-demo-seed.sql` is add-only and repeatable. It verifies the exact
existing synthetic organization and Division IDs before inserting. It contains no
UPDATE, DELETE, TRUNCATE, auth-account creation, or notification send operations.

It inserts six synthetic child records (Avery plus five), six recurring child
schedules, three directory-only
staff profiles without logins, 15 published example staff shifts, one route, one
weekly menu, 15 meal services, 18 completed attendance sessions, 12 synthetic
clock audit events, two messages on the new staff-demo Avery, and two incidents.

The existing parent-demo Avery lives in a different organization. That original
record, family access, and permissions remain unchanged. The new staff-demo Avery
has a `sourceDemoChildId` reference and **no** linked parent access, so the Parent
Portal does not gain a second child. Do not copy household access between these
organizations. No demo invitation or message is sent to an email address.

Database verification under the review user's authenticated role returned six
visible children and zero children from other organizations. Re-running the seed
succeeded without adding duplicates.

## Implementation and checks

Public routes share a server-only route group. Authentication, the location
provider, and the PWA updater are confined to `(portal)`. URL paths did not change.
The API-only `src/proxy.ts` handles the exact packaged-app CORS origin. Its matcher
excludes all public pages and it does not redirect or replace authorization.
Protected API routes retain their existing authorization checks.

The font bug was a circular `--font-sans: var(--font-sans)` definition. It now maps
to the loaded Geist font and an explicit sans-serif fallback stack.

Shared data reads are bounded, abortable, organization-filtered, and request only
needed fields. A read failure prevents autosaving empty initial state. Meals can
retry failed reads and has a rendering error boundary.

Validation: production build, native static screen export, and TypeScript pass;
all 119 automated tests pass (account deletion, sign-out, access checks,
notification state, moderation, staff contact, timesheet workflow/database,
request timeout, native API CORS, family alert permissions, and native trailing-slash
route permissions).
The repository has pre-existing full-lint errors; these are recorded separately
from new-file lint checks rather than represented as a clean lint run.

Public Chromium checks at phone and desktop widths passed with JavaScript both
enabled and disabled. The pages returned 200, showed text, made zero auth calls,
had no page errors or horizontal overflow, and used Geist/sans-serif. Login input
text and height met the 16px/44px minimums. These are browser checks, not Safari or
Xcode Simulator results.

Synthetic-only signed-in browser fixtures passed the mobile dashboard greeting,
single Student Store search, Parent Portal 18px prose, and mocked account deletion
request flow. A desktop Meals query was deliberately stalled: it timed out,
displayed the retry state, recovered after Try again, and did not save an empty
collection. No real account deletion or family alert was triggered. Axe contrast
checks found no color-contrast violations on either login or any public page at
390px and 1440px widths. This does not represent an exhaustive WCAG audit of every
existing app feature.

## iPhone packaging and release status

`native/capacitor` contains the new Xcode project with bundled screens, a native
QR/photo camera, APNs bridge, Face ID/device-passcode session unlock, permission
text, TCS assets, and a privacy manifest. Version 1.0/build 3 and the existing
bundle ID/team are configured. The old native shell remains available.

The owner explicitly authorized publication to the existing public GitHub
repository and deployment to Vercel. Release status is tracked by the branch's
pull request and deployment checks. The synthetic inserts above are the only
database changes applied.

The Mac reconnected. Xcode 27 compiled the app and ran it on the iPhone 18 Pro
Simulator. Both packaged login forms render. Privacy, Terms, and Support passed
signed-out native tests with JavaScript enabled and disabled. A restored scene
startup issue and trailing-slash login/route comparisons were fixed, with route
permission regressions added to CI. Debug-only test sessions use temporary web
storage and cannot expose existing signed-in sessions.

Xcode created version 1.0/build 3 at
`native/capacitor/artifacts/TheHub-1.0-build3-20261025-103001.xcarchive` using the
existing development signing identity. Xcode exported an App Store IPA under
`native/capacitor/artifacts/AppStore-build3/` using the Apple Distribution identity;
its signature verifies and its entitlements use production APNs with debugging
disabled. Apple-side validation and upload are separate steps. Signed-in native
flows and physical-device features remain
unchecked. Apple rejected the supplied account sign-in, so current submission
status and build-number availability could not yet be read. No submission was
cancelled or sent. See
`native/capacitor/README.md` for reproducible build commands and
`docs/IOS-RELEASE-CHECKLIST.md` for every phone check and owner step.
