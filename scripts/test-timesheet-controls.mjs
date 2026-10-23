import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const compile = source => "data:text/javascript;base64," + Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText).toString("base64");
const workflowURL = compile(await readFile(new URL("../src/lib/timesheet-workflow.ts", import.meta.url), "utf8"));
const workflow = await import(workflowURL);
const source = (await readFile(new URL("../src/lib/server/timesheet-batch-controls.ts", import.meta.url), "utf8")).replace('"@/lib/timesheet-workflow"', JSON.stringify(workflowURL));
const { controlledTimesheetBatch } = await import(compile(source));
const scan = "00000000-0000-4000-8000-000000000001", email = "00000000-0000-4000-8000-000000000002", receipt = "00000000-0000-4000-8000-000000000003";
function fixture() {
  const data = { collectorSigned: true, dynastyStatus: "Accounted For", dynastyHandedToDanielleAt: "2026-10-01T00:00:00Z", completedAt: "2026-10-01T01:00:00Z", timesheetType: "CCRC Stage 1", submissionDueDate: "2026-11-05" };
  const rows = [1, 2].map(id => ({ id: `form-${id}`, organization_id: "org", location_id: "halcom", service_period: "October 2026", funding_source: "CCRC Stage 1", updated_at: `v${id}`, record_data: { ...data } }));
  const documents = [scan, email, receipt].map((id, i) => ({ id, organization_id: "org", location_id: "halcom", document_type: ["Timesheet Batch Scan", "Timesheet Sent Email Proof", "Timesheet Agency Receipt"][i], status: "Active" }));
  const route = { id: "route", updatedAt: "revision-1", revision: "route:revision-1", department: "Test Department", email: "submissions@example.com", verified: true };
  const calls = []; let sequence = 0; let rpcError = null;
  const admin = {
    from(table) {
      const filters = []; const query = { select() { return query; }, eq(key, value) { filters.push([key, value]); return query; }, maybeSingle() { return query.then(result => ({ ...result, data: result.data[0] ?? null })); }, then(resolve, reject) { const source = table === "timesheets" ? rows : documents; return Promise.resolve({ data: source.filter(row => filters.every(([key, value]) => row[key] === value)), error: null }).then(resolve, reject); } }; return query;
    },
    async rpc(name, args) {
      calls.push({ name, args }); if (rpcError) return { error: rpcError };
      for (const update of args.p_updates) { const row = rows.find(row => row.id === update.id); row.record_data = structuredClone(update.record_data); row.updated_at = `saved-${++sequence}`; }
      return { data: args.p_updates.length, error: null };
    },
  };
  async function act(action, extras = {}, person = "Danielle") {
    const actor = { name: person, isDanielle: person === "Danielle", isJennifer: person === "Jennifer", isOwner: ["Danielle", "Jennifer"].includes(person), collectorSlug: person === "Latrice" ? "halcom" : person === "Noah" ? "tehachapi" : null, canViewAll: ["Danielle", "Jennifer"].includes(person) };
    const body = { action, servicePeriod: "October 2026", locationSlug: "halcom", timesheetType: "CCRC Stage 1", routeRevision: route.revision, expectedRows: rows.map(row => ({ id: row.id, updatedAt: row.updated_at })), ...extras };
    try { return await controlledTimesheetBatch({ admin, organizationId: "org", userId: person, actor, locations: [{ id: "halcom", slug: "halcom" }], routes: { [workflow.timesheetRouteKey("halcom", "CCRC Stage 1")]: route }, body }); }
    catch (error) { if (error instanceof Response) return error; throw error; }
  }
  const scans = () => act("scanBatch", { documentId: scan, scanQualityChecked: true });
  const approve = () => act("approveBatch", { formCount: 2, rosterConfirmed: true, destinationConfirmed: true }, "Latrice");
  const submit = (extras = {}) => act("emailBatch", { documentId: email, actualRecipient: route.email, sentAt: "2026-10-21T20:00:00Z", attachmentConfirmed: true, ...extras }, "Jennifer");
  return { rows, documents, route, calls, act, scans, approve, submit, setRpcError(error) { rpcError = error; } };
}
const ok = async promise => { const response = await promise; assert.equal(response.status, 200, await response.text()); };
const error = async (promise, status = 400) => { const response = await promise; assert.equal(response.status, status, await response.text()); };

