import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const failures = [];
function assert(condition, message) {
  if (!condition) failures.push(message);
}
function source(relative) {
  const url = new URL(`../${relative}`, import.meta.url);
  assert(existsSync(url), `Missing app-readiness file: ${relative}`);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const manifest = JSON.parse(source("public/manifest.webmanifest") || "{}");
const serviceWorker = source("public/sw.js");
const layout = source("src/app/layout.tsx");
const auth = source("src/components/providers/AuthProvider.tsx");
const roles = source("src/lib/team-access.ts");
const lanes = source("supabase/staff-lanes.sql");
const security = source("supabase/pre-app-security-hardening.sql");
const forms = source("supabase/official-form-and-staff-document-foundation.sql");
const timeClock = source("src/app/api/time-clock/route.ts");
const readiness = source("src/app/api/app-readiness/route.ts");
const privacy = source("src/app/privacy/page.tsx");
const support = source("src/app/support/page.tsx");
const mobileNav = source("src/components/layout/MobileQuickActions.tsx");
const mainLayout = source("src/components/layout/MainLayout.tsx");
const trainingCenter = source("src/app/training-center/page.tsx");
const trainingStyles = source("src/app/training-center/training-center-v2.css");
const updater = source("src/components/pwa/PwaUpdater.tsx");
const appVersionRoute = source("src/app/api/app-version/route.ts");
const adminOps = source("src/lib/admin-ops.ts");
const parentPortal = source("src/app/parent/page.tsx");
const parentScanner = source("src/app/parent/scan/page.tsx");
const staffTimeClock = source("src/app/time-clock/page.tsx");
const staffTimeClockScanner = source("src/app/time-clock/scan/page.tsx");
const staffTimeClockRoute = source("src/app/api/time-clock/route.ts");
const staffClockPinRoute = source("src/app/api/time-clock/pin/route.ts");
const staffClockPinHelper = source("src/lib/server/staff-clock-pin.ts");
const enrollmentForecastPage = source("src/app/enrollment-forecast/page.tsx");
const enrollmentForecastModel = source("src/lib/enrollment-forecast.ts");
const teamStorePage = source("src/app/team-store/page.tsx");
const studentStorePage = source("src/app/student-store/page.tsx");
const locationsPage = source("src/app/locations/page.tsx");
const childrenModel = source("src/lib/children.ts");
const iosProject = source("native/ios/project.yml");
const iosApp = source("native/ios/TheHub/TheHubApp.swift");
const iosWebView = source("native/ios/TheHub/HubWebView.swift");
const iosContentView = source("native/ios/TheHub/ContentView.swift");
const iosEntitlements = source("native/ios/TheHub/TheHub.entitlements");
const iosAssetScript = source("native/ios/scripts/prepare-assets.sh");
const nativePush = source("src/lib/server/native-push.ts");
const nativePushRoute = source("src/app/api/notifications/native-subscription/route.ts");
const pushClient = source("src/lib/push-client.ts");

assert(manifest.name === "The Hub — TCS Operations", "Manifest app name must stay The Hub — TCS Operations");
assert(manifest.short_name === "The Hub", "Manifest short name must stay The Hub");
assert(manifest.display === "standalone", "Manifest must launch in standalone mode");
assert(Array.isArray(manifest.icons) && manifest.icons.some((icon) => icon.sizes === "192x192"), "Manifest needs a 192x192 app icon");
assert(Array.isArray(manifest.icons) && manifest.icons.some((icon) => icon.sizes === "512x512"), "Manifest needs a 512x512 app icon");
assert(existsSync(new URL("../public/app-icon-180.png", import.meta.url)), "Apple 180x180 app icon is missing");
assert(existsSync(new URL("../public/app-icon-192.png", import.meta.url)), "192x192 app icon is missing");
assert(existsSync(new URL("../public/app-icon-512.png", import.meta.url)), "512x512 app icon is missing");
assert(existsSync(new URL("../public/branding/tcs-hub-launch.webp", import.meta.url)), "Official Hub launch artwork is missing");
assert(existsSync(new URL("../public/branding/tcs-hub-loading.webp", import.meta.url)), "Official Hub loading artwork is missing");

assert(serviceWorker.includes('self.addEventListener("push"'), "Service worker push handler is missing");
assert(serviceWorker.includes("event.respondWith(fetch(event.request))"), "Private app pages must remain network-backed");
assert(!serviceWorker.includes("caches.open("), "Service worker must not cache private Hub records");
assert(layout.includes('manifest: "/manifest.webmanifest"'), "Root metadata must reference the web app manifest");
assert(layout.includes("appleWebApp"), "Apple web-app metadata is missing");

assert(auth.includes('"/privacy"') && auth.includes('"/support"'), "Privacy and support routes must remain public");
assert(auth.includes('"/app-readiness"'), "App Readiness must remain Owner/Admin-only");
assert(roles.includes('export const ACCESS_ROLES = ["Owner / Admin", "Location Licensee", "Employee"]'), "Three software access levels must remain explicit");
assert(lanes.includes("Approved Staff Lane Profiles"), "TCS lane-sheet source-of-truth schema is missing");

assert(timeClock.includes("early_clock_in_window_minutes"), "Time Clock is missing the early clock-in policy");
assert(timeClock.includes("late_clock_out_window_minutes"), "Time Clock is missing the late clock-out policy");
assert(timeClock.includes("?? 4"), "Time Clock must preserve the approved four-minute default windows");
assert(timeClock.includes("unapproved_shift_overage"), "Time Clock must preserve unapproved overage review");

assert(security.includes("revoke execute on function public.record_audit_event"), "Pre-app hardening must remove anonymous audit RPC access");
assert(security.includes('create policy "organizations server only"'), "Server-only organization policy is missing");
assert(forms.includes("create table if not exists public.official_form_templates"), "Official form-template foundation is missing");
assert(forms.includes("staff_user_id uuid references auth.users"), "Staff document linkage is missing");
assert(forms.includes("Staff Self + Owner"), "Staff self-document confidentiality mode is missing");

assert(readiness.includes("Real-device role smoke test"), "Live App Readiness audit must include real-device QA");
assert(readiness.includes("Leaked-password protection"), "App Readiness must surface leaked-password protection");
assert(privacy.includes("The Hub Privacy Policy"), "Public privacy policy page is missing");
assert(support.includes("Contact TCS Support"), "Public support page is missing");
assert(mobileNav.includes('href: "/my-schedule"') && mobileNav.includes('href: "/time-clock"') && mobileNav.includes('href: "/notifications"'), "Mobile app navigation must keep Schedule, Time Clock, and Alerts");
assert(mobileNav.includes("All your tools"), "Mobile app tool drawer is missing");
assert(mainLayout.includes("pt-[env(safe-area-inset-top)]"), "Mobile app header must respect the device safe area");
assert(mainLayout.includes('src="/app-icon-192.png"'), "Main Hub shell must display the official app icon");
assert(auth.includes("AppLoadingScreen"), "Secure app loading must use the branded loading screen");
assert(auth.includes("AUTH_OPERATION_TIMEOUT_MS") && auth.includes("Secure sign-in check"), "Secure auth loading must time out instead of hanging forever");
assert(source("src/components/pwa/AppLoadingScreen.tsx").includes("tcs-hub-loading.webp"), "Secure loading must use the dedicated loading artwork, not the launch artwork");
assert(source("src/components/pwa/AppLoadingScreen.tsx").includes('backgroundSize: "contain"'), "Loading artwork must remain fully visible on desktop and mobile");
assert(layout.includes('apple: [{ url: "/app-icon-192.png"'), "Apple home-screen metadata must use the official app icon");
assert(manifest.theme_color === "#0b5d35", "Manifest theme color must use the official Hub green");
assert(trainingCenter.includes("<MainLayout>") && trainingCenter.includes("Hub Home"), "Training Center must stay integrated with the main app shell and provide a Hub Home control");
assert(trainingStyles.includes("overflow-x:hidden") && trainingStyles.includes(".tc-view-nav"), "Training Center responsive overflow protection/navigation is missing");
assert(updater.includes("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA") && updater.includes("serverVersion") && updater.includes("pageshow"), "Installed app must force-refresh stale deployment snapshots");
assert(updater.includes("RELOAD_GUARD_KEY") && updater.includes("guardedVersion === serverVersion"), "Installed app updater must prevent permanent reload loops");
assert(appVersionRoute.includes("gitSha") && appVersionRoute.includes("deploymentUrl"), "App-version endpoint must return like-for-like deployment identifiers");
assert(parentPortal.includes("Scan to Check In / Out") && parentPortal.includes('router.push("/parent/scan")'), "Parent Portal must keep the in-app attendance scanner entry point");
assert(parentScanner.includes("getUserMedia") && parentScanner.includes("jsQR") && parentScanner.includes("locationFromSlug"), "Parent in-app scanner must decode camera QR codes and validate TCS location slugs");
assert(parentScanner.includes("The Hub does not upload or save camera video or photos"), "Parent scanner must keep the on-device camera privacy disclosure");
assert(staffTimeClock.includes("Scan to Clock In") && staffTimeClock.includes("Scan to Clock Out"), "Staff Time Clock must keep QR clock-in and clock-out entry points");
assert(staffTimeClock.includes('act(qrAction, "Location QR"'), "Staff QR clock events must be recorded with the Location QR source");
assert(staffTimeClockScanner.includes("jsQR") && staffTimeClockScanner.includes("locationSlugFromQr"), "Staff Time Clock scanner must decode and validate posted TCS location QR codes");
assert(staffTimeClockScanner.includes("It does not use or claim GPS verification"), "Staff scanner must not overstate QR location verification");
assert(staffTimeClock.includes("My Staff Clock PIN") && staffTimeClock.includes("Maintenance Manual Clock"), "Time Clock must keep personal PIN setup and the maintenance-only manual exception");
assert(staffTimeClock.includes("Owner/Admin Staff Clock Override") && staffTimeClock.includes("Reset Staff PIN"), "Owner/Admin Time Clock override and PIN reset controls are missing");
assert(staffTimeClockRoute.includes("Regular staff must scan the TCS location QR to clock in or out."), "Regular staff clock-in/out must require the location QR");
assert(staffTimeClockRoute.includes('requestedSource === "Maintenance Manual" && targetIsMaintenance'), "Manual staff clocking must stay restricted to Maintenance");
assert(staffTimeClockRoute.includes("Only an Owner/Admin can clock another staff member in or out."), "Only Owner/Admin may clock another staff member");
assert(staffTimeClockRoute.includes("verifyStaffClockPin"), "Staff clock-in/out must verify the signed-in employee PIN");
assert(staffClockPinRoute.includes('action === "admin_reset"') && staffClockPinRoute.includes("Only an Owner/Admin"), "Only Owner/Admin may reset another staff clock PIN");
assert(staffClockPinHelper.includes("createHmac") && staffClockPinHelper.includes("timingSafeEqual"), "Staff clock PINs must stay server-protected and timing-safe");
assert(roles.includes('"/time-clock/scan"'), "Employee role must retain access to the secure staff QR scanner");
assert(enrollmentForecastPage.includes("([30, 60, 90] as ForecastHorizon[])") && enrollmentForecastPage.includes("{days} Days"), "Enrollment Forecast must keep 30/60/90-day planning windows");
assert(enrollmentForecastPage.includes("Pipeline Demand") && enrollmentForecastPage.includes("Projected Openings"), "Enrollment Forecast must separate prospect demand from confirmed projected openings");
assert(enrollmentForecastModel.includes("plannedLastDay") && enrollmentForecastModel.includes("preferredStartDate"), "Enrollment Forecast must use planned exits and Tour Board preferred starts");
assert(childrenModel.includes("plannedStartDate") && childrenModel.includes("plannedLastDay"), "Child records must preserve planned enrollment dates for forecasting");
assert(mainLayout.includes('href: "/enrollment-forecast"'), "Enrollment Forecast must remain reachable from Hub navigation");
assert(iosProject.includes("ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon"), "Native iOS project must compile the official AppIcon asset");
assert(iosProject.includes("DEVELOPMENT_TEAM: 6Y2923TFK5"), "Native iOS signing must stay connected to Apple Team 6Y2923TFK5");
assert(iosProject.includes("TheHub/Resources"), "Native iOS project must bundle the official Hub resource folder");
assert(existsSync(new URL("../native/ios/TheHub/Resources/tcs-hub-launch.webp", import.meta.url)), "Native Hub launch artwork resource link is missing");
assert(existsSync(new URL("../native/ios/TheHub/Resources/tcs-hub-loading.webp", import.meta.url)), "Native Hub loading artwork resource link is missing");
assert(iosProject.includes("TCS location QR check-in, staff clocking"), "Native camera permission must accurately describe QR and staff-clock camera use");
assert(iosEntitlements.includes("aps-environment") && iosProject.includes("APS_ENVIRONMENT: production"), "Native iOS project must include APNs entitlements for release builds");
assert(iosAssetScript.includes("1024") && iosAssetScript.includes("app-icon-512.png"), "Native pre-build must prepare the 1024×1024 App Store icon from the approved Hub icon");
assert(iosAssetScript.includes('SRCROOT') && !iosAssetScript.includes('dirname "$0"'), "Native app-icon build script must resolve paths from Xcode SRCROOT rather than $0 after XcodeGen inlines the script");
assert(iosProject.includes('inputFiles:') && iosProject.includes('$(SRCROOT)/../../public/app-icon-512.png'), "Native app-icon build script must declare its source icon as an Xcode sandbox input");
assert(iosProject.includes('outputFiles:') && iosProject.includes('$(SRCROOT)/TheHub/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png'), "Native app-icon build script must declare the generated App Store icon as an Xcode sandbox output");
assert(iosContentView.includes("HubLaunchScreen()") && iosContentView.includes("HubLoadingScreen()"), "Native opening experience must render both branded Hub launch and secure loading screens");
assert(iosContentView.includes("HubBrandMark") && iosContentView.includes("Preparing your secure workspace"), "Native opening experience must include the branded Hub mark and loading treatment");
assert(iosApp.includes("UIApplicationDelegateAdaptor(AppDelegate.self)"), "Native iOS app must attach the notification app delegate");
assert(iosWebView.includes("requestPushNotifications") && iosWebView.includes("tcs-native-push-token"), "Native WebView must bridge APNs registration back to the secured Hub session");
assert(iosWebView.includes("!AppConfiguration.allowedHosts.contains(host)"), "Native WebView must keep unrelated web hosts outside the secured Hub container");
assert(nativePush.includes("api.push.apple.com") && nativePush.includes("APPLE_APNS_PRIVATE_KEY"), "Server must include authenticated APNs delivery support");
assert(nativePush.includes('"6Y2923TFK5"'), "APNs server configuration must keep the verified Apple Team ID fallback");
assert(nativePush.includes('"9UCB82956G"'), "APNs server configuration must keep the verified Apple Key ID fallback");
assert(nativePushRoute.includes("requireStaff") && nativePushRoute.includes("deviceToken"), "Native device registration must require an authenticated staff account");
assert(pushClient.includes("/api/notifications/native-subscription") && pushClient.includes("tcs-native-push-token"), "Web notification client must register the native APNs device through the signed-in Hub account");

assert(teamStorePage.includes("SafeImage") && teamStorePage.includes("reward.imageUrl"), "Team Store must replace failed reward images with a clean fallback");
assert(studentStorePage.includes("SafeImage") && studentStorePage.includes("productImage(product)"), "Student Store must replace failed product images with a clean fallback");
assert(locationsPage.includes("SafeImage") && locationsPage.includes("QR preview unavailable"), "Location QR must show a clean fallback instead of a broken image icon");

function walkSource(relativeDir) {
  const root = new URL(`../${relativeDir}/`, import.meta.url);
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), root);
    if (entry.isDirectory()) {
      const nested = walkSource(`${relativeDir}/${entry.name}`);
      files.push(...nested);
    } else if (/\.(?:tsx|jsx|css)$/i.test(entry.name)) {
      files.push(child);
    }
  }
  return files;
}

