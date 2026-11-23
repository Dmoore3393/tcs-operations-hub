# Public App Store submission — November 23, 2026

Danielle requested a searchable public App Store app as soon as possible. The existing approved Unlisted app stays available. All real accounts, roles, assigned locations and family linkages remain unchanged. No reset emails or real-family notifications were sent.

## Identity and saved distribution

- Name: **The Hub: TCS Childcare** (“TCS Operations Hub” was unavailable).
- Apple app ID: **6838407438**; SKU: **tcs-hub-public-ios-2026**.
- Bundle: **com.thomasonchildcaresolutions.thehub.public**; team: **6Y2923TFK5**.
- Version/build: **1.0.0 / 2**.
- Distribution: **Public**, free, United States. Do not request Unlisted distribution for this record.
- Release: automatic after Apple approval.
- Existing Unlisted app: **6817598608**, bundle **com.thomasonchildcaresolutions.thehub**, remains supported.

## Completed

- Push-enabled explicit App ID registered; new public App Store record created.
- Business category, subtitle, content rights, calculated 13+ age rating, description, keywords, copyright, support URL and public-distribution review notes saved.
- Review contact saved using Danielle’s supplied phone and the existing TCS support email. Keep credentials and private contact details out of Git.
- All 16 source-verified privacy types configured for App Functionality, linked to identity, no advertising tracking. Danielle approved Apple’s accuracy/update statement and the disclosures are **published**, verified in App Store Connect.
- Two current signed-out screenshots each uploaded and accepted in the required iPhone 6.3-inch and iPad 13-inch slots. No real child/family/staff data appears in them.
- Build 2 archived, uploaded, processed and selected on the version draft. Build 1 was detached from the draft after screenshot inspection found phone parent-login overflow. The correction puts the form first on phones, constrains the grid and stacks the legal footer; desktop keeps its two-column layout.
- Native static export adapts only the language-cookie root and two server query wrappers. The same production Supabase project and authenticated API remain in use. Only public client configuration belongs in ignored `.env.native.local`; server/signing secrets are excluded.
- Backend allows exactly the old and public bundle IDs for scoped APNs registration; recipient permissions remain enforced. PR #172 deployed in commit `573abcf6da3956e3e3441e0ffcc175d171725ad8`.
- Phone parent-login correction and build 2 merged/deployed through PR #173, commit `92233775ab13a3ebecd88d110baaf5f3f255069f`, Vercel **READY**.

## Validation

- Production build, TypeScript, security and app readiness checks passed.
- 22 targeted native API, recipient authorization and static-export tests passed.
- Three original iPhone Simulator checks passed: staff/parent forms; public legal pages signed out; public legal pages without content JavaScript.
- Corrected build 2 sign-in checks passed on iPhone Pro Max, required iPhone 6.3-inch and iPad 13-inch Simulators. Parent submit button must be hittable. Cold Simulator accessibility startup waits allow 60 seconds; the first cold iPad run exceeded the original 20-second wait and passed on retry.
- Exported distribution package signature verifies; public bundle, 1.0.0/build 2, production APNs, debugging disabled, no tracking, and 16 manifest data types verified.
- Local exported IPA SHA-256: `7ca83e65fc12145c38533ada4e95fb6683ac34ad990fb6adba4dccb9bca0b869`.
- Signed-in native workflows and physical-device camera/Face ID/APNs were not newly verified. No real notifications were sent for tests.

## Actual remaining blocker

App Store Connect’s Add for Review validation reports **User name — This field is required** and **Password — This field is required**, alongside a generic unexpected-submission-error banner. The new draft’s synthetic reviewer login needs secure entry. Existing review credentials in the approved app are redacted; they were not extracted, reset or changed. Do not substitute a real staff/family account or broaden access. The existing isolated synthetic review organization/family remains in place.

After secure entry, save and retry Add for Review, then complete and verify the final submission. If Apple shows another requirement, resolve that actual requirement. The app currently remains **Prepare for Submission**: it has **not** entered review and is **not** publicly released. Apple approval is still required before public search availability.
