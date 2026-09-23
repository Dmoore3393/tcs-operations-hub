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
const adminOps = source("src/lib/admin-ops.ts");

assert(manifest.name === "The Hub — TCS Operations", "Manifest app name must stay The Hub — TCS Operations");
assert(manifest.short_name === "The Hub", "Manifest short name must stay The Hub");
assert(manifest.display === "standalone", "Manifest must launch in standalone mode");
assert(Array.isArray(manifest.icons) && manifest.icons.some((icon) => icon.sizes === "192x192"), "Manifest needs a 192x192 app icon");
assert(Array.isArray(manifest.icons) && manifest.icons.some((icon) => icon.sizes === "512x512"), "Manifest needs a 512x512 app icon");
assert(existsSync(new URL("../public/app-icon-180.png", import.meta.url)), "Apple 180x180 app icon is missing");
assert(existsSync(new URL("../public/app-icon-192.png", import.meta.url)), "192x192 app icon is missing");
assert(existsSync(new URL("../public/app-icon-512.png", import.meta.url)), "512x512 app icon is missing");

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

assert(/export const starterEnrollmentLeads:\s*EnrollmentLeadRecord\[\]\s*=\s*\[\s*\];/s.test(adminOps), "Enrollment starter data must remain empty");
assert(/export const starterDigitalForms:\s*DigitalFormRecord\[\]\s*=\s*\[\s*\];/s.test(adminOps), "Digital-form starter data must remain empty");

if (failures.length) {
  console.error("App readiness verification failed:\n- " + [...new Set(failures)].join("\n- "));
  process.exit(1);
}
console.log("App readiness verification passed: installability, mobile privacy, role boundaries, lane identity, clock policy, security hardening, public policy pages, and form foundation are present.");
