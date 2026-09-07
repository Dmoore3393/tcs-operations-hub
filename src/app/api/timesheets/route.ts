import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

export const runtime = "nodejs";

const COMMAND_TYPES = ["CCRC Stage 1", "CCRC Stage 2", "CCCC", "DCFS", "Respite"] as const;
const DEFAULT_FILE_NAME = "LastName_FirstName_ServiceMonth_Location.pdf";
const COLLECTOR_LABELS: Record<string, string> = {
  "33rd-street": "Nathaly Cornejo",
  "42nd-street": "Dynasty Lara",
  halcom: "Latrice",
  division: "Danielle",
  tehachapi: "Jennifer or Noah",
  "21st-street": "Heather",
};

type DbRow = Record<string, unknown>;

function asObject(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}
function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}
function asBool(value: unknown) {
  return value === true;
}
function actorFor(fullName: string, isOwner: boolean) {
  const name = (fullName || "TCS Staff").trim();
  const lower = name.toLowerCase();
  const isDynasty = /\bdynasty\b/.test(lower);
  const isDanielle = /\bdanielle\b/.test(lower);
  const isJennifer = /\bjennifer\b|\bjen\b/.test(lower);
  const isAnthony = /\banthony\b|\btony\b/.test(lower);
  let collectorSlug: string | null = null;
  if (/\bnathaly\b/.test(lower)) collectorSlug = "33rd-street";
  else if (isDynasty) collectorSlug = "42nd-street";
  else if (/\blatrice\b/.test(lower)) collectorSlug = "halcom";
  else if (isDanielle) collectorSlug = "division";
  else if (isJennifer || /\bnoah\b/.test(lower)) collectorSlug = "tehachapi";
  else if (/\bheather\b/.test(lower)) collectorSlug = "21st-street";
  return {
    name,
    collectorSlug,
    isOwner,
    isDynasty,
    isDanielle,
    isJennifer,
    isAnthony,
    canViewAll: isOwner || isDynasty || isDanielle || isJennifer || isAnthony,
  };
}
function normalizeType(value: unknown) {
  const source = asText(value).trim().toLowerCase();
  if (source.includes("ccrc") && source.includes("stage") && source.includes("1")) return "CCRC Stage 1";
  if (source.includes("ccrc") && source.includes("stage") && source.includes("2")) return "CCRC Stage 2";
  if (source === "ccrc1" || source === "ccrc 1") return "CCRC Stage 1";
  if (source === "ccrc2" || source === "ccrc 2") return "CCRC Stage 2";
  if (source === "cccc") return "CCCC";
  if (source === "dcfs") return "DCFS";
  if (source.includes("respite")) return "Respite";
  return "CCRC";
}
function signed(record: DbRow) {
  const prep = asObject(record.prep);
  return asBool(record.collectorSigned)
    || Boolean(asText(record.licenseeSubmittedAt))
    || (asBool(prep.parentSignature) && asBool(prep.providerSignature));
}
function stage(record: DbRow) {
  if (!signed(record)) return "Location Sign-Off";
  if (asText(record.dynastyStatus) !== "Accounted For") return "Dynasty Review";
  if (!(asText(record.dynastyHandedToJenniferAt) || asText(record.jenniferReceivedAt))) return "Personal Handoff";
  if (!asText(record.completedAt)) return "Jen + Danielle Fill Out";
  if (!asText(record.scannedAt) || !asText(record.sentToJenniferAt)) return "Scan & Send to Jennifer";
  if (!(asText(record.emailedAt) || asText(record.emailedByJenniferAt))) return "Jennifer Email";
  return "Complete";
}

