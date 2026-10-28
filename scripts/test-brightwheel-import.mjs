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
