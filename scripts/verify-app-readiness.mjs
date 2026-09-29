import { existsSync, readFileSync } from "node:fs";
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
const childrenModel = source("src/lib/children.ts");

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
assert(enrollmentForecastPage.includes("30 Days") && enrollmentForecastPage.includes("60 Days") && enrollmentForecastPage.includes("90 Days"), "Enrollment Forecast must keep 30/60/90-day planning windows");
assert(enrollmentForecastPage.includes("Pipeline Demand") && enrollmentForecastPage.includes("Projected Openings"), "Enrollment Forecast must separate prospect demand from confirmed projected openings");
assert(enrollmentForecastModel.includes("plannedLastDay") && enrollmentForecastModel.includes("preferredStartDate"), "Enrollment Forecast must use planned exits and Tour Board preferred starts");
assert(childrenModel.includes("plannedStartDate") && childrenModel.includes("plannedLastDay"), "Child records must preserve planned enrollment dates for forecasting");
assert(mainLayout.includes('href: "/enrollment-forecast"'), "Enrollment Forecast must remain reachable from Hub navigation");

assert(/export const starterEnrollmentLeads:\s*EnrollmentLeadRecord\[\]\s*=\s*\[\s*\];/s.test(adminOps), "Enrollment starter data must remain empty");
assert(/export const starterDigitalForms:\s*DigitalFormRecord\[\]\s*=\s*\[\s*\];/s.test(adminOps), "Digital-form starter data must remain empty");

if (failures.length) {
  console.error("App readiness verification failed:\n- " + [...new Set(failures)].join("\n- "));
  process.exit(1);
}
console.log("App readiness verification passed: installability, mobile privacy, role boundaries, lane identity, clock policy, security hardening, public policy pages, and form foundation are present.");
