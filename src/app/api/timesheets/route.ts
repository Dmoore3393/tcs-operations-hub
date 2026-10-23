import { TIMESHEET_TYPES, timesheetType as normalizeType, signedTimesheet as signed, timesheetStage as stage, timesheetHandoff, timesheetRouteKey } from "@/lib/timesheet-workflow";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { tcsLocationSlug } from "@/lib/server/location-slug";
import { BATCH_ACTIONS, controlledTimesheetBatch } from "@/lib/server/timesheet-batch-controls";

export const runtime = "nodejs";

const COMMAND_TYPES = TIMESHEET_TYPES;
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
async function liveLocations(admin: Awaited<ReturnType<typeof requireStaff>>["admin"], organizationId: string) {
  const result = await admin
    .from("locations")
    .select("id,slug,name,full_name")
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  if (result.error) throw result.error;
  return (result.data ?? []) as unknown as DbRow[];
}

async function liveRoutes(admin: Awaited<ReturnType<typeof requireStaff>>["admin"], organizationId: string, locations: DbRow[]) {
  const result = await admin
    .from("timesheet_submission_routes")
    .select("id,location_id,funding_source,department,department_email,deadline,file_name_format,record_data,updated_at")
    .eq("organization_id", organizationId);
  if (result.error) throw result.error;
  const routes: Record<string, DbRow> = {};
  for (const location of locations) for (const type of COMMAND_TYPES) routes[timesheetRouteKey(asText(location.slug), type)] = { department: "", email: "", deadline: "", fileNameFormat: DEFAULT_FILE_NAME, revision: "", verified: false };
  for (const row of (result.data ?? []) as unknown as DbRow[]) {
    const record = asObject(row.record_data);
    const type = normalizeType(record.timesheetType ?? record.fundingSource ?? row.funding_source);
    if (!COMMAND_TYPES.some((item) => item === type)) continue;
    const location = locations.find(item => item.id === row.location_id);
    if (!location) continue;
    const key = timesheetRouteKey(asText(location.slug), type);
    const next = {
      department: asText(row.department) || asText(record.department),
      email: asText(row.department_email) || asText(record.email),
      deadline: asText(row.deadline) || asText(record.deadline),
      fileNameFormat: asText(row.file_name_format) || asText(record.fileNameFormat) || DEFAULT_FILE_NAME,
      revision: `${asText(row.id)}:${asText(row.updated_at)}`,
      id: asText(row.id), updatedAt: asText(row.updated_at),
      verified: record.routingVerified === true,
    };
    // A canonical location route supersedes old imports. Ambiguous duplicates cannot be used.
    const canonical = asText(record.id).startsWith("command-route:");
    if (!routes[key].revision || canonical) routes[key] = { ...next, canonical };
    else if (!routes[key].canonical) routes[key] = { ...routes[key], verified: false, department: "Ambiguous routes — resave the location route" };
  }
  return routes;
}

