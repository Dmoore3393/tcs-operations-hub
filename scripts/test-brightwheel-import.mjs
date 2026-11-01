import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const moduleUrl=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const identityUrl=moduleUrl(await read('src/lib/brightwheel-identity.ts'));
const identity=await import(identityUrl);
const configUrl=moduleUrl(await read('src/lib/location-config.ts'));
const childrenUrl=moduleUrl((await read('src/lib/children.ts')).replace('"@/lib/location-config"',JSON.stringify(configUrl)));
const slugUrl=moduleUrl((await read('src/lib/server/location-slug.ts')).replace('import "server-only";','').replace('"@/lib/location-config"',JSON.stringify(configUrl)));
const base={firstName:'Synthetic',lastName:'Avery',dateOfBirth:'2020-01-02',brightwheelId:'',studentId:''};
const existing=(extra={})=>({id:'child-1',legacy_id:'existing-1',location_id:'location-1',first_name:base.firstName,last_name:base.lastName,date_of_birth:base.dateOfBirth,updated_at:'2026-10-25T10:00:00Z',record_data:{familyAccess:[{synthetic:true}],familyMessages:[{synthetic:true}],medicalNotes:'Preserved synthetic note'},...extra});
test('inactive is never Active; pending and unknown statuses are explicit',()=>{
 for(const value of ['Inactive','not active','Not enrolled','Withdrawn','Archived','Disenrolled'])assert.equal(identity.importedEnrollmentStatus(value),'Archived',value);
 for(const value of ['Active','currently enrolled','Current'])assert.equal(identity.importedEnrollmentStatus(value),'Active',value);
 assert.equal(identity.importedEnrollmentStatus('Waitlisted'),'Pending');assert.equal(identity.importedEnrollmentStatus('Unclear'),'Needs review');
});
test('same names with missing birthdays require an explicit compatible choice; they are never silently added',()=>{
 const rows=[existing({date_of_birth:null})];let match=identity.resolveImportIdentity(base,rows);assert.equal(match.matchType,'review');assert.equal(match.candidates.length,1);
 assert.equal(identity.resolveImportIdentity(base,rows,'child-1').matchType,'update');assert.equal(identity.resolveImportIdentity(base,rows,'new').matchType,'new');assert.equal(identity.resolveImportIdentity(base,rows,'forged-child').matchType,'review');
});
test('stored JSON names/birthdays and punctuation or accents resolve consistently',()=>{
 const row=existing({first_name:'',last_name:'',date_of_birth:null,record_data:{firstName:'Sýnthetic',lastName:'Avery',dateOfBirth:'1/2/2020'}});
 assert.equal(identity.resolveImportIdentity(base,[row]).existingRowId,'child-1');
 assert.equal(identity.normalizedBirthDate('02/31/2020'),'');assert.equal(identity.normalizedBirthDate('2020-01-02T00:00:00Z'),'2020-01-02');
});
test('identifier conflicts and several exact matches cannot select an arbitrary profile',()=>{
 assert.equal(identity.resolveImportIdentity({...base,brightwheelId:'bw'},[existing({date_of_birth:'2021-01-02',record_data:{brightwheel:{id:'bw'}}})]).matchType,'review');
 assert.equal(identity.resolveImportIdentity(base,[existing(),existing({id:'child-2'})]).matchType,'review');
 assert.equal(identity.resolveImportIdentity({...base,brightwheelId:'new-bw'},[existing({record_data:{brightwheel:{id:'old-bw'}}})]).matchType,'review');
});
test('CSV duplicates and different rows targeting the same child are held; row inclusion cannot bypass blocking',()=>{
 assert.equal(identity.repeatedImportRows([base,base]).size,2);
 assert.equal(identity.repeatedImportRows([base,{...base,firstName:'Another'}],['child-1','child-1']).size,2);
 assert.equal(identity.importIdentityReady({matchType:'duplicate',blocked:true,candidates:[],allowNew:true},'new'),false);
});
let sequence=0;
async function api(options={}) {
 const calls=[]; const rows=options.rows||[];
 const admin={from(table){const query={select(){return query},order(){return query},range(){return query},eq(...args){calls.push(['eq',table,...args]);return query},in(...args){calls.push(['in',table,...args]);return query},then(resolve,reject){return Promise.resolve({data:table==='locations'?[{id:'location-1',slug:'division'},{id:'location-2',slug:'halcom'}]:rows,error:null}).then(resolve,reject)}};return query;},async rpc(name,args){calls.push(['rpc',name,args]);return {data:{inserted:args.p_rows.filter(r=>!r.targetId).length,updated:args.p_rows.filter(r=>r.targetId).length},error:options.rpcError||null};}};
 globalThis.__bwStaff=async()=>{if(options.anonymous)throw new Response('Sign in',{status:401});return {admin,user:{id:'synthetic-actor'},profile:{organization_id:'synthetic-org',locations:['Division']},isOwner:!options.licensee&&!options.employee,isLicensee:!!options.licensee};};
 let source=await read('src/app/api/children/brightwheel-import/route.ts');
 source=source.replace(/import \{ requireStaff, staffErrorResponse \} from .*?;/,'const requireStaff=globalThis.__bwStaff; const staffErrorResponse=e=>e instanceof Response?e:Response.json({error:String(e)},{status:500});').replace('"@/lib/brightwheel-identity"',JSON.stringify(identityUrl)).replace('"@/lib/children"',JSON.stringify(childrenUrl)).replace('"@/lib/location-config"',JSON.stringify(configUrl)).replace('"@/lib/server/location-slug"',JSON.stringify(slugUrl));
 const route=await import(moduleUrl(source+'\n//'+sequence++));
 const request=body=>route.POST(new Request('https://synthetic.invalid/api/import',{method:'POST',body:JSON.stringify(body)}));
 return {request,calls};
}
const csv='First Name,Last Name,Birthday,Enrollment Status,Room,Subsidy\nSynthetic,Avery,01/02/2020,Active,Division,Cash\nSynthetic,Inactive,01/02/2020,Inactive,Division,Cash';
test('blank export funding preserves the matched child program before a batch default',async()=>{
 const row=existing();row.record_data.subsidy='CCCC';
 const roster=csv.replaceAll('Division,Cash','Division,');const t=await api({rows:[row]});
 const p=await(await t.request({csvText:roster,defaultFunding:'Cash Pay'})).json();
 assert.equal(p.rows[0].selectedFunding,'CCCC');
});
test('care-ending date, unknown-date note and explicit prior-month eligibility remain separate',async()=>{
 const roster='First Name,Last Name,Birthday,Enrollment Status,Room,Subsidy,Last day of care,Care status note,Timesheet service periods,Never started care\nSynthetic,Avery,01/02/2020,Archived,Division,CCCC,2026-10-29,Last day confirmed,October 2026,';
 const t=await api({rows:[existing()]});const p=await(await t.request({csvText:roster,activeOnly:false})).json();
 await t.request({mode:'commit',csvText:roster,activeOnly:false,previewToken:p.previewToken});
 const saved=t.calls.find(c=>c[0]==='rpc')[2].p_rows[0].payload.record_data;
 assert.equal(saved.plannedLastDay,'2026-10-29');assert.equal(saved.enrollmentStatus,'Archived');assert.deepEqual(saved.timesheetServicePeriods,['October 2026']);
 const never=roster.replace('2026-10-29,Last day confirmed,October 2026,',',Never started,,Yes');
 const n=await api();const np=await(await n.request({csvText:never,activeOnly:false})).json();await n.request({mode:'commit',csvText:never,activeOnly:false,previewToken:np.previewToken});
 const ns=n.calls.find(c=>c[0]==='rpc')[2].p_rows[0].payload.record_data;assert.equal(ns.plannedLastDay,undefined);assert.equal(ns.neverStartedCare,true);assert.equal(ns.timesheetServicePeriods,undefined);
});
test('stale Brightwheel Active status never reactivates a known inactive profile',async()=>{
 const t=await api({rows:[existing({enrollment_status:'Archived'})]});const p=await(await t.request({csvText:csv})).json();
 assert.equal(p.rows[0].enrollmentStatus,'Archived');
 assert.equal((await t.request({mode:'commit',csvText:csv,previewToken:p.previewToken})).status,200);
 assert.equal(t.calls.find(c=>c[0]==='rpc')[2].p_rows[0].payload.enrollment_status,'Archived');
});
test('consolidated roster keeps third parents and multiple emergency contacts',async()=>{
 const roster='First Name,Last Name,Birthday,Student status,Homeroom,Subsidy,Parent name,Parent 2 name,Parent 3 name,Parent 3 phone,Parent 3 email,Emergency contact 2 name,Emergency contact 2 phone,Emergency contact 3 name,Emergency contact 3 relationship\nSynthetic,Avery,01/02/2020,Active,Division,Cash,First,Second,Third,555-0100,third@example.invalid,Emergency Two,555-0200,Emergency Three,Aunt';
 const t=await api({rows:[existing()]});const preview=await(await t.request({csvText:roster})).json();
 assert.equal(preview.rows.length,1);assert.equal(preview.rows[0].matchType,'update');
 assert.equal((await t.request({mode:'commit',csvText:roster,previewToken:preview.previewToken})).status,200);
 const row=t.calls.find(c=>c[0]==='rpc')[2].p_rows[0];assert.equal(row.targetId,'child-1');
 assert.equal(row.payload.record_data.emergencyContact2Name,'Emergency Two');assert.equal(row.payload.record_data.emergencyContact2Phone,'555-0200');
 assert.deepEqual(row.payload.record_data.additionalGuardianContacts,[{name:'Third',phone:'555-0100',email:'third@example.invalid'}]);
 assert.deepEqual(row.payload.record_data.additionalEmergencyContacts,[{name:'Emergency Three',phone:'',relationship:'Aunt'}]);
});
test('possible spelling changes with same birthday require existing-profile review instead of silent duplicates',()=>{
 const changed={...base,firstName:'SyntheticChanged'};
 assert.equal(identity.resolveImportIdentity(changed,[existing()]).matchType,'review');
 assert.equal(identity.resolveImportIdentity(changed,[existing()],'child-1').matchType,'update');
});
test('both parents import into the same existing child and blanks retain second-parent details',async()=>{
 const roster='First Name,Last Name,Birthday,Enrollment Status,Room,Subsidy,Parent 1 First Name,Parent 1 Last Name,Parent 2 First Name,Parent 2 Last Name,Parent 2 Email,Parent 2 Mobile Phone\nSynthetic,Avery,01/02/2020,Active,Division,Cash,First,Guardian,Second,Guardian,synthetic@example.invalid,555-010-0200';
 const t=await api({rows:[existing()]});const preview=await(await t.request({csvText:roster})).json();
 assert.equal(preview.rows[0].matchType,'update');assert.equal(preview.rows[0].secondaryGuardian,'Second Guardian');
 const result=await t.request({mode:'commit',csvText:roster,previewToken:preview.previewToken});assert.equal(result.status,200);
 const row=t.calls.find(c=>c[0]==='rpc')[2].p_rows[0];assert.equal(row.targetId,'child-1');assert.equal(row.payload.legacy_id,'existing-1');
 assert.equal(row.payload.record_data.primaryGuardian,'First Guardian');assert.equal(row.payload.record_data.secondaryGuardianEmail,'synthetic@example.invalid');assert.equal(row.payload.record_data.secondaryGuardianPhone,'555-010-0200');
 assert.deepEqual(row.payload.record_data.familyAccess,[{synthetic:true}]);
 const old=existing();old.record_data.secondaryGuardian='Keep Second';old.record_data.secondaryGuardianPhone='keep-phone';old.record_data.secondaryGuardianEmail='keep@example.invalid';old.record_data.brightwheel={id:'existing-bw',studentId:'existing-student'};
 const blank=await api({rows:[old]});const p=await(await blank.request({csvText:csv})).json();await blank.request({mode:'commit',csvText:csv,previewToken:p.previewToken});
 const saved=blank.calls.find(c=>c[0]==='rpc')[2].p_rows[0].payload.record_data;
 assert.equal(saved.secondaryGuardian,'Keep Second');assert.equal(saved.secondaryGuardianPhone,'keep-phone');assert.equal(saved.secondaryGuardianEmail,'keep@example.invalid');
 assert.equal(saved.brightwheel.id,'existing-bw');assert.equal(saved.brightwheel.studentId,'existing-student');
});
test('actual preview is read-only, excludes inactive students and returns a unique row key',async()=>{
 const {request,calls}=await api();const response=await request({csvText:csv});assert.equal(response.status,200);const result=await response.json();assert.equal(result.rows.length,1);assert.equal(result.totals.excludedRows,1);assert.equal(result.rows[0].rowKey,'bw-row-2');assert.equal(calls.filter(c=>c[0]==='rpc').length,0);
});
test('only signed-in owners/licensees can read roster data, and licensee queries are location-filtered',async()=>{
 for(const [options,status] of [[{anonymous:true},401],[{employee:true},403]]){const t=await api(options);assert.equal((await t.request({csvText:csv})).status,status);assert.equal(t.calls.length,0);}
 const t=await api({licensee:true});await t.request({csvText:csv});assert.deepEqual(t.calls.find(c=>c[0]==='in'),['in','children','location_id',['location-1']]);
});
test('missing-birthday profile stays blocked until reviewed, preserving existing family access and messages',async()=>{
 const t=await api({rows:[existing({date_of_birth:null})]});const preview=await(await t.request({csvText:csv})).json();assert.equal(preview.rows[0].matchType,'review');assert.equal(preview.rows[0].ready,false);
 const response=await t.request({mode:'commit',csvText:csv,previewToken:preview.previewToken,overrides:[{rowKey:'bw-row-2',matchId:'child-1'}]});assert.equal(response.status,200);const args=t.calls.find(c=>c[0]==='rpc')[2];assert.equal(args.p_rows[0].targetId,'child-1');assert.deepEqual(args.p_rows[0].payload.record_data.familyAccess,[{synthetic:true}]);assert.deepEqual(args.p_rows[0].payload.record_data.familyMessages,[{synthetic:true}]);assert.equal(args.p_rows[0].payload.record_data.medicalNotes,'Preserved synthetic note');
});
test('stale/missing preview tokens never write and database conflicts get a retry response',async()=>{
 const t=await api();assert.equal((await t.request({mode:'commit',csvText:csv})).status,409);assert.equal(t.calls.some(c=>c[0]==='rpc'),false);
 const failing=await api({rpcError:{code:'40001'}});const preview=await(await failing.request({csvText:csv})).json();assert.equal((await failing.request({mode:'commit',csvText:csv,previewToken:preview.previewToken})).status,409);
});
test('active-only off imports inactive children as Archived, and repeated CSV identities stay excluded',async()=>{
 const t=await api();const preview=await(await t.request({csvText:csv,activeOnly:false})).json();assert.equal(preview.rows[1].enrollmentStatus,'Archived');
 const duplicate=await(await t.request({csvText:csv+'\nSynthetic,Avery,01/02/2020,Active,Division,Cash'})).json();assert.equal(duplicate.rows.every(r=>r.matchType==='duplicate'&&!r.ready&&!r.include),true);
});
if(process.env.HUB_IMPORT_PREVIEW_FIXTURE){test('generate isolated synthetic browser fixture',async()=>{
 const {writeFile}=await import('node:fs/promises');const t=await api({rows:[existing({date_of_birth:null})]});
 const csvText=csv+'\nSynthetic,Newchild,02/03/2021,Active,Division,Cash';
 await writeFile(process.env.HUB_IMPORT_PREVIEW_FIXTURE,JSON.stringify({csvText,preview:await(await t.request({csvText})).json()}));
});}

