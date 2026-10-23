import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { batchFingerprint, timesheetBatchKey, timesheetRouteKey, timesheetStage, timesheetType, TIMESHEET_TYPES, validSubmissionDate, validateTimesheetBatch } from "@/lib/timesheet-workflow";

type Row = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
function fail(error: string, status = 400): never { throw Response.json({ error }, { status }); }
export const BATCH_ACTIONS = ["scanBatch", "approveBatch", "emailBatch", "verifyBatch", "receiptBatch", "flagBatch", "reopenBatch", "setDeadline"];

export async function controlledTimesheetBatch({ admin, organizationId, userId, actor, locations, routes, body }: {
  admin: SupabaseClient; organizationId: string; userId: string;
  actor: { name: string; collectorSlug: string | null; canViewAll: boolean; isDanielle: boolean; isJennifer: boolean; isOwner: boolean };
  locations: Row[]; routes: Record<string, Row>; body: Row;
}) {
  const action = text(body.action);
  const type = timesheetType(body.timesheetType);
  const period = text(body.servicePeriod);
  if (!period || period.length > 40 || (!TIMESHEET_TYPES.some(item => item === type) && !["flagBatch", "reopenBatch", "setDeadline"].includes(action))) fail("Choose the service month and exact program, including the CCRC stage.");
  const location = locations.find(item => item.slug === body.locationSlug);
  if (!location) fail("Batch location not found.");
  const slug = text(location.slug);
  const isCollector = actor.collectorSlug === slug;
  const manager = actor.isDanielle || actor.isJennifer || actor.isOwner;
  if (!actor.canViewAll && !isCollector) fail("You cannot access this location's batch.", 403);
  if (action === "scanBatch" && !actor.isDanielle) fail("Only Danielle records scans sent to Jen.", 403);
  if (action === "emailBatch" && !actor.isJennifer) fail("Only Jennifer records company submissions.", 403);
  if (["approveBatch", "verifyBatch"].includes(action) && !isCollector) fail("The assigned location licensee must complete this check.", 403);
  if (["setDeadline", "reopenBatch", "receiptBatch"].includes(action) && !manager) fail("Danielle or Jennifer must complete this step.", 403);

  const result = await admin.from("timesheets").select("*").eq("organization_id", organizationId).eq("location_id", location.id).eq("service_period", period);
  if (result.error) throw result.error;
  const rows = (result.data as Row[] ?? []).filter(row => timesheetType(object(row.record_data).timesheetType ?? object(row.record_data).fundingSource ?? row.funding_source) === type);
  if (!rows.length) fail("This batch has no timesheets.");
  const expected = Array.isArray(body.expectedRows) ? body.expectedRows.map(object) : [];
  if (expected.length !== rows.length || new Set(expected.map(row => row.id)).size !== rows.length || rows.some(row => !expected.some(item => item.id === row.id && item.updatedAt === row.updated_at))) fail("The batch changed since you opened it. Refresh and review every form again.", 409);
  const records = rows.map(row => object(row.record_data));
  const route = routes[timesheetRouteKey(slug, type)];
  const routeRevision = text(route?.revision);
  const fingerprint = createHash("sha256").update(batchFingerprint(rows.map(row => ({ id: row.id, record_data: row.record_data })), routeRevision)).digest("hex");
  const hasIssue = records.some(record => Boolean(record.submissionIssue));
  if (hasIssue && !["flagBatch", "reopenBatch"].includes(action)) fail("This batch is flagged. Danielle or Jennifer must record the correction and reopen it.");
  if (records.every(record => timesheetStage(record) === "Complete") && action !== "flagBatch") fail("This batch is closed. Flag an issue to reopen it with an audit trail.");

  async function evidence(id: unknown, documentType: string) {
    if (!/^[0-9a-f-]{36}$/i.test(text(id))) fail(`Upload ${documentType.toLowerCase()} first.`);
    const found = await admin.from("document_records").select("id").eq("id", id).eq("organization_id", organizationId).eq("location_id", location!.id).eq("document_type", documentType).eq("status", "Active").maybeSingle();
    if (found.error) throw found.error;
    if (!found.data) fail("Evidence must be an active document of the correct type for this location.");
    return text(id);
  }
  function confirmed(key: string, message: string) { if (body[key] !== true) fail(message); }
  function readyRoute() {
    if (!route || route.verified !== true || !text(route.department) || !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(text(route.email))) fail("Danielle or Jennifer must verify this location and program's department route first.");
    if (body.routeRevision !== routeRevision) fail("Department routing changed. Refresh and check the new destination.", 409);
  }
  const now = new Date().toISOString();
  const batchId = randomUUID();
  let patch: Row = {};
  if (action === "setDeadline") {
    if (!validSubmissionDate(body.dueDate)) fail("Choose the actual submission due date from the agency instructions.");
    if (records.some(record => text(record.emailEvidenceDocumentId))) fail("Flag a submitted batch before changing its deadline.");
    patch = { submissionDueDate: body.dueDate, deadlineSetBy: actor.name, deadlineSetAt: now, licenseeApprovalFingerprint: "", licenseeApprovedAt: "" };
  } else if (action === "scanBatch") {
    const error = validateTimesheetBatch(records, "scanBatch"); if (error) fail(error);
    if (records.some(record => text(record.emailEvidenceDocumentId))) fail("Flag the submitted batch before replacing scans.");
    confirmed("scanQualityChecked", "Confirm every page is readable, complete, and sent to Jen.");
    const scanDocumentId = await evidence(body.documentId, "Timesheet Batch Scan");
    patch = { scanDocumentId, scanQualityChecked: true, scannedBy: actor.name, scannedAt: now, sentToJenniferAt: now, scanBatchId: batchId, licenseeApprovalFingerprint: "", licenseeApprovedAt: "" };
  } else if (action === "approveBatch") {
    readyRoute();
    if (records.some(record => !text(record.scanDocumentId) || !text(record.sentToJenniferAt) || !text(record.completedAt))) fail("Every completed form must have its scan recorded first.");
    if (records.some(record => !validSubmissionDate(record.submissionDueDate))) fail("Set the actual batch due date first.");
    if (records.some(record => text(record.emailEvidenceDocumentId))) fail("This batch has already been submitted. Use the final licensee verification.");
    if (body.formCount !== rows.length) fail("The expected form count must match the full batch. Account for missing forms before approving.");
    confirmed("rosterConfirmed", "Check every eligible child against the roster and certificate, including each applicable program.");
    confirmed("destinationConfirmed", "Check the location, service month, program/stage, department, and email against the agency instructions.");
    for (const id of new Set(records.map(record => record.scanDocumentId))) await evidence(id, "Timesheet Batch Scan");
    patch = { licenseeApprovedAt: now, licenseeApprovedBy: actor.name, licenseeApprovedByUserId: userId, licenseeApprovalFingerprint: fingerprint, approvedRouteRevision: routeRevision, expectedFormCount: rows.length };
  } else if (action === "emailBatch") {
    readyRoute();
    const error = validateTimesheetBatch(records, "emailBatch"); if (error) fail(error);
    if (records.some(record => record.licenseeApprovalFingerprint !== fingerprint)) fail("The assigned licensee must approve the complete current packet and destination before submission.");
    if (text(body.actualRecipient).toLowerCase() !== text(route.email).toLowerCase()) fail("The sent-email recipient does not match the verified department. Flag the batch if it went to the wrong destination.");
    const sentAt = new Date(text(body.sentAt));
    if (!Number.isFinite(sentAt.getTime()) || sentAt.getTime() > Date.now() + 120000) fail("Enter the actual sent-email date and time; it cannot be in the future.");
    confirmed("attachmentConfirmed", "Confirm the complete, correct packet is attached in the sent email.");
    const emailEvidenceDocumentId = await evidence(body.documentId, "Timesheet Sent Email Proof");
    patch = { emailEvidenceDocumentId, department: text(route.department), departmentEmail: text(route.email).toLowerCase(), attachmentConfirmed: true, emailedBy: actor.name, emailedByUserId: userId, emailedAt: sentAt.toISOString(), emailedByJenniferAt: sentAt.toISOString(), emailRecordedAt: now, emailBatchId: batchId, licenseeVerifiedAt: "", agencyReceiptAt: "", receiptDocumentId: "" };
  } else if (action === "verifyBatch") {
    if (records.some(record => !text(record.emailEvidenceDocumentId) || !text(record.emailedAt))) fail("Jennifer must record the sent-email proof first.");
    if (records.some(record => record.emailedByUserId === userId)) fail("The sender cannot verify their own submission. A separate assigned licensee must check it.", 403);
    confirmed("submissionChecked", "Open the sent-email proof and verify recipient, attachments, child list, location, stage, and service month.");
    for (const id of new Set(records.map(record => record.emailEvidenceDocumentId))) await evidence(id, "Timesheet Sent Email Proof");
    patch = { licenseeVerifiedAt: now, licenseeVerifiedBy: actor.name, licenseeVerifiedByUserId: userId };
  } else if (action === "receiptBatch") {
    if (records.some(record => !text(record.licenseeVerifiedAt) || !text(record.emailEvidenceDocumentId))) fail("The assigned licensee must independently verify the sent submission first.");
    const reference = text(body.reference);
    if (reference.length < 3 || reference.length > 300) fail("Record the agency's receipt/reference or who confirmed receipt.");
    confirmed("agencyAccepted", "Confirm the correct agency acknowledged receipt of this packet. An email sent checkmark alone is not a receipt.");
    const receiptDocumentId = await evidence(body.documentId, "Timesheet Agency Receipt");
    patch = { receiptDocumentId, agencyReceiptReference: reference, agencyReceiptAt: now, agencyReceiptBy: actor.name, agencyReceiptByUserId: userId };
  } else if (action === "flagBatch") {
    const reason = text(body.reason);
    if (reason.length < 10 || reason.length > 2000) fail("Describe what is missing, incorrect, rejected, or needs follow-up (10–2,000 characters).");
    patch = { submissionIssue: { reason, openedAt: now, openedBy: actor.name, openedByUserId: userId } };
  } else if (action === "reopenBatch") {
    if (!hasIssue) fail("Flag the issue before reopening this batch.");
    const reason = text(body.reason);
    if (reason.length < 10 || reason.length > 2000) fail("Record how the issue will be corrected (10–2,000 characters).");
    patch = { submissionIssue: null, lastCorrection: { reason, at: now, by: actor.name }, scanDocumentId: "", scanQualityChecked: false, scannedAt: "", sentToJenniferAt: "", scanBatchId: "", licenseeApprovedAt: "", licenseeApprovalFingerprint: "", approvedRouteRevision: "", emailEvidenceDocumentId: "", emailedAt: "", emailedByJenniferAt: "", emailBatchId: "", attachmentConfirmed: false, licenseeVerifiedAt: "", receiptDocumentId: "", agencyReceiptAt: "", agencyReceiptReference: "" };
  } else fail("Unknown batch action.");

  const updates = rows.map(row => {
    const record = { ...object(row.record_data), ...patch, submissionControlVersion: 2, submissionBatchKey: timesheetBatchKey(period, slug, type) };
    return { id: row.id, expected_updated_at: row.updated_at, record_data: record, workflow_stage: timesheetStage(record) };
  });
  const saved = await admin.rpc("record_timesheet_controlled_batch", {
    p_organization_id: organizationId, p_location_id: location.id, p_service_period: period, p_type: type,
    p_actor_id: userId, p_action: action, p_batch_id: batchId, p_updates: updates,
    p_route_id: ["approveBatch", "emailBatch"].includes(action) ? route.id : null,
    p_route_updated_at: ["approveBatch", "emailBatch"].includes(action) ? route.updatedAt : null,
  });
  if (saved.error) fail("The batch or route changed, or the database controls are not ready. Refresh and retry; no partial batch was saved.", 409);
  return Response.json({ ok: true, recorded: saved.data, batchId });
}
