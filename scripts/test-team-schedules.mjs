import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';

const require=createRequire(import.meta.url);
function load(path,deps={},globals={}){
 const context={exports:{},require:name=>deps[name]??require(name),Response,Request,URL,Intl,...globals};
 vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 return context.exports;
}
const fixedNow='2026-11-09T04:00:00Z';
class FixedDate extends Date {constructor(...args){super(...(args.length?args:[fixedNow]));}static now(){return new Date(fixedNow).getTime();}}
const dates=load('src/lib/team-schedule.ts',{}, {Date:FixedDate});
const config=load('src/lib/location-config.ts');
function query(rows,onRead=()=>{},error=null){
 let values=[...rows],columns;
 const q={select(value){columns=value.split(',');return q},eq(k,v){values=values.filter(row=>row[k]===v);return q},
  gte(k,v){values=values.filter(row=>row[k]>=v);return q},lte(k,v){values=values.filter(row=>row[k]<=v);return q},
  in(k,v){values=values.filter(row=>v.includes(row[k]));return q},
  or(value){assert.equal(value,config.WORK_LOCATION_FILTER);values=values.filter(row=>row.is_active||row.program_type==='Maintenance Site');return q},
  order(){return q},limit(n){values=values.slice(0,n);return q},
  maybeSingle(){return q.then(result=>({...result,data:result.data?.[0]??null}))},
  then(resolve,reject){onRead();return Promise.resolve({data:columns?values.map(row=>Object.fromEntries(columns.map(k=>[k,row[k]]))):values,error}).then(resolve,reject)}};
 return q;
}
function apiFixture(options={}){
 const location={id:'halcom',organization_id:'org',slug:'halcom',name:'Halcom',full_name:'Synthetic Halcom',capacity:14,program_type:'Family Childcare',is_active:true};
 const publication={id:'published',organization_id:'org',location_id:'halcom',week_of:'2026-11-09',status:'Published',revision:2,published_at:fixedNow};
 const shift={id:'current',organization_id:'org',publication_id:'published',location_id:'halcom',revision:2,user_id:'colleague',staff_name:'Weekend Colleague',shift_date:'2026-11-14',start_time:'09:00',end_time:'10:30',position_label:'Opener',notes:'Published notes'};
 const tables={locations:[location,{...location,id:'other',slug:'33rd-street',name:'33rd Street'},{...location,id:'foreign',organization_id:'other-org'}],schedule_publications:options.unpublished?[]:[publication],staff_schedule_publication_shifts:[shift,{...shift,id:'sunday',user_id:'second',staff_name:'Sunday Colleague',shift_date:'2026-11-15'},{...shift,id:'old',revision:1,notes:'Obsolete notes'},{...shift,id:'other-site',location_id:'other'},{...shift,id:'foreign',organization_id:'other-org'},{...shift,id:'draft',publication_id:'unpublished'},{...shift,id:'next-week',shift_date:'2026-11-16'}]};
 const reads=[];
 const auth={isOwner:false,isLicensee:true,profile:{organization_id:'org',primary_location:options.noPrimary?null:'Halcom',locations:['Halcom','33rd Street']},admin:{from(table){assert.ok(table in tables,`Unexpected table ${table}`);return query(tables[table],()=>reads.push(table),table===options.failTable?Error('Synthetic read failure'):null)}}};
 if(options.employee)auth.isLicensee=false;
 const api=load('src/app/api/staff-scheduling/team/route.ts',{'@/lib/location-config':config,'@/lib/team-schedule':dates,'@/lib/server/require-staff':{requireStaff:async()=>{if(options.unauthenticated)throw new Response('Missing session',{status:401});return auth},staffErrorResponse:e=>e instanceof Response?e:Response.json({error:e.message},{status:500})}});
 return {api,reads,get:(suffix='')=>api.GET(new Request('https://hub.test/api/staff-scheduling/team?week=2026-11-09'+suffix))};
}

