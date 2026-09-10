import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sql = readFileSync(new URL("../supabase/production-hardening.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../supabase/setup.sql", import.meta.url), "utf8");
const roles = readFileSync(new URL("../src/lib/team-access.ts", import.meta.url), "utf8");
const relational = readFileSync(new URL("../src/lib/relational-state.ts", import.meta.url), "utf8");
const documentCrypto = readFileSync(new URL("../src/lib/server/document-crypto.ts", import.meta.url), "utf8");
const childrenSource = readFileSync(new URL("../src/lib/children.ts", import.meta.url), "utf8");
const schedulesSource = readFileSync(new URL("../src/lib/child-schedules.ts", import.meta.url), "utf8");
const complianceSource = readFileSync(new URL("../src/lib/compliance-ops.ts", import.meta.url), "utf8");
const careSource = readFileSync(new URL("../src/lib/employee-care.ts", import.meta.url), "utf8");
const hubDataSource = readFileSync(new URL("../src/lib/hub-data.ts", import.meta.url), "utf8");

const failures = [];
function assert(condition, message) {
  if (!condition) failures.push(message);
}

const locationTables = [
  "children",
  "child_schedules",
  "child_location_memberships",
  "daily_care_entries",
  "weekly_menus",
  "meal_services",
  "shift_reports",
  "handoff_items",
  "incidents",
  "kidkare_enrollments",
  "timesheets",
  "timesheet_submission_routes",
  "transportation_routes",
  "compliance_files",
  "transportation_fee_records",
  "enrollment_leads",
  "digital_forms",
  "document_records",
];

for (const table of locationTables) {
  const pattern = new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`, "i");
  const match = sql.match(pattern);
  assert(Boolean(match), `Missing relational table: ${table}`);
  assert(Boolean(match?.[1]?.match(/\blocation_id\s+uuid\s+not\s+null/i)), `${table} must have a required location_id`);
  assert(new RegExp(`alter table public\\.${table} enable row level security|alter table public\\.%I enable row level security`, "i").test(sql), `${table} must be protected by RLS`);
}

const collectionKeys = [
  "tcs-children-v1",
  "tcs-child-schedules-v2",
  "tcs-daily-care-v1",
  "tcs-weekly-menus-v1",
  "tcs-meal-services-v1",
  "tcs-shift-reports-v1",
  "tcs-shift-handoffs-v1",
  "tcs-health-safety-v1",
  "tcs-kidkare-enrollments-v1",
  "tcs-timesheets-v1",
  "tcs-timesheet-department-routes-v1",
  "tcs-routes",
  "tcs-files",
  "tcs-transportation-fees-v1",
  "tcs-enrollment-pipeline-v1",
  "tcs-digital-forms-v1",
];
for (const key of collectionKeys) assert(relational.includes(`"${key}"`), `Missing relational client mapping: ${key}`);

assert(sql.includes("create trigger audit_log_no_update before update or delete on public.audit_log"), "Audit log mutation-prevention trigger is missing");
assert(sql.includes("action in ('CREATE', 'UPDATE', 'REVIEW', 'EXPORT', 'DELETE')"), "Audit action coverage is incomplete");
assert(sql.includes("when 'kidkare' then false"), "Standard Employee KidKare RLS denial is missing");
assert(!roles.includes('key: "kidkare"'), "KidKare must not be an Employee permission option");
assert(!roles.includes('"/kidkare": "kidkare"'), "KidKare must not be an Employee route permission");
assert(sql.includes("public.is_tcs_owner() or public.is_tcs_licensee()"), "Administrative role policy is missing");
assert(sql.includes('bucket_id = \'tcs-sensitive-documents\' and false'), "Direct document bucket access must be denied");
assert(documentCrypto.includes('createCipheriv("aes-256-gcm"'), "AES-256-GCM document encryption is missing");
assert(documentCrypto.includes("getAuthTag"), "Authenticated encryption tag handling is missing");
assert(sql.includes("not legal_hold and retention_until <= current_date"), "Retention/legal-hold purge protection is missing");
assert(setup.includes("TCS Operations Hub production hardening"), "Combined setup.sql does not include production hardening");

// Live people data must never be shipped as application defaults.
assert(/export const initialChildren:\s*ChildRecord\[\]\s*=\s*\[\s*\];/s.test(childrenSource), "initialChildren must stay empty; child records belong in Supabase");
assert(/export const starterChildSchedules:\s*ChildScheduleRecord\[\]\s*=\s*\[\s*\];/s.test(schedulesSource), "starterChildSchedules must stay empty");
assert(/export const starterTimesheets:\s*TimesheetRecord\[\]\s*=\s*\[\s*\];/s.test(complianceSource), "starterTimesheets must stay empty");
assert(/export const starterCareLogs:\s*CareLogEntry\[\]\s*=\s*\[\s*\];/s.test(careSource), "starterCareLogs must stay empty");
assert(/export const starterHealthSafety:\s*HealthSafetyRecord\[\]\s*=\s*\[\s*\];/s.test(careSource), "starterHealthSafety must stay empty");
assert(/export const starterFamilies:\s*FamilyRecord\[\]\s*=\s*\[\s*\];/s.test(hubDataSource), "starterFamilies must stay empty");
assert(/export const starterRoutes:\s*TransportationRoute\[\]\s*=\s*\[\s*\];/s.test(hubDataSource), "starterRoutes must stay empty");
assert(/export const starterFiles:\s*FileRecord\[\]\s*=\s*\[\s*\];/s.test(hubDataSource), "starterFiles must stay empty");

// Scan shipped application text for accidentally committed server secrets.
// Person-specific deny lists are intentionally NOT stored in this repository:
// privacy checks should validate structure and data boundaries without repeating PII.
const textExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".txt", ".svg"]);
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const scanRoots = [join(repoRoot, "src"), join(repoRoot, "public")];

function scanDirectory(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      scanDirectory(path);
      continue;
    }
    if (!textExtensions.has(extname(path).toLowerCase())) continue;
    const value = readFileSync(path, "utf8");
    assert(!/SUPABASE_(?:SERVICE_ROLE_KEY|SECRET_KEY)\s*=/.test(value), `A Supabase server secret appears to be committed in ${path.replace(repoRoot, "")}`);
  }
}
for (const root of scanRoots) scanDirectory(root);

if (failures.length) {
  console.error("Production security verification failed:\n- " + [...new Set(failures)].join("\n- "));
  process.exit(1);
}

console.log(`Production security verification passed (${locationTables.length} location-owned tables, ${collectionKeys.length} relational client mappings, no bundled child/family records).`);
