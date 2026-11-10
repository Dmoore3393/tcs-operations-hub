// Offline regression tests: actual source, synthetic data, no live accounts or writes.
// Run: node --test tests/schedule-sync-regression.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { nativeLayoutSource, nativePlannerPageSource } from '../native/capacitor/scripts/native-route-source.mjs';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = new URL('../', import.meta.url);
const hookSource = await readFile(process.env.TCS_SCHEDULE_HOOK_SOURCE || new URL('src/hooks/useDatedCarePlan.ts', root), 'utf8');
const modelSource = await readFile(new URL('src/lib/weekly-care-planner.ts', root), 'utf8');
const timeoutSource = await readFile(new URL('src/lib/request-timeout.ts', root), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
function compile(source, deps, globals = {}) {
  const output = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});
  assert.equal((output.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  const context = {exports:{}, Error, AbortController, ...globals, require(name) {
    assert.ok(Object.hasOwn(deps,name), `Unexpected import: ${name}`); return deps[name];
  }};
  vm.runInNewContext(output.outputText, context);
  return context.exports;
}
const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const model = compile(modelSource, {
  '@/lib/family-care-calendar':{isoDateInTimeZone:()=> '2026-11-10'},
  '@/lib/child-schedules':{
    dateToDayName:date=>days[new Date(date+'T12:00:00Z').getUTCDay()],
    emptyWeek:()=>Object.fromEntries(days.map(day=>[day,{noCare:true,blocks:[],note:''}])),
    timeToMinutes:time=>time.split(':').reduce((h,m)=>Number(h)*60+Number(m)),
  },
  '@/lib/location-config':{normalizeLocation:name=>name},
});
function database() {
  return {
    locations:[{id:'site-a',name:'Halcom',organization_id:'org-a',is_active:true},{id:'site-b',name:'Division',organization_id:'org-a',is_active:true}],
    children:[{id:'child-a',legacy_id:'legacy-a',record_key:'1',first_name:'Synthetic',last_name:'Child',location_id:'site-a',organization_id:'org-a',enrollment_status:'Active',age_group:'School Age',planned_start:null,planned_end:null}],
    child_schedule_overrides:[],care_calendar_closures:[],child_schedule_school_notes:[],
  };
}
function dated(end='18:00', date='2026-11-10') {
  return {child_id:'child-a',location_id:'site-a',organization_id:'org-a',service_date:date,no_care:false,start_time:'08:00:00',end_time:end+':00',planner_status:'scheduled',care_blocks:[{locationId:'site-a',start:'08:00',end}],updated_at:'2026-11-10T16:00:00Z',note:'Synthetic change'};
}
const usual = [{childId:1,days:Object.fromEntries(days.map(day=>[day,{noCare:false,blocks:[{id:'regular',location:'Halcom',start:'08:00',end:'17:00'}],note:''}]))}];
function eventTarget(extra = {}) {
  const listeners = new Map();
  return {...extra, addEventListener(event,fn){if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event).add(fn);},removeEventListener(event,fn){listeners.get(event)?.delete(fn);},emit(event){for(const fn of [...(listeners.get(event)||[])])fn();},listeners};
}
let instances=0;
function reader(db=database()) {
  const id=++instances, slots=[], effects=[], timers=new Map(), calls=[], channels=[], held=[];
  let cursor=0, now=0, nextTimer=0, hold=false, fail='', writes=0;
  let profile={organization_id:'org-a',user_id:'staff-a'}, args=['2026-11-09','2026-11-15',true];
  const window=eventTarget({navigator:{onLine:true}}), document=eventTarget({visibilityState:'visible'});
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>v===b[i]);
  const react={
    useId:()=>`fixture-${id}`,
    useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,fn=>{writes++;slots[i].value=typeof fn==='function'?fn(slots[i].value):fn;}];},
    useRef(initial){const i=cursor++;if(!slots[i])slots[i]={current:initial};return slots[i];},
    useCallback(fn,deps){const i=cursor++;if(!same(slots[i]?.deps,deps))slots[i]={fn,deps};return slots[i].fn;},
    useEffect(fn,deps){const i=cursor++;if(!same(slots[i]?.deps,deps)){effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()};});}},
  };
  const setTimeout=(fn,ms=0)=>{const id=++nextTimer;timers.set(id,{fn,at:now+ms});return id;};
  const clearTimeout=id=>timers.delete(id);
  const setInterval=(fn,ms)=>{const id=setTimeout(fn,ms);timers.get(id).interval=ms;return id;};
  const globals={window,document,setTimeout,clearTimeout,setInterval,clearInterval:clearTimeout,fetch(){throw Error('Network forbidden in this test');}};
  const client={
    from(table){const filters=[];let signal;const query={
      select(){return query;}, order(){return query;}, eq(k,v){filters.push(['eq',k,v]);return query;}, neq(k,v){filters.push(['neq',k,v]);return query;},gte(k,v){filters.push(['gte',k,v]);return query;},lte(k,v){filters.push(['lte',k,v]);return query;},abortSignal(s){signal=s;return query;},
      then(resolve,reject){
        calls.push({table,filters,signal});
        const data=copy(db[table]).filter(row=>filters.every(([op,k,v])=>op==='eq'?row[k]===v:op==='neq'?row[k]!==v:op==='gte'?row[k]>=v:row[k]<=v));
        const value={data,error:fail===table?{message:'Synthetic read failure'}:null};
        const promise=hold?new Promise(done=>held.push(()=>done(value))):Promise.resolve(value);
        return promise.then(resolve,reject);
      },
    };return query;},
    channel(name){const channel={name,handlers:[],removed:false,on(event,config,fn){channel.handlers.push({event,config,fn});return channel;},subscribe(fn){channel.status=fn;return channel;}};channels.push(channel);return channel;},
    async removeChannel(channel){channel.removed=true;},
  };
  const {withRequestTimeout}=compile(timeoutSource,{},globals);
  const {useDatedCarePlan}=compile(hookSource,{
    react,'@/lib/supabase/client':{supabase:client},'@/lib/weekly-care-planner':model,
    '@/components/providers/AuthProvider':{useAuth:()=>({profile})},'@/lib/request-timeout':{withRequestTimeout},
  },globals);
  const settle=()=>new Promise(setImmediate);
  function render(){cursor=0;const value=useDatedCarePlan(...args);while(effects.length)effects.shift()();return value;}
  async function tick(ms){const end=now+ms;let safety=0;while(true){const due=[...timers.entries()].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;assert.ok(++safety<500);const [id,timer]=due;now=timer.at;if(timer.interval)timer.at+=timer.interval;else timers.delete(id);timer.fn();await settle();}now=end;await settle();return render();}
  render();
  return {db,calls,channels,window,document,render,tick,settle,held,
    set hold(value){hold=value;},set failure(value){fail=value;},get writes(){return writes;},
    realtime(table){for(const ch of channels.filter(c=>!c.removed))for(const h of ch.handlers)if(h.config.table===table)h.fn();},
    status(status){channels.at(-1).status?.(status);},
    change(nextArgs,nextProfile=profile){args=nextArgs;profile=nextProfile;return render();},
    unmount(){for(const slot of slots)slot?.cleanup?.();},
  };
}
const endTime = r => model.planForDate(r.render().data,usual,'2026-11-10')[0]?.blocks[0]?.end;

