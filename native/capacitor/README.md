# The Hub — Capacitor iPhone app

This is the new native project. The older `native/ios` shell is retained.
TCS branding, existing email/password login, account deletion, and earned-only
Gator Cash remain in place.

## Architecture

The app bundles a static export of the Next.js **screens**. It calls the existing
Supabase project and the live Vercel `/api/` handlers using the existing bearer
session. The native build excludes API handlers, server secrets, and user data.
Privacy, Terms, and Support are included in the package and render without auth
or JavaScript. Online access is still required for sign-in and current records.

This approach gives the app a packaged interface and native features. It avoids
making every launch depend on downloading the website. Interface changes require
a new iOS build; API/data changes continue through Vercel. Capacitor's remote
`server.url` is deliberately absent. The API proxy allows the exact native
origin `capacitor://localhost`; it does not bypass endpoint authorization.

## Prepare and open on the Mac

Use Node 22 and the current Xcode supported by Capacitor 8. Complete Xcode's
first-run setup and install an iPhone Simulator runtime.

1. Run `npm ci` in the repository root.
2. Put only `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the existing public anon key) in
   root `.env.native.local`. Use the same Hub project as the web app. This file
   is ignored by git. Never put a service-role key or APNs private key there.
3. From `native/capacitor`, run `npm ci`, then `npm run sync`.
4. Open `ios/App/App.xcodeproj`, select the shared **TheHub** scheme, and choose
   an iPhone Simulator. Or run `bash scripts/build-ios.sh simulator`.

`prepare:web` builds in ignored `.native-export-work`, then creates ignored
`www-native`. `sync` copies that export into the Xcode app. Re-run it after web
UI changes. Do not commit generated web bundles or personal signing files.

## Native features

- **Camera:** AVCapture QR scanner and a native still-photo picker. Existing
  attendance/time-clock checks still validate the scanned location and PIN.
  Photo capture fills the existing upload form; the user must still choose to
  upload. Redrawing strips EXIF/location metadata; no photo is saved to Photos.
- **Face ID:** after the first successful email/password login, an existing
  session can be unlocked with Face ID or the iPhone passcode. A cover hides the
  app in the app switcher and locks after 30 seconds in the background. No
  biometric template or password is passed to JavaScript or the server.
- **Notifications:** the user explicitly enables iPhone alerts. Tokens are
  registered for the current authenticated account and removed on normal
  sign-out. Pickups and approved schedule changes target authorized linked
  adults only. Incident alerts require a separate staff action and contain no
  internal incident narrative. Synthetic demo children never send family alerts.
- **Public/account links:** legal links remain available in footers and on the
  native lock cover; Account & Privacy keeps the existing deletion flow.

Native registration is implemented by `TCSDevicePlugin`, registered in
`HubBridgeViewController`. Camera and biometrics use Apple frameworks directly.
No photo-library-wide access, tracking permission, or location permission is added.

The bridge supplies a static-file router for Next's exported nested HTML pages.
Capacitor's default SPA fallback would otherwise serve the staff home page for
direct links to `/privacy`, `/support`, or `/terms`. Unknown paths use the bundled
404 page and paths cannot escape the bundled asset directory.

## Push configuration and permissions

Keep `APPLE_APNS_PRIVATE_KEY` in the **Vercel server environment only**. Configure
the matching `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_BUNDLE_ID`; the existing
defaults remain in the server helper. The distribution provisioning profile must
include Push Notifications for this bundle ID. Debug uses sandbox APNs; Release
uses production APNs. No real push was sent as part of implementation testing.

`Info.plist` includes camera, selected-photo, and Face ID purpose text. iOS uses
the runtime notification authorization dialog; it has no notification usage
description plist key. `TCSNotificationPurpose` documents the app's explanation.

The included `PrivacyInfo.xcprivacy` declares the data handled by the existing
staff/family features, no tracking, and UserDefaults reason CA92.1 for app/session
preferences. Review Xcode's aggregated privacy report and the App Store Connect
privacy answers together before submission.

## Identity, simulator, and archive

The current target is the separate **Public** app, **The Hub: TCS Childcare**,
App Store ID **6838407438**, bundle ID
`com.thomasonchildcaresolutions.thehub.public`, version **1.0.0**, build **2**,
team **6Y2923TFK5**. Keep the approved Unlisted app (6817598608,
`com.thomasonchildcaresolutions.thehub`) available. Both identities use the
same existing accounts and server authorization; APNs registrations retain their
own exact bundle ID.

On November 23, 2026, the latest packaged screens passed the three iPhone
Simulator UI tests. The first public Release archive was uploaded to Apple. Build 2 corrects the parent-login phone layout found during screenshot inspection.
App Store review and release are separate steps: see
`docs/PUBLIC-APP-STORE-SUBMISSION.md` for current status. No real families were
notified during these checks.

After the matching Vercel API release is live and the simulator/device checks
pass, run `bash scripts/build-ios.sh archive`. The script checks native API CORS
before archiving and names the archive using the configured version and build.
It does not upload to Apple. Xcode Organizer can validate and distribute it;
`ExportOptions.plist` exports an App Store Connect package after signing.

The following October 25 details describe the previous Unlisted app only.

**Verified on October 25, 2026:** Xcode 27 compiled and ran the packaged app on
the iPhone 18 Pro Simulator. Both login forms render, and Privacy, Terms, and
Support passed signed-out checks with content JavaScript both enabled and
disabled. The shared scheme includes these isolated `TheHubUITests` checks;
their temporary web storage and test launch paths exist only in Debug builds.

The native entry point preserves the previous app's SwiftUI scene identity so
upgrades construct the Capacitor bridge. Route comparisons normalize trailing
slashes used by exported pages, including login and role restrictions. The
build script supports Xcode's Device Hub as well as older Simulator windows.

Build 3 first uploaded successfully. The final package is build 4, archived at
`artifacts/TheHub-1.0-build4-20261025-112135.xcarchive` and exported to
`artifacts/AppStore-build4/The Hub.ipa` with the existing Apple Distribution
identity. Its signature verifies, production APNs is enabled, and debugging is
disabled. Build 4 adds the three privacy categories already disclosed in App
Store Connect but missing from the manifest; the App Store form also includes
the four additional source-verified categories in the manifest. All sixteen use
App Functionality, identity linkage and no tracking. See
`docs/IOS-PRIVACY-DATA-MAP.md` for the storage evidence and Apple definitions.

The interface is unchanged from the Simulator-tested build 3. Build 4's property
lists, archive, exported signature, entitlements and upload were verified.
Signed-in native flows and physical-device camera/Face ID/APNs checks remain.
The full phone checklist and submission status are in
`docs/IOS-RELEASE-CHECKLIST.md` at the repository root.
