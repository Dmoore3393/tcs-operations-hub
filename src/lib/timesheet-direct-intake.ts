type Row = Record<string, unknown>;
const text = (v: unknown) => typeof v === "string" ? v : "";

/** Direct receipt is a documented leadership review, never a fabricated staff handoff. */
export function directIntakePatch(current: Row, body: Row, actor: { name: string; isOwner: boolean; isDanielle: boolean }, now: string) {
  if (!actor.isOwner || !actor.isDanielle) throw new Error("Danielle's active Owner/Admin account is required.");
  if (current.submissionIssue || current.completedAt || current.scanDocumentId || current.licenseeApprovalFingerprint || current.emailedAt) throw new Error("Use correction controls for a filled or submitted form.");
  const reason = text(body.reason).trim();
  if (reason.length < 5 || reason.length > 500) throw new Error("Enter a reason for direct receipt (5–500 characters).");
  if (body.received !== true) throw new Error("Confirm that the child's form is physically received.");
  const signed = body.signaturesChecked === true || Boolean(current.directSignaturesAt);
  const dated = body.datesChecked === true || Boolean(current.directDatesAt);
  const patch: Row = {
    directReceivedAt: current.directReceivedAt || now,
    directReceivedBy: actor.name,
    directReceiptReason: reason,
    ...(signed ? { directSignaturesAt: current.directSignaturesAt || now } : {}),
    ...(dated ? { directDatesAt: current.directDatesAt || now } : {}),
  };
  if (signed && dated) Object.assign(patch, {
    collectorSigned: true,
    collectorSignedAt: current.collectorSignedAt || now,
    collectorSignedBy: current.collectorSignedBy || actor.name,
    directReviewAt: current.directReviewAt || now,
    directReviewBy: actor.name,
  });
  return patch;
}