for (const file of [...walkSource("src/app"), ...walkSource("src/components")]) {
  const text = readFileSync(file, "utf8");
  const staticImage = /["'`](\/[^"'\`?\s)]+?\.(?:png|jpe?g|webp|gif|svg|ico))(?:\?[^"'\`\s)]*)?/gi;
  for (const match of text.matchAll(staticImage)) {
    const assetPath = match[1];
    assert(
      existsSync(new URL(`../public${assetPath}`, import.meta.url)),
      `Broken static image reference: ${assetPath} in ${fileURLToPath(file)}`,
    );
  }
}


assert(/export const starterEnrollmentLeads:\s*EnrollmentLeadRecord\[\]\s*=\s*\[\s*\];/s.test(adminOps), "Enrollment starter data must remain empty");
assert(/export const starterDigitalForms:\s*DigitalFormRecord\[\]\s*=\s*\[\s*\];/s.test(adminOps), "Digital-form starter data must remain empty");

if (failures.length) {
  console.error("App readiness verification failed:\n- " + [...new Set(failures)].join("\n- "));
  process.exit(1);
}
console.log("App readiness verification passed: installability, native iOS branding, APNs bridge, mobile privacy, role boundaries, lane identity, clock policy, security hardening, public policy pages, and form foundation are present.");
