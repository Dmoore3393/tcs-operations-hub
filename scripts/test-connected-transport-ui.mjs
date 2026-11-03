import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const url=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const config=url(await readFile('src/lib/location-config.ts','utf8'));
const helpers=await import(url((await readFile('src/lib/transport-child-schools.ts','utf8')).replace('"./location-config"',JSON.stringify(config))));
const trips=await import(url(await readFile('src/lib/transport-trips.ts','utf8')));
const handoff=await import(url(await readFile('src/lib/transport-care-handoff.ts','utf8')));
test('a child profile shows only its linked morning and afternoon trips and stable profile links',async()=>{
 const child={id:123,legacyId:'brightwheel:synthetic-one',firstName:'Synthetic',lastName:'Child',location:'Halcom',enrollmentStatus:'Active',schoolAgeSupport:{schoolName:'Synthetic School'}};
 const rows=[{id:1,childId:child.legacyId,tripPeriod:'Morning',pickupLocation:'Halcom',school:'Synthetic School',days:'Mon-Fri',pickup:'7:00 AM',driver:'Synthetic Driver',vehicle:'Synthetic Van'}, {id:2,childId:child.legacyId,tripPeriod:'Afternoon',school:'Synthetic School',dropoffLocation:'42nd Street',days:'Mon-Fri',pickup:'2:00 PM'}, {id:3,childId:'different-child',driver:'Do not show',school:'Different School'}];
 const deps={'next/link':{default:({children,...props})=>require('react').createElement('a',props,children)},'@/hooks/usePersistentState':{usePersistentState:()=>[rows,()=>{},true,{retry(){}}]},'@/lib/hub-data':{starterRoutes:[]},'@/lib/transport-child-schools':helpers,'@/lib/transport-trips':trips};
 const context={exports:{},require:name=>deps[name]||require(name)};
 vm.runInNewContext(ts.transpileModule(await readFile('src/components/transportation/ChildTransportSummary.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 const html=require('react-dom/server').renderToStaticMarkup(require('react').createElement(context.exports.default,{child,canManage:true}));
 assert.match(html,/Morning/);assert.match(html,/Afternoon/);assert.match(html,/42nd Street/);assert.doesNotMatch(html,/Do not show|Different School/);
 assert.match(html,/child=brightwheel%3Asynthetic-one/);assert.match(html,/route=1/);assert.match(html,/route=2/);
});
test('Brightwheel handoff records a timestamp without falsely checking a child into care',async()=>{
 assert.equal(handoff.transportUsesBrightwheel,true);
 const patch=handoff.transportHandoffPatch('2026-11-03','2026-11-03T16:00:00Z','Synthetic Driver');
 assert.equal(patch.runStatus,'Dropped Off');assert.equal(patch.droppedOffAt,'2026-11-03T16:00:00Z');assert.ok(!Object.hasOwn(patch,'checkedInAt'));
 const source=await readFile('src/app/(portal)/transportation-v2/page.tsx','utf8');
 const file=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);let fn;
 const visit=node=>{if(ts.isFunctionDeclaration(node)&&node.name?.text==='checkIntoLocation')fn=node.getText(file);ts.forEachChild(node,visit)};visit(file);
 let confirmations=0,attendanceWrites=0;
 const context={exports:{},transportUsesBrightwheel:true,confirmCareHandoff:()=>{confirmations++},fetch:()=>{attendanceWrites++;throw Error('Must not write Hub attendance')}};
 vm.runInNewContext(ts.transpileModule('export '+fn,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 await context.exports.checkIntoLocation({id:1,child:'Synthetic Child'});
 assert.equal(confirmations,1);assert.equal(attendanceWrites,0);
});


test('route patch diff includes only edited children and never turns omission into deletion',async()=>{
 const {transportRecordPatches}=await import(url(await readFile('src/lib/transport-record-patches.ts','utf8')));
 const before=[{id:1,runStatus:'Waiting'},{id:2,runStatus:'Waiting'}];
 const after=[{...before[0],runStatus:'Picked Up',checkedInAt:undefined},before[1]];
 const patches=transportRecordPatches(before,after);assert.equal(patches.length,1);assert.equal(patches[0].id,'1');assert.equal(patches[0].before.runStatus,'Waiting');assert.equal(patches[0].after.runStatus,'Picked Up');assert.ok(!Object.hasOwn(patches[0].after,'checkedInAt'));
 assert.throws(()=>transportRecordPatches(before,[after[0]]),/Not Riding/);
 assert.throws(()=>transportRecordPatches(before,[...before,{id:3}]),/new school trips/);
 assert.throws(()=>transportRecordPatches(before,[...before,before[0]]),/appears twice/);
 assert.deepEqual(transportRecordPatches(before,before),[]);
});

test('a realtime route refresh cannot discard an unsaved pickup, and the writer sends only changed trips',async()=>{
 const {transportRecordPatches}=await import(url(await readFile('src/lib/transport-record-patches.ts','utf8')));
 let cursor=0,rows=[{legacy_id:'1',record_data:{id:1,childId:'synthetic-child',location:'Halcom',runStatus:'Waiting'}}],timerId=0,refreshEvent;
 const slots=[],effects=[],timers=new Map(),calls=[],notices=[];
 const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
 const react={
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value}]},
  useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i]},
  useMemo(fn,deps){const i=cursor++;if(!slots[i]||!equal(slots[i].deps,deps))slots[i]={value:fn(),deps};return slots[i].value},
  useCallback(fn,deps){return react.useMemo(()=>fn,deps)},
  useEffect(fn,deps){const i=cursor++;if(!slots[i]||!equal(slots[i].deps,deps)){const previous=slots[i];slots[i]={deps};effects.push(()=>{previous?.cleanup?.();slots[i].cleanup=fn()})}},
 };
 const fakeSetTimeout=(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id};const fakeClearTimeout=id=>timers.delete(id);
 const user={id:'synthetic-user'},profile={organization_id:'synthetic-org'},config={table:'transportation_routes',label:'routes'};
 const client={from(){const q={select(){return q},eq(){return q},order(){return q},abortSignal:async()=>({data:structuredClone(rows),error:null})};return q},channel(){const q={on(_kind,_filter,fn){refreshEvent=fn;return q},subscribe(){return q}};return q},removeChannel:async()=>{},rpc(name,args){calls.push({name,args});assert.equal(name,'patch_transport_records');for(const item of args.p_changes){const row=rows.find(row=>row.legacy_id===item.id);assert.deepEqual(row.record_data,JSON.parse(JSON.stringify(item.before)));row.record_data=JSON.parse(JSON.stringify(item.after))}return{abortSignal:async()=>({data:args.p_changes.length,error:null})}},auth:{getSession:async()=>({data:{session:null}})}};
 const deps={react,'@/components/providers/AuthProvider':{useAuth:()=>({user,profile}),canReadStateKey:()=>true,canWriteStateKey:()=>true},'@/lib/production-defaults':{getProductionInitialValue:()=>[]},'@/lib/relational-state':{relationalConfigForKey:()=>config,sortRelationalRecords:items=>items},'@/lib/sync-events':{announceHubSync:detail=>notices.push(detail)},'@/lib/supabase/client':{supabase:client},'@/lib/storage-migrations':{migratePersistentValue:(_key,value)=>value},'@/lib/location-config':{dayNames:[]},'@/lib/request-timeout':{withRequestTimeout:fn=>fn(new AbortController().signal)},'@/lib/transport-record-patches':{transportRecordPatches}};
 const context={exports:{},setTimeout:fakeSetTimeout,clearTimeout:fakeClearTimeout,require:name=>deps[name]||require(name)};
 vm.runInNewContext(ts.transpileModule(await readFile('src/hooks/usePersistentState.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 const render=()=>{cursor=0;const result=context.exports.usePersistentState('tcs-routes',[]);while(effects.length)effects.shift()();return result};
 const tick=()=>new Promise(setImmediate);const runTimer=ms=>{for(const [id,timer] of timers)if(timer.ms===ms){timers.delete(id);timer.fn()}};
 render();await tick();let view=render();assert.equal(view[2],true);assert.equal(calls.length,0);
 view[1](current=>current.map(row=>({...row,runStatus:'Picked Up'})));view=render();
 rows.push({legacy_id:'2',record_data:{id:2,childId:'another-child',location:'Halcom',runStatus:'Waiting'}});
 refreshEvent();runTimer(180);await tick();view=render();assert.equal(view[0][0].runStatus,'Picked Up');
 runTimer(650);await tick();render();await tick();view=render();
 assert.equal(calls.length,1);assert.equal(calls[0].args.p_changes.length,1);assert.equal(calls[0].args.p_changes[0].id,'1');
 assert.equal(rows.length,2);assert.equal(view[0].length,2);assert.equal(view[0][0].runStatus,'Picked Up');
 assert.equal(notices.filter(note=>note.state==='saved'&&note.operation==='write').length,1);
});