test('licensees see their whole team including weekends, only at their main site and current published revision',async()=>{
 const fixture=apiFixture();const response=await fixture.get();assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.location.id,'halcom');assert.deepEqual(body.shifts.map(row=>row.id),['current','sunday']);
 assert.ok(body.shifts.every(row=>row.status==='Published'));
 assert.deepEqual(Object.keys(body.shifts[0]).sort(),['id','location_id','user_id','staff_name','shift_date','start_time','end_time','position_label','notes','status'].sort());
 assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.ok(!fixture.reads.includes('staff_shifts'));assert.equal(fixture.api.POST,undefined);
});
test('team schedule cannot use backup access to read other teams, foreign sites, or an unassigned main site',async()=>{
 for(const site of ['other','foreign','unknown'])assert.equal((await apiFixture().get('&location='+site)).status,403);
 assert.equal((await apiFixture({noPrimary:true}).get()).status,403);
 assert.equal((await apiFixture({employee:true}).get()).status,403);
 assert.equal((await apiFixture({unauthenticated:true}).get()).status,401);
});
test('unpublished weeks stay empty, read errors are explicit, and the endpoint bounds dates to one valid week',async()=>{
 const empty=apiFixture({unpublished:true});assert.deepEqual((await (await empty.get()).json()).shifts,[]);assert.ok(!empty.reads.includes('staff_schedule_publication_shifts'));
 for(const failTable of ['locations','schedule_publications','staff_schedule_publication_shifts'])assert.equal((await apiFixture({failTable}).get()).status,500);
 for(const date of ['2026-11-10','2026-02-30','invalid',''])assert.equal((await apiFixture().api.GET(new Request('https://hub.test/api/staff-scheduling/team?week='+date))).status,400);
});
test('Pacific dates and the next personal shift preserve current-week weekend work',()=>{
 assert.equal(dates.pacificScheduleDate(),'2026-11-08');assert.equal(dates.initialTeamScheduleWeek(),'2026-11-09');
 assert.equal(dates.nextPublishedScheduleWeek([{shift_date:'2026-11-14'}],'2026-11-08'),'2026-11-09');
 assert.equal(dates.nextPublishedScheduleWeek([{shift_date:'2026-11-14'},{shift_date:'2026-11-08'}],'2026-11-08'),'2026-11-02');
 assert.equal(dates.nextPublishedScheduleWeek([{shift_date:'2026-11-07'}],'2026-11-08'),null);
 assert.equal(dates.scheduleDatePlus('2026-12-28',6),'2027-01-03');
});

