import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const url=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const auditUrl=url(await readFile(new URL('../src/lib/child-file-audits.ts',import.meta.url),'utf8'));
const config=url(await readFile(new URL('../src/lib/location-config.ts',import.meta.url),'utf8'));
let source=await readFile(new URL('../src/app/api/children/route.ts',import.meta.url),'utf8');
source=source.replace('"@/lib/child-file-audits"',JSON.stringify(auditUrl)).replace(/import \{ flushTransportAssignmentNotices \} from .*?;/,'const flushTransportAssignmentNotices=async()=>{};').replace(/import \{ safeFamilyAccess \} from .*?;/,'const safeFamilyAccess=v=>Array.isArray(v)?v:[];').replace('"@/lib/location-config"',JSON.stringify(config)).replace(/import \{ requireStaff, staffErrorResponse \} from .*?;/,'const requireStaff=async()=>globalThis.__childEditAuth;const staffErrorResponse=e=>e instanceof Response?e:Response.json({error:String(e)},{status:500});');
const api=await import(url(source));
test('editing child contact fields retains server-held import identity, extras and historical eligibility',async()=>{
 const held={fundingLocation:'The School Age Center • Division',fundingLocationId:'synthetic-location',brightwheel:{id:'synthetic-bw'},additionalGuardianContacts:[{name:'Third Guardian',phone:'555',email:''}],careStatusNote:'Known departure',timesheetServicePeriods:['October 2026'],neverStartedCare:false};let written;
 const admin={from(){const q={select(){return q;},eq(){return q;},then(resolve,reject){return Promise.resolve({data:[{id:'synthetic-location',slug:'division'}],error:null}).then(resolve,reject);}};return q;}};
 const userClient={from(){const q={select(){return q;},eq(){return q;},update(value){written=value;return q;},maybeSingle(){return Promise.resolve({data:written||{id:'synthetic-child',legacy_id:'7',record_data:held},error:null});}};return q;}};
 globalThis.__childEditAuth={admin,userClient,profile:{organization_id:'synthetic-org'},isOwner:true,isLicensee:false};
 const response=await api.POST(new Request('https://synthetic.invalid/api/children',{method:'POST',body:JSON.stringify({child:{id:7,firstName:'Synthetic',lastName:'Child',primaryGuardian:'First Guardian',location:'Division',ageGroup:'School Age',subsidy:'',dateOfBirth:'',enrollmentStatus:'Archived',secondaryGuardianPhone:'555-0100',secondaryGuardianEmail:'second@example.invalid',careStatusNote:'client replacement',timesheetServicePeriods:['November 2026']}})}));
 assert.equal(response.status,200,await response.text());
 for(const key of Object.keys(held))assert.deepEqual(written.record_data[key],held[key]);
 assert.equal(written.date_of_birth,null);assert.equal(written.record_data.subsidy,'');
 assert.equal(written.record_data.secondaryGuardianPhone,'555-0100');assert.equal(written.record_data.secondaryGuardianEmail,'second@example.invalid');
});

