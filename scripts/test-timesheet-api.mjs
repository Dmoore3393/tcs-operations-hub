import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const url=source=>'data:text/javascript;base64,'+Buffer.from(compile(source)).toString('base64');
const helper=url(await readFile(new URL('../src/lib/timesheet-workflow.ts',import.meta.url),'utf8'));
let source=await readFile(new URL('../src/app/api/timesheets/route.ts',import.meta.url),'utf8');
source=source.replace('"@/lib/timesheet-workflow"',JSON.stringify(helper)).replace(/import \{ requireStaff, staffErrorResponse \} from .*?;/,'const requireStaff=async()=>globalThis.__timesheetAuth;const staffErrorResponse=e=>e instanceof Response?e:Response.json({error:String(e)},{status:500});');
const api=await import(url(source));
let changes=[];
const location={id:'loc',slug:'halcom',name:'Halcom',full_name:'Halcom'};
function setup(name,record={collectorSigned:true,dynastyStatus:'Accounted For'}){
 changes=[];
 const admin={from(table){let patch;const q={select(){return q},eq(){return q},order(){return q},update(value){patch=value;return q},insert(value){changes.push({table,value});return Promise.resolve({error:null})},maybeSingle(){return Promise.resolve({data:{id:'row',legacy_id:'ts',location_id:'loc',record_data:record},error:null})},then(resolve,reject){if(patch)changes.push({table,patch});return Promise.resolve({data:table==='locations'?[location]:[],error:null}).then(resolve,reject)}};return q}};
 globalThis.__timesheetAuth={admin,profile:{full_name:name,organization_id:'org'},user:{id:'actor'},isOwner:false};
}
const post=body=>api.POST(new Request('https://hub.test/api/timesheets',{method:'POST',body:JSON.stringify(body)}));
test('Jennifer and Anthony cannot fill or scan; Danielle cannot record company email',async()=>{
 setup('Jennifer Thomason');assert.equal((await post({action:'fillOut',id:'ts'})).status,403);assert.equal((await post({action:'scanBatch'})).status,403);
 setup('Anthony');assert.equal((await post({action:'scanBatch'})).status,403);
 setup('Danielle Moore');assert.equal((await post({action:'emailBatch'})).status,403);
});
test('Dynasty handoff records Danielle as recipient without overwriting old Jennifer handoff',async()=>{
 setup('Dynasty Lara');assert.equal((await post({action:'dynastyHandoff',id:'ts',handoffDate:'2026-10-13'})).status,200);
 const saved=changes.find(item=>item.table==='timesheets').patch.record_data;
 assert.equal(saved.batchReceivedBy,'Danielle');assert.equal(saved.dynastyHandoffRecipient,'Danielle');assert.ok(saved.dynastyHandedToDanielleAt);assert.equal(saved.jenniferReceivedAt,undefined);
 setup('Dynasty Lara',{collectorSigned:true,dynastyStatus:'Accounted For',dynastyHandedToJenniferAt:'historical'});
 assert.equal((await post({action:'dynastyHandoff',id:'ts'})).status,400);assert.equal(changes.length,0);
});
test('Danielle completion still requires certificate and tuition checks after handoff',async()=>{
 setup('Danielle Moore',{collectorSigned:true,dynastyStatus:'Accounted For',dynastyHandedToDanielleAt:'now'});
 assert.equal((await post({action:'fillOut',id:'ts',certificateVerified:false,tuitionPolicyAcknowledged:true})).status,400);
 assert.equal((await post({action:'fillOut',id:'ts',certificateVerified:true,tuitionPolicyAcknowledged:true})).status,200);
});
test('individual scan and email cannot bypass batch controls',async()=>{
 setup('Danielle Moore');assert.equal((await post({action:'scan',id:'ts'})).status,400);
 setup('Jennifer Thomason');assert.equal((await post({action:'email',id:'ts'})).status,400);
});
