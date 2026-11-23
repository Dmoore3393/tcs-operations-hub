# Public App Store submission

Requested by Danielle on November 23, 2026: publish a searchable public App Store app as soon as possible. Keep the existing approved Unlisted app available and preserve all TCS accounts and permissions.

## Public identity

- App name: **The Hub: TCS Childcare**. The initial name “TCS Operations Hub” was unavailable.
- Apple app ID: **6838407438**.
- Bundle ID: **com.thomasonchildcaresolutions.thehub.public**.
- Team: **6Y2923TFK5**.
- SKU: **tcs-hub-public-ios-2026**.
- Planned version/build: **1.0.0 / 2**.
- Distribution: **Public**, discoverable in App Store search; do not request Unlisted distribution for this record.
- Price/initial region: Free / United States.
- Existing Unlisted app: **6817598608**, bundle **com.thomasonchildcaresolutions.thehub**, remains available and supported.

## Build and review preparation

The public app uses the same production Supabase project and authenticated Vercel API. Only the existing URL and publishable key belong in the ignored `.env.native.local`. Server credentials and signing keys are never included in the app or Git.

The native export adapts only the server language-cookie lookup and the two server query-parameter wrappers for packaged execution. Staff authorization and location/parent linkage checks remain in the existing API. The native notification endpoints recognize only the two approved TCS bundle IDs, retaining old-device support and all recipient permission checks.

New App Store record and Push-enabled App ID have been created. Native static export and Capacitor sync passed on Danielle’s MacBook Air. The three iPhone Simulator UI tests passed. The Release archive and App Store Connect upload succeeded on November 23. Apple is processing build 1. Screenshots, privacy metadata and review submission are in progress. Creation of a draft record is **not** an Apple review submission or public release.

## November 23 checkpoint

- Public distribution and United States availability are saved; price schedule is $0.00.
- Business category, subtitle, content rights and 13+ calculated age rating are saved.
- Description, keywords, support URL, public-distribution review notes and automatic release after approval are saved.
- All 16 privacy categories are configured for App Functionality, linked to identity, with no tracking. Privacy publication is awaiting Danielle’s confirmation of Apple’s accuracy/update commitment.
- Build 1 uploaded and processed successfully. Screenshot inspection caught a parent-login phone overflow: the flex row also contained the footer and the grid lacked an explicit single-column constraint. Build 2 puts the form first on phones, constrains grid width and stacks the footer; replacement native checks/upload are in progress.
- The initial cold iPad Simulator run exceeded the 20-second accessibility wait; its retry passed both forms. UI test waits now allow 60 seconds for Simulator startup, and assert that the parent submit button is actually hittable.
- Review credentials must be entered securely into the new app’s Sign-In Information. The existing app’s saved credentials are redacted; do not extract, reset or expose them, and do not substitute a real staff/family account.
- Apple requires a review contact phone number. Danielle has been asked for it. Contact fields remain blank until all required contact details can be saved together.
- Backend support for the public bundle ID is deployed to production in commit 573abcf6da3956e3e3441e0ffcc175d171725ad8 (PR #172), Vercel READY. No account, role, location or family linkage changes were made.

The listing has **not** been submitted for review and is **not** publicly released. Remaining work: replacement build, current iPhone/iPad screenshots, secure review access/contact, privacy publication approval and final submission.
