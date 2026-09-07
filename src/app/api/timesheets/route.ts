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

type JsonObject = Record<string, any>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}
function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}
function asBool(value: unknown) {
  return value === true;
}
function deny(message: string, status = 403): never {
  throw new Response(message, { status });
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
    isOwner,
    isDynasty,
    isDanielle,
    isJennifer,
    isAnthony,
    collectorSlug,
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
function isFinalType(value: string) {
  return COMMAND_TYPES.some((type) => type === value);
}
function collectorSigned(data: JsonObject) {
  const prep = asObject(data.prep);
  return asBool(data.collectorSigned)
    || Boolean(asText(data.licenseeSubmittedAt))
    || (asBool(prep.parentSignature) && asBool(prep.providerSignature));
}
function deriveStage(data: JsonObject) {
  if (!collectorSigned(data)) return "Location Sign-Off";
  if (asText(data.dynastyStatus) !== "Accounted For") return "Dynasty Review";
  if (!(asText(data.dynastyHandedToJenniferAt) || asText(data.jenniferReceivedAt))) return "Personal Handoff";
  if (!asText(data.completedAt)) return "Jen + Danielle Fill Out";
  if (!asText(data.scannedAt) || !asText(data.sentToJenniferAt)) return "Scan & Send to Jennifer";
  if (!(asText(data.emailedAt) || asText(data.emailedByJenniferAt))) return "Jennifer Email";
  return "Complete";
}

async function getLocations(admin: any, organizationId: string) {
  const { data, error } = await admin
    .from("locations")
    .select("id,slug,name,full_name")
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []) as JsonObject[];
}
function locationMap(locations: JsonObject[]) {
  return new Map(locations.map((location) => [String(location.id), location]));
}
function canView(actor: ReturnType<typeof actorFor>, slug: string) {
  return actor.canViewAll || actor.collectorSlug === slug;
}

function normalizeRecord(row: JsonObject, location: JsonObject) {
  const record = asObject(row.record_data);
  const type = normalizeType(record.timesheetType ?? record.fundingSource ?? row.funding_source);
  const handoffAt = asText(record.dynastyHandedToJenniferAt) || asText(record.jenniferReceivedAt);
  const emailedAt = asText(record.emailedAt) || asText(record.emailedByJenniferAt);
  return {
    id: String(row.legacy_id),
    rowId: String(row.id),
    childName: asText(row.child_name),
    familyName: asText(row.family_name) || asText(record.familyName),
    servicePeriod: asText(row.service_period),
    location: asText(location.full_name) || asText(location.name),
    locationSlug: asText(location.slug),
    collector: COLLECTOR_LABELS[asText(location.slug)] || "Assigned staff",
    timesheetType: type,
    needsCcrcStage: type === "CCRC",
    stage: deriveStage(record),
    collectorSigned: collectorSigned(record),
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
  };
}

async function getTimesheet(admin: any, organizationId: string, legacyId: string) {
  const { data, error } = await admin
    .from("timesheets")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("legacy_id", legacyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) deny("Timesheet not found.", 404);
  return data as JsonObject;
}