export async function GET(request: Request) {
  try {
    const { admin, profile, isOwner } = await requireStaff(request);
    const actor = actorFor(profile.full_name, isOwner);
    if (!actor.canViewAll && !actor.collectorSlug) return new Response("This account is not assigned to the Timesheet Command Center.", { status: 403 });

    const locationResult = await admin
      .from("locations")
      .select("id,slug,name,full_name")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true);
    if (locationResult.error) throw locationResult.error;
    const locations = (locationResult.data ?? []) as unknown as DbRow[];
    const locationById = new Map<string, DbRow>();
    for (const location of locations) locationById.set(asText(location.id), location);

    const timesheetResult = await admin
      .from("timesheets")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("updated_at", { ascending: false });
    if (timesheetResult.error) throw timesheetResult.error;

    const records: DbRow[] = [];
    for (const row of (timesheetResult.data ?? []) as unknown as DbRow[]) {
      const location = locationById.get(asText(row.location_id));
      if (!location) continue;
      const slug = asText(location.slug);
      if (!actor.canViewAll && actor.collectorSlug !== slug) continue;
      const record = asObject(row.record_data);
      const type = normalizeType(record.timesheetType ?? record.fundingSource ?? row.funding_source);
      const handoffAt = asText(record.dynastyHandedToJenniferAt) || asText(record.jenniferReceivedAt);
      const emailedAt = asText(record.emailedAt) || asText(record.emailedByJenniferAt);
      records.push({
        id: asText(row.legacy_id),
        rowId: asText(row.id),
        childName: asText(row.child_name),
        familyName: asText(row.family_name) || asText(record.familyName),
        servicePeriod: asText(row.service_period),
        location: asText(location.full_name) || asText(location.name),
        locationSlug: slug,
        collector: COLLECTOR_LABELS[slug] || "Assigned staff",
        timesheetType: type,
        needsCcrcStage: type === "CCRC",
        stage: stage(record),
        collectorSigned: signed(record),
        collectorSignedAt: asText(record.collectorSignedAt) || asText(record.licenseeSubmittedAt),
        collectorSignedBy: asText(record.collectorSignedBy) || asText(record.licenseeInitials),
        collectorNotes: asText(record.collectorNotes),
        dynastyStatus: asText(record.dynastyStatus) || "Awaiting",
        dynastyReviewedAt: asText(record.dynastyReviewedAt),
        dynastyReviewedBy: asText(record.dynastyReviewedBy) || asText(record.dynastyInitials),
        dynastyHandoffDate: asText(record.dynastyHandoffDate) || handoffAt.slice(0, 10),
        dynastyHandedToJenniferAt: handoffAt,
        dynastyHandoffBy: asText(record.dynastyHandoffBy) || asText(record.batchReceivedBy),
        certificateVerified: asBool(record.certificateVerified),
        tuitionPolicyAcknowledged: asBool(record.tuitionPolicyAcknowledged),
        completedBy: asText(record.completedBy),
        completedAt: asText(record.completedAt),
        scanQualityChecked: asBool(record.scanQualityChecked),
        scannedBy: asText(record.scannedBy),
        scannedAt: asText(record.scannedAt),
        sentToJenniferAt: asText(record.sentToJenniferAt),
        department: asText(record.department),
        departmentEmail: asText(record.departmentEmail),
        attachmentConfirmed: asBool(record.attachmentConfirmed),
        emailedBy: asText(record.emailedBy),
        emailedAt,
        notes: asText(record.notes),
        updatedAt: asText(row.updated_at),
      });
    }

    const routeResult = await admin
      .from("timesheet_submission_routes")
      .select("funding_source,department,department_email,deadline,file_name_format,record_data")
      .eq("organization_id", profile.organization_id);
    if (routeResult.error) throw routeResult.error;
    const routes: Record<string, DbRow> = {};
    for (const type of COMMAND_TYPES) routes[type] = { department: "", email: "", deadline: "", fileNameFormat: DEFAULT_FILE_NAME };
    for (const row of (routeResult.data ?? []) as unknown as DbRow[]) {
      const record = asObject(row.record_data);
      const type = normalizeType(record.timesheetType ?? record.fundingSource ?? row.funding_source);
      if (!COMMAND_TYPES.some((item) => item === type)) continue;
      const next = {
        department: asText(row.department) || asText(record.department),
        email: asText(row.department_email) || asText(record.email),
        deadline: asText(row.deadline) || asText(record.deadline),
        fileNameFormat: asText(row.file_name_format) || asText(record.fileNameFormat) || DEFAULT_FILE_NAME,
      };
      if (!asText(routes[type].department) || next.department) routes[type] = next;
    }

    const collectors = locations
      .filter((location) => Boolean(COLLECTOR_LABELS[asText(location.slug)]))
      .filter((location) => actor.canViewAll || actor.collectorSlug === asText(location.slug))
      .map((location) => ({
        slug: asText(location.slug),
        location: asText(location.full_name) || asText(location.name),
        collector: COLLECTOR_LABELS[asText(location.slug)],
      }));

    return Response.json({
      records,
      routes,
      types: COMMAND_TYPES,
      collectors,
      actor: {
        name: actor.name,
        collectorSlug: actor.collectorSlug,
        canViewAll: actor.canViewAll,
        canCreateBatch: actor.isDanielle || actor.isJennifer || actor.isOwner,
        canDynastyReview: actor.isDynasty,
        canDynastyHandoff: actor.isDynasty,
        canFillOut: actor.isDanielle || actor.isJennifer,
        canScan: actor.isDanielle || actor.isAnthony,
        canEmail: actor.isJennifer,
        canManageRoutes: actor.isDanielle || actor.isJennifer || actor.isOwner,
      },
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireStaff(request);
    return Response.json({ ok: true });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
