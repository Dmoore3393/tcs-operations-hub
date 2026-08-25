import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/production-hardening.sql", import.meta.url), "utf8");
const setup = readFileSync(new URL("../supabase/setup.sql", import.meta.url), "utf8");
const roles = readFileSync(new URL("../src/lib/team-access.ts", import.meta.url), "utf8");
const relational = readFileSync(new URL("../src/lib/relational-state.ts", import.meta.url), "utf8");
const documentCrypto = readFileSync(new URL("../src/lib/server/document-crypto.ts", import.meta.url), "utf8");

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

if (failures.length) {
  console.error("Production security verification failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(`Production security verification passed (${locationTables.length} location-owned tables, ${collectionKeys.length} relational client mappings).`);
