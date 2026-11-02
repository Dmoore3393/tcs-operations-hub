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
test('assignment editor offers separate care, funding, and current-versus-future scope choices',async()=>{
 let state=[],cursor=0;const fakeReact={useState(initial){const slot=cursor++;if(!(slot in state))state[slot]=initial;return[state[slot],value=>state[slot]=value]}};
 const Editor=load('src/components/timesheets/TimesheetAssignmentEditor.tsx',{react:fakeReact}).default;
 const calls=[];const record={id:'synthetic-form',childName:'Synthetic Child',servicePeriod:'October 2026',timesheetType:'CCRC Stage 1',fundingLocationId:'funding',careLocationId:'care',updatedAt:'form-version',childAssignment:{updatedAt:'child-version',careLocationId:'future-care',fundingLocationId:'future-funding',funding:'Cash Pay'}};
 const props={record,locations:[{id:'care',name:'Synthetic Care'},{id:'funding',name:'Synthetic Funding'}],saving:false,onAction:async body=>{calls.push(body);return true}};
 const render=()=>{cursor=0;return list(Editor(props))};
 const selects=()=>render().filter(n=>n.type==='select');
 assert.equal(selects()[1].props.value,'care');assert.equal(selects()[2].props.value,'funding');
 await render().find(n=>n.type==='button').props.onClick();assert.equal(calls[0].scope,'both');assert.equal(calls[0].expectedChildUpdatedAt,'child-version');
 selects()[0].props.onChange({target:{value:'profile'}});assert.equal(selects()[1].props.value,'future-care');assert.equal(selects()[3].props.value,'Cash Pay');
 selects()[0].props.onChange({target:{value:'form'}});assert.equal(selects()[3].props.value,'CCRC Stage 1');assert.equal(selects()[3].props.children.flat().some(n=>n?.props?.children==='Cash Pay'),false);
});


test('external scan and email confirmations finish checklist steps without pretending that a document exists',()=>{
 const record={submissionControlVersion:3,directReceivedAt:'time',collectorSigned:true,directDatesAt:'time',completedAt:'time',scannedAt:'time',scanRecordedExternally:true,emailedAt:'time',submissionRecordedExternally:true};
 assert.ok(helper.timesheetChecklist(record).every(Boolean));assert.equal(workflow.timesheetStage(record),'Licensee Verification');
 assert.equal(helper.timesheetChecklist({...record,submissionIssue:{reason:'Needs correction'}})[5],false);
 assert.equal(helper.timesheetChecklist({...record,scanRecordedExternally:false})[4],false);
});

test('current scan button saves an external confirmation without selecting a file',async()=>{
 let cursor=0;const states=[],actions=[];const react={useState(initial){const slot=cursor++;if(!(slot in states))states[slot]=initial;return[states[slot],value=>states[slot]=value]}};
 const Controls=load('src/components/timesheets/SubmissionBatchControls.tsx',{react,'@/components/providers/AuthProvider':{useAuth:()=>({session:null})},'@/lib/timesheet-policy':load('src/lib/timesheet-policy.ts'),'@/lib/timesheet-workflow':workflow}).default;
 const props={rows:[{id:'synthetic',rowId:'synthetic',updatedAt:'v1',childName:'Synthetic Child',location:'Synthetic',locationSlug:'halcom',servicePeriod:'October 2026',timesheetType:'CCCC',submissionControlVersion:3,stage:'Scan & Send to Jennifer',completedAt:'time',submissionDueDate:'2026-11-01',scanDocumentId:'',emailEvidenceDocumentId:'',collector:'Synthetic',submissionIssue:null}],actor:{managedLocations:['halcom'],canScan:true,canEmail:true},routes:{},saving:false,onAction:async body=>actions.push(body)};
 const render=()=>{cursor=0;return list(Controls(props));};let nodes=render();assert.equal(nodes.find(n=>n.type==='button'&&n.props.children==='Mark Scanned').props.disabled,true);
 nodes.find(n=>typeof n.type==='function'&&n.props.children==='I scanned these forms outside The Hub and checked that every page is readable and complete.').props.onChange(true);
 nodes=render();const button=nodes.find(n=>n.type==='button'&&n.props.children==='Mark Scanned');assert.equal(button.props.disabled,false);await button.props.onClick();assert.equal(actions[0].recordedExternally,true);assert.equal(actions[0].documentId,'');assert.equal(actions[0].action,'scanBatch');
});