test('missing birthday and funding import as unknown, never as infant, resident or cash pay',async()=>{
 const roster='First Name,Last Name,Birthday,Room,Subsidy\nSynthetic,Optional,,Halcom,';
 const t=await api();const p=await(await t.request({csvText:roster})).json();assert.equal(p.rows[0].ready,true);
 assert.equal((await t.request({mode:'commit',csvText:roster,previewToken:p.previewToken})).status,200);
 const saved=t.calls.find(c=>c[0]==='rpc')[2].p_rows[0].payload;
 assert.equal(saved.date_of_birth,null);assert.equal(saved.age_group,'Unknown');assert.equal(saved.record_data.age,'Age not entered');assert.equal(saved.record_data.subsidy,undefined);assert.equal(saved.record_data.resident,undefined);
});
test('blank imported birthday preserves existing DOB after an explicit identity choice',async()=>{
 const roster='First Name,Last Name,Birthday,Room,Subsidy\nSynthetic,Avery,,Division,';
 const row=existing();row.record_data.subsidy='CCCC';const t=await api({rows:[row]});
 const p=await(await t.request({csvText:roster})).json();assert.equal(p.rows[0].matchType,'review');assert.equal(p.rows[0].candidates[0].canUpdate,true);
 await t.request({mode:'commit',csvText:roster,previewToken:p.previewToken,overrides:[{rowKey:'bw-row-2',matchId:'child-1'}]});
 const saved=t.calls.find(c=>c[0]==='rpc')[2].p_rows[0].payload;assert.equal(saved.date_of_birth,base.dateOfBirth);assert.equal(saved.record_data.subsidy,'CCCC');
});
test('invalid supplied birthdays and repeated children without birthdays remain blocked',async()=>{
 const t=await api();for(const birthday of ['not-a-date','02/31/2020','2099-01-01']){
 const p=await(await t.request({csvText:`First Name,Last Name,Birthday,Room\nSynthetic,Invalid,${birthday},Division`})).json();assert.equal(p.rows[0].ready,false,birthday);assert.equal(p.rows[0].blocked,true);
 }
 const p=await(await t.request({csvText:'First Name,Last Name,Room\nSynthetic,Repeated,Division\nSynthetic,Repeated,Division'})).json();assert.ok(p.rows.every(r=>r.matchType==='duplicate'));
});
test('funding location imports independently and persists through an ordinary roster update',async()=>{
 const roster='First Name,Last Name,Birthday,Room,Subsidy,Funding location\nSynthetic,Avery,01/02/2020,Halcom,CCRC Stage 2,Division';
 const t=await api();const p=await(await t.request({csvText:roster})).json();assert.equal(p.rows[0].ready,true);
 await t.request({mode:'commit',csvText:roster,previewToken:p.previewToken});const saved=t.calls.find(c=>c[0]==='rpc')[2].p_rows[0].payload;
 assert.equal(saved.location_id,'location-2');assert.equal(saved.record_data.fundingLocationId,'location-1');assert.equal(saved.record_data.subsidy,'CCRC Stage 2');
 const row=existing({location_id:'location-2',record_data:saved.record_data});const next=await api({rows:[row]});const np=await(await next.request({csvText:csv})).json();assert.equal(np.rows[0].selectedFundingLocation,'The School Age Center • Division');
});