test('web and app reader fixtures converge on dated changes in both directions',async()=>{
  const db=database(),web=reader(db),app=reader(db);await web.tick(0);await app.tick(0);assert.equal(endTime(app),'17:00');
  db.child_schedule_overrides=[dated('18:00')];web.realtime('child_schedule_overrides');app.realtime('child_schedule_overrides');await web.tick(100);await app.tick(100);
  assert.equal(endTime(web),'18:00');assert.equal(endTime(app),'18:00');
  db.child_schedule_overrides=[dated('19:00')];web.realtime('child_schedule_overrides');app.realtime('child_schedule_overrides');await web.tick(100);await app.tick(100);
  assert.equal(endTime(web),'19:00');assert.equal(endTime(app),'19:00');assert.equal(usual[0].days.Tuesday.blocks[0].end,'17:00');
});
test('No Care overrides usual hours without changing future weeks',async()=>{
  const r=reader();r.db.child_schedule_overrides=[{...dated(),no_care:true,planner_status:'no-care',care_blocks:[]}];await r.tick(0);
  assert.equal(model.planForDate(r.render().data,usual,'2026-11-10')[0].status,'no-care');
  assert.equal(model.planForDate(r.render().data,usual,'2026-11-17')[0].blocks[0].end,'17:00');
});
test('a dated split-site plan keeps every block and its destination',async()=>{
  const r=reader();r.db.child_schedule_overrides=[{...dated(),care_blocks:[{locationId:'site-a',start:'06:00',end:'08:00'},{locationId:'site-b',start:'15:00',end:'18:00'}]}];await r.tick(0);
  assert.deepEqual(copy(model.planForDate(r.render().data,usual,'2026-11-10')[0].blocks),r.db.child_schedule_overrides[0].care_blocks);
});
test('closure changes update ratio input and do not manufacture attendance',async()=>{
  const r=reader();await r.tick(0);r.db.care_calendar_closures=[{location_id:null,organization_id:'org-a',closure_date:'2026-11-10',title:'Synthetic closure'}];r.realtime('care_calendar_closures');await r.tick(100);
  assert.equal(model.closedSites(r.render().data,'2026-11-10').has('site-a'),true);
  assert.equal(model.effectiveScheduleRecords(r.render().data,usual,'2026-11-10')[0].days.Tuesday.noCare,true);
});
test('returning to a visible app reloads missed dated changes',async()=>{
  const r=reader();await r.tick(0);r.document.visibilityState='hidden';r.db.child_schedule_overrides=[dated('18:30')];
  r.document.emit('visibilitychange');await r.tick(100);assert.equal(endTime(r),'17:00');
  r.document.visibilityState='visible';r.document.emit('visibilitychange');await r.tick(100);assert.equal(endTime(r),'18:30');
});
test('network reconnect refreshes after an explicit offline warning',async()=>{
  const r=reader();await r.tick(0);r.window.navigator.onLine=false;r.window.emit('offline');await r.tick(100);
  assert.equal(r.render().ready,false);assert.match(r.render().error,/Offline/);
  r.db.child_schedule_overrides=[dated('18:45')];r.window.navigator.onLine=true;r.window.emit('online');await r.tick(100);
  assert.equal(endTime(r),'18:45');assert.equal(r.render().error,'');
});
test('realtime re-subscription reloads events missed while disconnected',async()=>{
  const r=reader();await r.tick(0);r.db.child_schedule_overrides=[dated('18:15')];r.status('SUBSCRIBED');await r.tick(100);assert.equal(endTime(r),'18:15');
});
test('foreground fallback refresh repairs a missed realtime event',async()=>{
  const r=reader();await r.tick(0);r.db.child_schedule_overrides=[dated('18:20')];await r.tick(30100);assert.equal(endTime(r),'18:20');
});
test('polling does not keep fetching while the app is hidden',async()=>{
  const r=reader();await r.tick(0);const before=r.calls.length;r.document.visibilityState='hidden';await r.tick(60100);assert.equal(r.calls.length,before);
});
test('focus and restored page events refresh without duplicate bursts',async()=>{
  const r=reader();await r.tick(0);const before=r.calls.length;r.db.child_schedule_overrides=[dated('18:10')];
  r.window.emit('focus');r.window.emit('pageshow');r.window.emit('online');await r.tick(100);assert.equal(r.calls.length-before,5);assert.equal(endTime(r),'18:10');
});
test('failed reads never silently fall back to usual weekly hours',async()=>{
  const r=reader();r.db.child_schedule_overrides=[dated()];await r.tick(0);r.failure='child_schedule_overrides';assert.equal(await r.render().reload(),false);
  assert.equal(r.render().ready,false);assert.equal(r.render().data.children.length,0);assert.match(r.render().error,/Synthetic read failure/);
});
test('stalled reads time out with all queries sharing an abort signal',async()=>{
  const r=reader();r.hold=true;await r.tick(0);assert.equal(r.calls.length,5);const signal=r.calls[0].signal;assert.ok(signal);assert.ok(r.calls.every(c=>c.signal===signal));
  await r.tick(12000);assert.equal(signal.aborted,true);assert.equal(r.render().ready,false);assert.match(r.render().error,/taking too long/);
  r.held.splice(0).forEach(resolve=>resolve());await r.settle();assert.equal(r.render().ready,false);
});
test('older requests cannot overwrite a newer schedule',async()=>{
  const r=reader();await r.tick(0);r.hold=true;const stale=r.render().reload();await r.settle();r.hold=false;r.db.child_schedule_overrides=[dated('19:00')];assert.equal(await r.render().reload(),true);
  r.held.splice(0).forEach(resolve=>resolve());assert.equal(await stale,false);assert.equal(endTime(r),'19:00');
});
test('changing weeks invalidates the previous in-flight response',async()=>{
  const r=reader();r.hold=true;await r.tick(0);r.hold=false;r.change(['2026-11-16','2026-11-22',true]);await r.tick(0);r.held.splice(0).forEach(resolve=>resolve());await r.settle();
  assert.equal(r.render().ready,true);assert.equal(r.channels[0].removed,true);
  assert.ok(r.calls.slice(-5).filter(c=>c.table.includes('schedule')||c.table.includes('closures')).every(c=>c.filters.some(f=>f[0]==='gte'&&f[2]==='2026-11-16')));
});
test('every query remains organization-scoped and dated reads are range-bounded',async()=>{
  const r=reader();await r.tick(0);assert.ok(r.calls.every(c=>c.filters.some(f=>f[0]==='eq'&&f[1]==='organization_id'&&f[2]==='org-a')));
  for(const c of r.calls.filter(c=>['child_schedule_overrides','care_calendar_closures','child_schedule_school_notes'].includes(c.table)))assert.ok(c.filters.some(f=>f[0]==='gte')&&c.filters.some(f=>f[0]==='lte'));
});
test('sign-out masks old data and stops existing subscriptions',async()=>{
  const r=reader();await r.tick(0);assert.equal(r.render().ready,true);r.change(['2026-11-09','2026-11-15',true],null);
  assert.equal(r.render().ready,false);assert.equal(r.render().data.children.length,0);assert.equal(r.channels[0].removed,true);
});
test('cleanup prevents pending responses and resume events updating an unmounted reader',async()=>{
  const r=reader();r.hold=true;await r.tick(0);r.unmount();const before=r.writes;r.held.splice(0).forEach(resolve=>resolve());await r.settle();
  r.window.emit('online');r.document.emit('visibilitychange');await r.tick(30100);assert.equal(r.writes,before);assert.equal(r.channels[0].removed,true);
});
test('disabled readers expose no schedule and make no requests',async()=>{
  const r=reader();r.change(['2026-11-09','2026-11-15',false]);await r.tick(0);assert.equal(r.calls.length,0);assert.equal(r.render().ready,false);
});
const plannerEntry=component=>`import Planner from "@/components/scheduling/${component}"; export default async function Page({searchParams}){ const selection=plannerPageSelection(await searchParams); return <Planner {...selection}/>; }`;
test('native schedule and ratio routes retain the shared dated planners, not a frozen regular grid',()=>{
  for(const component of ['WeeklyCarePlanner','DailyRatioPlan']){
    const source=nativePlannerPageSource(plannerEntry(component),component);assert.match(source,new RegExp(`scheduling/${component}`));assert.match(source,/useSearchParams/);assert.match(source,/Suspense/);assert.doesNotMatch(source,/await searchParams|2026-11-10|usePersistentState/);
    compile(source,{'react':{Suspense:()=>{}},'next/navigation':{useSearchParams:()=>new URLSearchParams()},[`@/components/scheduling/${component}`]:{default:()=>{}},'@/lib/weekly-care-planner':model,'react/jsx-runtime':{jsx:()=>({})}});
  }
});
test('native entry preserves date/location deep links and remounts on selection change',()=>{
  const source=nativePlannerPageSource(plannerEntry('WeeklyCarePlanner'),'WeeklyCarePlanner');assert.match(source,/plannerPageSelection\(Object.fromEntries\(query.entries\(\)\)\)/);assert.match(source,/key=\{selection.initialDate/);
  assert.deepEqual(copy(model.plannerPageSelection({date:'2026-11-15',location:'Halcom'})),{initialDate:'2026-11-15',initialLocation:'Halcom'});
});
test('native export replaces only request-time language access and retains client language support',()=>{
  const source='import {cookies} from "next/headers";\nconst language=(await cookies()).get("tcs_language")?.value==="es"?"es":"en";\n<LanguageProvider initialLanguage={language}><LanguageSwitch/></LanguageProvider>';
  const output=nativeLayoutSource(source);assert.doesNotMatch(output,/next\/headers|await cookies/);assert.match(output,/LanguageSwitch/);assert.match(output,/LanguageProvider/);assert.match(source,/await cookies/);
});
test('unexpected native entry or layout shapes fail closed instead of shipping an old screen',()=>{
  assert.throws(()=>nativePlannerPageSource('export default function LegacyWeekGrid(){}','WeeklyCarePlanner'),/Review/);
  assert.throws(()=>nativePlannerPageSource(plannerEntry('OtherScreen'),'OtherScreen'),/Review/);
  assert.throws(()=>nativeLayoutSource('export default function Unknown(){}'),/Review/);
});
test('the actual native exporter applies both dated-route adapters in the throwaway copy',async()=>{
  const source=await readFile(new URL('native/capacitor/scripts/prepare-web.mjs',root),'utf8');
  assert.match(source,/nativeLayoutSource\(await readFile\(layoutPath/);
  assert.match(source,/\['child-schedules','WeeklyCarePlanner'\],\['ratios','DailyRatioPlan'\]/);
  assert.match(source,/join\(work,`src\/app\/\(portal\)\/\$\{page\}\/page.tsx`\)/);
  assert.match(source,/nativePlannerPageSource\(await readFile\(path/);
});
test('realtime subscribes only to published schedule tables; location metadata refreshes through polling',async()=>{
  const r=reader();await r.tick(0);
  assert.deepEqual(r.channels[0].handlers.map(h=>h.config.table),['children','child_schedule_overrides','care_calendar_closures','child_schedule_school_notes']);
});