function editHarness(existing) {
 const calls={insert:0,filters:[],written:null};
 const admin={from(){const q={select(){return q},eq(){return q},then(resolve,reject){return Promise.resolve({data:[{id:'synthetic-care',slug:'halcom'}]}).then(resolve,reject)}};return q}};
 const userClient={from(){let updating=false;const q={select(){return q},eq(key,value){calls.filters.push([key,value]);return q},update(value){updating=true;calls.written=value;return q},insert(value){calls.insert++;calls.written=value;return q},maybeSingle(){return Promise.resolve({data:updating||calls.insert?calls.written:existing,error:null})}};return q}};
 globalThis.__childEditAuth={admin,userClient,profile:{organization_id:'synthetic-org'},isOwner:true,isLicensee:false};
 return calls;
}
const importedEdit={id:145317,legacyId:'brightwheel:synthetic-import',firstName:'Synthetic',lastName:'Imported',primaryGuardian:'Synthetic Parent',location:'Halcom',ageGroup:'School Age',updatedAt:'2026-11-03T10:00:00Z'};
const post=child=>api.POST(new Request('https://synthetic.invalid/api/children',{method:'POST',body:JSON.stringify({action:'update',child})}));
test('editing an imported numeric display ID updates the original text identity and preserves unedited support/history',async()=>{
 const held={noTransportationNeeded:true,schoolAgeSupport:{schoolName:'Synthetic School',accommodations:'Existing support'},familyMessages:[{id:'1',body:'Existing message'}],checkedInAt:'2026-11-03T08:00:00Z',checkedInBy:'Synthetic Staff',transportRestraint:'Booster Seat'};
 const calls=editHarness({id:'synthetic-child',legacy_id:importedEdit.legacyId,record_data:held,school_name:'Synthetic School',updated_at:importedEdit.updatedAt});
 const result=await post(importedEdit);assert.equal(result.status,200,await result.text());
 assert.equal(calls.insert,0);assert.ok(calls.filters.some(([key,value])=>key==='legacy_id'&&value===importedEdit.legacyId));
 assert.ok(calls.filters.some(([key,value])=>key==='updated_at'&&value===importedEdit.updatedAt));
 assert.equal(calls.written.record_data.noTransportationNeeded,true);assert.equal(calls.written.legacy_id,importedEdit.legacyId);assert.equal(calls.written.school_name,'Synthetic School');
 assert.equal(calls.written.record_data.schoolAgeSupport.accommodations,'Existing support');assert.equal(calls.written.record_data.familyMessages[0].body,'Existing message');assert.equal(calls.written.record_data.checkedInAt,held.checkedInAt);
});
test('missing imported identity and stale child edits never create a duplicate or overwrite a newer profile',async()=>{
 let calls=editHarness(null);assert.equal((await post(importedEdit)).status,409);assert.equal(calls.insert,0);assert.equal(calls.written,null);
 calls=editHarness({id:'synthetic-child',record_data:{},updated_at:'2026-11-03T11:00:00Z'});assert.equal((await post(importedEdit)).status,409);assert.equal(calls.written,null);
});

test('a profile can explicitly turn transportation off and back on without clearing school details',async()=>{
 for(const excluded of [true,false]){
  const calls=editHarness({id:'synthetic-child',legacy_id:importedEdit.legacyId,record_data:{noTransportationNeeded:!excluded,schoolAgeSupport:{schoolName:'Synthetic School',grade:'TK'}},school_name:'Synthetic School',updated_at:importedEdit.updatedAt});
  const result=await post({...importedEdit,noTransportationNeeded:excluded});assert.equal(result.status,200);
  assert.equal(calls.written.record_data.noTransportationNeeded,excluded);assert.equal(calls.written.record_data.schoolAgeSupport.grade,'TK');assert.equal(calls.written.school_name,'Synthetic School');
 }
});

test('saving an older child file removes cached N/A names, preserves manual missing paperwork and retains the audit entry',async()=>{
 const {createBlankChildFileAudit,documentsForTemplate}=await import(auditUrl);
 const audit=createBlankChildFileAudit('Synthetic reviewer','In-Home');
 for(const item of audit.items)item.status='On File';
 const item=audit.items[0];Object.assign(item,{status:'N/A',note:'Synthetic reason',dateChecked:'2030-03-01'});
 const name=documentsForTemplate('In-Home').find(doc=>doc.id===item.documentId).name;
 const held={fileAudits:[audit],licensingStatus:'Missing Documents',missingDocuments:[name,'Separate manual document']};
 const calls=editHarness({id:'synthetic-child',legacy_id:importedEdit.legacyId,record_data:held,updated_at:importedEdit.updatedAt});
 const result=await post(importedEdit);assert.equal(result.status,200);
 const {child}=await result.json();
 assert.deepEqual(child.missingDocuments,['Separate manual document']);
 assert.deepEqual(calls.written.record_data.missingDocuments,['Separate manual document']);
 assert.deepEqual(calls.written.record_data.fileAudits[0].items[0],item);
});
