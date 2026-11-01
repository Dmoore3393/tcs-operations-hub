import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
const require=createRequire(import.meta.url);
function load(path,dependencies={}){
 const context={exports:{},require:name=>dependencies[name]||require(name)};
 vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);return context.exports;
}
const helper=load('src/lib/timesheet-checklist.ts');
const workflow=load('src/lib/timesheet-workflow.ts');
const direct=load('src/lib/timesheet-direct-intake.ts');
const Component=load('src/components/timesheets/ChildTimesheetChecklist.tsx',{'@/lib/timesheet-checklist':helper,'@/lib/timesheet-workflow':workflow,'@/lib/timesheet-policy':load('src/lib/timesheet-policy.ts')}).default;
const list=node=>Array.isArray(node)?node.flatMap(list):node&&typeof node==='object'?[node,...list(node.props?.children)]:[];
test('main checklist records receipt, signatures and dates without inventing a Dynasty handoff',async()=>{
 const record={id:'synthetic-form',childName:'Synthetic Child',servicePeriod:'October 2026',location:'Synthetic Site',locationSlug:'halcom',timesheetType:'CCCC',collectorSigned:false,stage:'Location Sign-Off',submissionIssue:null};
 const actions=[];let opened;
 const props={rows:[record],canDirectIntake:true,saving:false,routes:{},onAction:async body=>{actions.push(body);Object.assign(record,direct.directIntakePatch(record,body,{name:'Danielle Synthetic',isOwner:true,isDanielle:true},'2026-11-01T20:00:00Z'))},onOpen:id=>opened=id,onBatch(){}};
 const checkbox=label=>list(Component(props)).find(n=>n.type==='input'&&n.props['aria-label']===`${label}: Synthetic Child`);
 assert.equal(checkbox('Received').props.disabled,false);assert.equal(checkbox('Signed').props.disabled,true);
 await checkbox('Received').props.onChange();assert.equal(checkbox('Received').props.checked,true);assert.equal(checkbox('Dated').props.disabled,false);
 await checkbox('Signed').props.onChange();assert.equal(checkbox('Signed').props.checked,true);assert.equal(record.directReviewAt,undefined);
 await checkbox('Dated').props.onChange();assert.equal(workflow.timesheetStage(record),'Danielle Fill Out');assert.equal(record.dynastyHandedToDanielleAt,undefined);
 assert.equal(record.directReceivedBy,'Danielle Synthetic');assert.equal(actions.length,3);
 list(Component(props)).find(n=>n.type==='button'&&n.props.children==='Fill out form').props.onClick();assert.equal(opened,'synthetic-form');
 assert.equal(list(Component({...props,canDirectIntake:false})).find(n=>n.type==='input').props.disabled,true);
});
test('a sign-off does not infer dates, and scans and submissions require recorded proof',()=>{
 const record={collectorSigned:true,scannedAt:'time',emailedAt:'time'};
 assert.deepEqual(Array.from(helper.timesheetChecklist(record)),[false,true,false,false,false,false]);
 Object.assign(record,{directReceivedAt:'time',directDatesAt:'time',completedAt:'time',scanDocumentId:'scan',sentToJenniferAt:'time',emailEvidenceDocumentId:'sent-email'});
 assert.ok(helper.timesheetChecklist(record).every(Boolean));
});
test('default service month follows the previous calendar month in TCS local time',()=>{
 assert.equal(helper.previousTimesheetMonth(new Date('2026-11-01T21:00:00Z')).label,'October 2026');
 assert.equal(helper.previousTimesheetMonth(new Date('2027-01-01T20:00:00Z')).value,'2026-12');
 assert.equal(helper.previousTimesheetMonth(new Date('2026-11-01T06:00:00Z')).label,'September 2026');
});
