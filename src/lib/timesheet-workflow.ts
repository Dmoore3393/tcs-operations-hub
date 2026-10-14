export const TIMESHEET_TYPES = ["CCRC Stage 1", "CCRC Stage 2", "CCCC", "DCFS", "Respite"] as const;
export type TimesheetData = Record<string, unknown>;
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
  return text(record.dynastyHandedToDanielleAt) || text(record.dynastyHandedToJenniferAt) || text(record.jenniferReceivedAt);
}
export function timesheetStage(record: TimesheetData) {
  if (!signedTimesheet(record)) return "Location Sign-Off";
  if (record.dynastyStatus !== "Accounted For") return "Dynasty Review";
  if (!timesheetHandoff(record)) return "Personal Handoff";
  if (!text(record.completedAt)) return "Danielle Fill Out";
  if (!text(record.scannedAt) || !text(record.sentToJenniferAt)) return "Scan & Send to Jennifer";
  if (!text(record.emailedAt) && !text(record.emailedByJenniferAt)) return "Jennifer Email";
  return "Complete";
}
export function timesheetBatchKey(period: string, location: string, type: string) {
  return JSON.stringify([period, location, type]);
}
export function validateTimesheetBatch(records: TimesheetData[], action: "scanBatch" | "emailBatch") {
  if (!records.length) return "This batch has no timesheets.";
  if (action === "scanBatch" && records.some(record => !["Scan & Send to Jennifer", "Jennifer Email", "Complete"].includes(timesheetStage(record)))) return "Every timesheet in this batch must be signed, reviewed, handed off, and filled out before sending the scans to Jen.";
  if (action === "emailBatch" && records.some(record => !["Jennifer Email", "Complete"].includes(timesheetStage(record)))) return "Every timesheet in this batch must be scanned and sent to Jen before recording the company email.";
  if (records.every(record => action === "scanBatch" ? Boolean(text(record.sentToJenniferAt)) : timesheetStage(record) === "Complete")) return "This batch has already been recorded.";
  return "";
}
