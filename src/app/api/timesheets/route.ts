import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

export const runtime = "nodejs";

const COMMAND_TYPES = ["CCRC Stage 1", "CCRC Stage 2", "CCCC", "DCFS", "Respite"] as const;
type CommandType = (typeof COMMAND_TYPES)[number];
type CommandTypeValue = CommandType | "CCRC";

type LocationRow = { id: string; slug: string; name: string; full_name: string };
type TimesheetRow = {
  id: string;
  organization_id: string;
  location_id: string;
  child_id: string | null;
  legacy_id: string;
  child_name: string;
  family_name: string | null;
  service_period: string;
  funding_source: string;
  workflow_stage: string;
  record_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type RouteRow = {
  id: string;
  organization_id: string;
  location_id: string;
  legacy_id: string;
  funding_source: string;
  department: string | null;
  department_email: string | null;
  deadline: string | null;
  file_name_format: string | null;
  record_data: Record<string, unknown> | null;
};

type Actor = {
  name: string;
  lowerName: string;
  isOwner: boolean;
  collectorSlug: string | null;
  isDynasty: boolean;
  isDanielle: boolean;
  isJennifer: boolean;
  isAnthony: boolean;
  canViewAll: boolean;
};

const COLLECTOR_LABELS: Record<string, string> = {
  "33rd-street": "Nathaly Cornejo",
  "42nd-street": "Dynasty Lara",
  halcom: "Latrice",
  division: "Danielle",
  tehachapi: "Jennifer or Noah",
  "21st-street": "Heather",
};

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function bool(value: unknown) {
  return value === true;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function actorFor(profile: { full_name: string; role: string }, isOwner: boolean): Actor {
  const lowerName = (profile.full_name || "").trim().toLowerCase();
  const isDynasty = /\bdynasty\b/.test(lowerName);
  const isDanielle = /\bdanielle\b/.test(lowerName);
  const isJennifer = /\bjennifer\b|\bjen\b/.test(lowerName);
  const isAnthony = /\banthony\b|\btony\b/.test(lowerName);
  let collectorSlug: string | null = null;
  if (/\bnathaly\b/.test(lowerName)) collectorSlug = "33rd-street";
  else if (isDynasty) collectorSlug = "42nd-street";
  else if (/\blatrice\b/.test(lowerName)) collectorSlug = "halcom";
  else if (isDanielle) collectorSlug = "division";
  else if (isJennifer || /\bnoah\b/.test(lowerName)) collectorSlug = "tehachapi";
  else if (/\bheather\b/.test(lowerName)) collectorSlug = "21st-street";

  return {
    name: profile.full_name || "TCS Staff",
    lowerName,
    isOwner,
    collectorSlug,
    isDynasty,
    isDanielle,
    isJennifer,
    isAnthony,
    canViewAll: isOwner || isDynasty || isDanielle || isJennifer || isAnthony,
  };
}

function normalizeType(value: unknown): CommandTypeValue {
  const source = text(value).trim().toLowerCase();
  if (source.includes("ccrc") && source.includes("stage") && source.includes("1")) return "CCRC Stage 1";
  if (source.includes("ccrc") && source.includes("stage") && source.includes("2")) return "CCRC Stage 2";
  if (source === "ccrc 1" || source === "ccrc1") return "CCRC Stage 1";
  if (source === "ccrc 2" || source === "ccrc2") return "CCRC Stage 2";
  if (source === "cccc") return "CCCC";
  if (source === "dcfs") return "DCFS";
  if (source.includes("respite")) return "Respite";
  return "CCRC";
}

function isFinalType(value: CommandTypeValue): value is CommandType {
  return (COMMAND_TYPES as readonly string[]).includes(value);
}

function deriveStage(data: Record<string, unknown>, row?: TimesheetRow) {
  const prep = object(data.prep);
  const collectorSigned = bool(data.collectorSigned)
    || Boolean(text(data.licenseeSubmittedAt))
    || (bool(prep.parentSignature) && bool(prep.providerSignature));
  const dynastyStatus = text(data.dynastyStatus);
  const handoff = text(data.dynastyHandedToJenniferAt) || text(data.jenniferReceivedAt);
  const completed = text(data.completedAt);
  const scanned = text(data.scannedAt);
  const sentToJen = text(data.sentToJenniferAt);
  const emailed = text(data.emailedAt) || text(data.emailedByJenniferAt);

  if (!collectorSigned) return "Location Sign-Off";
  if (dynastyStatus !== "Accounted For") return "Dynasty Review";
  if (!handoff) return "Personal Handoff";
  if (!completed) return "Jen + Danielle Fill Out";
  if (!scanned || !sentToJen) return "Scan & Send to Jennifer";
  if (!emailed) return "Jennifer Email";
  return "Complete";
}

function normalizeRecord(row: TimesheetRow, location: LocationRow) {
  const data = object(row.record_data);
  const prep = object(data.prep);
  const timesheetType = normalizeType(data.timesheetType ?? data.fundingSource ?? row.funding_source);
  const collectorSigned = bool(data.collectorSigned)
    || Boolean(text(data.licenseeSubmittedAt))
    || (bool(prep.parentSignature) && bool(prep.providerSignature));
  const emailedAt = text(data.emailedAt) || text(data.emailedByJenniferAt);
  const handoffAt = text(data.dynastyHandedToJenniferAt) || text(data.jenniferReceivedAt);
  const handoffDate = text(data.dynastyHandoffDate) || handoffAt.slice(0, 10);

  return {
    id: row.legacy_id,
    rowId: row.id,
    childName: row.child_name,
    familyName: row.family_name ?? text(data.familyName),
    servicePeriod: row.service_period,
    location: location.full_name || location.name,
    locationSlug: location.slug,
    collector: COLLECTOR_LABELS[location.slug] ?? "Assigned staff",
    timesheetType,
    needsCcrcStage: timesheetType === "CCRC",
    stage: deriveStage(data, row),
    collectorSigned,
    collectorSignedAt: text(data.collectorSignedAt) || text(data.licenseeSubmittedAt),
    collectorSignedBy: text(data.collectorSignedBy) || text(data.licenseeInitials),
    collectorNotes: text(data.collectorNotes),
    dynastyStatus: text(data.dynastyStatus) || "Awaiting",
    dynastyReviewedAt: text(data.dynastyReviewedAt),
    dynastyReviewedBy: text(data.dynastyReviewedBy) || text(data.dynastyInitials),
    dynastyHandoffDate: handoffDate,
    dynastyHandedToJenniferAt: handoffAt,
    dynastyHandoffBy: text(data.dynastyHandoffBy) || text(data.batchReceivedBy),
    certificateVerified: bool(data.certificateVerified),
    tuitionPolicyAcknowledged: bool(data.tuitionPolicyAcknowledged),
    completedBy: text(data.completedBy),
    completedAt: text(data.completedAt),
    scanQualityChecked: bool(data.scanQualityChecked),
    scannedBy: text(data.scannedBy),
    scannedAt: text(data.scannedAt),
    sentToJenniferAt: text(data.sentToJenniferAt),
    department: text(data.department),
    departmentEmail: text(data.departmentEmail),
    attachmentConfirmed: bool(data.attachmentConfirmed),
    emailedBy: text(data.emailedBy),
    emailedAt,
    notes: text(data.notes),
    updatedAt: row.updated_at,
  };
}

function canViewLocation(actor: Actor, slug: string) {
  return actor.canViewAll || actor.collectorSlug === slug;
}

function deny(message: string, status = 403): never {
  throw new Response(message, { status });
}

async function loadLocations(admin: Awaited<ReturnType<typeof requireStaff>>["admin"], organizationId: string) {
  const { data, error } = await admin
    .from("locations")
    .select("id,slug,name,full_name")
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []) as LocationRow[];
}

async function loadRecord(
  admin: Awaited<ReturnType<typeof requireStaff>>["admin"],
  organizationId: string,
  legacyId: string,
) {
  const { data, error } = await admin
    .from("timesheets")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("legacy_id", legacyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) deny("Timesheet not found.", 404);
  return data as TimesheetRow;
}

async function writeRecord(
  admin: Awaited<ReturnType<typeof requireStaff>>["admin"],
  userId: string,
  row: TimesheetRow,
  patch: Record<string, unknown>,
  action: string,
) {
  const merged = { ...object(row.record_data), ...patch, updatedAt: new Date().toISOString() };
  const stage = deriveStage(merged, row);
  const type = normalizeType(merged.timesheetType ?? merged.fundingSource ?? row.funding_source);
  merged.stage = stage;
  merged.timesheetType = type;
  merged.fundingSource = type;

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
  if (!data) throw new Error("The timesheet update did not return a saved record.");

  await admin.from("audit_log").insert({
    organization_id: row.organization_id,
    location_id: row.location_id,
    actor_user_id: userId,
    action: "REVIEW",
    table_name: "timesheets",
    row_id: row.id,
    metadata: { command_action: action, stage },
  });

  return data as TimesheetRow;
}

async function routeMap(
  admin: Awaited<ReturnType<typeof requireStaff>>["admin"],
  organizationId: string,
) {
  const { data, error } = await admin
    .from("timesheet_submission_routes")
    .select("*")
    .eq("organization_id", organizationId);
  if (error) throw error;
  const rows = (data ?? []) as RouteRow[];
  const result: Record<string, { department: string; email: string; deadline: string; fileNameFormat: string }> = {};
  for (const row of rows) {
    const raw = object(row.record_data);
    const type = normalizeType(raw.timesheetType ?? raw.fundingSource ?? row.funding_source);
    if (!isFinalType(type)) continue;
    const next = {
      department: row.department ?? text(raw.department),
      email: row.department_email ?? text(raw.email),
      deadline: row.deadline ?? text(raw.deadline),
      fileNameFormat: row.file_name_format ?? text(raw.fileNameFormat) || "LastName_FirstName_ServiceMonth_Location.pdf",
    };
    if (!result[type] || (!result[type].department && next.department)) result[type] = next;
  }
  for (const type of COMMAND_TYPES) {
    result[type] ??= { department: "", email: "", deadline: "", fileNameFormat: "LastName_FirstName_ServiceMonth_Location.pdf" };
  }
  return result;
}

export async function GET(request: Request) {
  try {
    const { admin, profile, isOwner } = await requireStaff(request);
    const actor = actorFor(profile, isOwner);
    if (!actor.canViewAll && !actor.collectorSlug) deny("This account is not assigned to the Timesheet Command Center.");

    const locations = await loadLocations(admin, profile.organization_id);
    const locationById = new Map(locations.map((item) => [item.id, item]));
    const { data, error } = await admin
      .from("timesheets")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("updated_at", { ascending: false });
    if (error) throw error;

    const records = ((data ?? []) as TimesheetRow[])
      .map((row) => {
        const location = locationById.get(row.location_id);
        return location && canViewLocation(actor, location.slug) ? normalizeRecord(row, location) : null;
      })
      .filter(Boolean);

    const routes = await routeMap(admin, profile.organization_id);
    const collectorCards = locations
      .filter((location) => COLLECTOR_LABELS[location.slug])
      .filter((location) => actor.canViewAll || actor.collectorSlug === location.slug)
      .map((location) => ({ slug: location.slug, location: location.full_name || location.name, collector: COLLECTOR_LABELS[location.slug] }));

    return Response.json({
      records,
      routes,
      types: COMMAND_TYPES,
      collectors: collectorCards,
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
    const actor = actorFor(profile, isOwner);
    if (!actor.canViewAll && !actor.collectorSlug) deny("This account is not assigned to the Timesheet Command Center.");
    const body = object(await request.json().catch(() => ({})));
    const action = text(body.action);
    const locations = await loadLocations(admin, profile.organization_id);
    const locationById = new Map(locations.map((item) => [item.id, item]));

    if (action === "createBatch") {
      if (!(actor.isDanielle || actor.isJennifer || actor.isOwner)) deny("Only Danielle or Jennifer can create the monthly timesheet batch.");
      const servicePeriod = text(body.servicePeriod).trim();
      if (!servicePeriod) deny("Choose a service period before creating the batch.", 400);

      const { data: existing, error: existingError } = await admin
        .from("timesheets")
        .select("child_id,legacy_id")
        .eq("organization_id", profile.organization_id)
        .eq("service_period", servicePeriod);
      if (existingError) throw existingError;
      const existingChildIds = new Set((existing ?? []).map((item: { child_id: string | null }) => item.child_id).filter(Boolean));

      const { data: children, error: childError } = await admin
        .from("children")
        .select("id,legacy_id,location_id,first_name,last_name,enrollment_status,record_data")
        .eq("organization_id", profile.organization_id)
        .eq("enrollment_status", "Active");
      if (childError) throw childError;

      const rows = (children ?? []).flatMap((child: any) => {
        if (existingChildIds.has(child.id)) return [];
        const childData = object(child.record_data);
        const subsidy = text(childData.subsidy).trim();
        const lower = subsidy.toLowerCase();
        if (!subsidy || lower.includes("private") || lower.includes("cash")) return [];
        let timesheetType: CommandTypeValue | null = null;
        if (lower.includes("dcfs")) timesheetType = "DCFS";
        else if (lower.includes("cccc")) timesheetType = "CCCC";
        else if (lower.includes("respite")) timesheetType = "Respite";
        else if (lower.includes("ccrc")) timesheetType = "CCRC";
        if (!timesheetType) return [];
        const location = locationById.get(child.location_id);
        if (!location) return [];
        const legacyId = `ts-${servicePeriod.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${child.legacy_id}`;
        const childName = `${child.first_name} ${child.last_name}`.trim();
        const recordData = {
          id: legacyId,
          childName,
          familyName: `${child.last_name} Family`,
          servicePeriod,
          location: location.full_name || location.name,
          timesheetType,
          fundingSource: timesheetType,
          stage: "Location Sign-Off",
          collectorSigned: false,
          collectorSignedAt: "",
          collectorSignedBy: "",
          collectorNotes: "",
          dynastyStatus: "Awaiting",
          dynastyReviewedAt: "",
          dynastyReviewedBy: "",
          dynastyHandoffDate: "",
          dynastyHandedToJenniferAt: "",
          dynastyHandoffBy: "",
          certificateVerified: false,
          tuitionPolicyAcknowledged: false,
          completedBy: "",
          completedAt: "",
          scanQualityChecked: false,
          scannedBy: "",
          scannedAt: "",
          sentToJenniferAt: "",
          department: "",
          departmentEmail: "",
          attachmentConfirmed: false,
          emailedBy: "",
          emailedAt: "",
          notes: "",
        };
        return [{
          organization_id: profile.organization_id,
          location_id: child.location_id,
          child_id: child.id,
          legacy_id: legacyId,
          child_name: childName,
          family_name: `${child.last_name} Family`,
          service_period: servicePeriod,
          funding_source: timesheetType,
          workflow_stage: "Location Sign-Off",
          record_data: recordData,
          created_by: user.id,
          updated_by: user.id,
        }];
      });

      if (rows.length) {
        const { error: insertError } = await admin.from("timesheets").upsert(rows, { onConflict: "organization_id,legacy_id" });
        if (insertError) throw insertError;
      }
      return Response.json({ ok: true, created: rows.length });
    }

    if (action === "saveRoute") {
      if (!(actor.isDanielle || actor.isJennifer || actor.isOwner)) deny("Only Danielle or Jennifer can change department routing.");
      const timesheetType = normalizeType(body.timesheetType);
      if (!isFinalType(timesheetType)) deny("Choose one of the five timesheet types.", 400);
      const department = text(body.department).trim();
      const email = text(body.email).trim();
      const deadline = text(body.deadline).trim();
      const fileNameFormat = text(body.fileNameFormat).trim() || "LastName_FirstName_ServiceMonth_Location.pdf";
      const slugKey = timesheetType.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const rows = locations.map((location) => ({
        organization_id: profile.organization_id,
        location_id: location.id,
        legacy_id: `command-route:${location.slug}:${slugKey}`,
        funding_source: timesheetType,
        department,
        department_email: email,
        deadline,
        file_name_format: fileNameFormat,
        record_data: { id: `command-route:${location.slug}:${slugKey}`, location: location.full_name || location.name, fundingSource: timesheetType, timesheetType, department, email, deadline, fileNameFormat },
        created_by: user.id,
        updated_by: user.id,
      }));
      const { error } = await admin.from("timesheet_submission_routes").upsert(rows, { onConflict: "organization_id,legacy_id" });
      if (error) throw error;
      return Response.json({ ok: true });
    }

    const id = text(body.id);
    if (!id) deny("A timesheet record is required.", 400);
    const row = await loadRecord(admin, profile.organization_id, id);
    const location = locationById.get(row.location_id);
    if (!location || !canViewLocation(actor, location.slug)) deny("You cannot access this timesheet.");
    const current = object(row.record_data);

    if (action === "setType") {
      const nextType = normalizeType(body.timesheetType);
      if (!isFinalType(nextType)) deny("Select CCRC Stage 1, CCRC Stage 2, CCCC, DCFS, or Respite.", 400);
      if (!(actor.canViewAll || actor.collectorSlug === location.slug)) deny("You cannot classify this timesheet.");
      await writeRecord(admin, user.id, row, { timesheetType: nextType, fundingSource: nextType }, "SET_TYPE");
      return Response.json({ ok: true });
    }

    if (action === "markSigned") {
      if (actor.collectorSlug !== location.slug) deny(`Only ${COLLECTOR_LABELS[location.slug] ?? "the assigned collector"} can check off signed forms for this location.`);
      const signed = bool(body.signed);
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = signed ? {
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
      await writeRecord(admin, user.id, row, patch, signed ? "FORM_SIGNED" : "SIGNATURE_UNCHECKED");
      return Response.json({ ok: true });
    }

    if (action === "dynastyReview") {
      if (!actor.isDynasty) deny("Dynasty is the required reviewer for all timesheets.");
      const status = text(body.status);
      if (!['Accounted For', 'Needs Correction'].includes(status)) deny("Choose Accounted For or Needs Correction.", 400);
      const signed = bool(current.collectorSigned) || Boolean(text(current.licenseeSubmittedAt));
      if (status === "Accounted For" && !signed) deny("The location must check off the child's signed form first.", 400);
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
      await writeRecord(admin, user.id, row, patch, status === "Accounted For" ? "DYNASTY_ACCOUNTED" : "DYNASTY_CORRECTION");
      return Response.json({ ok: true });
    }

    if (action === "dynastyHandoff") {
      if (!actor.isDynasty) deny("Dynasty must personally hand the timesheets to Jennifer.");
      if (text(current.dynastyStatus) !== "Accounted For") deny("Dynasty must first confirm the timesheet is accounted for and signed.", 400);
      const handoffDate = text(body.handoffDate) || new Date().toISOString().slice(0, 10);
      const now = new Date().toISOString();
      await writeRecord(admin, user.id, row, {
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
      const handoff = text(current.dynastyHandedToJenniferAt) || text(current.jenniferReceivedAt);
      if (!handoff) deny("Dynasty's personal handoff to Jennifer must be recorded first.", 400);
      if (!bool(body.certificateVerified) || !bool(body.tuitionPolicyAcknowledged)) deny("Verify the child's certificate and acknowledge that tuition is charged regardless of attendance.", 400);
      await writeRecord(admin, user.id, row, {
        certificateVerified: true,
        tuitionPolicyAcknowledged: true,
        completedBy: actor.name,
        completedAt: new Date().toISOString(),
      }, "TIMESHEET_FILLED_FROM_CERTIFICATE");
      return Response.json({ ok: true });
    }

    if (action === "scan") {
      if (!(actor.isDanielle || actor.isAnthony)) deny("Only Danielle or Anthony can scan completed timesheets and send them to Jennifer.");
      if (!text(current.completedAt)) deny("Jennifer or Danielle must fill out this timesheet first.", 400);
      if (!bool(body.scanQualityChecked)) deny("Confirm the scan is readable and complete.", 400);
      const now = new Date().toISOString();
      await writeRecord(admin, user.id, row, {
        scanQualityChecked: true,
        scannedBy: actor.name,
        scannedAt: now,
        sentToJenniferAt: now,
      }, "SCANNED_AND_SENT_TO_JENNIFER");
      return Response.json({ ok: true });
    }

    if (action === "email") {
      if (!actor.isJennifer) deny("Jennifer is the final sender for department email submission.");
      if (!text(current.sentToJenniferAt)) deny("The completed timesheet must be scanned and sent to Jennifer first.", 400);
      const timesheetType = normalizeType(current.timesheetType ?? current.fundingSource ?? row.funding_source);
      if (!isFinalType(timesheetType)) deny("Choose CCRC Stage 1 or CCRC Stage 2 before final submission.", 400);
      const routes = await routeMap(admin, profile.organization_id);
      const route = routes[timesheetType];
      if (!route?.department || !route?.email) deny(`Department routing for ${timesheetType} is not configured yet.`, 400);
      const now = new Date().toISOString();
      await writeRecord(admin, user.id, row, {
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
