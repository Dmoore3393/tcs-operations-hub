# The Hub — App Store v1 Submission Package

Prepared for the first iOS/iPadOS App Store submission.

## App identity

- **App Store name:** The Hub — TCS Operations
- **Platform:** iOS / iPadOS
- **Primary language:** English (U.S.)
- **Bundle ID:** `com.thomasonchildcaresolutions.thehub`
- **Version:** 1.0.0
- **Build:** 1
- **Category:** Business
- **Price:** Free
- **Distribution goal:** Unlisted App
- **SKU suggestion:** `TCS-THEHUB-IOS-001`

## Public URLs

- **Marketing URL:** https://tcs-operations-hub.vercel.app
- **Privacy Policy URL:** https://tcs-operations-hub.vercel.app/privacy
- **Support URL:** https://tcs-operations-hub.vercel.app/support

## App Store subtitle

**Childcare Operations & Family Hub**

## Promotional text

A secure TCS workspace that keeps childcare operations, staff workflows, and invited families connected in one place.

## Description

**The Hub — TCS Operations** is the secure childcare operations and family-connection app for Thomason Childcare Solutions.

Authorized TCS staff can use The Hub to manage day-to-day childcare workflows including schedules, attendance, daily care, meals and menus, transportation, staffing, training, forms, operational checklists, and location-based responsibilities.

Invited parents and guardians can use the Parent Portal to stay connected to their child’s care through authorized features such as weekly schedules, child profile information, daily-care updates, meal and intake details, weekly menus, photos, weekly check-ins, Family Matters updates, newsletters, and Gator Cash activity.

Access is private. Downloading The Hub does not grant access to TCS records. Users must sign in with an account authorized by Thomason Childcare Solutions, and information is limited by the user’s role, assigned location, or linked child permissions.

Highlights include:

- Secure staff and family sign-in
- Parent Portal with child-specific access
- Weekly childcare schedule tools
- Daily-care and meal updates
- Planned weekly menu images and actual meal intake details
- Child photos and profile photos
- Family Matters announcements and monthly newsletters
- Gator Cash child rewards
- Transportation and childcare operations tools
- Staff training and 30/60/90 check-ins
- Face ID / Touch ID / device-passcode app protection
- Native notification support
- Role- and location-based access controls

The Hub is intended for authorized Thomason Childcare Solutions staff and invited TCS families.

## Keywords

childcare,daycare,parent portal,family,staff,schedule,meals,transportation,training,TCS

## Copyright

© 2026 Thomason Childcare Solutions. All rights reserved.

## App Review notes

The Hub is a private childcare operations and family-connection application for Thomason Childcare Solutions. It is intended for **Unlisted App distribution** because access is limited to authorized TCS staff and invited families.

Downloading the app does not provide access to childcare records. Authentication and server-side authorization are required. Staff accounts are restricted by role, assigned location, and permissions. Family accounts are restricted to specifically linked children and enabled Parent Portal permissions.

The app loads the secured production Hub inside a native iOS container and also provides native functionality including device authentication/app lock, notification registration, network-state handling, native safe-area behavior, and camera/photo/file integration for approved workflows.

### App Review test account

Create a dedicated review account containing **synthetic demo data only** before submission. Do not give App Review an Owner/Admin account that exposes real TCS child, family, employee, medical, transportation, or subsidy information.

Fill these in immediately before submission:

- Review account email: `[CREATE REVIEW ACCOUNT]`
- Review account password: `[CREATE REVIEW PASSWORD]`
- Test role/portal: `[FAMILY DEMO OR LIMITED STAFF DEMO]`
- Demo child/location: `[SYNTHETIC DATA ONLY]`

Suggested reviewer path after sign-in:

1. Open the dashboard / Parent Portal.
2. View a weekly menu.
3. Open a daily-care meal entry to see planned, served, eaten, and substituted food.
4. View an approved child photo/profile image.
5. View a Family Matters post or newsletter.
6. View Gator Cash activity if present.
7. Open App Setup / notification controls.
8. Background and reopen the app to verify the native app lock.

## App Privacy preparation

The App Store privacy answers must describe the app’s actual production behavior, including applicable data processed by the Hub and its service providers. Review the final Xcode privacy report and production integrations before publishing the answers.

Likely categories that require review include:

- Contact information / account identifiers
- User content and uploaded photos/files
- Child/family operational information entered by authorized users
- Health-related childcare information when used in authorized child records
- Usage or diagnostics data only if actually collected by the production services
- Location only if an enabled feature actually collects precise or coarse device location

**Tracking:** The Hub is not intended to use data for cross-app advertising tracking. Verify all production third-party services before answering App Store Connect.

Do not mark a data type as collected unless the final production app or an integrated service actually collects it under Apple’s definitions.

## Screenshot plan

Capture screenshots only with synthetic demo data. Never use real enrolled children, real family names, medical information, employee records, phone numbers, addresses, transportation details, or subsidy records in App Store screenshots.

Recommended screenshot story:

1. **Welcome to The Hub** — polished sign-in screen.
2. **Family Connection** — Parent Portal overview with synthetic child profile.
3. **Your Week at TCS** — weekly menu / family schedule.
4. **Daily Care Updates** — synthetic meal entry showing served food and intake.
5. **Moments That Matter** — synthetic child photo / weekly check-in.
6. **Staff Operations** — staff dashboard with synthetic operational data.
7. **Training & Growth** — Training Center or 30/60/90 check-ins.

Use the highest-resolution supported iPhone screenshot set in App Store Connect. Because the app supports iPad, capture the required iPad screenshots as well if App Store Connect does not provide an accepted scaling path for the submitted build.

## Unlisted App submission sequence

1. Create the app record in App Store Connect with the exact bundle ID.
2. Upload the Release archive from Xcode.
3. Complete app information, privacy answers, age rating, screenshots, support URL, privacy-policy URL, and review notes.
4. Select public App Store distribution for the initial submission path required by Apple’s unlisted-app process.
5. Submit the build to App Review and note that the app is intended for unlisted distribution.
6. Submit Apple’s Unlisted App Distribution request once the app is submitted for review / ready for final distribution.
7. After Apple approves the unlisted request and app review, release the app and share the direct App Store link only with intended TCS users.

## Final pre-archive checks

- Apple Developer Program membership is Active.
- Latest Apple agreements are accepted in App Store Connect.
- Bundle ID exists and matches `com.thomasonchildcaresolutions.thehub`.
- Signing team is correct.
- App icon renders correctly.
- Push Notifications capability signs correctly.
- Production Hub loads in the Release build.
- Staff login works.
- Parent login works.
- Sign-out works.
- Face ID / device app lock works.
- Camera/photo picker works.
- External links open outside the Hub as intended.
- Notification permission flow works.
- No private TCS records are embedded in the native project.
- Privacy and support pages are publicly reachable without authentication.
- Dedicated App Review credentials use synthetic data only.