async function personalScreen({currentSunday=false,licensee=false}={}){
 let cursor=0,dirty=true;const state=[],effects=[],reads=[];
 const react={
  useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],value=>{const next=typeof value==='function'?value(state[i]):value;if(!Object.is(next,state[i]))dirty=true;state[i]=next}]},
  useRef(initial){return react.useState(()=>({current:initial}))[0]},
  useMemo(fn,deps){const i=cursor++;if(!state[i]||deps.some((x,j)=>x!==state[i].deps[j]))state[i]={deps,value:fn()};return state[i].value},
  useCallback(fn,deps){return react.useMemo(()=>fn,deps)},
  useEffect(fn,deps){const i=cursor++;if(!state[i]||deps.some((x,j)=>x!==state[i].deps[j])){const previous=state[i];state[i]={deps};effects.push(()=>{previous?.cleanup?.();state[i].cleanup=fn()})}},
 };
 const published={id:'next',location_id:'halcom',week_of:'2026-11-09',status:'Published',revision:2,published_at:fixedNow};
 const snapshot={id:'own',publication_id:'next',location_id:'halcom',user_id:'self',staff_name:'Synthetic Self',shift_date:'2026-11-14',start_time:'09:00:00',end_time:'10:30:00',position_label:'Weekend opener',notes:'Own published weekend shift',revision:2};
 const tables={locations:[{id:'halcom',name:'Halcom',is_active:true}],schedule_publications:[published],staff_schedule_acknowledgements:[],staff_schedule_publication_shifts:[snapshot,{...snapshot,id:'obsolete',revision:1,notes:'Obsolete shift must stay hidden'},{...snapshot,id:'colleague',user_id:'someone-else',notes:'Colleague must stay private'}]};
 if(currentSunday){tables.schedule_publications.push({...published,id:'current',week_of:'2026-11-02'});tables.staff_schedule_publication_shifts.push({...snapshot,id:'sunday',publication_id:'current',shift_date:'2026-11-08',notes:'Current Sunday shift'});}
 const empty=()=>null,childrenOnly=({children})=>children;const {jsx}=require('react/jsx-runtime');
 const channel={on(){return channel},subscribe(){return channel}};
 const client={from(table){assert.ok(table in tables,`Unexpected schedule table ${table}`);return query(tables[table],()=>reads.push(table))},channel:()=>channel,removeChannel(){}};
 const deps={react,'next/link':{default:props=>jsx('a',props)},'@/lib/location-config':config,'@/lib/team-schedule':dates,'@/components/layout/MainLayout':{default:childrenOnly},'@/components/providers/AuthProvider':{useAuth:()=>({profile:{user_id:'self'},isLocationLicensee:licensee})},'@/lib/staffing-command':{locationKeyForDbLocation:site=>site.name},'@/lib/supabase/client':{supabase:client},'lucide-react':new Proxy({},{get:()=>empty}),'@/components/hub/HubUI':{SectionCard:childrenOnly,StatCard:empty,PrimaryButton:props=>jsx('button',props),SecondaryButton:props=>jsx('button',props)}};
 const Page=load('src/app/(portal)/my-schedule/page.tsx',deps,{Date:FixedDate,window:{setTimeout(fn,delay){if(delay===0)fn();return 1},clearTimeout(){}}}).default;
 function flatten(node){if(Array.isArray(node))return node.flatMap(flatten);if(!node||typeof node!=='object')return[];if(typeof node.type==='function')return flatten(node.type(node.props));return[node,...flatten(node.props?.children)];}
 function render(){cursor=0;dirty=false;return flatten(Page());}
 async function settle(){for(let i=0;i<12;i++){render();for(const effect of effects.splice(0))effect();await new Promise(setImmediate);if(!dirty&&!effects.length)return render();}throw Error('Schedule rendering did not settle');}
 return {settle,reads};
}
test('My Schedule opens a weekend-only upcoming published shift and never shows another employee or old revision',async()=>{
 const ui=await personalScreen();const nodes=await ui.settle();const text=JSON.stringify(nodes.map(node=>node.props.children));
 assert.match(text,/Own published weekend shift/);assert.match(text,/Sat, Nov 14, 2026/);
 assert.doesNotMatch(text,/Colleague must stay private|Obsolete shift must stay hidden/);
 assert.ok(!ui.reads.includes('staff_shifts'));
 nodes.find(node=>node.props['aria-label']==='Previous week').props.onClick();
 const previous=JSON.stringify((await ui.settle()).map(node=>node.props.children));
 assert.doesNotMatch(previous,/Own published weekend shift/);assert.match(previous,/Sun, Nov 8, 2026/);
});
test('My Schedule keeps a remaining current Sunday shift before switching to next week',async()=>{
 const ui=await personalScreen({currentSunday:true});const nodes=await ui.settle();const text=JSON.stringify(nodes.map(node=>node.props.children));
 assert.match(text,/Current Sunday shift/);assert.doesNotMatch(text,/Own published weekend shift/);
});
test('licensees receive the read-only team screen while owners retain the existing planner',()=>{
 let role='licensee';const Owner=()=>null,Team=()=>null;
 const Page=load('src/app/(portal)/staff-schedules/page.tsx',{'@/components/scheduling/StaffingWorkspace':{default:Owner},'@/components/scheduling/TeamScheduleView':{default:Team},'@/components/layout/MainLayout':{default:()=>null},'@/components/providers/AuthProvider':{useAuth:()=>({isSystemOwner:role==='owner',isLocationLicensee:role==='licensee'})}}).default;
 assert.equal(Page().type,Team);role='owner';assert.equal(Page().type,Owner);role='employee';assert.notEqual(Page().type,Team);
});

test('licensees can open their team schedule directly from My Schedule',async()=>{
 const nodes=await (await personalScreen({licensee:true})).settle();
 assert.ok(nodes.some(node=>node.type==='a'&&node.props.href==='/staff-schedules'&&node.props.children==='View team schedule'));
});
