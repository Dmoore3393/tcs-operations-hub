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

## Submission completed — November 23, 2026

**The public app is submitted to Apple and Waiting for Review.** App Store Connect confirms “Your submission has been submitted to App Review,” with iOS 1.0.0/build 2 and zero draft submissions. Submission time shown by Apple: November 23, 2026 at 4:14 PM Pacific.

- Submission ID: `f7ebd3ce-f12c-4a07-9b55-afe242bd8961`.
- Review page: https://appstoreconnect.apple.com/apps/6838407438/distribution/reviewsubmissions/details/f7ebd3ce-f12c-4a07-9b55-afe242bd8961
- Public/free/United States distribution and automatic release after approval remain configured. It is not yet approved or publicly available.
- Existing approved Unlisted app remains available. No real staff/family account, role, location or family linkage was changed.

## Secure API continuation completed

Danielle explicitly approved App Store Connect API access, a temporary App Manager key, and Apple’s separate internal-team-use agreement. Apple approved API access. A temporary app-management key was generated and used only for this release operation.

`scripts/copy-apple-review-access.mjs` reused the reviewer details already held by Apple without displaying or saving the password. Before updating the new listing, it successfully authenticated and verified the exact designated synthetic reviewer (`f38bea87-fffb-4c92-b226-ed819fe4e6a9`) and isolated synthetic organization (`7024880e-865a-4148-ad75-723099f83ff0`). It changed no passwords and logged out its own verification session. The original app’s review details were not modified.

The temporary key was **revoked after use**, verified in App Store Connect as **Active (0)** and **Revoked (1)**. API access remains enabled as authorized, but no active team key remains. The downloaded private key was never printed, committed or included in the app. No reset email, real-family alert or third-party message was sent.

The helper was syntax checked and successfully exercised against the actual Apple read/update endpoints and Hub demo authorization. It issues two-minute tokens, with exact request scopes for GET requests; Apple’s documented scopes support GET, while the single authorized PATCH relies on the temporary App Manager role. The initial read scope omitted the query filter and Apple rejected it; including the full query fixed that request without altering key permissions.

Apple review/approval is the remaining external stage. Do not describe Waiting for Review as approval or public availability.
