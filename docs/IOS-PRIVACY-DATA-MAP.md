# iOS privacy disclosure mapping — October 25, 2026

Version 1.0/build 4 aligns the app's privacy manifest with the App Store
disclosures. This change describes existing storage behavior; it adds no data
collection, tracking, permissions, analytics SDK, or changes to staff/family rows.
No production records were inspected for this mapping.

## Categories missing from the prior App Store form

| Apple category | Source evidence of collection and retention | Purpose / linkage / tracking |
| --- | --- | --- |
| Physical Address | `src/app/(portal)/locations/page.tsx` exposes an editable Address and persists `LocationRecord.address` under `tcs-locations-v2`. Family childcare locations include provider business/home addresses. `src/hooks/usePersistentState.ts` saves shared state to Supabase with the authenticated account and organization. | App Functionality; linked; no tracking. |
| Other User Contact Info | `src/app/(portal)/enrollment-pipeline/page.tsx` collects Best contact time and inquiry/contact channel (including Facebook/Instagram) with the family's contact record. `persistLead` saves the complete record. `src/lib/tour-board.ts` retains `bestContactTime` and `inquiryMethod`; `src/lib/relational-state.ts` maps this collection to `enrollment_leads`. These are contact preferences beyond name/email/phone. | App Functionality; linked; no tracking. |
| Device ID | `src/app/api/notifications/native-subscription/route.ts` receives the APNs `deviceToken` for the authenticated user. `src/lib/server/native-push.ts` retains the token, its derived device ID, app version and registration dates in that user's protected `app_metadata.tcs_native_push_devices`. | App Functionality (opt-in alerts); linked; no tracking. |
| Product Interaction | `src/lib/audit.ts` records REVIEW/EXPORT activity using `record_audit_event`. Parent forms, messages and profile-photo endpoints also retain action metadata with `actor_user_id`. `supabase/setup.sql` defines the persistent, immutable `audit_log` with action, actor, affected record and timestamp. This supports operational accountability, not advertising. | App Functionality; linked; no tracking. |

The existing App Store form already declares these twelve categories: Name,
Email Address, Phone Number, Health, Sensitive Info, Other Financial Info,
Emails or Text Messages, Photos or Videos, Other User Content, User ID, Purchase
History, and Other Data Types. Their existing purposes/linkage are preserved.
Build 4 adds Sensitive Info, Emails or Text Messages and Purchase History to the
native manifest, where those three existing declarations had been omitted.

The final manifest and App Store form contain the same sixteen categories,
with App Functionality as purpose, identity linkage, and no tracking. Face ID
templates and device passcodes stay with iOS and are not collected by TCS.
QR scanning uses the selected TCS location; continuous GPS is not added.
Gator Cash continues to use earned points, with no purchases of points or
in-app payments introduced by this release.

## Apple references

- [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)
- [Collected data types in privacy manifests](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype)
- [Registering an app with APNs](https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns)
