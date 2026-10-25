# App Review notes — version 1.0/build 4

Submitted October 25, 2026. Existing sign-in credentials stay in App Store
Connect and are intentionally excluded from this document.

```text
The Hub by TCS is the private childcare operations and family-connection app for Thomason Childcare Solutions. It is intended for Unlisted App distribution. Access is limited to authorized staff and invited parents/guardians; downloading the app does not grant access to childcare records.

REVIEW ACCESS
Use the existing credentials in Sign-In Information for both staff and parent access. Sign in on the staff login screen and select Division to explore the isolated synthetic review workspace: six demo children, three directory staff, a transportation route, weekly meals, attendance/time-clock examples, messages and incident reports. Records are labeled Demo/Synthetic and contain no real child, family or employee information.
Open the profile menu and choose Switch to Parent Portal, or use the Parent Portal sign-in screen with the same credentials, to view the Apple Review Demo Family and Avery Reviewer's synthetic family records, menus, care updates and family features.

PUBLIC PAGES (NO SIGN-IN)
Privacy: https://tcs-operations-hub.vercel.app/privacy
Terms: https://tcs-operations-hub.vercel.app/terms
Support: https://tcs-operations-hub.vercel.app/support
These pages are also packaged inside the iPhone app and render without authentication or content JavaScript.

NATIVE IPHONE FEATURES
The app bundles its interface and uses the existing secure API for current authorized records. Native camera QR scanning supports parent check-in and staff time-clock workflows. In Child Photos, choose a synthetic child and Take a photo to use native photo capture; the existing upload action is separate. After the initial email/password login, backgrounding the app for more than 30 seconds requires Face ID or device-passcode unlock for the existing session. No biometric data is sent to TCS.
Enable iPhone alerts is available in the Parent Portal. Alerts are optional and scoped to authorized pickups, shared incidents and approved schedule updates. Synthetic family records intentionally do not send family alerts.

ACCOUNT DELETION AND POINTS
Account & Privacy is available from portal/profile links and /account. Users can initiate the existing account-deletion request in the app; the displayed completion timeframe is 30 days, subject to required childcare/employment record retention.
Gator Cash and store rewards are earned points. Points are not bought with money, and the app does not sell digital points or require in-app purchases. Sign-in uses email/password.

BUILD 4
This build fixes packaged-app launch/login rendering, public legal-page visibility, fonts/readability and mobile forms, and aligns the privacy manifest with the App Store privacy disclosures.
```
