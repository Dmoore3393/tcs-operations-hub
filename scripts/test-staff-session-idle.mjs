import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import ts from 'typescript';
const source=await readFile('src/lib/staff-session-idle.ts','utf8');
const m=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
test('normal short breaks remain signed in and two full inactive days expire',()=>{
 const now=Date.UTC(2026,10,19);
 assert.equal(m.staffIdleExpired(now,now+20*60*1000),false);
 assert.equal(m.staffIdleExpired(now,now+m.STAFF_IDLE_TIMEOUT_MS-1),false);
 assert.equal(m.staffIdleExpired(now,now+m.STAFF_IDLE_TIMEOUT_MS),true);
});
test('activity survives app reopen and stays separate for each account',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 const now=Date.UTC(2026,10,19);
 m.writeStaffActivity(storage,'a',now);assert.equal(m.readStaffActivity(storage,'a',now+1000),now);assert.equal(m.readStaffActivity(storage,'b',now+1000),null);
 assert.equal(m.staffIdleExpired(m.readStaffActivity(storage,'a',now+m.STAFF_IDLE_TIMEOUT_MS),now+m.STAFF_IDLE_TIMEOUT_MS),true);
 m.clearStaffActivity(storage,'a');assert.equal(m.readStaffActivity(storage,'a',now),null);
});
test('another tab activity extends the same account and invalid timestamps are ignored',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)},now=Date.UTC(2026,10,19);
 m.writeStaffActivity(storage,'a',now);m.writeStaffActivity(storage,'a',now+5000);assert.equal(m.readStaffActivity(storage,'a',now+6000),now+5000);
 for(const value of ['invalid','Infinity','-1',String(now+100000)]){map.set('tcs-staff-last-activity:a',value);assert.equal(m.readStaffActivity(storage,'a',now),null);}
});
