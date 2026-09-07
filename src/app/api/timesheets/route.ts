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

async function liveLocations(admin: Awaited<ReturnType<typeof requireStaff>>["admin"], organizationId: string) {
  const result = await admin
    .from("locations")
    .select("id,slug,name,full_name")
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  if (result.error) throw result.error;
  return (result.data ?? []) as unknown as DbRow[];
}

async function liveRoutes(admin: Awaited<ReturnType<typeof requireStaff>>["admin"], organizationId: string) {
  const result = await admin
    .from("timesheet_submission_routes")
    .select("funding_source,department,department_email,deadline,file_name_format,record_data")
    .eq("organization_id", organizationId);
  if (result.error) throw result.error;
  const routes: Record<string, DbRow> = {};
  for (const type of COMMAND_TYPES) routes[type] = { department: "", email: "", deadline: "", fileNameFormat: DEFAULT_FILE_NAME };
  for (const row of (result.data ?? []) as unknown as DbRow[]) {
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
  return routes;
}

export async function GET(request: Request) {
  try {
    const { admin, profile, isOwner } = await requireStaff(request);
    const actor = actorFor(profile.full_name, isOwner);
    if (!actor.canViewAll && !actor.collectorSlug) return new Response("This account is not assigned to the Timesheet Command Center.", { status: 403 });

    const locations = await liveLocations(admin, profile.organization_id);
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
      routes: await liveRoutes(admin, profile.organization_id),
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
    const { admin, profile, user, isOwner } = await requireStaff(request);
    const actor = actorFor(profile.full_name, isOwner);
    if (!actor.canViewAll && !actor.collectorSlug) return new Response("This account is not assigned to the Timesheet Command Center.", { status: 403 });

    const body = asObject(await request.json().catch(() => ({})));
    const action = asText(body.action);
    if (action === "createBatch" || action === "saveRoute") {
      return Response.json({ error: "This setup action is still being enabled." }, { status: 503 });
    }

    const id = asText(body.id);
    if (!id) return Response.json({ error: "A timesheet record is required." }, { status: 400 });
    const rowResult = await admin
      .from("timesheets")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .eq("legacy_id", id)
      .maybeSingle();
    if (rowResult.error) throw rowResult.error;
    if (!rowResult.data) return Response.json({ error: "Timesheet not found." }, { status: 404 });
    const row = rowResult.data as unknown as DbRow;

    const locations = await liveLocations(admin, profile.organization_id);
    const location = locations.find((item) => asText(item.id) === asText(row.location_id));
    if (!location) return Response.json({ error: "Timesheet location not found." }, { status: 404 });
    const slug = asText(location.slug);
    if (!actor.canViewAll && actor.collectorSlug !== slug) return Response.json({ error: "You cannot access this timesheet." }, { status: 403 });
    const current = asObject(row.record_data);

    async function save(patch: DbRow, auditAction: string) {
      const merged: DbRow = { ...current, ...patch, updatedAt: new Date().toISOString() };
      const type = normalizeType(merged.timesheetType ?? merged.fundingSource ?? row.funding_source);
      merged.timesheetType = type;
      merged.fundingSource = type;
      merged.stage = stage(merged);
      const updateResult = await admin
        .from("timesheets")
        .update({
          workflow_stage: asText(merged.stage),
          funding_source: type,
          record_data: merged,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (updateResult.error) throw updateResult.error;
      const auditResult = await admin.from("audit_log").insert({
        organization_id: profile.organization_id,
        location_id: row.location_id,
        actor_user_id: user.id,
        action: "REVIEW",
        table_name: "timesheets",
        row_id: row.id,
        metadata: { command_action: auditAction, stage: asText(merged.stage) },
      });
      if (auditResult.error) throw auditResult.error;
    }

    if (action === "setType") {
      if (!(actor.collectorSlug === slug || actor.isDynasty || actor.isDanielle || actor.isJennifer)) return Response.json({ error: "You cannot classify this timesheet." }, { status: 403 });
      const type = normalizeType(body.timesheetType);
      if (!COMMAND_TYPES.some((item) => item === type)) return Response.json({ error: "Choose CCRC Stage 1, CCRC Stage 2, CCCC, DCFS, or Respite." }, { status: 400 });
      await save({ timesheetType: type, fundingSource: type }, "SET_TYPE");
      return Response.json({ ok: true });
    }

    if (action === "markSigned") {
      if (actor.collectorSlug !== slug) return Response.json({ error: `Only ${COLLECTOR_LABELS[slug] || "the assigned collector"} can check off signed forms for this location.` }, { status: 403 });
      const checked = asBool(body.signed);
      const now = new Date().toISOString();
      const patch: DbRow = checked ? {
        collectorSigned: true,
        collectorSignedAt: now,
        collectorSignedBy: actor.name,
        licenseeSubmittedAt: now,
        licenseeInitials: actor.name,
        dynastyStatus: "Awaiting",
      } : {
        collectorSigned: false,
        collectorSignedAt: "",
        collectorSignedBy: "",
        licenseeSubmittedAt: "",
        licenseeInitials: "",
        dynastyStatus: "Awaiting",
        dynastyReviewedAt: "",
        dynastyReviewedBy: "",
        dynastyHandedToJenniferAt: "",
        dynastyHandoffDate: "",
        dynastyHandoffBy: "",
        jenniferReceivedAt: "",
        completedBy: "",
        completedAt: "",
        scannedBy: "",
        scannedAt: "",
        sentToJenniferAt: "",
        emailedBy: "",
        emailedAt: "",
        emailedByJenniferAt: "",
      };
      await save(patch, checked ? "FORM_SIGNED" : "SIGNATURE_UNCHECKED");
      return Response.json({ ok: true });
    }

    if (action === "dynastyReview") {
      if (!actor.isDynasty) return Response.json({ error: "Dynasty is the required reviewer for all timesheets." }, { status: 403 });
      const status = asText(body.status);
      if (status !== "Accounted For" && status !== "Needs Correction") return Response.json({ error: "Choose Accounted For or Needs Correction." }, { status: 400 });
      if (status === "Accounted For" && !signed(current)) return Response.json({ error: "The location must check off the child's signed form first." }, { status: 400 });
      const now = new Date().toISOString();
      await save(status === "Accounted For" ? {
        dynastyStatus: status,
        dynastyReviewedAt: now,
        dynastyReviewedBy: actor.name,
        dynastyInitials: actor.name,
      } : {
        dynastyStatus: status,
        dynastyReviewedAt: now,
        dynastyReviewedBy: actor.name,
        dynastyInitials: actor.name,
        collectorSigned: false,
        collectorSignedAt: "",
        collectorSignedBy: "",
        licenseeSubmittedAt: "",
        licenseeInitials: "",
        dynastyHandedToJenniferAt: "",
        dynastyHandoffDate: "",
        dynastyHandoffBy: "",
      }, status === "Accounted For" ? "DYNASTY_ACCOUNTED" : "DYNASTY_CORRECTION");
      return Response.json({ ok: true });
    }

    if (action === "dynastyHandoff") {
      if (!actor.isDynasty) return Response.json({ error: "Dynasty must personally hand the timesheets to Jennifer." }, { status: 403 });
      if (asText(current.dynastyStatus) !== "Accounted For") return Response.json({ error: "Dynasty must first confirm the timesheet is accounted for and signed." }, { status: 400 });
      const now = new Date().toISOString();
      await save({
        dynastyHandoffDate: asText(body.handoffDate) || now.slice(0, 10),
        dynastyHandedToJenniferAt: now,
        dynastyHandoffBy: actor.name,
        jenniferReceivedAt: now,
        batchReceivedBy: "Jennifer",
      }, "PERSONAL_HANDOFF_TO_JENNIFER");
      return Response.json({ ok: true });
    }

    if (action === "fillOut") {
      if (!(actor.isDanielle || actor.isJennifer)) return Response.json({ error: "Only Jennifer or Danielle can fill out timesheets from the child's certificate." }, { status: 403 });
      if (!(asText(current.dynastyHandedToJenniferAt) || asText(current.jenniferReceivedAt))) return Response.json({ error: "Dynasty's personal handoff to Jennifer must be recorded first." }, { status: 400 });
      if (!asBool(body.certificateVerified) || !asBool(body.tuitionPolicyAcknowledged)) return Response.json({ error: "Verify the child certificate and acknowledge tuition is charged regardless of attendance." }, { status: 400 });
      await save({ certificateVerified: true, tuitionPolicyAcknowledged: true, completedBy: actor.name, completedAt: new Date().toISOString() }, "TIMESHEET_FILLED_FROM_CERTIFICATE");
      return Response.json({ ok: true });
    }

    if (action === "scan") {
      if (!(actor.isDanielle || actor.isAnthony)) return Response.json({ error: "Only Danielle or Anthony can scan completed timesheets and send them to Jennifer." }, { status: 403 });
      if (!asText(current.completedAt)) return Response.json({ error: "Jennifer or Danielle must fill out this timesheet first." }, { status: 400 });
      if (!asBool(body.scanQualityChecked)) return Response.json({ error: "Confirm the scan is readable and complete." }, { status: 400 });
      const now = new Date().toISOString();
      await save({ scanQualityChecked: true, scannedBy: actor.name, scannedAt: now, sentToJenniferAt: now }, "SCANNED_AND_SENT_TO_JENNIFER");
      return Response.json({ ok: true });
    }

    if (action === "email") {
      if (!actor.isJennifer) return Response.json({ error: "Jennifer is the final sender for department email submission." }, { status: 403 });
      if (!asText(current.sentToJenniferAt)) return Response.json({ error: "The completed timesheet must be scanned and sent to Jennifer first." }, { status: 400 });
      const type = normalizeType(current.timesheetType ?? current.fundingSource ?? row.funding_source);
      if (!COMMAND_TYPES.some((item) => item === type)) return Response.json({ error: "Choose CCRC Stage 1 or CCRC Stage 2 before final submission." }, { status: 400 });
      const routes = await liveRoutes(admin, profile.organization_id);
      const route = routes[type];
      if (!route || !asText(route.department) || !asText(route.email)) return Response.json({ error: `Department routing for ${type} is not configured yet.` }, { status: 400 });
      const now = new Date().toISOString();
      await save({
        department: asText(route.department),
        departmentEmail: asText(route.email),
        attachmentConfirmed: true,
        emailedBy: actor.name,
        emailedAt: now,
        emailedByJenniferAt: now,
      }, "EMAILED_TO_DEPARTMENT");
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown Timesheet Command Center action." }, { status: 400 });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
