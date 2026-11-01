import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
async function load(path) {
  const source=await readFile(new URL(path,import.meta.url),'utf8');
  return import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
}
const {directIntakePatch}=await load('../src/lib/timesheet-direct-intake.ts');
const w=await load('../src/lib/timesheet-workflow.ts');
const actor={name:'Danielle Moore',isOwner:true,isDanielle:true};
const body={received:true,reason:'Already collected by Danielle.',signaturesChecked:true,datesChecked:true};
test('only active Danielle Owner/Admin can take over intake',()=>{
 for(const candidate of [{...actor,isOwner:false},{...actor,isDanielle:false}]) assert.throws(()=>directIntakePatch({},body,candidate,'now'),/Owner/);
});
test('receipt requires explicit physical confirmation and reason',()=>{
 assert.throws(()=>directIntakePatch({},{...body,received:false},actor,'now'),/physically/);
 assert.throws(()=>directIntakePatch({},{...body,reason:''},actor,'now'),/reason/);
});
test('receiving and checking signatures alone does not skip dates or advance review',()=>{
 const p=directIntakePatch({},{...body,datesChecked:false},actor,'now');
 assert.equal(p.directReceivedAt,'now');assert.equal(p.directReviewAt,undefined);
 assert.equal(w.timesheetStage(p),'Location Sign-Off');
});
test('verified intake advances to filling without impersonating Dynasty',()=>{
 const p=directIntakePatch({},body,actor,'now');
 assert.equal(w.timesheetStage(p),'Danielle Fill Out');
 assert.equal(p.dynastyReviewedBy,undefined);assert.equal(p.dynastyHandedToDanielleAt,undefined);
 assert.equal(p.directReviewBy,'Danielle Moore');
 assert.match(w.validateTimesheetBatch([p],'scanBatch'),/Every/);
 assert.equal(w.validateTimesheetBatch([{...p,completedAt:'later'}],'scanBatch'),'');
});
test('already recorded collection evidence is preserved',()=>{
 const p=directIntakePatch({collectorSignedBy:'Original collector',collectorSignedAt:'original',directReceivedAt:'received'},body,actor,'now');
 assert.equal(p.collectorSignedBy,'Original collector');assert.equal(p.collectorSignedAt,'original');assert.equal(p.directReceivedAt,'received');
});
test('filled, flagged, scanned or approved forms require existing correction controls',()=>{
 for(const current of [{completedAt:'x'},{submissionIssue:{}},{scanDocumentId:'x'},{licenseeApprovalFingerprint:'x'},{emailedAt:'x'}]) assert.throws(()=>directIntakePatch(current,body,actor,'now'),/correction/);
});