test('multiple exact profiles offer an explicit choice with status and location, never an extra copy',async()=>{
 const active=existing({enrollment_status:'Active',record_data:{...existing().record_data,location:'Synthetic Care Site'}});
 const archived=existing({id:'child-archived',legacy_id:'existing-archived',enrollment_status:'Archived',record_data:{location:'Synthetic Care Site'}});
 const t=await api({rows:[active,archived]});const p=await(await t.request({csvText:csv})).json();const item=p.rows[0];
 assert.equal(item.matchType,'review');assert.equal(item.ready,false);assert.equal(item.allowNew,false);assert.equal(item.candidates.length,2);
 assert.match(item.candidates[0].label,/Active.*Synthetic Care Site/);assert.match(item.candidates[1].label,/Archived.*Synthetic Care Site/);
 assert.equal(identity.importIdentityReady(item,'child-1'),true);assert.equal(identity.importIdentityReady(item,'new'),false);
 for(const selection of ['','new','forged-child']){
 const match=identity.resolveImportIdentity(base,[active,archived],selection);assert.equal(match.matchType,'review');assert.equal(match.existingRowId,'');
 }
 const response=await t.request({mode:'commit',csvText:csv,previewToken:p.previewToken,overrides:[{rowKey:'bw-row-2',matchId:'child-1'}]});assert.equal(response.status,200);
 const changes=t.calls.find(c=>c[0]==='rpc')[2].p_rows;assert.equal(changes.length,1);assert.equal(changes[0].targetId,'child-1');assert.equal(changes[0].payload.legacy_id,'existing-1');assert.deepEqual(changes[0].payload.record_data.familyAccess,[{synthetic:true}]);
 const archivedChoice=identity.resolveImportIdentity(base,[active,archived],'child-archived');assert.equal(archivedChoice.existingRowId,'child-archived');
});
test('multiple identifier matches do not permit conflicting names, birthdays or student IDs',()=>{
 const source={...base,brightwheelId:'shared-bw',studentId:'source-student'};
 const first=existing({record_data:{brightwheel:{id:'shared-bw',studentId:'source-student'}}});
 for(const extra of [{last_name:'Different'},{date_of_birth:'2021-01-02'},{record_data:{brightwheel:{id:'shared-bw',studentId:'other-student'}}}]){
 const other=existing({id:'child-other',record_data:{brightwheel:{id:'shared-bw',studentId:'source-student'}},...extra});
 const match=identity.resolveImportIdentity(source,[first,other],'child-other');assert.equal(match.matchType,'review');assert.equal(match.candidates.find(c=>c.id==='child-other').canUpdate,false);
 assert.equal(identity.resolveImportIdentity(source,[first,other],'child-1').existingRowId,'child-1');
 }
});
