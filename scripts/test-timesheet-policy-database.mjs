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
    create table locations(id uuid primary key,organization_id uuid,slug text,is_active boolean,name text,full_name text);
    create table staff_location_assignments(user_id uuid,organization_id uuid,location_id uuid);
    create table timesheets(id uuid primary key,organization_id uuid,location_id uuid,service_period text,funding_source text,record_data jsonb,workflow_stage text,updated_by uuid,updated_at timestamptz,child_id uuid);
    create table timesheet_submission_routes(id uuid primary key,organization_id uuid,location_id uuid,funding_source text,department_email text,record_data jsonb,updated_at timestamptz);
    create table children(id uuid primary key,organization_id uuid,location_id uuid,record_data jsonb,updated_at timestamptz);
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
  const assignmentName=(await readdir(folder)).find(name=>name.endsWith('_timesheet_assignment_editor.sql'));assert.ok(assignmentName);await db.exec(await readFile(new URL(assignmentName,folder),'utf8'));
  const tehachapiName=(await readdir(folder)).find(name=>name.endsWith('_timesheet_tehachapi_processor.sql'));assert.ok(tehachapiName);await db.exec(await readFile(new URL(tehachapiName,folder),'utf8'));
  const externalName=(await readdir(folder)).find(name=>name.endsWith('_timesheet_external_tracking.sql'));await db.exec(await readFile(new URL(externalName,folder),'utf8'));
});
beforeEach(async () => {
  await db.exec("reset role; select set_config('request.jwt.claims','{}',false); truncate timesheets,timesheet_submission_routes,staff_access,locations,staff_location_assignments,document_records,audit_log,user_notification_state,children; drop trigger if exists fail_audit on audit_log;");
  await db.query("insert into locations(id,organization_id,slug,is_active) values ($1,$2,'halcom',true),($3,$2,'tehachapi',true)", [loc, org, otherLoc]);
  for (const [user, name, role] of [[danielle, "Danielle Moore", "Owner / Admin"], [jen, "Jennifer Thomason", "Owner / Admin"], [latrice, "Latrice Test", "Location Licensee"], [unassigned, "Latrice Unassigned", "Location Licensee"]]) await db.query("insert into staff_access values ($1,$2,$3,$4,true)", [user, org, name, role]);
  await db.query("insert into staff_location_assignments values($1,$2,$3)", [latrice, org, loc]);
  await db.query("insert into timesheet_submission_routes values($1,$2,$3,'CCRC Stage 1','submissions@example.com',$4,'2026-10-01Z')", [routeId, org, loc, JSON.stringify({ routingVerified: true })]);
  for (const [key, type] of [[scan, "Timesheet Batch Scan"], [email, "Timesheet Sent Email Proof"], [receipt, "Timesheet Agency Receipt"]]) await db.query("insert into document_records values($1,$2,$3,$4,'Active')", [key, org, loc, type]);
  for (let n = 1; n <= 2; n++) await db.query("insert into timesheets(id,organization_id,location_id,service_period,funding_source,record_data,workflow_stage,updated_by,updated_at) values($1,$2,$3,'October 2026','CCRC Stage 1',$4,'Scan & Send to Jennifer',null,'2026-10-01Z')", [id(100+n), org, loc, JSON.stringify({ timesheetType: "CCRC Stage 1", completedAt: "2026-10-01T00:00:00Z" })]);
  await db.query("insert into children values($1,$2,$3,$4,'2026-10-01Z')",[id(60),org,loc,JSON.stringify({subsidy:'CCRC Stage 1',primaryGuardian:'Preserve guardian',secondaryGuardian:'Preserve second guardian',dateOfBirth:'2022-01-01'})]);
  await db.query("update timesheets set child_id=$1",[id(60)]);
  await db.exec("update locations set name=slug,full_name=slug");
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

async function assignment(overrides={}){
 const row=(await rows())[0];const c=(await db.query('select * from children')).rows[0];
 const args={org,actor:danielle,row:row.id,formAt:row.updated_at,childAt:c.updated_at,care:loc,funding:otherLoc,type:'CCRC Stage 2',scope:'both',...overrides};
 return db.query('select change_timesheet_assignment($1,$2,$3,$4,$5,$6,$7,$8,$9)',[args.org,args.actor,args.row,args.formAt,args.childAt,args.care,args.funding,args.type,args.scope]);
}
test('assignment changes selected month and profile atomically, preserving other months and contacts',async()=>{
 await assignment();const changed=(await rows())[0],untouched=(await rows())[1];
 assert.equal(changed.location_id,otherLoc);assert.equal(changed.funding_source,'CCRC Stage 2');assert.equal(changed.record_data.submissionDueDate,'2026-11-05');assert.equal(changed.record_data.completedAt,'');
 assert.equal(untouched.location_id,loc);assert.equal(untouched.funding_source,'CCRC Stage 1');
 const child=(await db.query('select * from children')).rows[0];assert.equal(child.location_id,loc);assert.equal(child.record_data.fundingLocationId,otherLoc);assert.equal(child.record_data.subsidy,'CCRC Stage 2');assert.equal(child.record_data.secondaryGuardian,'Preserve second guardian');assert.equal(child.record_data.dateOfBirth,'2022-01-01');assert.equal(await auditCount(),2);
});
test('form-only and profile-only changes have separate scopes, including future Cash Pay',async()=>{
 await assignment({scope:'form'});assert.equal((await db.query('select record_data from children')).rows[0].record_data.subsidy,'CCRC Stage 1');
 const before=await rows();await assignment({actor:jen,scope:'profile',type:'Cash Pay',care:otherLoc});assert.deepEqual(await rows(),before);assert.equal((await db.query('select record_data from children')).rows[0].record_data.subsidy,'Cash Pay');
});
test('assignment rejects unauthorized actors, cross-organization sites, stale writes, and scanned routing changes',async()=>{
 await assert.rejects(assignment({actor:jen}),/Unauthorized/);await assert.rejects(assignment({funding:id(999)}),/Invalid funding/);await assert.rejects(assignment({childAt:'2000-01-01Z'}),/Child changed/);await assert.rejects(assignment({formAt:'2000-01-01Z'}),/Timesheet changed/);
 await db.query("update timesheets set record_data=record_data||$1",[JSON.stringify({scanDocumentId:scan})]);
 await assert.rejects(assignment(),/Reopen/);assert.equal(await auditCount(),0);
 await assignment({scope:'profile'});assert.equal(await auditCount(),1);
});
test('assignment rolls back the form and profile together when auditing fails',async()=>{
 const before=await rows();const childBefore=(await db.query('select * from children')).rows;
 await db.exec("create function reject_assignment_audit() returns trigger language plpgsql as $$ begin if new.table_name='children' then raise exception 'synthetic audit failure'; end if; return new; end $$;create trigger fail_audit before insert on audit_log for each row execute function reject_assignment_audit();");
 await assert.rejects(assignment(),/synthetic audit failure/);assert.deepEqual(await rows(),before);assert.deepEqual((await db.query('select * from children')).rows,childBefore);assert.equal(await auditCount(),0);
});

test('Jennifer alone processes Tehachapi; neither processor can impersonate the other location owner',async()=>{
 for(const action of ['DANIELLE_DIRECT_INTAKE','TIMESHEET_FILLED_FROM_CERTIFICATE','scanBatch','emailBatch','SET_TYPE']){
  assert.equal((await db.query('select timesheet_actor_can($1,$2,$3,$4) allowed',[jen,org,otherLoc,action])).rows[0].allowed,true);
  assert.equal((await db.query('select timesheet_actor_can($1,$2,$3,$4) allowed',[danielle,org,otherLoc,action])).rows[0].allowed,false);
  assert.equal((await db.query('select timesheet_actor_can($1,$2,$3,$4) allowed',[jen,org,loc,action])).rows[0].allowed,false);
 }
 assert.equal((await db.query("select timesheet_actor_can($1,$2,$3,'verifyBatch') allowed",[jen,org,otherLoc])).rows[0].allowed,false);
 await assignment();assert.equal((await rows())[0].record_data.workflowOwner,'Jennifer');assert.equal((await rows())[0].record_data.workflowReviewer,'');
 await assert.rejects(assignment({type:'CCCC'}),/Unauthorized/);
 await assignment({actor:jen,type:'CCCC'});assert.equal((await rows())[0].record_data.submissionDueDate,'2026-11-01');
});
test('database accepts Jennifer’s Tehachapi submission only with the verified destination and evidence',async()=>{
 await db.query('update timesheets set location_id=$1',[otherLoc]);await db.query('update timesheet_submission_routes set location_id=$1',[otherLoc]);await db.query('update document_records set location_id=$1',[otherLoc]);
 const patch={submissionControlVersion:3,workflowOwner:'Jennifer',workflowReviewer:'',scanDocumentId:scan,emailEvidenceDocumentId:email,departmentEmail:'submissions@example.com',emailedByUserId:jen,emailedAt:'2026-11-01T20:00:00Z'};
 await assert.rejects(batch('emailBatch',danielle,patch,{loc:otherLoc}),/Unauthorized/);
 await assert.rejects(batch('emailBatch',jen,{...patch,departmentEmail:'wrong@example.com'},{loc:otherLoc}),/recipient/);
 await batch('emailBatch',jen,patch,{loc:otherLoc});assert.ok((await rows()).every(row=>row.record_data.emailedByUserId===jen));
});


test('current workflow records external scans and submissions without creating document records, while keeping recipient and actor controls',async()=>{
 await db.query('delete from document_records');
 const scanPatch={submissionControlVersion:3,scanRecordedExternally:true,scanQualityChecked:true,scanRecordedByUserId:danielle,scannedAt:'2026-11-01T18:00:00Z'};
 await assert.rejects(batch('scanBatch',danielle,{...scanPatch,scanQualityChecked:false}),/Confirm external scanning/);
 await batch('scanBatch',danielle,scanPatch);
 const emailPatch={submissionControlVersion:3,submissionRecordedExternally:true,attachmentConfirmed:true,emailedByUserId:danielle,emailedAt:'2026-11-01T19:00:00Z',departmentEmail:'submissions@example.com'};
 await assert.rejects(batch('emailBatch',danielle,{...emailPatch,departmentEmail:'wrong@example.com'}),/recipient/);
 await assert.rejects(batch('emailBatch',danielle,{...emailPatch,emailedByUserId:jen}),/Confirm external submission/);
 await batch('emailBatch',danielle,emailPatch);await batch('verifyBatch',jen,{jenReviewedAt:'2026-11-01T20:00:00Z'});
 assert.equal((await db.query('select count(*) n from document_records')).rows[0].n,0);
 assert.ok((await rows()).every(row=>row.record_data.scanRecordedExternally&&row.record_data.submissionRecordedExternally&&!row.record_data.scanDocumentId&&!row.record_data.emailEvidenceDocumentId));
});
