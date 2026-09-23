# The Hub — Native App Launch Checklist

This checklist is for the **v1 freeze → native packaging → store submission** phase. The live web Hub remains the single backend and operational source of truth.

## Product identity

- App name: **The Hub**
- Full product name: **The Hub — TCS Operations**
- Organization: **Thomason Childcare Solutions**
- Public privacy route: `/privacy`
- Public support route: `/support`
- Existing installable PWA: manifest, icons, standalone mode, service worker, mobile quick actions, background web push.
- Sensitive Hub pages stay network-backed; the service worker must not cache private child/staff records.

## v1 freeze gate

Before native packaging:
- Production security checks and TypeScript checks pass.
- Supabase security advisor has no unexpected anonymous-access findings.
- Leaked-password protection is enabled in Supabase Auth.
- At least one accepted account exists for:
  - Owner / Admin
  - Location Licensee
  - Employee
- Complete real-device smoke tests for all three access levels.
- Confirm each launch user is linked to the correct approved TCS lane.
- Verify schedule → Time Clock → break → clock-out → time-off → blocked-date → notification workflows.
- Verify confidential files and location boundaries with non-owner accounts.
- Freeze v1 behavior after QA; new feature work resumes after the native baseline is packaged.

## Document/forms foundation

Redesigned TCS forms can be added without changing the app architecture:
1. Add the official form to the encrypted document system.
2. Register/version it in `official_form_templates`.
3. Set subject type, workflow, signature/verification requirements, and confidentiality.
4. Link generated/signed copies to the correct child, employee, facility, vehicle, or operational record.
5. Apply a configured retention policy; do not invent a retention period when TCS has not approved one.

## Apple organization enrollment

For organization enrollment, prepare:
- Thomason Childcare Solutions legal entity information.
- D-U-N-S number.
- A person with legal authority to bind the organization.
- Work email associated with the organization.
- Functional public organization website.
- Apple Developer Program annual membership fee.
- App Store privacy answers, public privacy-policy URL, support URL, screenshots, app description, age rating, and review notes/test access.

Do not create the Apple signing/bundle identity until the organization developer account is available.

## Google Play organization enrollment

Prepare:
- Organization legal name/address and contact information.
- D-U-N-S number for organization verification.
- Public organization website.
- Developer contact email/phone.
- Google Play Console registration fee.
- Data safety disclosure, public privacy-policy URL, support/contact information, store listing graphics/screenshots, content rating, and testing/release tracks.

## Native packaging

Native packaging should wrap the existing production Hub rather than fork business logic into a second app.

Native-specific work:
- iOS/Android project shell.
- Stable bundle/package identifiers chosen after organization developer accounts are ready.
- Universal/app links for Hub routes.
- Native secure storage/session handling review.
- Native APNs setup for iOS push.
- Android notification setup for native push.
- Camera/file chooser permissions only where used.
- App icons and launch/splash assets.
- TestFlight/internal Android testing before production submission.

## Release rule

A store build is not considered ready merely because it compiles. It must pass:
- Hub CI/security gate.
- App-readiness automated audit.
- Owner/Admin real-device smoke test.
- Location Licensee real-device smoke test.
- Employee real-device smoke test.
- Notification test.
- Sign-out/session-protection test.
- Confidential-record access test.
