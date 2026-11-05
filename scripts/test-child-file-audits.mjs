import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

function moduleUrl(source) {
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return "data:text/javascript;base64," + Buffer.from(outputText).toString("base64");
}

const url = moduleUrl(await readFile("src/lib/child-file-audits.ts", "utf8"));
const {
  auditForReview, auditItemFor, auditProfileDocuments, auditStatusFlags, auditSummary,
  createBlankChildFileAudit, documentsForTemplate, latestFileAudit,
} = await import(url);

function reviewed(template = "In-Home") {
  const audit = createBlankChildFileAudit("Synthetic Reviewer", template);
  for (const item of audit.items) item.status = "On File";
  return audit;
}
const asOf = "2030-01-15";

test("family homes get the home-specific forms and expanded-capacity notice; extended hours are conditional in both programs", () => {
  const home = documentsForTemplate("In-Home"), center = documentsForTemplate("School Age Center");
  assert.ok(home.some(doc => doc.name.startsWith("LIC 995A") && doc.requirement === "Required"));
  assert.ok(home.some(doc => doc.name.startsWith("LIC 9212")));
  assert.ok(home.some(doc => doc.name.startsWith("LIC 9150") && doc.requirement === "If Applicable"));
  assert.ok(!center.some(doc => doc.name.startsWith("LIC 9150") || doc.name.startsWith("LIC 995A")));
  for (const prefix of ["LIC 995 –", "LIC 702", "LIC 613A"]) {
    assert.ok(!home.some(doc => doc.name.startsWith(prefix)));
    assert.ok(center.some(doc => doc.name.startsWith(prefix)));
  }
  for (const template of [home, center]) {
    assert.equal(new Set(template.map(doc => doc.id)).size, template.length);
    assert.equal(template.find(doc => doc.name === "Extended Hours Care Agreement").requirement, "If Applicable");
  }
  for (const id of [7, 16, 17, 33, 34, 35]) assert.equal(home.find(doc => doc.id === id).requirement, "If Applicable");
});

test("N/A is reviewed, never missing, expired or due soon, even on a required row with an old date", () => {
  for (const template of ["In-Home", "School Age Center"]) {
    const audit = reviewed(template), a = audit.items[0], b = audit.items[1];
    Object.assign(a, { status: "N/A", expirationDate: "2029-01-01", note: "Synthetic note" });
    Object.assign(b, { status: "N/A", expirationDate: "2030-01-18" });
    audit.statusFlags = ["Missing Documents", "Transportation Child"];
    const summary = auditSummary(audit, asOf);
    assert.equal(summary.checked, summary.total); assert.equal(summary.complete, true);
    assert.deepEqual([summary.expired, summary.expiringSoon, summary.missingDocuments], [[], [], []]);
    assert.deepEqual(auditStatusFlags(audit, summary), ["Transportation Child", "File Complete"]);
    b.status = "Missing";
    const changed = auditSummary(audit, asOf);
    assert.equal(changed.missingRequired.length, 1);
    assert.deepEqual(auditStatusFlags(audit, changed), ["Transportation Child", "Missing Documents"]);
    b.status = "On File"; b.expirationDate = "2029-01-01";
    assert.equal(auditSummary(audit, asOf).expired.length, 1);
  }
});

test("unreviewed optional items request review without a missing flag; explicitly missing conditional forms are actionable", () => {
  const audit = reviewed();
  const item = auditItemFor(audit, 41); item.status = "Not Checked";
  let summary = auditSummary(audit, asOf);
  assert.ok(!summary.complete); assert.deepEqual(summary.missingDocuments, []); assert.deepEqual(auditStatusFlags(audit, summary), []);
  item.status = "Missing";
  assert.deepEqual(auditSummary(audit, asOf).missingDocuments, [documentsForTemplate("In-Home").find(doc => doc.id === 41).name]);
  item.status = "N/A";
  const required = auditItemFor(audit, 1); required.status = "Not Checked";
  assert.equal(auditSummary(audit, asOf).missingRequired[0].documentId, 1);
});

