# Public App Store submission

Requested by Danielle on November 23, 2026: publish a searchable public App Store app as soon as possible. Keep the existing approved Unlisted app available and preserve all TCS accounts and permissions.

## Public identity

- App name: **The Hub: TCS Childcare**. The initial name “TCS Operations Hub” was unavailable.
- Apple app ID: **6838407438**.
- Bundle ID: **com.thomasonchildcaresolutions.thehub.public**.
- Team: **6Y2923TFK5**.
- SKU: **tcs-hub-public-ios-2026**.
- Planned version/build: **1.0.0 / 1**.
- Distribution: **Public**, discoverable in App Store search; do not request Unlisted distribution for this record.
- Price/initial region: Free / United States.
- Existing Unlisted app: **6817598608**, bundle **com.thomasonchildcaresolutions.thehub**, remains available and supported.

## Build and review preparation

The public app uses the same production Supabase project and authenticated Vercel API. Only the existing URL and publishable key belong in the ignored `.env.native.local`. Server credentials and signing keys are never included in the app or Git.

The native export adapts only the server language-cookie lookup and the two server query-parameter wrappers for packaged execution. Staff authorization and location/parent linkage checks remain in the existing API. The native notification endpoints recognize only the two approved TCS bundle IDs, retaining old-device support and all recipient permission checks.

New App Store record and Push-enabled App ID have been created. Native static export and Capacitor sync passed on Danielle’s MacBook Air. The three iPhone Simulator UI tests passed. The Release archive and App Store Connect upload succeeded on November 23. Apple is processing build 1. Screenshots, privacy metadata and review submission are in progress. Creation of a draft record is **not** an Apple review submission or public release.
