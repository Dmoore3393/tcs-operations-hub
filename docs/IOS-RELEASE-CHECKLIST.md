# The Hub — phone and App Store release checklist

TCS name, green/gator branding, email/password sign-in, existing account deletion,
the original parent-demo family, and earned-only Gator Cash are preserved.

## What changed and how to check on your phone

The initial web fixes are live on Vercel. The isolated synthetic database records
have already been added. No real staff or family data was changed.

| Fix | What changed | Phone check |
| --- | --- | --- |
| 1. Public pages | Privacy and Support use a server-rendered public layout without auth/session gates. | In a Safari Private tab, signed out, open `/privacy` and `/support`. Repeat after disabling JavaScript. Text and legal links must remain visible. |
| 2. Terms and links | Added starter Terms, legal-review markers, and Privacy / Terms / Support / Account & Privacy footer links. | Open `/terms` signed out. Follow footer links from both logins and both portals. Have TCS counsel review the marked Terms provisions. |
| 3. Staff review data | Added six synthetic children including a staff-demo Avery, three directory staff, one route, schedules, meals, attendance, clock examples, messages, and incidents in the isolated review organization. | Use the existing staff review login and Division. Visit Children, Employees, Transportation, Meals, Attendance, Time Clock, and Health & Safety. Look for Demo/Synthetic labels. Original parent-demo Avery must still appear normally in the Parent Portal. |
| 4. Font | Fixed the circular font variable and applied Geist with a sans-serif fallback. | Open both logins and portal screens; body text should be clean sans-serif, including when the custom font loads slowly. |
| 5. Readability | Raised small text to 16px, Parent Portal prose to 18px, and strengthened muted labels. | Read welcome text, field labels, child details, menus, and footer links without pinching to zoom. |
| 6. Forms | Inputs/selects/textareas have a 16px floor; controls have a 44px height floor. | Tap email/password and a Parent Portal form. Safari should not automatically zoom into a field. |
| 7. Greeting | One dashboard greeting uses the device's local time and updates on foreground/minute changes. | Sign into Staff Hub; check that the greeting matches your local time and is shown once. |
| 8. Student Store | Removed the extra nonfunctional layout search. | Open Student Store on iPhone. One search should be visible and filter products. |
| 9. Meals | Bounded shared reads, added a 12-second timeout, a friendly error, and Try again. Failed reads cannot autosave empty data. | Open Meals on desktop and phone. Block the connection, reload, wait for the error, restore the connection, then tap Try again. |
| 10. Titles | Page metadata now supplies only the page name; the root appends The Hub once. | Open Privacy in Safari and inspect the tab title; The Hub should appear once. |
| 11. Doodles | Decorative icons are behind the welcome text, hidden from assistive technology, and ignore taps. | Read login/portal welcome text and tap nearby controls; doodles must not cover words or intercept taps. |
| 12. Discovery files | Added exact public allowlist robots.txt and a four-page sitemap. Protected layouts are noindex. | Open `/robots.txt` and `/sitemap.xml`; only `/`, `/privacy`, `/terms`, and `/support` are public. Authentication still protects portal data. |

## Native checks

- [x] Build/install on the iPhone 18 Pro Simulator with Xcode 27. Both login
  forms render in the packaged app.
- [x] Signed-out Privacy, Support, and Terms render in the packaged app with
  content JavaScript enabled and disabled (`TheHubUITests`).
- [ ] Confirm successful staff and parent email/password sign-in and the live
  Parent Portal inside the packaged app.
- [ ] Repeat public page checks in Airplane Mode on a physical iPhone.
- [ ] Open Account & Privacy. Complete a deletion request only with a dedicated
  disposable test account; do not request deletion of the Apple review account
  or any real staff/family account. Automated checks used mocks, not live deletion.
- [ ] On a physical iPhone, sign in once, background for over 30 seconds, and
  confirm Face ID or device passcode unlock. Cancel and retry; the private screen
  must remain covered. Sign out and verify the next person must sign in.
- [ ] On a physical iPhone, test native staff/parent QR scanning with a permitted
  test location. Cancelling or denying the camera must show a useful message.
  A scanned code must still pass existing location/PIN/authorization checks.
- [ ] Test native photo capture on an authorized disposable record. The preview
  should appear in the existing form and upload only after the existing consent
  and upload action. Check denial/cancel behavior too.
- [ ] Enable iPhone alerts on an authorized test family account. With APNs
  configured, verify pickup, approved schedule change, and explicitly shared
  incident alerts. Do not use real families for this test. Synthetic review
  records intentionally do not send alerts. Check denial, app settings, sign-out,
  and notification taps. Lock-screen alerts must contain no sensitive child text.
- [ ] Confirm the TCS icon, green launch screen, The Hub display name, version
  1.0/build 3, correct bundle ID/team, and iPhone layout in Xcode.

## Steps requiring the owner

- [x] Authorize publishing the prepared branch to the existing public GitHub
  repository and deploying it to Vercel. The owner provided explicit approval.
- [x] Reconnect Danielle's MacBook Air; Xcode builds and Simulator checks ran.
- [ ] Sign into the Apple Developer account in Xcode if needed, accept any
  agreements, and approve signing/provisioning. Confirm build number 3 is unused.
- [ ] Configure/confirm the APNs key in Vercel server environment and enable the
  matching App ID capability/provisioning profile. Do not add signing keys to git.
- [ ] Review marked Terms with counsel and confirm the privacy manifest and App
  Store Connect privacy answers against enabled TCS features and processors.
- [x] Create the version 1.0/build 3 archive (October 25) using the existing
  development identity. Artifact:
  `native/capacitor/artifacts/TheHub-1.0-build3-20261025-103001.xcarchive`.
- [x] Export the App Store IPA with the existing Apple Distribution identity;
  verify its signature and production APNs entitlements. Export:
  `native/capacitor/artifacts/AppStore-build3/The Hub.ipa`.
- [ ] Complete Apple-side validation, the remaining device checks, and upload
  through Xcode Organizer to TestFlight/App Store Connect.
  Check the current review status before replacing a queued submission.
- [ ] Update App Store Connect Privacy, Support, and Terms URLs and review notes.
  Explain invite-only access, demo staff/parent credentials, earned-only points,
  native camera/alerts/unlock, and the in-app account deletion location. Native
  features strengthen the submission; Apple makes the final Guideline 4.2 decision.
