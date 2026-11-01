import assert from "node:assert/strict";
import { readFile,readdir } from "node:fs/promises";
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
    create table user_notification_state(user_id uuid primary key,inbox jsonb not null default '[]',preferences jsonb not null default '{}',updated_at timestamptz default now());
    create table audit_log(organization_id uuid,location_id uuid,actor_user_id uuid,action text,table_name text,row_id uuid,metadata jsonb);
    create function record_timesheet_submission_batch(uuid,uuid,text,text,uuid,text,uuid,jsonb) returns integer language sql as 'select 1';
    grant execute on function record_timesheet_submission_batch(uuid,uuid,text,text,uuid,text,uuid,jsonb) to service_role;
    grant all on all tables in schema public to service_role;
    grant select,insert,update,delete on timesheets,timesheet_submission_routes to authenticated;
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20261023000100_timesheet_accountability.sql", import.meta.url), "utf8"));
  const folder=new URL('../supabase/migrations/',import.meta.url);const name=(await readdir(folder)).find(name=>name.endsWith('_timesheet_danielle_jen_workflow.sql'));assert.ok(name);await db.exec(await readFile(new URL(name,folder),'utf8'));
});
beforeEach(async () => {
  await db.exec("reset role; select set_config('request.jwt.claims','{}',false); truncate timesheets,timesheet_submission_routes,staff_access,locations,staff_location_assignments,document_records,audit_log,user_notification_state; drop trigger if exists fail_audit on audit_log;");
  await db.query("insert into locations values ($1,$2,'halcom',true),($3,$2,'tehachapi',true)", [loc, org, otherLoc]);
  for (const [user, name, role] of [[danielle, "Danielle Moore", "Owner / Admin"], [jen, "Jennifer Thomason", "Owner / Admin"], [latrice, "Latrice Test", "Location Licensee"], [unassigned, "Latrice Unassigned", "Location Licensee"]]) await db.query("insert into staff_access values ($1,$2,$3,$4,true)", [user, org, name, role]);
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


test('only Danielle processes submissions and only Jen reviews them',async()=>{
 for(const [actor,action,expected] of [[danielle,'scanBatch',true],[danielle,'emailBatch',true],[danielle,'verifyBatch',false],[jen,'emailBatch',false],[jen,'verifyBatch',true],[latrice,'FORM_SIGNED',false],[latrice,'approveBatch',false],[unassigned,'SET_TYPE',false]]){
 const result=(await db.query('select timesheet_actor_can($1,$2,$3,$4) allowed',[actor,org,loc,action])).rows[0];assert.equal(result.allowed,expected);
 }
 assert.equal((await db.query("select timesheet_policy_applies('October 2026') current,timesheet_policy_applies('September 2026') old,timesheet_policy_applies('Nonsense 2030') invalid")).rows[0].current,true);
});
test('Danielle submits without a licensee handoff and Jen independently reviews',async()=>{
 await batch('emailBatch',danielle,{submissionControlVersion:3,scanDocumentId:scan,emailEvidenceDocumentId:email,departmentEmail:'submissions@example.com',emailedByUserId:danielle,emailedAt:'2026-11-01T19:00:00Z'});
 assert.ok((await rows()).every(row=>row.record_data.emailedByUserId===danielle));
 await assert.rejects(batch('verifyBatch',danielle,{jenReviewedAt:'now'}),/Unauthorized/);
 await batch('verifyBatch',jen,{jenReviewedAt:'2026-11-01T20:00:00Z',jenReviewedByUserId:jen});
 assert.ok((await rows()).every(row=>row.record_data.jenReviewedByUserId===jen));
});
test('current workflow still rejects wrong destinations, bad evidence and stale data',async()=>{
 await assert.rejects(batch('emailBatch',danielle,{departmentEmail:'wrong@example.com',emailEvidenceDocumentId:email}),/recipient mismatch/);
 await assert.rejects(batch('emailBatch',danielle,{departmentEmail:'submissions@example.com',emailEvidenceDocumentId:scan}),/evidence/);
 const payload=await updates({scanDocumentId:scan});payload[1].expected_updated_at='2000-01-01Z';await assert.rejects(batch('scanBatch',danielle,{}, {updates:payload}),/changed/);assert.equal(await auditCount(),0);
});
test('notification append is leadership-only, atomic and deduplicated',async()=>{
 const eventKey='timesheet-alert:synthetic:October:today';const notification={id:'synthetic-alert',eventKey,href:'/timesheets',title:'Synthetic deadline',body:'Synthetic count only'};
 await db.exec('set role service_role');
 const call=user=>db.query('select append_timesheet_alert($1,$2,$3,$4) added',[org,user,eventKey,JSON.stringify(notification)]);
 assert.equal((await call(danielle)).rows[0].added,true);assert.equal((await call(danielle)).rows[0].added,false);assert.equal((await call(jen)).rows[0].added,true);await assert.rejects(call(latrice),/recipient required/);
 await db.exec('reset role');assert.equal((await db.query('select jsonb_array_length(inbox) n from user_notification_state where user_id=$1',[danielle])).rows[0].n,1);
 const privileges=(await db.query("select has_function_privilege('authenticated','append_timesheet_alert(uuid,uuid,text,jsonb,jsonb,jsonb)','EXECUTE') allowed")).rows[0];assert.equal(privileges.allowed,false);
});

test('first deadline alert preserves a legacy inbox and notification preferences',async()=>{
 const key='timesheet-alert:seeded';const notification={id:'new',eventKey:key,href:'/timesheets'};
 await db.exec('set role service_role');await db.query('select append_timesheet_alert($1,$2,$3,$4,$5,$6)',[org,danielle,key,JSON.stringify(notification),JSON.stringify([{id:'previous',eventKey:'previous'}]),JSON.stringify({enabled:false,quietHoursEnabled:true})]);await db.exec('reset role');
 const saved=(await db.query('select inbox,preferences from user_notification_state where user_id=$1',[danielle])).rows[0];assert.deepEqual(saved.inbox.map(n=>n.id),['new','previous']);assert.equal(saved.preferences.enabled,false);assert.equal(saved.preferences.quietHoursEnabled,true);
});
