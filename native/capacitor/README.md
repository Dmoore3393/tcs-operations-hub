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

Display name **The Hub**; bundle ID
`com.thomasonchildcaresolutions.thehub`; version **1.0**, build **3**; existing
team **6Y2923TFK5**. The existing approved TCS icon is used, with a green launch
screen. Confirm build 3 is unused in App Store Connect before uploading.

After the matching Vercel API release is live and the simulator/device checks
pass, run `bash scripts/build-ios.sh archive`. The script checks native API CORS
before archiving and creates `artifacts/TheHub-1.0-build3.xcarchive`. It does not
upload to Apple. Xcode Organizer can validate and distribute it; the supplied
`ExportOptions.plist` can export an App Store Connect package after signing.

**Current verification limit:** the connected Mac was offline. The web export,
TypeScript, authorization tests, Xcode project structure, XML, and plists were
checked here. Swift compilation, Simulator execution, physical-device features,
signing, an actual archive, and TestFlight upload remain pending. The full phone
checklist is in `docs/IOS-RELEASE-CHECKLIST.md` at the repository root.
