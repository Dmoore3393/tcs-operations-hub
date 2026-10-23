import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test, before, beforeEach, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const org = id(1), loc = id(2), otherLoc = id(3), danielle = id(10), jen = id(11), latrice = id(12), unassigned = id(13), routeId = id(20), scan = id(30), email = id(31), receipt = id(32);
before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table staff_access(user_id uuid primary key,organization_id uuid,full_name text,role text,is_active boolean);
    create table locations(id uuid primary key,organization_id uuid,slug text,is_active boolean);
    create table staff_location_assignments(user_id uuid,organization_id uuid,location_id uuid);
    create table timesheets(id uuid primary key,organization_id uuid,location_id uuid,service_period text,funding_source text,record_data jsonb,workflow_stage text,updated_by uuid,updated_at timestamptz);
    create table timesheet_submission_routes(id uuid primary key,organization_id uuid,location_id uuid,funding_source text,department_email text,record_data jsonb,updated_at timestamptz);
    create table document_records(id uuid primary key,organization_id uuid,location_id uuid,document_type text,status text);
    create table audit_log(organization_id uuid,location_id uuid,actor_user_id uuid,action text,table_name text,row_id uuid,metadata jsonb);
    create function record_timesheet_submission_batch(uuid,uuid,text,text,uuid,text,uuid,jsonb) returns integer language sql as 'select 1';
    grant execute on function record_timesheet_submission_batch(uuid,uuid,text,text,uuid,text,uuid,jsonb) to service_role;
    grant all on all tables in schema public to service_role;
    grant select,insert,update,delete on timesheets,timesheet_submission_routes to authenticated;
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20261023000100_timesheet_accountability.sql", import.meta.url), "utf8"));
});
beforeEach(async () => {
  await db.exec("reset role; select set_config('request.jwt.claims','{}',false); truncate timesheets,timesheet_submission_routes,staff_access,locations,staff_location_assignments,document_records,audit_log; drop trigger if exists fail_audit on audit_log;");
  await db.query("insert into locations values ($1,$2,'halcom',true),($3,$2,'tehachapi',true)", [loc, org, otherLoc]);
  for (const [user, name, role] of [[danielle, "Danielle Test", "Owner / Admin"], [jen, "Jennifer Test", "Owner / Admin"], [latrice, "Latrice Test", "Location Licensee"], [unassigned, "Latrice Unassigned", "Location Licensee"]]) await db.query("insert into staff_access values ($1,$2,$3,$4,true)", [user, org, name, role]);
  await db.query("insert into staff_location_assignments values($1,$2,$3)", [latrice, org, loc]);
  await db.query("insert into timesheet_submission_routes values($1,$2,$3,'CCRC Stage 1','submissions@example.com',$4,'2026-10-01Z')", [routeId, org, loc, JSON.stringify({ routingVerified: true })]);
  for (const [key, type] of [[scan, "Timesheet Batch Scan"], [email, "Timesheet Sent Email Proof"], [receipt, "Timesheet Agency Receipt"]]) await db.query("insert into document_records values($1,$2,$3,$4,'Active')", [key, org, loc, type]);
  for (let n = 1; n <= 2; n++) await db.query("insert into timesheets values($1,$2,$3,'October 2026','CCRC Stage 1',$4,'Scan & Send to Jennifer',null,'2026-10-01Z')", [id(100+n), org, loc, JSON.stringify({ timesheetType: "CCRC Stage 1", completedAt: "2026-10-01T00:00:00Z" })]);
});
after(() => db.close());
async function rows() { return (await db.query("select * from timesheets order by id")).rows; }
async function updates(patch = {}) { return (await rows()).map(row => ({ id: row.id, expected_updated_at: new Date(row.updated_at).toISOString(), record_data: { ...row.record_data, ...patch }, workflow_stage: "Licensee Approval" })); }
async function batch(action, actor, patch = {}, overrides = {}) {
  const args = { org, loc, period: "October 2026", type: "CCRC Stage 1", actor, action, updates: await updates(patch), routeId: ["approveBatch", "emailBatch"].includes(action) ? routeId : null, routeAt: "2026-10-01T00:00:00Z", ...overrides };
  return db.query("select record_timesheet_controlled_batch($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [args.org, args.loc, args.period, args.type, args.actor, args.action, id(40), JSON.stringify(args.updates), args.routeId, args.routeAt]);
}
const auditCount = async () => Number((await db.query("select count(*) n from audit_log")).rows[0].n);

test("database revokes direct and legacy write paths", async () => {
  const result = await db.query("select has_table_privilege('authenticated','timesheets','UPDATE') as direct,has_function_privilege('authenticated','record_timesheet_controlled_batch(uuid,uuid,text,text,uuid,text,uuid,jsonb,uuid,timestamptz)','EXECUTE') as rpc,has_function_privilege('service_role','record_timesheet_submission_batch(uuid,uuid,text,text,uuid,text,uuid,jsonb)','EXECUTE') as legacy");
  assert.deepEqual(result.rows[0], { direct: false, rpc: false, legacy: true });
  await db.exec("set role authenticated"); await assert.rejects(db.exec("update timesheets set workflow_stage='Complete'"), /permission denied/); await db.exec("reset role");
});
test("guard still blocks end-user writes if permissions are accidentally regranted", async () => {
  await db.exec("grant update on timesheets to authenticated; set role authenticated"); await assert.rejects(db.exec("update timesheets set workflow_stage='Complete'"), /controlled Timesheet/); await db.exec("reset role; revoke update on timesheets from authenticated");
  await db.exec(`select set_config('request.jwt.claims','{"role":"authenticated"}',false)`); await assert.rejects(db.exec("update timesheets set workflow_stage='Complete'"), /controlled Timesheet/);
});
test("a full batch commits together with one audit record per form", async () => {
  await batch("scanBatch", danielle, { scanDocumentId: scan }); assert.equal(await auditCount(), 2); assert.ok((await rows()).every(row => row.record_data.scanDocumentId === scan));
});
test("wrong actors, inactive staff and unassigned licensees are rejected", async () => {
  await assert.rejects(batch("scanBatch", jen, { scanDocumentId: scan }), /Unauthorized/);
  await assert.rejects(batch("approveBatch", unassigned), /Unauthorized/);
  await db.query("update staff_access set is_active=false where user_id=$1", [danielle]); await assert.rejects(batch("scanBatch", danielle, { scanDocumentId: scan }), /Unauthorized/); assert.equal(await auditCount(), 0);
});
test("stale last row rolls back earlier row writes and audits", async () => {
  const payload = await updates({ scanDocumentId: scan }); payload[1].expected_updated_at = "2000-01-01T00:00:00Z";
  await assert.rejects(batch("scanBatch", danielle, {}, { updates: payload }), /Batch record changed/); assert.equal(await auditCount(), 0); assert.ok((await rows()).every(row => !row.record_data.scanDocumentId));
});
test("missing and duplicate members cannot produce a partial batch", async () => {
  const payload = await updates({ scanDocumentId: scan }); await assert.rejects(batch("scanBatch", danielle, {}, { updates: payload.slice(0, 1) }), /membership/); await assert.rejects(batch("scanBatch", danielle, {}, { updates: [payload[0], payload[0]] }), /membership/); assert.equal(await auditCount(), 0);
});
test("proof belongs to the exact location and document type", async () => {
  await assert.rejects(batch("scanBatch", danielle, { scanDocumentId: email }), /Invalid submission evidence/);
  await db.query("update document_records set location_id=$1 where id=$2", [otherLoc, scan]); await assert.rejects(batch("scanBatch", danielle, { scanDocumentId: scan }), /Invalid submission evidence/); assert.equal(await auditCount(), 0);
});
test("changing routing between read and commit rejects the old approval", async () => {
  await db.query("update timesheet_submission_routes set updated_at='2026-10-02Z' where id=$1", [routeId]); await assert.rejects(batch("approveBatch", latrice), /Route changed/); assert.equal(await auditCount(), 0);
});
test("recipient mismatch and self-verification are database errors", async () => {
  await db.exec(`update timesheets set record_data=record_data || '{"licenseeApprovalFingerprint":"approved"}'::jsonb`);
  await assert.rejects(batch("emailBatch", jen, { departmentEmail: "wrong@example.com", emailEvidenceDocumentId: email }), /recipient mismatch/);
  await db.query("update timesheets set record_data=record_data || jsonb_build_object('emailedByUserId',$1::text)", [latrice]); await assert.rejects(batch("verifyBatch", latrice), /Sender cannot verify/);
});
test("audit failure rolls back the batch instead of recording an unaudited success", async () => {
  await db.exec("create or replace function fail_timesheet_test_audit() returns trigger language plpgsql as $$ begin raise exception 'test audit failure'; end $$; create trigger fail_audit before insert on audit_log for each row execute function fail_timesheet_test_audit();");
  await assert.rejects(batch("scanBatch", danielle, { scanDocumentId: scan }), /test audit failure/); assert.ok((await rows()).every(row => !row.record_data.scanDocumentId));
});
test("reopening preserves earlier submission evidence in immutable audit and history", async () => {
  await db.query("update timesheets set record_data=record_data || jsonb_build_object('emailEvidenceDocumentId',$1::text,'submissionIssue','Wrong department')", [email]);
  await batch("reopenBatch", danielle, { emailEvidenceDocumentId: "", submissionIssue: null });
  assert.equal((await rows())[0].record_data.submissionHistory[0].previous.emailEvidenceDocumentId, email);
  assert.equal((await db.query("select metadata->'before'->>'emailEvidenceDocumentId' proof from audit_log limit 1")).rows[0].proof, email);
});
test("single form updates use row-version checks and atomic auditing", async () => {
  const call = stamp => db.query("select record_timesheet_controlled_action($1,$2,$3,$4,'TIMESHEET_FILLED_FROM_CERTIFICATE',$5,'CCRC Stage 1','Scan & Send to Jennifer')", [org, id(101), danielle, stamp, JSON.stringify({ completedAt: "now", timesheetType: "CCRC Stage 1" })]);
  await assert.rejects(call("2000-01-01Z"), /Timesheet changed/); await call("2026-10-01Z"); assert.equal(await auditCount(), 1);
});