export async function GET(request: Request) {
  try {
    const { admin, profile, isOwner, isLicensee, user } = await requireStaff(request);
    if (!isOwner && !isLicensee) return new Response("Timesheets require Owner/Admin or Licensee access.", { status: 403 });
    const actor = actorFor(profile.full_name, isOwner);
    if (!isOwner && actor.collectorSlug && !profile.locations.some(name => tcsLocationSlug(name) === actor.collectorSlug)) actor.collectorSlug = null;
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
      const handoffAt = timesheetHandoff(record);
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
        dynastyHandedToDanielleAt: asText(record.dynastyHandedToDanielleAt),
        dynastyHandedToJenniferAt: asText(record.dynastyHandedToJenniferAt) || asText(record.jenniferReceivedAt),
        handoffAt,
        handoffRecipient: asText(record.dynastyHandoffRecipient) || (asText(record.dynastyHandedToDanielleAt) ? "Danielle" : handoffAt ? "Jennifer (previous workflow)" : ""),
        scanBatchId: asText(record.scanBatchId),
        emailBatchId: asText(record.emailBatchId),
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
        submissionDueDate: asText(record.submissionDueDate),
        scanDocumentId: asText(record.scanDocumentId),
        licenseeApprovedAt: asText(record.licenseeApprovedAt),
        licenseeApprovedBy: asText(record.licenseeApprovedBy),
        licenseeApprovalFingerprint: asText(record.licenseeApprovalFingerprint),
        approvedRouteRevision: asText(record.approvedRouteRevision),
        emailEvidenceDocumentId: asText(record.emailEvidenceDocumentId),
        emailedByUserId: asText(record.emailedByUserId),
        licenseeVerifiedAt: asText(record.licenseeVerifiedAt),
        licenseeVerifiedBy: asText(record.licenseeVerifiedBy),
        agencyReceiptAt: asText(record.agencyReceiptAt),
        agencyReceiptReference: asText(record.agencyReceiptReference),
        receiptDocumentId: asText(record.receiptDocumentId),
        submissionIssue: record.submissionIssue || null,
        submissionHistory: Array.isArray(record.submissionHistory) ? record.submissionHistory : [],
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
      routes: await liveRoutes(admin, profile.organization_id, locations.filter(location => actor.canViewAll || actor.collectorSlug === asText(location.slug))),
      types: COMMAND_TYPES,
      collectors,
      actor: {
        name: actor.name,
        userId: user.id,
        collectorSlug: actor.collectorSlug,
        canViewAll: actor.canViewAll,
        canCreateBatch: actor.isDanielle || actor.isJennifer || actor.isOwner,
        canDynastyReview: actor.isDynasty,
        canDynastyHandoff: actor.isDynasty,
        canFillOut: actor.isDanielle,
        canScan: actor.isDanielle,
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
    const { admin, profile, user, isOwner, isLicensee } = await requireStaff(request);
    if (!isOwner && !isLicensee) return new Response("Timesheets require Owner/Admin or Licensee access.", { status: 403 });
    const actor = actorFor(profile.full_name, isOwner);
    if (!isOwner && actor.collectorSlug && !profile.locations.some(name => tcsLocationSlug(name) === actor.collectorSlug)) actor.collectorSlug = null;
    if (!actor.canViewAll && !actor.collectorSlug) return new Response("This account is not assigned to the Timesheet Command Center.", { status: 403 });

    const body = asObject(await request.json().catch(() => ({})));
    const action = asText(body.action);

    if (action === "createBatch") {
      if (!(actor.isDanielle || actor.isJennifer || actor.isOwner)) return Response.json({ error: "Only Danielle or Jennifer can create the monthly timesheet batch." }, { status: 403 });
      const servicePeriod = asText(body.servicePeriod).trim();
      if (!servicePeriod) return Response.json({ error: "Choose a service period before creating the batch." }, { status: 400 });

      const existingResult = await admin
        .from("timesheets")
        .select("child_id")
        .eq("organization_id", profile.organization_id)
        .eq("service_period", servicePeriod);
      if (existingResult.error) throw existingResult.error;
      const existingChildIds = new Set<string>();
      for (const item of (existingResult.data ?? []) as unknown as DbRow[]) {
        const childId = asText(item.child_id);
        if (childId) existingChildIds.add(childId);
      }

      const childrenResult = await admin
        .from("children")
        .select("id,legacy_id,location_id,first_name,last_name,enrollment_status,record_data")
        .eq("organization_id", profile.organization_id)
        .eq("enrollment_status", "Active");
      if (childrenResult.error) throw childrenResult.error;
      const locations = await liveLocations(admin, profile.organization_id);
      const locationById = new Map<string, DbRow>();
      for (const location of locations) locationById.set(asText(location.id), location);

      const rows: DbRow[] = [];
      for (const child of (childrenResult.data ?? []) as unknown as DbRow[]) {
        const childId = asText(child.id);
        if (!childId || existingChildIds.has(childId)) continue;
        const childData = asObject(child.record_data);
        const subsidy = asText(childData.subsidy).trim();
        const subsidyLower = subsidy.toLowerCase();
        if (!subsidy || subsidyLower.includes("private") || subsidyLower.includes("cash")) continue;

        let timesheetType = "";
        if (subsidyLower.includes("dcfs")) timesheetType = "DCFS";
        else if (subsidyLower.includes("cccc")) timesheetType = "CCCC";
        else if (subsidyLower.includes("respite")) timesheetType = "Respite";
        else if (subsidyLower.includes("ccrc")) timesheetType = "CCRC";
        if (!timesheetType) continue;

        const location = locationById.get(asText(child.location_id));
        if (!location) continue;
        const legacyId = `ts-${servicePeriod.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${asText(child.legacy_id)}`;
        const childName = `${asText(child.first_name)} ${asText(child.last_name)}`.trim();
        const familyName = `${asText(child.last_name)} Family`;
        const recordData: DbRow = {
          id: legacyId,
          childName,
          familyName,
          servicePeriod,
          location: asText(location.full_name) || asText(location.name),
          timesheetType,
          fundingSource: timesheetType,
          stage: "Location Sign-Off",
          collectorSigned: false,
          collectorSignedAt: "",
          collectorSignedBy: "",
          dynastyStatus: "Awaiting",
          dynastyReviewedAt: "",
          dynastyReviewedBy: "",
          dynastyHandoffDate: "",
          dynastyHandedToJenniferAt: "",
        dynastyHandedToDanielleAt: "",
        dynastyHandoffRecipient: "",
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
        rows.push({
          organization_id: profile.organization_id,
          location_id: child.location_id,
          child_id: child.id,
          legacy_id: legacyId,
          child_name: childName,
          family_name: familyName,
          service_period: servicePeriod,
          funding_source: timesheetType,
          workflow_stage: "Location Sign-Off",
          record_data: recordData,
          created_by: user.id,
          updated_by: user.id,
        });
      }

      if (rows.length) {
        const insertResult = await admin.from("timesheets").upsert(rows, { onConflict: "organization_id,legacy_id", ignoreDuplicates: true });
        if (insertResult.error) throw insertResult.error;
      }
      return Response.json({ ok: true, created: rows.length });
    }

    if (action === "saveRoute") {
      if (!(actor.isDanielle || actor.isJennifer || actor.isOwner)) return Response.json({ error: "Only Danielle or Jennifer can change department routing." }, { status: 403 });
      const timesheetType = normalizeType(body.timesheetType);
      if (!COMMAND_TYPES.some((item) => item === timesheetType)) return Response.json({ error: "Choose CCRC Stage 1, CCRC Stage 2, CCCC, DCFS, or Respite." }, { status: 400 });
      const department = asText(body.department).trim();
      const email = asText(body.email).trim();
      if (!department || department.length > 200 || !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email) || email.length > 254 || !asBool(body.routingVerified)) return Response.json({ error: "Enter the verified department and a single exact submission email, then confirm the route against the agency instructions." }, { status: 400 });
      const deadline = asText(body.deadline).trim();
      const fileNameFormat = asText(body.fileNameFormat).trim() || DEFAULT_FILE_NAME;
      const typeSlug = timesheetType.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const locations = await liveLocations(admin, profile.organization_id);
      const selectedLocation = locations.find(location => location.slug === body.locationSlug);
      if (!selectedLocation) return Response.json({ error: "Choose the specific location for this route." }, { status: 400 });
      const rows = [selectedLocation].map((location) => {
        const legacyId = `command-route:${asText(location.slug)}:${typeSlug}`;
        return {
          organization_id: profile.organization_id,
          location_id: location.id,
          legacy_id: legacyId,
          funding_source: timesheetType,
          department,
          department_email: email,
          deadline,
          file_name_format: fileNameFormat,
          record_data: {
            id: legacyId,
            location: asText(location.full_name) || asText(location.name),
            fundingSource: timesheetType,
            timesheetType,
            department,
            email,
            deadline,
            fileNameFormat,
            routingVerified: true, routingVerifiedBy: actor.name, routingVerifiedByUserId: user.id, routingVerifiedAt: new Date().toISOString(),
          },
          created_by: user.id,
          updated_by: user.id,
        };
      });
      if (rows.length) {
        const routeResult = await admin.from("timesheet_submission_routes").upsert(rows, { onConflict: "organization_id,legacy_id" });
        if (routeResult.error) throw routeResult.error;
      }
      return Response.json({ ok: true });
    }

    if (BATCH_ACTIONS.includes(action)) {
      const locations = await liveLocations(admin, profile.organization_id);
      return await controlledTimesheetBatch({ admin, organizationId: profile.organization_id, userId: user.id, actor, locations, routes: await liveRoutes(admin, profile.organization_id, locations), body });
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
      const saved = await admin.rpc("record_timesheet_controlled_action", {
        p_organization_id: profile.organization_id, p_row_id: row.id, p_actor_id: user.id,
        p_expected_updated_at: row.updated_at, p_action: auditAction, p_record: merged,
        p_funding_source: type, p_stage: asText(merged.stage),
      });
      if (saved.error) throw Response.json({ error: "This form changed or could not be saved. Refresh and try again." }, { status: 409 });
    }

    if (action === "setType") {
      if (!(actor.collectorSlug === slug || actor.isDynasty || actor.isDanielle || actor.isJennifer)) return Response.json({ error: "You cannot classify this timesheet." }, { status: 403 });
      if (asText(current.sentToJenniferAt) || asText(current.licenseeApprovalFingerprint) || stage(current) === "Complete") return Response.json({ error: "Flag and reopen a submitted batch before reclassifying it." }, { status: 400 });
      const type = normalizeType(body.timesheetType);
      if (!COMMAND_TYPES.some((item) => item === type)) return Response.json({ error: "Choose CCRC Stage 1, CCRC Stage 2, CCCC, DCFS, or Respite." }, { status: 400 });
      const changedCompletedForm = type !== normalizeType(current.timesheetType ?? current.fundingSource ?? row.funding_source) && asText(current.completedAt);
      await save({ timesheetType: type, fundingSource: type, ...(changedCompletedForm ? { certificateVerified: false, completedAt: "", completedBy: "" } : {}) }, "SET_TYPE");
      return Response.json({ ok: true });
    }

    if (action === "markSigned") {
      if (actor.collectorSlug !== slug) return Response.json({ error: `Only ${COLLECTOR_LABELS[slug] || "the assigned collector"} can check off signed forms for this location.` }, { status: 403 });
      if (!["Location Sign-Off", "Dynasty Review"].includes(stage(current))) return Response.json({ error: "The form has already passed location sign-off." }, { status: 400 });
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
        dynastyHandedToDanielleAt: "",
        dynastyHandoffRecipient: "",
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
      if (timesheetHandoff(current)) return Response.json({ error: "The handoff has already been recorded." }, { status: 400 });
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
        dynastyHandedToDanielleAt: "",
        dynastyHandoffRecipient: "",
        dynastyHandoffDate: "",
        dynastyHandoffBy: "",
      }, status === "Accounted For" ? "DYNASTY_ACCOUNTED" : "DYNASTY_CORRECTION");
      return Response.json({ ok: true });
    }

    if (action === "dynastyHandoff") {
      if (!actor.isDynasty) return Response.json({ error: "Dynasty must personally hand the timesheets to Danielle." }, { status: 403 });
      if (timesheetHandoff(current)) return Response.json({ error: "The handoff has already been recorded." }, { status: 400 });
      if (asText(current.dynastyStatus) !== "Accounted For") return Response.json({ error: "Dynasty must first confirm the timesheet is accounted for and signed." }, { status: 400 });
      const now = new Date().toISOString();
      await save({
        dynastyHandoffDate: asText(body.handoffDate) || now.slice(0, 10),
        dynastyHandedToDanielleAt: now,
        dynastyHandoffRecipient: "Danielle",
        dynastyHandoffBy: actor.name,
        danielleReceivedAt: now,
        batchReceivedBy: "Danielle",
      }, "PERSONAL_HANDOFF_TO_DANIELLE");
      return Response.json({ ok: true });
    }

    if (action === "fillOut") {
      if (!actor.isDanielle) return Response.json({ error: "Only Danielle can fill out timesheets from the child's certificate." }, { status: 403 });
      if (!timesheetHandoff(current)) return Response.json({ error: "Dynasty's personal handoff must be recorded first." }, { status: 400 });
      if (asText(current.completedAt)) return Response.json({ error: "Completion has already been recorded." }, { status: 400 });
      if (!asBool(body.certificateVerified) || !asBool(body.tuitionPolicyAcknowledged)) return Response.json({ error: "Verify the child certificate and acknowledge tuition is charged regardless of attendance." }, { status: 400 });
      await save({ certificateVerified: true, tuitionPolicyAcknowledged: true, completedBy: actor.name, completedAt: new Date().toISOString() }, "TIMESHEET_FILLED_FROM_CERTIFICATE");
      return Response.json({ ok: true });
    }

    if (action === "scan" || action === "email") {
      return Response.json({ error: "Use the location and program batch controls to record scans sent to Jen or company email submission." }, { status: 400 });
    }

    return Response.json({ error: "Unknown Timesheet Command Center action." }, { status: 400 });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
