export const CHECKLIST_STEPS = ["Received", "Signed", "Dated", "Filled out", "Scanned", "Submitted"] as const;
export type ChecklistRecord = {
  submissionIssue?:unknown;
  submissionControlVersion?: number; jenReviewedAt?: string;
  directReceivedAt?: string; dynastyHandedToDanielleAt?: string; directSignaturesAt?: string;
  collectorSigned?: boolean; directDatesAt?: string; completedAt?: string;
  scanRecordedExternally?:boolean; submissionRecordedExternally?:boolean;
  scannedAt?: string; scanDocumentId?: string; sentToJenniferAt?: string;
  emailedAt?: string; emailEvidenceDocumentId?: string;
};
export function timesheetChecklist(record: ChecklistRecord) {
  return [
    Boolean(record.directReceivedAt || record.dynastyHandedToDanielleAt),
    Boolean(record.directSignaturesAt || record.collectorSigned),
    Boolean(record.directDatesAt),
    Boolean(record.completedAt),
    Boolean(record.scannedAt && (record.scanDocumentId || (record.submissionControlVersion===3&&record.scanRecordedExternally===true)) && (record.submissionControlVersion === 3 || record.sentToJenniferAt)),
    Boolean(record.emailedAt && (record.emailEvidenceDocumentId || (record.submissionControlVersion===3&&record.submissionRecordedExternally===true)) && !record.submissionIssue),
  ];
}
/** Form processing starts with the previous service month in TCS local time. */
export function previousTimesheetMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit"}).formatToParts(now);
  const date = new Date(Date.UTC(Number(parts.find(p=>p.type==='year')?.value),Number(parts.find(p=>p.type==='month')?.value)-2,15,12));
  return {value:date.toISOString().slice(0,7),label:new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(date)};
}
