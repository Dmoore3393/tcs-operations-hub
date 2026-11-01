import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const url=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const policyUrl=url(await read('src/lib/timesheet-policy.ts')),workflowUrl=url(await read('src/lib/timesheet-workflow.ts')),checklistUrl=url(await read('src/lib/timesheet-checklist.ts'));
const p=await import(policyUrl),w=await import(workflowUrl);
let source=await read('src/lib/server/timesheet-alerts.ts');
source=source.replace('import "server-only";','').replace('"@/lib/timesheet-policy"',JSON.stringify(policyUrl)).replace('"@/lib/timesheet-workflow"',JSON.stringify(workflowUrl)).replace('"@/lib/timesheet-checklist"',JSON.stringify(checklistUrl)).replace(/import \{isOwnerAccessRole\}[^;]+;/,'const isOwnerAccessRole=role=>role==="Owner / Admin";').replace(/import \{deliverStoredTimesheetAlert,loadNotificationState\}[^;]+;/,'const deliverStoredTimesheetAlert=async()=>{};const loadNotificationState=async()=>({inbox:[],preferences:{}});');
const alerts=await import(url(source));
test('October deadlines start November 1 and stage 2 stays due November 5',()=>{
 for(const type of ['CCRC Stage 1','CCCC','DCFS'])assert.equal(p.timesheetDeadline('October 2026',type),'2026-11-01');
 assert.equal(p.timesheetDeadline('October 2026','CCRC Stage 2'),'2026-11-05');assert.equal(p.timesheetDeadline('December 2026','CCRC Stage 2'),'2027-01-05');
 assert.equal(p.timesheetDeadline('October 2026','Respite'),'');assert.equal(p.timesheetDeadline('September 2026','CCCC'),'');
 assert.equal(p.timesheetDeadlineFlag('2026-11-01',false,'2026-11-01'),'Due today');assert.equal(p.timesheetDeadlineFlag('2026-11-01',false,'2026-11-02'),'Overdue');assert.equal(p.timesheetDeadlineFlag('2026-11-05',false,'2026-11-01'),'');assert.equal(p.timesheetDeadlineFlag('2026-11-01',true,'2026-11-02'),'');assert.equal(p.timesheetDeadlineFlag('unknown',false,'2026-11-02'),'');
});
test('current forms require Danielle steps followed by Jen review, without old staff gates',()=>{
 let r=p.applyTimesheetPolicy({},'October 2026','CCCC');assert.equal(w.timesheetStage(r),'Location Sign-Off');
 Object.assign(r,{directReceivedAt:'time',directSignaturesAt:'time',directDatesAt:'time',collectorSigned:true});assert.equal(w.timesheetStage(r),'Danielle Fill Out');
 r.completedAt='time';assert.equal(w.timesheetStage(r),'Scan & Send to Jennifer');r.scanDocumentId='scan';r.scannedAt='time';assert.equal(w.timesheetStage(r),'Jennifer Email');r.emailEvidenceDocumentId='proof';r.emailedAt='time';assert.equal(w.timesheetStage(r),'Licensee Verification');r.jenReviewedAt='time';assert.equal(w.timesheetStage(r),'Complete');
 assert.equal(r.dynastyReviewedAt,undefined);assert.equal(r.licenseeApprovedAt,undefined);assert.equal(r.emailedByJenniferAt,undefined);
});
const form=(id,type,extra={})=>({child_id:id,service_period:'October 2026',funding_source:type,record_data:{timesheetType:type,...extra}});
test('deadline red flags include missing eligible forms and do not guess Respite or blank funding',()=>{
 const forms=[form('one','CCRC Stage 1'),form('two','CCRC Stage 2'),form('three','CCCC',{emailedAt:'time',emailEvidenceDocumentId:'proof'})];
 const children=[{id:'missing',enrollment_status:'Active',record_data:{subsidy:'DCFS'}},{id:'not-started',enrollment_status:'Active',record_data:{subsidy:'CCCC',neverStartedCare:true}},{id:'respite',enrollment_status:'Active',record_data:{subsidy:'Respite'}},{id:'blank',enrollment_status:'Active',record_data:{}},{id:'new',enrollment_status:'Active',record_data:{subsidy:'CCCC',plannedStartDate:'2026-11-03'}}];
 const found=alerts.timesheetAlertsForRows(forms,children,'2026-11-01','October 2026');assert.deepEqual(found.map(a=>`${a.type}:${a.status}:${a.count}`).sort(),['CCCC:Jen review:1','CCRC Stage 1:Due today:1','DCFS:Due today:1']);
 const later=alerts.timesheetAlertsForRows(forms,children,'2026-11-06','October 2026');assert.ok(later.some(a=>a.type==='CCRC Stage 2'&&a.status==='Overdue'));
});
test('scheduled alerts reach only same-organization Danielle and Jen, once daily per program',async()=>{
 const people=[{user_id:'dan',organization_id:'org',full_name:'Danielle Moore',role:'Owner / Admin'},{user_id:'jen',organization_id:'org',full_name:'Jennifer Thomason',role:'Owner / Admin'},{user_id:'other',organization_id:'org',full_name:'Other Owner',role:'Owner / Admin'}];
 const delivered=[],seen=new Set();const forms=[{...form('one','CCCC'),organization_id:'org'}];const sites=[];
 const admin={from(table){const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},in(k,values){filters.push([k,values]);return q},then(resolve,reject){const rows=table==='staff_access'?people.map(p=>({...p,is_active:true})):table==='timesheets'?forms:table==='locations'?sites:[];return Promise.resolve({data:rows.filter(row=>filters.every(([k,v])=>Array.isArray(v)?v.includes(row[k]):row[k]===v)),error:null}).then(resolve,reject)}};return q},async rpc(name,args){assert.equal(name,'append_timesheet_alert');assert.equal(args.p_org,'org');const key=args.p_user+args.p_event_key;const fresh=!seen.has(key);seen.add(key);if(fresh)delivered.push(args);return {data:fresh,error:null}}};
 await alerts.scanTimesheetAlerts(admin,'org',new Date('2026-11-01T21:00:00Z'));assert.deepEqual(delivered.map(d=>d.p_user).sort(),['dan','jen']);assert.ok(delivered.every(d=>!d.p_notification.body.includes('one')));
 await alerts.scanTimesheetAlerts(admin,'org',new Date('2026-11-01T22:00:00Z'));assert.equal(delivered.length,2);
 await alerts.scanTimesheetAlerts(admin,'other-org',new Date('2026-11-01T22:00:00Z'));assert.equal(delivered.length,2);
 forms.push({...form('teh','CCCC'),location_id:'teh',organization_id:'org'});sites.push({id:'teh',slug:'tehachapi',organization_id:'org'});await alerts.scanTimesheetAlerts(admin,'org',new Date('2026-11-01T22:00:00Z'));assert.equal(delivered.length,3);assert.equal(delivered[2].p_user,'jen');assert.ok(delivered[2].p_event_key.includes(':tehachapi:'));
 people.push({...people[0],user_id:'duplicate-name'});await alerts.scanTimesheetAlerts(admin,'org',new Date('2026-11-02T22:00:00Z'));assert.equal(delivered.length,3);
});
test('scheduled endpoint requires its server secret, including non-ASCII malformed headers',async()=>{
 let routeSource=await read('src/app/api/cron/timesheets/route.ts');routeSource=routeSource.replace(/import \{createSupabaseAdminClient\}[^;]+;/,'const createSupabaseAdminClient=()=>({});').replace(/import \{scanTimesheetAlerts\}[^;]+;/,'const scanTimesheetAlerts=async()=>({flagged:2,delivered:2});');const route=await import(url(routeSource));const old=process.env.CRON_SECRET;process.env.CRON_SECRET='synthetic-secret';
 try{for(const authorization of ['', 'Bearer wrong', 'Bearer synthetic-secret-extra'])assert.equal((await route.GET(new Request('https://synthetic.invalid',{headers:{authorization}}))).status,401);assert.equal((await route.GET(new Request('https://synthetic.invalid',{headers:{authorization:'Bearer synthetic-secret'}}))).status,200);}finally{if(old===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=old;}
});
test('Tehachapi assigns Jennifer all processing steps and closes on actual submission proof, with the same deadlines',()=>{
 let r=p.applyTimesheetPolicy({},'October 2026','CCRC Stage 1','tehachapi');
 assert.equal(r.workflowOwner,'Jennifer');assert.equal(r.workflowReviewer,'');assert.equal(r.submissionDueDate,'2026-11-01');
 assert.equal(p.canProcessTimesheet({isOwner:true,isDanielle:false,isJennifer:true},'tehachapi'),true);
 assert.equal(p.canProcessTimesheet({isOwner:true,isDanielle:true,isJennifer:false},'tehachapi'),false);
 assert.equal(p.canProcessTimesheet({isOwner:false,isDanielle:false,isJennifer:true},'tehachapi'),false);
 Object.assign(r,{directReceivedAt:'time',collectorSigned:true,directDatesAt:'time',completedAt:'time',scanDocumentId:'scan',scannedAt:'time',emailedAt:'time'});
 assert.equal(w.timesheetStage(r),'Jennifer Email');r.emailEvidenceDocumentId='proof';assert.equal(w.timesheetStage(r),'Complete');assert.equal(r.jenReviewedAt,undefined);
 assert.equal(p.timesheetStepLabel('Danielle Fill Out',true,'Jennifer',''),'Jennifer: fill out');
 assert.equal(p.timesheetStepLabel('Complete',true,'Jennifer',''),'Submission recorded');
 assert.equal(p.applyTimesheetPolicy({},'October 2026','CCRC Stage 2','halcom').workflowOwner,'Danielle');
 const flags=alerts.timesheetAlertsForRows([{...form('teh','CCCC',{emailedAt:'time',emailEvidenceDocumentId:'proof'}),locationSlug:'tehachapi'}],[],'2026-11-01','October 2026');assert.equal(flags.length,0);
 const missing=alerts.timesheetAlertsForRows([],[{id:'teh',locationSlug:'tehachapi',enrollment_status:'Active',record_data:{subsidy:'CCCC'}}],'2026-11-01','October 2026');assert.equal(missing[0].owner,'Jennifer');
});