test("opening an earlier checklist adds unreviewed forms without changing historical results, IDs or notes", () => {
  const audit = reviewed();
  audit.items = audit.items.filter(item => item.documentId <= 40);
  const legacy = { documentId: 3, status: "On File", expirationDate: "2027-01-01", dateChecked: asOf, note: "Keep this older center-form entry" };
  audit.items.push(legacy);
  const before = structuredClone(audit);
  assert.equal(auditSummary(audit, asOf).complete, true);
  assert.equal(auditSummary(audit, asOf).expired.length, 0);
  const editor = auditForReview(audit);
  assert.deepEqual(audit, before);
  assert.equal(editor.items.find(item => item.documentId === 3).note, legacy.note);
  assert.equal(auditItemFor(editor, 43).status, "Not Checked");
  assert.equal(auditItemFor(editor, 41).status, "Not Checked");
  assert.equal(auditItemFor(editor, 42).status, "Not Checked");
  assert.deepEqual(auditForReview(editor).items, editor.items);
});

test("old cached N/A names clear without erasing real missing paperwork, manual entries or archived notes", () => {
  const audit = reviewed();
  const [first, second] = audit.items;
  first.status = "N/A"; second.status = "Missing";
  const docs = documentsForTemplate("In-Home");
  const firstName = docs.find(doc => doc.id === first.documentId).name;
  const secondName = docs.find(doc => doc.id === second.documentId).name;
  const retired = "LIC 613A – Personal Rights Child Care Centers";
  const originalNames = [firstName, secondName, retired, "Separate manual item"];
  assert.deepEqual(auditProfileDocuments(audit, originalNames, "Missing Documents"), {
    licensingStatus: "Missing Documents", missingDocuments: [secondName, "Separate manual item"],
  });
  const next = structuredClone(audit);
  auditItemFor(next, second.documentId).status = "N/A";
  assert.deepEqual(auditProfileDocuments(next, [firstName, secondName, retired], "Missing Documents", audit), {
    licensingStatus: "Complete", missingDocuments: [],
  });
  assert.deepEqual(auditProfileDocuments(null, ["Unreviewed file"], "Missing Documents").missingDocuments, ["Unreviewed file"]);
  assert.equal(auditProfileDocuments(audit, [], "Missing Documents").licensingStatus, "Missing Documents");
  audit.auditDate = "2030-01-01"; next.auditDate = "2030-02-01"; next.id = "newer-audit";
  assert.equal(latestFileAudit([next, audit]).id, next.id);
  audit.auditDate = next.auditDate; audit.updatedAt = "2030-02-01T10:00:00Z"; next.updatedAt = "2030-02-01T12:00:00Z";
  assert.equal(latestFileAudit([audit, next]).id, next.id);
});

test("enrollment packets respect N/A on both templates and include a conditional form explicitly marked missing", async () => {
  const path = "src/app/(portal)/enrollment-readiness/page.tsx";
  const source = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "applicableDocuments");
  const { applicableDocuments } = await import(moduleUrl('import { auditItemFor, documentsForTemplate, templateForChildLocation } from ' +
    JSON.stringify(url) + ';\nexport ' + fn.getText(source)));
  for (const [template, location] of [["In-Home", "Halcom"], ["School Age Center", "Division"]]) {
    const audit = reviewed(template);
    const first = audit.items[0]; first.status = "N/A";
    const extended = auditItemFor(audit, 42); extended.status = "Missing";
    const child = { location, ageGroup: "School Age", transportation: "No transportation", allergies: "None reported", medicalNotes: "No current medical notes" };
    if (template === "In-Home") {
      const infant = { ...child, ageGroup: "Infant" };
      assert.ok(applicableDocuments(infant, null).some(doc => doc.id === 7));
      auditItemFor(audit, 7).status = "N/A";
      assert.ok(!applicableDocuments(infant, audit).some(doc => doc.id === 7));
    }
    const ids = applicableDocuments(child, audit).map(doc => doc.id);
    assert.ok(!ids.includes(first.documentId)); assert.ok(ids.includes(42));
    extended.status = "N/A";
    assert.ok(!applicableDocuments(child, audit).some(doc => doc.id === 42));
  }
});
