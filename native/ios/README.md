# The Hub — Native iOS Shell

This folder is the App Store-ready native shell for **The Hub**.

## Why this exists

The installed web app remains useful, but the App Store version gives TCS a true iOS app container with:

- native full-screen presentation
- Face ID / Touch ID / device-passcode app lock
- native network/offline awareness
- native camera/file permission descriptions
- native status/safe-area behavior
- a controlled container around the same secured production Hub
- the ability to add APNs push notifications and other native capabilities without rebuilding the web product

The native app intentionally loads the same production Hub at:

https://tcs-operations-hub.vercel.app

That keeps the website and app on one operational system. Most Hub feature/content changes deploy once to the website and appear in the native app automatically. Changes to the native shell itself—Face ID behavior, APNs configuration, native permissions, icons, splash screen, or other native code—require a new App Store build.

## Distribution direction

Planned Apple distribution: **Unlisted App**.

The Apple Developer membership may remain under Danielle's individual developer account. The app itself remains branded as **The Hub — TCS Operations** and downloading it never grants access; an active authorized TCS staff or family account is still required.

## Bundle ID direction

com.thomasonchildcaresolutions.thehub

Register this identifier once the Apple Developer membership is active and signing can be completed. The repo now uses this same identifier for native push registration and App Store packaging.

## Generate the Xcode project

This native shell uses XcodeGen so the Xcode project does not need to be hand-maintained.

1. Install Xcode on a Mac.
2. Install XcodeGen.
3. From this folder, run: xcodegen generate
4. Open TheHub.xcodeproj.
5. Choose the TCS Apple Developer team under Signing & Capabilities.
6. Register the final bundle ID.
7. The project already contains the Push Notifications entitlement and APNs bridge. Connect the Apple signing team and APNs key in the release environment.
8. The official green/yellow Hub icon is converted to the required 1024×1024 App Store icon by the native pre-build step.
9. The official Hub launch artwork is bundled as the native opening screen artwork.
10. Capture final App Store screenshots after TestFlight smoke testing.

## Before App Store submission

Still required from the TCS Apple Developer account:

- Apple Developer Program enrollment
- final bundle identifier
- signing team/certificates
- APNs key for native push
- App Store Connect app record
- privacy labels
- support/contact URL
- app screenshots
- age rating
- unlisted-app distribution request/approval

No child, family, employee, medical, or transportation records belong in this native project or in App Store metadata.
