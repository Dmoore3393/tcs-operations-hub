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

This keeps The Hub out of App Store search and charts. Staff receive the direct TCS download link. Downloading the app does not grant access; an active authorized TCS account is still required.

## Provisional bundle ID

com.thomasonchildcaresolutions.thehub

Do not register this with Apple until the TCS Apple Developer account is ready. It can be changed before App Store registration if needed.

## Generate the Xcode project

This native shell uses XcodeGen so the Xcode project does not need to be hand-maintained.

1. Install Xcode on a Mac.
2. Install XcodeGen.
3. From this folder, run: xcodegen generate
4. Open TheHub.xcodeproj.
5. Choose the TCS Apple Developer team under Signing & Capabilities.
6. Register the final bundle ID.
7. Add Push Notifications / APNs capability after the Apple Developer account is connected.
8. Add final App Store icons and screenshots before archive/release.

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
