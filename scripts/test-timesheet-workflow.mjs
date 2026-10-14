import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../src/lib/timesheet-workflow.ts',import.meta.url),'utf8');
const {outputText} = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}});
const w = await import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
const handed = {collectorSigned:true,dynastyStatus:'Accounted For',dynastyHandedToDanielleAt:'2026-10-14T00:00:00Z'};
const filled = {...handed,completedAt:'2026-10-14T00:01:00Z'};
const sent = {...filled,scannedAt:'2026-10-14T00:02:00Z',sentToJenniferAt:'2026-10-14T00:02:00Z'};
test('collection and Dynasty review still precede handoff',()=>{
 assert.equal(w.timesheetStage({}),'Location Sign-Off');
 assert.equal(w.timesheetStage({collectorSigned:true}),'Dynasty Review');
 assert.equal(w.timesheetStage({collectorSigned:true,dynastyStatus:'Accounted For'}),'Personal Handoff');
 assert.equal(w.timesheetStage(handed),'Danielle Fill Out');
});
test('legacy Jennifer handoffs and completed receipts retain progress',()=>{
 const old={collectorSigned:true,dynastyStatus:'Accounted For',dynastyHandedToJenniferAt:'old'};
 assert.equal(w.timesheetHandoff(old),'old');assert.equal(w.timesheetStage(old),'Danielle Fill Out');
 assert.equal(w.timesheetStage({...sent,emailedByJenniferAt:'old'}),'Complete');
});
test('location, program, CCRC stage and month each define separate batches',()=>{
 const base=w.timesheetBatchKey('October 2026','halcom','CCRC Stage 1');
 for(const args of [['October 2026','halcom','CCRC Stage 2'],['October 2026','halcom','CCCC'],['October 2026','division','CCRC Stage 1'],['November 2026','halcom','CCRC Stage 1']]) assert.notEqual(w.timesheetBatchKey(...args),base);
});
test('one incomplete form blocks the entire scanned batch',()=>{
 assert.match(w.validateTimesheetBatch([filled,handed],'scanBatch'),/Every timesheet/);
 assert.equal(w.validateTimesheetBatch([filled,filled],'scanBatch'),'');
});
test('company email requires every form sent to Jen',()=>{
 assert.match(w.validateTimesheetBatch([sent,filled],'emailBatch'),/Every timesheet/);
 assert.equal(w.validateTimesheetBatch([sent,sent],'emailBatch'),'');
});
test('duplicate batch recording is rejected',()=>{
 assert.match(w.validateTimesheetBatch([sent],'scanBatch'),/already/);
 assert.match(w.validateTimesheetBatch([{...sent,emailedAt:'done'}],'emailBatch'),/already/);
});