async function saveTimesheet(admin: any, userId: string, row: JsonObject, patch: JsonObject, auditAction: string) {
  const merged = { ...asObject(row.record_data), ...patch, updatedAt: new Date().toISOString() };
  const type = normalizeType(merged.timesheetType ?? merged.fundingSource ?? row.funding_source);
  const stage = deriveStage(merged);
  merged.timesheetType = type;
  merged.fundingSource = type;
  merged.stage = stage;

  const { data, error } = await admin
    .from("timesheets")
    .update({
      workflow_stage: stage,
      funding_source: type,
      record_data: merged,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("The saved timesheet was not returned by the database.");

  const { error: auditError } = await admin.from("audit_log").insert({
    organization_id: row.organization_id,
    location_id: row.location_id,
    actor_user_id: userId,
    action: "REVIEW",
    table_name: "timesheets",
    row_id: row.id,
    metadata: { command_action: auditAction, stage },
  });
  if (auditError) throw auditError;
}

async function getRoutes(admin: any, organizationId: string) {
  const routes: Record<string, JsonObject> = {};
  for (const type of COMMAND_TYPES) {
    routes[type] = { department: "", email: "", deadline: "", fileNameFormat: DEFAULT_FILE_NAME };
  }
  const { data, error } = await admin
    .from("timesheet_submission_routes")
    .select("*")
    .eq("organization_id", organizationId);
  if (error) throw error;

  for (const row of (data ?? []) as JsonObject[]) {
    const record = asObject(row.record_data);
    const type = normalizeType(record.timesheetType ?? record.fundingSource ?? row.funding_source);
    if (!isFinalType(type)) continue;
    const next = {
      department: asText(row.department) || asText(record.department),
      email: asText(row.department_email) || asText(record.email),
      deadline: asText(row.deadline) || asText(record.deadline),
      fileNameFormat: asText(row.file_name_format) || asText(record.fileNameFormat) || DEFAULT_FILE_NAME,
    };
    if (!routes[type].department || next.department) routes[type] = next;
  }
  return routes;
}

export async function GET(request: Request) {
  try {
    const { admin, profile, isOwner } = await requireStaff(request);
    const actor = actorFor(profile.full_name, isOwner);
    if (!actor.canViewAll && !actor.collectorSlug) deny("This account is not assigned to the Timesheet Command Center.");

    const locations = await getLocations(admin, profile.organization_id);
    const byId = locationMap(locations);
    const { data, error } = await admin
      .from("timesheets")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("updated_at", { ascending: false });
    if (error) throw error;

    const records = ((data ?? []) as JsonObject[]).flatMap((row) => {
      const location = byId.get(String(row.location_id));
      if (!location || !canView(actor, asText(location.slug))) return [];
      return [normalizeRecord(row, location)];
    });
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
      routes: await getRoutes(admin, profile.organization_id),
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
    if (!actor.canViewAll && !actor.collectorSlug) deny("This account is not assigned to the Timesheet Command Center.");

    const body = asObject(await request.json().catch(() => ({})));
    const action = asText(body.action);
    const locations = await getLocations(admin, profile.organization_id);
    const byId = locationMap(locations);

    if (action === "createBatch") {
      if (!(actor.isDanielle || actor.isJennifer || actor.isOwner)) deny("Only Danielle or Jennifer can create the monthly timesheet batch.");
      const servicePeriod = asText(body.servicePeriod).trim();
      if (!servicePeriod) deny("Choose a service period first.", 400);

      const existingResult = await admin
        .from("timesheets")
        .select("child_id")
        .eq("organization_id", profile.organization_id)
        .eq("service_period", servicePeriod);
      if (existingResult.error) throw existingResult.error;
      const existingIds = new Set(((existingResult.data ?? []) as JsonObject[]).map((item) => asText(item.child_id)).filter(Boolean));

      const childResult = await admin
        .from("children")
        .select("id,legacy_id,location_id,first_name,last_name,enrollment_status,record_data")
        .eq("organization_id", profile.organization_id)
        .eq("enrollment_status", "Active");
      if (childResult.error) throw childResult.error;

      const rows: JsonObject[] = [];
      for (const child of (childResult.data ?? []) as JsonObject[]) {
        if (existingIds.has(asText(child.id))) continue;
        const subsidy = asText(asObject(child.record_data).subsidy).trim();
        const lower = subsidy.toLowerCase();
        if (!subsidy || lower.includes("private") || lower.includes("cash")) continue;
        let type = "";
        if (lower.includes("dcfs")) type = "DCFS";
        else if (lower.includes("cccc")) type = "CCCC";
        else if (lower.includes("respite")) type = "Respite";
        else if (lower.includes("ccrc")) type = "CCRC";
        if (!type) continue;
        const location = byId.get(asText(child.location_id));
        if (!location) continue;
        const legacyId = `ts-${servicePeriod.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${asText(child.legacy_id)}`;
        const childName = `${asText(child.first_name)} ${asText(child.last_name)}`.trim();
        const recordData = {
          id: legacyId,
          childName,
          familyName: `${asText(child.last_name)} Family`,
          servicePeriod,
          location: asText(location.full_name) || asText(location.name),
          timesheetType: type,
          fundingSource: type,
          stage: "Location Sign-Off",
          collectorSigned: false,
          dynastyStatus: "Awaiting",
          certificateVerified: false,
          tuitionPolicyAcknowledged: false,
          scanQualityChecked: false,
          attachmentConfirmed: false,
        };
        rows.push({
          organization_id: profile.organization_id,
          location_id: child.location_id,
          child_id: child.id,
          legacy_id: legacyId,
          child_name: childName,
          family_name: `${asText(child.last_name)} Family`,
          service_period: servicePeriod,
          funding_source: type,
          workflow_stage: "Location Sign-Off",
          record_data: recordData,
          created_by: user.id,
          updated_by: user.id,
        });
      }
      if (rows.length) {
        const result = await admin.from("timesheets").upsert(rows, { onConflict: "organization_id,legacy_id" });
        if (result.error) throw result.error;
      }
      return Response.json({ ok: true, created: rows.length });
    }

    if (action === "saveRoute") {
      if (!(actor.isDanielle || actor.isJennifer || actor.isOwner)) deny("Only Danielle or Jennifer can change department routing.");
      const type = normalizeType(body.timesheetType);
      if (!isFinalType(type)) deny("Choose one of the five timesheet types.", 400);
      const department = asText(body.department).trim();
      const email = asText(body.email).trim();
      const deadline = asText(body.deadline).trim();
      const fileNameFormat = asText(body.fileNameFormat).trim() || DEFAULT_FILE_NAME;
      const slugKey = type.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const rows = locations.map((location) => ({
        organization_id: profile.organization_id,
        location_id: location.id,
        legacy_id: `command-route:${asText(location.slug)}:${slugKey}`,
        funding_source: type,
        department,
        department_email: email,
        deadline,
        file_name_format: fileNameFormat,
        record_data: {
          id: `command-route:${asText(location.slug)}:${slugKey}`,
          location: asText(location.full_name) || asText(location.name),
          fundingSource: type,
          timesheetType: type,
          department,
          email,
          deadline,
          fileNameFormat,
        },
        created_by: user.id,
        updated_by: user.id,
      }));
      const result = await admin.from("timesheet_submission_routes").upsert(rows, { onConflict: "organization_id,legacy_id" });
      if (result.error) throw result.error;
      return Response.json({ ok: true });
    }

    const id = asText(body.id);
    if (!id) deny("A timesheet record is required.", 400);
    const row = await getTimesheet(admin, profile.organization_id, id);
    const location = byId.get(asText(row.location_id));
    if (!location || !canView(actor, asText(location.slug))) deny("You cannot access this timesheet.");
    const current = asObject(row.record_data);

    if (action === "setType") {
      if (!(actor.collectorSlug === asText(location.slug) || actor.isDynasty || actor.isDanielle || actor.isJennifer)) deny("You cannot classify this timesheet.");
      const type = normalizeType(body.timesheetType);
      if (!isFinalType(type)) deny("Choose CCRC Stage 1, CCRC Stage 2, CCCC, DCFS, or Respite.", 400);
      await saveTimesheet(admin, user.id, row, { timesheetType: type, fundingSource: type }, "SET_TYPE");
      return Response.json({ ok: true });
    }

    if (action === "markSigned") {
      if (actor.collectorSlug !== asText(location.slug)) deny(`Only ${COLLECTOR_LABELS[asText(location.slug)] || "the assigned collector"} can check off signed forms for this location.`);
      const signed = asBool(body.signed);
      const now = new Date().toISOString();
      const patch = signed ? {
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
      await saveTimesheet(admin, user.id, row, patch, signed ? "FORM_SIGNED" : "SIGNATURE_UNCHECKED");
      return Response.json({ ok: true });
    }

    if (action === "dynastyReview") {
      if (!actor.isDynasty) deny("Dynasty is the required reviewer for all timesheets.");
      const status = asText(body.status);
      if (status !== "Accounted For" && status !== "Needs Correction") deny("Choose Accounted For or Needs Correction.", 400);
      if (status === "Accounted For" && !collectorSigned(current)) deny("The location must check off the child's signed form first.", 400);
      const now = new Date().toISOString();
      const patch = status === "Accounted For" ? {
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
      };
      await saveTimesheet(admin, user.id, row, patch, status === "Accounted For" ? "DYNASTY_ACCOUNTED" : "DYNASTY_CORRECTION");
      return Response.json({ ok: true });
    }

    if (action === "dynastyHandoff") {
      if (!actor.isDynasty) deny("Dynasty must personally hand the timesheets to Jennifer.");
      if (asText(current.dynastyStatus) !== "Accounted For") deny("Dynasty must first confirm the timesheet is accounted for and signed.", 400);
      const handoffDate = asText(body.handoffDate) || new Date().toISOString().slice(0, 10);
      const now = new Date().toISOString();
      await saveTimesheet(admin, user.id, row, {
        dynastyHandoffDate: handoffDate,
        dynastyHandedToJenniferAt: now,
        dynastyHandoffBy: actor.name,
        jenniferReceivedAt: now,
        batchReceivedBy: "Jennifer",
      }, "PERSONAL_HANDOFF_TO_JENNIFER");
      return Response.json({ ok: true });
    }

    if (action === "fillOut") {
      if (!(actor.isDanielle || actor.isJennifer)) deny("Only Jennifer or Danielle can fill out timesheets from the child's certificate.");
      if (!(asText(current.dynastyHandedToJenniferAt) || asText(current.jenniferReceivedAt))) deny("Dynasty's personal handoff to Jennifer must be recorded first.", 400);
      if (!asBool(body.certificateVerified) || !asBool(body.tuitionPolicyAcknowledged)) deny("Verify the child certificate and acknowledge tuition is charged regardless of attendance.", 400);
      await saveTimesheet(admin, user.id, row, {
        certificateVerified: true,
        tuitionPolicyAcknowledged: true,
        completedBy: actor.name,
        completedAt: new Date().toISOString(),
      }, "TIMESHEET_FILLED_FROM_CERTIFICATE");
      return Response.json({ ok: true });
    }

    if (action === "scan") {
      if (!(actor.isDanielle || actor.isAnthony)) deny("Only Danielle or Anthony can scan completed timesheets and send them to Jennifer.");
      if (!asText(current.completedAt)) deny("Jennifer or Danielle must fill out this timesheet first.", 400);
      if (!asBool(body.scanQualityChecked)) deny("Confirm the scan is readable and complete.", 400);
      const now = new Date().toISOString();
      await saveTimesheet(admin, user.id, row, {
        scanQualityChecked: true,
        scannedBy: actor.name,
        scannedAt: now,
        sentToJenniferAt: now,
      }, "SCANNED_AND_SENT_TO_JENNIFER");
      return Response.json({ ok: true });
    }

    if (action === "email") {
      if (!actor.isJennifer) deny("Jennifer is the final sender for department email submission.");
      if (!asText(current.sentToJenniferAt)) deny("The completed timesheet must be scanned and sent to Jennifer first.", 400);
      const type = normalizeType(current.timesheetType ?? current.fundingSource ?? row.funding_source);
      if (!isFinalType(type)) deny("Choose CCRC Stage 1 or CCRC Stage 2 before final submission.", 400);
      const routes = await getRoutes(admin, profile.organization_id);
      const route = routes[type];
      if (!route.department || !route.email) deny(`Department routing for ${type} is not configured yet.`, 400);
      const now = new Date().toISOString();
      await saveTimesheet(admin, user.id, row, {
        department: route.department,
        departmentEmail: route.email,
        attachmentConfirmed: true,
        emailedBy: actor.name,
        emailedAt: now,
        emailedByJenniferAt: now,
      }, "EMAILED_TO_DEPARTMENT");
      return Response.json({ ok: true });
    }

    deny("Unknown Timesheet Command Center action.", 400);
  } catch (error) {
    return staffErrorResponse(error);
  }
}