test("full packet -> licensee approval -> sent proof -> independent check -> agency receipt", async () => {
  const f = fixture(); await ok(f.scans()); assert.equal(workflow.timesheetStage(f.rows[0].record_data), "Licensee Approval");
  await ok(f.approve()); assert.equal(workflow.timesheetStage(f.rows[0].record_data), "Jennifer Email");
  await ok(f.submit()); assert.equal(workflow.timesheetStage(f.rows[0].record_data), "Licensee Verification");
  await ok(f.act("verifyBatch", { submissionChecked: true }, "Latrice")); assert.equal(workflow.timesheetStage(f.rows[0].record_data), "Agency Receipt");
  await ok(f.act("receiptBatch", { documentId: receipt, reference: "Agency reference 123", agencyAccepted: true }));
  assert.ok(f.rows.every(row => workflow.timesheetStage(row.record_data) === "Complete"));
  assert.equal(f.calls.length, 5);
});
test("one missing form completion prevents a partial batch", async () => { const f = fixture(); delete f.rows[1].record_data.completedAt; await error(f.scans()); assert.equal(f.calls.length, 0); });
test("stale or duplicate membership cannot silently submit", async () => { const f = fixture(); await error(f.act("scanBatch", { expectedRows: [] }), 409); await error(f.act("scanBatch", { expectedRows: [{ id: "form-1", updatedAt: "v1" }, { id: "form-1", updatedAt: "v1" }] }), 409); assert.equal(f.calls.length, 0); });
test("scans require real evidence for the same organization, location and type", async () => {
  for (const patch of [{ organization_id: "other" }, { location_id: "other" }, { document_type: "Other Child Form" }, { status: "Deleted" }]) { const f = fixture(); Object.assign(f.documents[0], patch); await error(f.scans()); assert.equal(f.calls.length, 0); }
  const f = fixture(); await error(f.act("scanBatch", { scanQualityChecked: true }));
});
test("approval requires assigned licensee, due date, exact count and both checks", async () => {
  const f = fixture(); await ok(f.scans()); await error(f.act("approveBatch", { formCount: 2, rosterConfirmed: true, destinationConfirmed: true }), 403);
  await error(f.act("approveBatch", { formCount: 1, rosterConfirmed: true, destinationConfirmed: true }, "Latrice"));
  await error(f.act("approveBatch", { formCount: 2, destinationConfirmed: true }, "Latrice"));
  f.rows[1].record_data.submissionDueDate = ""; await error(f.approve());
});
test("route edits and packet edits invalidate prior approval", async () => {
  const f = fixture(); await ok(f.scans()); await ok(f.approve()); f.route.revision = "new-route"; await error(f.submit());
  await ok(f.approve()); f.rows[1].record_data.scanBatchId = "changed-packet"; await error(f.submit());
});
test("unverified, wrong-recipient, future-dated and evidence-free emails are rejected", async () => {
  const f = fixture(); await ok(f.scans()); await ok(f.approve());
  await error(f.submit({ actualRecipient: "wrong@example.com" })); await error(f.submit({ sentAt: "2100-01-01T00:00:00Z" })); await error(f.submit({ documentId: "" }));
  f.route.verified = false; await error(f.submit());
});
test("only Danielle scans and only Jennifer records company email", async () => {
  const f = fixture(); await error(f.act("scanBatch", {}, "Jennifer"), 403); await error(f.act("emailBatch", {}, "Danielle"), 403); await error(f.act("verifyBatch", {}, "Noah"), 403);
});
test("a sender cannot verify their own submission even if assigned as licensee", async () => {
  const f = fixture(); await ok(f.scans()); await ok(f.approve()); await ok(f.submit()); f.rows.forEach(row => { row.record_data.emailedByUserId = "Latrice"; }); await error(f.act("verifyBatch", { submissionChecked: true }, "Latrice"), 403);
});
test("agency receipt cannot skip independent verification or reference/evidence", async () => {
  const f = fixture(); await ok(f.scans()); await ok(f.approve()); await ok(f.submit()); await error(f.act("receiptBatch", { documentId: receipt, reference: "ref", agencyAccepted: true }));
  await ok(f.act("verifyBatch", { submissionChecked: true }, "Latrice")); await error(f.act("receiptBatch", { documentId: receipt, agencyAccepted: true })); await error(f.act("receiptBatch", { documentId: email, reference: "ref", agencyAccepted: true }));
});
test("issues prevent closing; reopening requires a manager and preserves initial workflow", async () => {
  const f = fixture(); await ok(f.scans()); await ok(f.approve()); await ok(f.submit()); await ok(f.act("flagBatch", { reason: "Missing a child in the submitted attachment" }, "Latrice"));
  assert.equal(workflow.timesheetStage(f.rows[0].record_data), "Correction Required"); await error(f.act("verifyBatch", { submissionChecked: true }, "Latrice")); await error(f.act("reopenBatch", { reason: "Add the missing form and check the packet" }, "Latrice"), 403);
  await ok(f.act("reopenBatch", { reason: "Add the missing form and prepare corrected scans" })); assert.ok(f.rows[0].record_data.completedAt); assert.equal(f.rows[0].record_data.emailEvidenceDocumentId, "");
});
test("a database conflict reports failure without changing the batch", async () => { const f = fixture(); f.setRpcError(new Error("concurrent change")); await error(f.scans(), 409); assert.equal(f.rows[0].record_data.scanDocumentId, undefined); });
test("deadline validation and overdue tracking use valid calendar dates", () => { assert.equal(workflow.validSubmissionDate("2026-02-30"), false); assert.equal(workflow.validSubmissionDate("2028-02-29"), true); assert.equal(workflow.batchOverdue([{ submissionDueDate: "2026-10-20" }], "2026-10-21"), true); assert.equal(workflow.pacificToday(new Date("2026-10-22T01:00:00Z")), "2026-10-21"); });
