export const TIMESHEET_TYPES = ["CCRC Stage 1", "CCRC Stage 2", "CCCC", "DCFS", "Respite"] as const;
export type TimesheetData = Record<string, unknown>;
/** Archived children need an explicitly confirmed service month, not an invented last-care date. */
export function timesheetChildEligible(enrollmentStatus: unknown, record: TimesheetData, servicePeriod: string) {
  if (record.neverStartedCare === true) return false;
  if (enrollmentStatus === "Active") return true;
  return enrollmentStatus === "Archived" && Array.isArray(record.timesheetServicePeriods) && record.timesheetServicePeriods.includes(servicePeriod);
}
const text = (value: unknown) => typeof value === "string" ? value : "";
export function timesheetType(value: unknown) {
  const source = text(value).trim().toLowerCase();
  if ((source.includes("ccrc") && source.includes("stage") && source.includes("1")) || source === "ccrc1" || source === "ccrc 1") return "CCRC Stage 1";
  if ((source.includes("ccrc") && source.includes("stage") && source.includes("2")) || source === "ccrc2" || source === "ccrc 2") return "CCRC Stage 2";
  if (source === "cccc") return "CCCC";
  if (source === "dcfs") return "DCFS";
  if (source.includes("respite")) return "Respite";
  return "CCRC";
}
export function signedTimesheet(record: TimesheetData) {
  const prep = record.prep as TimesheetData | undefined;
  return record.collectorSigned === true || Boolean(text(record.licenseeSubmittedAt)) || (prep?.parentSignature === true && prep?.providerSignature === true);
}
export function timesheetHandoff(record: TimesheetData) {
  // Existing handoffs retain their original recipient and timestamp.
  return text(record.dynastyHandedToDanielleAt) || text(record.dynastyHandedToJenniferAt) || text(record.jenniferReceivedAt) || text(record.directReviewAt);
}
/** External confirmations are explicit facts, never fabricated document IDs. */
export function hasTimesheetScan(record:TimesheetData){return Boolean(text(record.scannedAt)&&(text(record.scanDocumentId)||(record.submissionControlVersion===3&&record.scanRecordedExternally===true)));}
export function hasTimesheetSubmission(record:TimesheetData){return Boolean(text(record.emailedAt)&&(text(record.emailEvidenceDocumentId)||(record.submissionControlVersion===3&&record.submissionRecordedExternally===true)));}
export function timesheetStage(record: TimesheetData) {
  if (record.submissionIssue && typeof record.submissionIssue === "object") return "Correction Required";
  if (record.submissionControlVersion === 3) {
    if (record.submittedOn && hasTimesheetSubmission(record)) return (record.workflowOwner === "Jennifer" && record.workflowReviewer === "") || text(record.jenReviewedAt) ? "Complete" : "Licensee Verification";
    if (!text(record.directReceivedAt) || !signedTimesheet(record) || !text(record.directDatesAt)) return "Location Sign-Off";
    if (!text(record.completedAt)) return "Danielle Fill Out";
    if (!hasTimesheetScan(record)) return "Scan & Send to Jennifer";
    if (!hasTimesheetSubmission(record)) return "Jennifer Email";
    if (!(record.workflowOwner === "Jennifer" && record.workflowReviewer === "") && !text(record.jenReviewedAt)) return "Licensee Verification";
    return "Complete";
  }
  if (!signedTimesheet(record)) return "Location Sign-Off";
  if (record.dynastyStatus !== "Accounted For" && !text(record.directReviewAt)) return "Dynasty Review";
  if (!timesheetHandoff(record)) return "Personal Handoff";
  if (!text(record.completedAt)) return "Danielle Fill Out";
  if (!text(record.scannedAt) || (record.submissionControlVersion !== 3 && !text(record.sentToJenniferAt)) || !text(record.scanDocumentId)) return "Scan & Send to Jennifer";
  if (!text(record.licenseeApprovalFingerprint)) return "Licensee Approval";
  if ((!text(record.emailedAt) && !text(record.emailedByJenniferAt)) || !text(record.emailEvidenceDocumentId)) return "Jennifer Email";
  if (!text(record.licenseeVerifiedAt)) return "Licensee Verification";
  if (!text(record.agencyReceiptAt) || !text(record.receiptDocumentId)) return "Agency Receipt";
  return "Complete";
}
export function timesheetBatchKey(period: string, location: string, type: string) {
  return JSON.stringify([period, location, type]);
}
export function validateTimesheetBatch(records: TimesheetData[], action: "scanBatch" | "emailBatch") {
  if (!records.length) return "This batch has no timesheets.";
  if (records.some(record => record.submissionIssue)) return "Resolve the flagged issue and reopen this batch first.";
  if (records.some(record => !signedTimesheet(record) || (record.submissionControlVersion === 3 && (!text(record.directReceivedAt) || !text(record.directDatesAt))) || (record.submissionControlVersion !== 3 && record.dynastyStatus !== "Accounted For" && !text(record.directReviewAt)) || (record.submissionControlVersion !== 3 && !timesheetHandoff(record)) || !text(record.completedAt))) return "Every timesheet in this batch must be signed, reviewed, handed off, and filled out before submission.";
  if (action === "emailBatch" && records.some(record => (record.submissionControlVersion !== 3 && !text(record.sentToJenniferAt)) || !hasTimesheetScan(record))) return "Every timesheet in this batch must be marked scanned before recording the agency submission.";
  if (records.every(record => action === "scanBatch" ? hasTimesheetScan(record) : hasTimesheetSubmission(record))) return "This batch has already been recorded. Flag an issue to correct a submitted batch.";
  return "";
}

export function timesheetRouteKey(location: string, type: string) { return JSON.stringify([location, type]); }
export function validSubmissionDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function pacificToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function batchOverdue(records: TimesheetData[], today = pacificToday()) {
  return records.some(record => validSubmissionDate(record.submissionDueDate) && text(record.submissionDueDate) < today && !hasTimesheetSubmission(record) && timesheetStage(record) !== "Complete");
}
export function batchFingerprint(rows: Array<{ id: unknown; record_data: unknown }>, routeRevision: string) {
  return JSON.stringify([routeRevision, rows.map(row => {
    const record = row.record_data as TimesheetData;
    return [String(row.id), text(record.completedAt), text(record.scanDocumentId), text(record.scanBatchId), text(record.submissionDueDate), text(record.scannedAt), String(record.scanRecordedExternally===true)];
  }).sort((a, b) => a[0].localeCompare(b[0]))]);
}
