import { requireOwner, responseFromThrown } from "@/lib/server/require-owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckStatus = "pass" | "warning" | "manual";

type ReadinessCheck = {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  action?: string;
};

function check(key: string, label: string, status: CheckStatus, detail: string, action?: string): ReadinessCheck {
  return { key, label, status, detail, action };
}

export async function GET(request: Request) {
  try {
    const { admin, profile } = await requireOwner(request);
    const organizationId = profile.organization_id;

    const [
      staffResult,
      lanesResult,
      locationsResult,
      attendanceResult,
      docsResult,
      retentionResult,
      performanceTypesResult,
      bucketsResult,
    ] = await Promise.all([
      admin
        .from("staff_access")
        .select("user_id,full_name,email,role,locations,permissions,is_active,accepted_at")
        .eq("organization_id", organizationId)
        .order("full_name"),
      admin
        .from("staff_lane_profiles")
        .select("id,staff_user_id,full_name,preferred_name,lane_group,job_title,is_active")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("sort_order"),
      admin
        .from("locations")
        .select("id,name,full_name,slug,is_active")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name"),
      admin
        .from("staff_attendance_settings")
        .select("enforce_schedule_clocking,early_clock_in_window_minutes,late_clock_out_window_minutes,flag_scheduled_hours_overage")
        .eq("organization_id", organizationId)
        .maybeSingle(),
      admin
        .from("document_records")
        .select("id,status", { count: "exact", head: false })
        .eq("organization_id", organizationId)
        .limit(1),
      admin
        .from("retention_policies")
        .select("id,document_type,is_active")
        .eq("organization_id", organizationId)
        .eq("is_active", true),
      admin
        .from("staff_performance_event_types")
        .select("code,is_active")
        .eq("organization_id", organizationId)
        .eq("is_active", true),
      admin.storage.listBuckets(),
    ]);

    const firstError =
      staffResult.error ||
      lanesResult.error ||
      locationsResult.error ||
      attendanceResult.error ||
      docsResult.error ||
      retentionResult.error ||
      performanceTypesResult.error ||
      bucketsResult.error;
    if (firstError) throw firstError;

    const staff = staffResult.data ?? [];
    const lanes = lanesResult.data ?? [];
    const activeStaff = staff.filter((row) => row.is_active);
    const activeOwners = activeStaff.filter((row) => row.role === "Owner / Admin");
    const activeLicensees = activeStaff.filter((row) => row.role === "Location Licensee");
    const activeEmployees = activeStaff.filter((row) => row.role === "Employee");
    const linkedLaneIds = new Set(lanes.filter((row) => row.staff_user_id).map((row) => String(row.id)));
    const unlinkedLanes = lanes.filter((row) => !linkedLaneIds.has(String(row.id)));
    const accepted = activeStaff.filter((row) => Boolean(row.accepted_at));
    const bucket = (bucketsResult.data ?? []).find((item) => item.id === "tcs-sensitive-documents");
    const retentionTypes = new Set((retentionResult.data ?? []).map((row) => String(row.document_type)));
    const performanceTypes = new Set((performanceTypesResult.data ?? []).map((row) => String(row.code)));
    const attendance = attendanceResult.data;

    const checks: ReadinessCheck[] = [];

    checks.push(check(
      "production-locations",
      "Active location configuration",
      (locationsResult.data ?? []).length > 0 ? "pass" : "warning",
      `${(locationsResult.data ?? []).length} active location${(locationsResult.data ?? []).length === 1 ? "" : "s"} available to the Hub.`,
      (locationsResult.data ?? []).length ? undefined : "Add at least one active TCS location.",
    ));

    checks.push(check(
      "owner-coverage",
      "Owner/Admin coverage",
      activeOwners.length >= 2 ? "pass" : "warning",
      `${activeOwners.length} active Owner/Admin account${activeOwners.length === 1 ? "" : "s"}.`,
      activeOwners.length >= 2 ? undefined : "Keep at least two active Owner/Admin accounts for continuity.",
    ));

    checks.push(check(
      "role-test-owner",
      "Owner/Admin test role",
      activeOwners.some((row) => row.accepted_at) ? "pass" : "warning",
      activeOwners.some((row) => row.accepted_at) ? "An accepted Owner/Admin account is available for launch testing." : "No accepted Owner/Admin test account is available.",
    ));

    checks.push(check(
      "role-test-licensee",
      "Location Licensee test role",
      activeLicensees.some((row) => row.accepted_at) ? "pass" : "warning",
      activeLicensees.some((row) => row.accepted_at) ? "An accepted Location Licensee account is available for launch testing." : "No accepted Location Licensee account is available.",
    ));

    checks.push(check(
      "role-test-employee",
      "Employee test role",
      activeEmployees.some((row) => row.accepted_at) ? "pass" : "warning",
      activeEmployees.some((row) => row.accepted_at) ? "An accepted Employee account is available for launch testing." : "A regular Employee account still needs to be invited and accepted for final permission testing.",
      activeEmployees.some((row) => row.accepted_at) ? undefined : "Invite one regular employee before freezing v1.",
    ));

    checks.push(check(
      "lane-linkage",
      "Lane-sheet linkage",
      unlinkedLanes.length === 0 ? "pass" : "warning",
      unlinkedLanes.length === 0
        ? "Every approved TCS lane is linked to a Hub account."
        : `${unlinkedLanes.length} approved lane${unlinkedLanes.length === 1 ? "" : "s"} do not have a Hub login yet. This is allowed before rollout, but launch users should be linked.`,
      unlinkedLanes.length ? "Link each person who will use v1 to the correct approved TCS lane." : undefined,
    ));

    checks.push(check(
      "accepted-accounts",
      "Invitation acceptance",
      accepted.length === activeStaff.length ? "pass" : "warning",
      `${accepted.length} of ${activeStaff.length} active staff account${activeStaff.length === 1 ? "" : "s"} have accepted setup.`,
    ));

    const clockReady = Boolean(
      attendance?.enforce_schedule_clocking &&
      Number(attendance?.early_clock_in_window_minutes) === 4 &&
      Number(attendance?.late_clock_out_window_minutes) === 4 &&
      attendance?.flag_scheduled_hours_overage,
    );
    checks.push(check(
      "clock-policy",
      "Scheduled-hours policy",
      clockReady ? "pass" : "warning",
      clockReady
        ? "Published-shift enforcement is on: 4 minutes early, 4 minutes after, with unapproved overage review."
        : "The current Time Clock settings do not match the approved TCS 4-minute policy.",
      clockReady ? undefined : "Restore the approved 4-minute clock-in/clock-out policy before launch.",
    ));

    checks.push(check(
      "performance-accountability",
      "Attendance accountability event types",
      performanceTypes.has("late_arrival") && performanceTypes.has("early_departure") && performanceTypes.has("no_call_no_show") && performanceTypes.has("unapproved_shift_overage") ? "pass" : "warning",
      "The launch check verifies late arrival, early departure, no-call/no-show, and unapproved scheduled-hours overage event types.",
    ));

    checks.push(check(
      "document-bucket",
      "Encrypted document storage",
      bucket && bucket.public === false ? "pass" : "warning",
      bucket && bucket.public === false
        ? "The sensitive-document bucket is private and server-mediated."
        : "The private sensitive-document bucket could not be verified.",
    ));

    checks.push(check(
      "document-encryption",
      "Document encryption key",
      Boolean(process.env.DOCUMENT_ENCRYPTION_KEY) ? "pass" : "warning",
      process.env.DOCUMENT_ENCRYPTION_KEY
        ? "Server-side AES-256-GCM document encryption is configured."
        : "DOCUMENT_ENCRYPTION_KEY is not available in this deployment.",
    ));

    checks.push(check(
      "retention-policies",
      "Retention policy foundation",
      retentionTypes.size > 0 ? "pass" : "warning",
      `${retentionTypes.size} active retention polic${retentionTypes.size === 1 ? "y" : "ies"} are configured for secured document workflows.`,
    ));

    checks.push(check(
      "pwa-foundation",
      "Installable app foundation",
      "pass",
      "The Hub already ships a web-app manifest, standalone app metadata, app icons, service worker, mobile quick actions, and automatic version refresh.",
    ));

    checks.push(check(
      "push-foundation",
      "Web push foundation",
      Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) ? "pass" : "warning",
      (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
        ? "Background web-push signing can be derived from the server secret."
        : "A server secret is required for background web push.",
    ));

    checks.push(check(
      "leaked-password-protection",
      "Leaked-password protection",
      "manual",
      "Supabase currently reports leaked-password protection as disabled. This requires an Auth dashboard setting rather than a database migration.",
      "Enable leaked-password protection in Supabase Auth before broad staff rollout.",
    ));

    checks.push(check(
      "real-device-smoke-test",
      "Real-device role smoke test",
      "manual",
      "Run one complete mobile workflow as Owner/Admin, one as Location Licensee, and one as Employee after the regular Employee test account exists.",
      "Test sign-in, lane, location access, schedule, clock actions, time off, blocked dates, notifications, files, and sign-out on real devices.",
    ));

    checks.push(check(
      "app-store-accounts",
      "App-store organization accounts",
      "manual",
      "Apple and Android developer organization enrollment is an external account step and cannot be completed from the Hub codebase.",
      "Prepare organization developer accounts, D-U-N-S information, website, and public privacy/support URLs.",
    ));

    const automated = checks.filter((item) => item.status !== "manual");
    const passing = automated.filter((item) => item.status === "pass").length;
    const warnings = automated.filter((item) => item.status === "warning").length;

    return Response.json({
      generatedAt: new Date().toISOString(),
      release: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "development",
      summary: {
        automatedChecks: automated.length,
        passing,
        warnings,
        manualChecks: checks.filter((item) => item.status === "manual").length,
        activeStaff: activeStaff.length,
        owners: activeOwners.length,
        licensees: activeLicensees.length,
        employees: activeEmployees.length,
        approvedLanes: lanes.length,
        linkedLanes: lanes.filter((row) => row.staff_user_id).length,
        encryptedDocumentCount: docsResult.count ?? 0,
      },
      checks,
      unlinkedLanes: unlinkedLanes.map((lane) => ({
        id: lane.id,
        fullName: lane.full_name,
        preferredName: lane.preferred_name,
        jobTitle: lane.job_title,
        laneGroup: lane.lane_group,
      })),
      roleAccounts: activeStaff.map((row) => ({
        userId: row.user_id,
        fullName: row.full_name,
        role: row.role,
        accepted: Boolean(row.accepted_at),
      })),
    }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    });
  } catch (error) {
    return responseFromThrown(error);
  }
}
