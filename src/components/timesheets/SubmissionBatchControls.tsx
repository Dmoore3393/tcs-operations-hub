"use client";

import { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { batchOverdue, timesheetRouteKey } from "@/lib/timesheet-workflow";

export type SubmissionRoute = { department: string; email: string; deadline: string; fileNameFormat: string; revision: string; verified: boolean };
export type SubmissionRecord = {
  id: string; rowId: string; updatedAt: string; childName: string; location: string; locationSlug: string;
  timesheetType: string; servicePeriod: string; stage: string; completedAt: string; sentToJenniferAt: string;
  scanDocumentId: string; submissionDueDate: string; licenseeApprovedAt: string; licenseeApprovedBy: string;
  approvedRouteRevision: string; emailEvidenceDocumentId: string; emailedByUserId: string; emailedAt: string;
  licenseeVerifiedAt: string; licenseeVerifiedBy: string; agencyReceiptAt: string; agencyReceiptReference: string;
  receiptDocumentId: string; collector: string; submissionIssue: { reason: string; openedBy: string } | null;
  submissionHistory?: Array<{ reopenedAt: string; previous: { departmentEmail?: string; emailedAt?: string; emailEvidenceDocumentId?: string; receiptDocumentId?: string } }>;
};
type Actor = { userId: string; collectorSlug: string | null; canScan: boolean; canEmail: boolean; canManageRoutes: boolean };

export function EvidenceFile({ location, documentType, onUpload, documentId, disabled = false, label }: {
  location: string; documentType?: string; onUpload?: (id: string) => void; documentId?: string; disabled?: boolean; label: string;
}) {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  async function upload(file: File | undefined) {
    if (!file || !session || !documentType || !onUpload) return;
    setBusy(true); setError("");
    try {
      if (file.size > 4 * 1024 * 1024) throw new Error("Choose a PDF or image under 4 MB. Compress larger scans first.");
      const form = new FormData(); form.set("file", file); form.set("location", location); form.set("documentType", documentType);
      const response = await fetch("/api/documents", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: form });
      const result = await response.json();
      if (!response.ok || !result.document?.id) throw new Error(result.error || "The file could not be saved.");
      onUpload(result.document.id); setFileName(file.name);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Upload failed."); }
    finally { setBusy(false); }
  }
  async function download() {
    if (!documentId || !session) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/documents/${documentId}/download`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      if (!response.ok) throw new Error("The evidence could not be opened. Refresh and try again.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] || "timesheet-evidence"; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Download failed."); }
    finally { setBusy(false); }
  }
  return <div className="tscc-evidence">
    {onUpload && <label>{label}<input type="file" accept="application/pdf,image/jpeg,image/png,image/heic,image/heif" disabled={disabled || busy} onChange={event => void upload(event.target.files?.[0])} /></label>}
    {busy && <span role="status">Saving / opening file…</span>}
    {fileName && <span>Saved: {fileName}</span>}
    {documentId && <button type="button" className="tscc-btn light" disabled={busy} onClick={() => void download()}>Open {label}</button>}
    {error && <p role="alert" className="tscc-control-error">{error}</p>}
  </div>;
}

export default function SubmissionBatchControls({ rows, actor, routes, saving, onAction }: {
  rows: SubmissionRecord[]; actor?: Actor; routes?: Record<string, SubmissionRoute>; saving: boolean;
  onAction: (body: Record<string, unknown>, message: string) => Promise<unknown>;
}) {
  const first = rows[0];
  const route = routes?.[timesheetRouteKey(first.locationSlug, first.timesheetType)];
  const isCollector = actor?.collectorSlug === first.locationSlug;
  const classified = first.timesheetType !== "CCRC";
  const all = (key: keyof SubmissionRecord) => rows.every(row => Boolean(row[key]));
  const scanned = all("scanDocumentId");
  const approved = all("licenseeApprovedAt") && rows.every(row => row.approvedRouteRevision === route?.revision);
  const emailed = all("emailEvidenceDocumentId");
  const verified = all("licenseeVerifiedAt");
  const complete = rows.every(row => row.stage === "Complete");
  const issue = rows.find(row => row.submissionIssue)?.submissionIssue;
  const [documentId, setDocumentId] = useState("");
  const [dueDate, setDueDate] = useState(first.submissionDueDate);
  const [confirmed, setConfirmed] = useState(false);
  const [rosterChecked, setRosterChecked] = useState(false);
  const [count, setCount] = useState("");
  const [actualRecipient, setActualRecipient] = useState("");
  const [sentAt, setSentAt] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const body = { servicePeriod: first.servicePeriod, locationSlug: first.locationSlug, timesheetType: first.timesheetType, routeRevision: route?.revision, expectedRows: rows.map(row => ({ id: row.rowId, updatedAt: row.updatedAt })) };
  const label = `${first.location} · ${first.timesheetType} · ${first.servicePeriod}`;
  const run = (action: string, extras: Record<string, unknown>, message: string) => onAction({ ...body, action, ...extras }, `${label}: ${message}`);
  return <article className={`tscc-stage-card tscc-controlled-batch ${issue ? "issue" : complete ? "done" : ""}`}>
    <h3>{first.location} · {first.timesheetType}</h3>
    <p>{first.servicePeriod} · {rows.length} forms · Accountable: <strong>{first.collector}</strong></p>
    <div className="tscc-stage-actions"><span className={`tscc-chip ${complete ? "green" : issue ? "red" : "gold"}`}>{issue ? "Correction required" : complete ? "Submission verified + agency receipt recorded" : first.stage}</span><span className={`tscc-chip ${batchOverdue(rows.map(row => ({ ...row }))) ? "red" : ""}`}>{first.submissionDueDate ? `Due ${first.submissionDueDate}${batchOverdue(rows.map(row => ({ ...row }))) ? " · OVERDUE / FOLLOW UP" : ""}` : "Due date required"}</span></div>
    <details className="tscc-control-details"><summary>Review all {rows.length} forms</summary><ul>{rows.map(row => <li key={row.id}>{row.childName} — {row.stage}</li>)}</ul></details>
    <div className="tscc-note"><strong>Verified destination for this location and program</strong><br/>{route?.department || "Department needs setup"}<br/>{route?.email || "Email needs setup"}{!route?.verified && <p>Danielle or Jennifer must verify this route against the agency instructions.</p>}</div>
    {!classified && <p className="tscc-control-error">Choose CCRC Stage 1 or Stage 2 on each form before submission.</p>}
    {first.emailedAt && !emailed && <p>An earlier email was recorded. The scan, sent-email proof, licensee checks, and agency receipt still need to be documented.</p>}
    {actor?.canManageRoutes && !emailed && !issue && classified && <div className="tscc-control-row"><label>Submission due date<input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} /></label><button className="tscc-btn light" disabled={saving || !dueDate || rows.every(row => row.submissionDueDate === dueDate)} onClick={() => void run("setDeadline", { dueDate }, "due date recorded.")}>Save Due Date</button></div>}
    {scanned && <EvidenceFile location={first.location} documentId={first.scanDocumentId} label="batch scan" />}
    {emailed && <EvidenceFile location={first.location} documentId={first.emailEvidenceDocumentId} label="sent-email proof" />}
    {all("receiptDocumentId") && <EvidenceFile location={first.location} documentId={first.receiptDocumentId} label="agency receipt" />}
    {approved && <p>Packet and destination checked by {first.licenseeApprovedBy}.</p>}
    {verified && <p>Sent submission independently checked by {first.licenseeVerifiedBy}.</p>}
    {complete && <p>Agency receipt: {first.agencyReceiptReference}. Submission completion does not confirm payment.</p>}

    {!issue && classified && !complete && <>
      {actor?.canScan && !scanned && <section className="tscc-control-step"><h4>Danielle: save the scans sent to Jen</h4><EvidenceFile location={first.location} documentType="Timesheet Batch Scan" label="complete batch scan" documentId={documentId} onUpload={setDocumentId} disabled={saving || !all("completedAt")} /><Check checked={confirmed} onChange={setConfirmed} disabled={saving}>Every page is readable and complete, and this packet was sent to Jen.</Check><button className="tscc-btn primary" disabled={saving || !all("completedAt") || !documentId || !confirmed} onClick={() => void run("scanBatch", { documentId, scanQualityChecked: confirmed }, "scan handoff recorded; licensee packet review is next.")}>Record Scans Sent to Jen</button></section>}
      {isCollector && scanned && !emailed && <section className="tscc-control-step"><h4>Licensee: approve this packet and destination</h4><p>Reconcile the full child roster and certificates, including Respite when applicable. Missing forms must be added before approval.</p><label>Expected number of forms<input type="number" min="1" inputMode="numeric" value={count} onChange={event => setCount(event.target.value)} /></label><Check checked={rosterChecked} onChange={setRosterChecked} disabled={saving}>Every expected child and applicable program is included; I opened and checked the scans.</Check><Check checked={confirmed} onChange={setConfirmed} disabled={saving}>Location, service month, program/stage, department and email match the agency instructions.</Check><button className="tscc-btn green" disabled={saving || !rosterChecked || !confirmed || Number(count) !== rows.length || !route?.verified || !first.submissionDueDate} onClick={() => void run("approveBatch", { formCount: Number(count), rosterConfirmed: rosterChecked, destinationConfirmed: confirmed }, "licensee packet approval recorded.")}>{approved ? "Reconfirm Packet" : "Approve Packet for Jennifer"}</button></section>}
      {actor?.canEmail && scanned && !emailed && <section className="tscc-control-step"><h4>Jennifer: record the actual company submission</h4>{!approved && <p className="tscc-control-error">Waiting for the location licensee to approve the current packet and destination.</p>}<label>Recipient shown in the sent email<input type="email" autoComplete="off" value={actualRecipient} onChange={event => setActualRecipient(event.target.value)} /></label><label>Actual sent date and time<input type="datetime-local" value={sentAt} onChange={event => setSentAt(event.target.value)} /></label><EvidenceFile location={first.location} documentType="Timesheet Sent Email Proof" label="sent-email proof showing recipient and attachments" documentId={documentId} onUpload={setDocumentId} disabled={saving || !approved} /><Check checked={confirmed} onChange={setConfirmed} disabled={saving}>The complete correct packet is attached in the sent email.</Check><button className="tscc-btn primary" disabled={saving || !approved || !documentId || !confirmed || !sentAt || actualRecipient.trim().toLowerCase() !== route?.email.toLowerCase()} onClick={() => void run("emailBatch", { documentId, actualRecipient, sentAt: new Date(sentAt).toISOString(), attachmentConfirmed: confirmed }, "sent-email proof recorded; independent licensee verification is next.")}>Record Company Submission</button></section>}
      {isCollector && emailed && !verified && <section className="tscc-control-step"><h4>Licensee: verify the actual sent submission</h4><Check checked={confirmed} onChange={setConfirmed} disabled={saving}>I opened the sent-email proof and checked the recipient, attachments, child list, location, program/stage, and service month.</Check><button className="tscc-btn green" disabled={saving || !confirmed || rows.some(row => row.emailedByUserId === actor?.userId)} onClick={() => void run("verifyBatch", { submissionChecked: confirmed }, "independent licensee verification recorded; awaiting agency receipt.")}>Verify Sent Submission</button>{rows.some(row => row.emailedByUserId === actor?.userId) && <p>A different assigned licensee must verify your submission.</p>}</section>}
      {actor?.canManageRoutes && verified && !complete && <section className="tscc-control-step"><h4>Danielle / Jennifer: confirm agency receipt</h4><p>Keep this open and follow up until the correct agency acknowledges the packet.</p><label>Agency receipt/reference or confirmation contact<input value={reference} maxLength={300} onChange={event => setReference(event.target.value)} /></label><EvidenceFile location={first.location} documentType="Timesheet Agency Receipt" label="agency acknowledgment" documentId={documentId} onUpload={setDocumentId} disabled={saving} /><Check checked={confirmed} onChange={setConfirmed} disabled={saving}>The correct agency acknowledged receipt of this packet.</Check><button className="tscc-btn green" disabled={saving || !confirmed || !documentId || reference.trim().length < 3} onClick={() => void run("receiptBatch", { documentId, reference, agencyAccepted: confirmed }, "agency receipt recorded; submission closed.")}>Record Agency Receipt & Close</button></section>}
    </>}
    {issue && <div className="tscc-control-error" role="status"><strong>{issue.openedBy} flagged this batch:</strong> {issue.reason}</div>}
    <details className="tscc-control-details" open={Boolean(issue)}><summary>{issue ? "Correction and reopening" : "Report a missing form, wrong destination, rejection, or other issue"}</summary><label>{issue ? "Correction plan" : "What needs attention?"}<textarea minLength={10} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label>{(!issue || actor?.canManageRoutes) && <button className="tscc-btn red" disabled={saving || reason.trim().length < 10} onClick={() => void run(issue ? "reopenBatch" : "flagBatch", { reason }, issue ? "correction recorded; a corrected scan and fresh checks are required. Earlier evidence is preserved." : "issue flagged for Danielle and Jennifer.")}>{issue ? "Record Correction & Reopen" : "Flag Issue"}</button>}</details>
    {first.submissionHistory?.length ? <details className="tscc-control-details"><summary>Earlier submission history ({first.submissionHistory.length})</summary>{first.submissionHistory.map((event, index) => <div key={index}><p>Reopened {event.reopenedAt.slice(0, 10)} · Previously sent {event.previous.emailedAt || "not recorded"} to {event.previous.departmentEmail || "not recorded"}</p>{event.previous.emailEvidenceDocumentId && <EvidenceFile location={first.location} documentId={event.previous.emailEvidenceDocumentId} label="earlier sent-email proof" />}</div>)}</details> : null}
    <p className="tscc-control-footnote">Records and checks are shared in the Hub. Jennifer sends the actual email outside the Hub.</p>
  </article>;
}

function Check({ checked, onChange, disabled, children }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; children: React.ReactNode }) {
  return <label className="tscc-check"><input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /><span>{children}</span></label>;
}
