import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const moduleURL=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const dailyURL=moduleURL(await readFile('src/lib/transportation-day.ts','utf8'));
const locationURL=moduleURL(await readFile('src/lib/location-config.ts','utf8'));
const modelURL=moduleURL((await readFile('src/lib/transport-accountability/model.ts','utf8')).replace("'../transportation-day'",JSON.stringify(dailyURL)));
const m=await import(modelURL);
const roster=await import(moduleURL((await readFile('src/lib/transport-accountability/roster.ts','utf8')).replace("'./model'",JSON.stringify(modelURL)).replace("'../transportation-day'",JSON.stringify(dailyURL)).replace("'../location-config'",JSON.stringify(locationURL))));
const date='2030-01-08',now='2030-01-08T23:00:00Z';
const planner={id:'planner',name:'Danielle',planner:true,leader:true,locationIds:['site','destination']};
const driver={id:'driver',name:'Driver',planner:false,leader:false,locationIds:['site']};
const receiver={id:'receiver',name:'Receiving staff',planner:false,leader:false,locationIds:['destination']};
const outsider={id:'outside',name:'Outside staff',planner:false,leader:false,locationIds:['elsewhere']};
const people=[{id:'driver',name:'Driver',driver:true,leader:false,globalLeader:false,locationIds:['site']},{id:'backup',name:'Backup',driver:true,leader:false,globalLeader:false,locationIds:['site']},{id:'planner',name:'Danielle',driver:true,leader:true,globalLeader:true,locationIds:['site','destination']},{id:'backupLeader',name:'Backup leader',driver:false,leader:true,globalLeader:true,locationIds:[]}];
const settings={...structuredClone(m.defaultSettings),backupLeaderIds:['backupLeader'],schedules:[{id:'school',school:'Test School',grade:'',classroom:'',childId:'',regular:'14:33',minimum:'12:05',weekdays:[2],overrides:{}}]};
const c=(actor=planner,extra={})=>({date,now,actor,people,settings,...extra});
const child=n=>({id:'child-'+n,legacy_id:'legacy-'+n,location_id:'site',first_name:'Synthetic',last_name:String(n),age_group:'School Age',enrollment_status:'Active',school_name:'Test School',record_data:{transportRestraint:'Booster',schoolAgeSupport:{grade:'3'}}});
function day(count=1){return roster.reconcileRoster({trips:[],closedAt:''},Array.from({length:count},(_,n)=>child(n+1)),[],[{id:'site',name:'Site'},{id:'destination',name:'Destination'}],people,structuredClone(settings),date,now);}
const plan=(period='Afternoon')=>({...m.emptyPlan(),school:'Test School',pickupLocation:'Test School',destination:'Destination',destinationId:'destination',driverId:'driver',backupDriverId:'backup',vehicle:'Van',pickup:period==='Morning'?'07:00':'12:10',arrival:period==='Morning'?'07:30':'12:40',dismissal:period==='Morning'?'':'12:05',scheduleLabel:'Recurring minimum day',seating:'Booster',route:period+' route'});
function action(d,action,t=d.trips[1],actor=planner,extra={}){return m.applyCommand(d,{action,key:t.key,revision:t.revision,...extra},c(actor));}
function scheduled(count=1){let d=day(count);for(const t of d.trips)d=action(d,'save',d.trips.find(r=>r.key===t.key),planner,{decision:t.period==='Afternoon'?'needs_transport':'no_transport',plan:t.period==='Afternoon'?plan():{...m.emptyPlan(),reason:'Parent confirmed morning school dropoff by phone'}});d=m.applyCommand(d,{action:'publish'},c());for(const t of d.trips.filter(t=>t.decision==='needs_transport'))d=action(d,'acknowledge',d.trips.find(r=>r.key===t.key),driver);return d;}
test('new enrollment without any route creates separate unresolved morning and afternoon decisions',()=>{const d=day();assert.equal(d.trips.length,2);assert.ok(d.trips.every(t=>t.decision==='unresolved'));assert.equal(d.trips[1].plan.dismissal,'12:05');assert.equal(m.readiness(d.trips[1],d.trips,c())[0],'Transportation decision missing');});
test('blank decision never becomes no transportation and partial publish retains all unresolved children',()=>{let d=day(2);d=action(d,'save',d.trips[1],planner,{decision:'needs_transport',plan:plan()});d=m.applyCommand(d,{action:'publish'},c());assert.equal(d.trips.length,4);assert.equal(d.trips.filter(t=>t.decision==='unresolved').length,3);assert.throws(()=>m.applyCommand(d,{action:'close'},c()),/Unresolved/);});
test('morning transportation is independent of afternoon no transportation, with reason required',()=>{let d=day();d=action(d,'save',d.trips[0],planner,{decision:'needs_transport',plan:plan('Morning')});assert.throws(()=>action(d,'save',d.trips[1],planner,{decision:'no_transport',plan:m.emptyPlan()}),/reason/);d=action(d,'save',d.trips[1],planner,{decision:'no_transport',plan:{...m.emptyPlan(),reason:'Mother confirmed pickup in person'}});assert.equal(d.trips[0].decision,'needs_transport');assert.equal(d.trips[1].decision,'no_transport');assert.equal(d.trips[1].plan.reason,'Mother confirmed pickup in person');});
test('recurring minimum days, school-wide and child-specific overrides preserve regular schedules',()=>{const d=day(),t=d.trips[1],s=structuredClone(settings);assert.equal(m.schoolTime(s,t,date).time,'12:05');assert.equal(m.schoolTime(s,t,'2030-01-09').time,'14:33');s.schedules[0].overrides['2030-01-09']={kind:'minimum',time:'11:50',reason:'School notice'};assert.equal(m.schoolTime(s,t,'2030-01-09').label,'One-time minimum day');s.schedules.push({...s.schedules[0],id:'specific',childId:t.childId,grade:'3',regular:'14:10',overrides:{'2030-01-09':{kind:'special',time:'10:15',reason:'IEP appointment'}}});assert.equal(m.schoolTime(s,t,'2030-01-09').time,'10:15');assert.equal(m.schoolTime(s,{...t,childId:'another'},'2030-01-09').time,'11:50');s.schedules[0].overrides[date]={kind:'closed',time:'',reason:'Holiday'};assert.equal(m.schoolTime(s,t,date).closed,true);assert.equal(s.schedules[0].regular,'14:33');});
test('three of four individual pickups leave the fourth awaiting pickup; sweep and day closure fail',()=>{let d=scheduled(4);for(const t of d.trips.filter(t=>t.period==='Afternoon').slice(0,3))d=action(d,'pickup',d.trips.find(r=>r.key===t.key),driver);const afternoon=d.trips.filter(t=>t.period==='Afternoon');assert.equal(afternoon.filter(t=>t.pickedUpAt).length,3);assert.equal(afternoon[3].stage,'awaiting_pickup');assert.throws(()=>action(d,'sweep',afternoon[0],driver,{confirmed:true}),/accounted/);assert.throws(()=>m.applyCommand(d,{action:'close'},c()),/Unresolved/);});
test('school report that a parent collected the child stays unresolved until whereabouts and adult confirmed',()=>{let d=scheduled();d=action(d,'problem',d.trips[1],driver,{reason:'School says parent collected child'});assert.equal(m.finished(d.trips[1]),false);assert.throws(()=>action(d,'save',d.trips[1],planner,{decision:'no_transport',plan:{...plan(),reason:'School said parent collected'},reason:'Cancel'}),/whereabouts/);assert.throws(()=>action(d,'resolve_problem',d.trips[1],planner,{reason:'At home',confirmed:true}),/responsible adult/);d=action(d,'resolve_problem',d.trips[1],planner,{reason:'Called mother; child is physically home with her',adult:'Synthetic Mother',confirmed:true});assert.equal(d.trips[1].decision,'needs_transport');d=action(d,'save',d.trips[1],planner,{decision:'no_transport',plan:{...plan(),reason:'Mother confirmed child home with her by telephone'},reason:'Confirmed parent pickup'});assert.equal(d.trips[1].publishedRevision,1);assert.equal(d.trips[1].revision,2);assert.equal(d.trips[1].ackRevision,0);});
test('destination changes after publication require republish and driver acknowledgment; stale actions fail',()=>{let d=scheduled(),old=d.trips[1];d=action(d,'save',old,planner,{decision:'needs_transport',plan:{...old.plan,destination:'New destination',destinationId:'new-site'},reason:'Danielle confirmed care location changed'});assert.throws(()=>action(d,'pickup',old,driver),/changed/);assert.throws(()=>action(d,'pickup',d.trips[1],driver),/published/);d=m.applyCommand(d,{action:'publish'},c());assert.throws(()=>action(d,'pickup',d.trips[1],driver),/acknowledge/);d=action(d,'acknowledge',d.trips[1],driver);d=action(d,'pickup',d.trips[1],driver);assert.equal(d.trips[1].stage,'with_driver');assert.equal(d.trips[1].plan.destination,'New destination');});
test('called-out driver replacement requires new driver acknowledgment and retains old-driver acknowledgment',()=>{let d=scheduled();d=action(d,'save',d.trips[1],planner,{decision:'needs_transport',plan:{...plan(),driverId:'backup',backupDriverId:'driver'},reason:'Original driver called out'});d=m.applyCommand(d,{action:'publish'},c());assert.deepEqual(new Set(d.trips[1].pendingDriverIds),new Set(['driver','backup']));assert.throws(()=>action(d,'pickup',d.trips[1],{...driver,id:'backup'}),/acknowledge/);d=action(d,'acknowledge',d.trips[1],{...driver,id:'backup'});d=action(d,'pickup',d.trips[1],{...driver,id:'backup'});assert.ok(d.trips[1].pendingDriverIds.includes('driver'));assert.throws(()=>action(d,'pickup',d.trips[1],driver),/assigned/);});
test('arrival remains open until a different, authorized destination employee physically receives each child',()=>{let d=scheduled();d=action(d,'pickup',d.trips[1],driver);d=action(d,'arrive',d.trips[1],driver);assert.equal(m.finished(d.trips[1]),false);assert.throws(()=>action(d,'receive',d.trips[1],driver),/Receiving staff/);assert.throws(()=>action(d,'receive',d.trips[1],outsider),/Receiving staff/);assert.throws(()=>action(d,'adult_handoff',d.trips[1],driver,{adult:'Another person',confirmed:true}),/authorization/);d=action(d,'receive',d.trips[1],receiver);assert.equal(d.trips[1].receivedAdult,receiver.name);assert.throws(()=>m.applyCommand(d,{action:'close'},c()),/sweeps/);d=action(d,'sweep',d.trips[1],driver,{confirmed:true});d=m.applyCommand(d,{action:'close'},c());assert.equal(d.closedAt,now);});
test('enrollment transfer and later archival never erase unresolved or in-custody trips',()=>{let d=scheduled();d=action(d,'pickup',d.trips[1],driver);const transferred={...child(1),location_id:'destination'};d=roster.reconcileRoster(d,[transferred],[],[{id:'destination',name:'Destination'}],people,settings,date,now);assert.match(d.trips[1].problem,/Enrollment location changed/);assert.equal(d.trips[1].stage,'with_driver');d=roster.reconcileRoster(d,[{...transferred,enrollment_status:'Archived'}],[],[],people,settings,date,now);assert.equal(d.trips.length,2);assert.equal(d.trips[1].stage,'with_driver');});
test('conflicting driver or vehicle assignments and missing dismissal information block readiness',()=>{let d=scheduled(2);d.trips[3].plan.route='Other route';assert.match(m.readiness(d.trips[1],d.trips,c()).join(','),/overlaps/);d=scheduled();d.trips[1].plan.dismissal='';assert.match(m.readiness(d.trips[1],d.trips,c()).join(','),/Dismissal time missing/);});
test('overdue pickups and incomplete handoffs are explicit exceptions; no inferred GPS location',()=>{let d=scheduled();assert.ok(m.exceptions(d.trips[1],c()).includes('Overdue pickup'));d=action(d,'pickup',d.trips[1],driver);d=action(d,'arrive',d.trips[1],driver);assert.ok(m.exceptions(d.trips[1],c(planner,{now:'2030-01-08T23:10:00Z'})).includes('Incomplete handoff'));assert.equal(d.trips[1].receivedAt,'');});

test('database: atomic versions, durable audit/outbox, notification deduplication, settings CAS and client isolation',async()=>{
 const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,org=id(1),actor=id(2),recipient=id(3);
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table organizations(id uuid primary key);create table staff_access(user_id uuid,organization_id uuid,is_active boolean);create table transportation_day_stops(organization_id uuid,service_date date);create table transportation_routes(organization_id uuid,record_data jsonb);create table user_notification_state(user_id uuid primary key,inbox jsonb default '[]',updated_at timestamptz default now());insert into organizations values('${org}');insert into auth.users values('${actor}'),('${recipient}');insert into staff_access values('${actor}','${org}',true),('${recipient}','${org}',true);`);
 await db.exec(await readFile('supabase/migrations/20261117180754_transport_accountability.sql','utf8'));
 const doc=scheduled(),notices=[{recipient,key:'synthetic-key',notification:{id:'synthetic-key',eventKey:'synthetic-key',body:'Synthetic child arrived'}}];
 const commit=(version,noticesValue=notices)=>db.query('select commit_transport_accountability($1,$2,$3,$4,$5,$6,$7,$8,0) n',[org,date,actor,'publish','Synthetic reason',version,JSON.stringify(doc),JSON.stringify(noticesValue)]);
 assert.equal((await commit(0)).rows[0].n,1);
 await assert.rejects(commit(0),/changed/);
 assert.equal((await db.query('select count(*)::int n from transport_accountability_events')).rows[0].n,1);
 await commit(1);
 assert.equal((await db.query('select count(*)::int n from transport_accountability_outbox')).rows[0].n,1);
 assert.equal((await db.query('select jsonb_array_length(inbox) n from user_notification_state')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from claim_transport_accountability_notices($1)',[org])).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from claim_transport_accountability_notices($1)',[org])).rows[0].n,0);
 await db.query('select queue_transport_accountability_notices($1,$2)',[org,JSON.stringify([...notices,{...notices[0],key:'escalated',notification:{id:'escalated',eventKey:'escalated'}}])]);
 assert.equal((await db.query('select count(*)::int n from transport_accountability_outbox')).rows[0].n,2);
 assert.equal((await db.query('select jsonb_array_length(inbox) n from user_notification_state')).rows[0].n,2);
 await db.query('select save_transport_accountability_settings($1,$2,0,$3,$4)',[org,actor,JSON.stringify(settings),date]);
 await assert.rejects(db.query('select save_transport_accountability_settings($1,$2,0,$3,$4)',[org,actor,JSON.stringify(settings),date]),/changed/);
 await assert.rejects(commit(2),/School settings changed/);
 await db.query('insert into transport_accountability_rollout(organization_id,enabled_from,activated_by) values($1,$2,$3)',[org,'2026-01-01',actor]);
 await assert.rejects(db.query('insert into transportation_day_stops values($1,$2)',[org,date]),/daily transportation ledger/);
 await db.query('insert into transportation_routes values($1,$2)',[org,JSON.stringify({runStatus:'Waiting',driver:'Synthetic'})]);
 await assert.rejects(db.query("update transportation_routes set record_data=record_data||'{\"runStatus\":\"Picked Up\"}'"),/daily transportation ledger/);
 await db.query("update transportation_routes set record_data=record_data||'{\"school\":\"New School\"}'");
 await db.exec('set role authenticated');
 await assert.rejects(db.query('select * from transport_accountability_days'),/permission denied/);
 await assert.rejects(commit(2),/permission denied/);
 await db.exec('reset role');
 await db.close();
});


test('explicit usual morning decisions retain every child, preserve afternoons, and leave new enrollments unresolved',()=>{
 const configured={...settings,usualDecisions:{'child-1:Morning':{decision:'needs_transport',reason:'Danielle confirmed',confirmedBy:'planner',confirmedAt:now,effectiveFrom:date},'child-2:Morning':{decision:'no_transport',reason:'Danielle confirmed no morning ride',confirmedBy:'planner',confirmedAt:now,effectiveFrom:date}}};
 const result=roster.reconcileRoster({trips:[],closedAt:''},[child(1),child(2),child(3)],[],[],people,configured,date,now);
 assert.equal(result.trips.find(t=>t.key==='child-1:Morning').decision,'needs_transport');
 assert.equal(result.trips.find(t=>t.key==='child-2:Morning').decision,'no_transport');
 assert.equal(result.trips.find(t=>t.key==='child-3:Morning').decision,'unresolved');
 assert.ok(result.trips.filter(t=>t.period==='Afternoon').every(t=>t.decision==='unresolved'));
 assert.ok(result.trips.every(t=>t.publishedRevision===0));
 result.trips[0].decision='absent';result.trips[0].revision++;
 roster.reconcileRoster(result,[child(1),child(2),child(3)],[],[],people,configured,date,now);
 assert.equal(result.trips[0].decision,'absent');
 const earlier=roster.reconcileRoster({trips:[],closedAt:''},[child(1)],[],[],people,configured,'2030-01-07',now);assert.equal(earlier.trips[0].decision,'unresolved');
});


test('group route assignment is atomic, period-scoped, and never records a physical pickup',()=>{
 const before=day(3),chosen=before.trips.filter(t=>t.period==='Afternoon');
 const changes=chosen.map(t=>({key:t.key,revision:t.revision,decision:'needs_transport',plan:plan()}));
 const after=m.applyPlanningBatch(before,changes,c());
 assert.equal(before.trips.filter(t=>t.decision==='needs_transport').length,0);
 assert.equal(after.trips.filter(t=>t.decision==='needs_transport').length,3);
 assert.ok(after.trips.filter(t=>t.period==='Morning').every(t=>t.decision==='unresolved'));
 assert.ok(after.trips.every(t=>!t.pickedUpAt&&t.stage==='awaiting_pickup'&&!t.publishedRevision));
 assert.throws(()=>m.applyPlanningBatch(before,[...changes,{key:before.trips[0].key,revision:0,decision:'no_transport',plan:{...plan(),reason:'Confirmed'}}],c()),/separately/);
 assert.throws(()=>m.applyPlanningBatch(before,[...changes,{...changes[0]}],c()),/only once/);
 assert.throws(()=>m.applyPlanningBatch(before,changes.map((x,n)=>n===2?{...x,revision:999}:x),c()),/changed/);
 assert.throws(()=>m.applyPlanningBatch(before,changes,c(driver)),/Only Danielle/);
 assert.equal(before.trips.every(t=>t.decision==='unresolved'),true);
 const injected=m.applyPlanningBatch(before,changes.map(x=>({...x,action:'pickup'})),c());assert.ok(injected.trips.every(t=>!t.pickedUpAt));
});
test('publishing one period does not publish the other; custody edits and unexplained published edits remain blocked',()=>{
 let d=scheduled(2);d=action(d,'pickup',d.trips[1],driver);
 assert.throws(()=>m.applyPlanningBatch(d,[{key:d.trips[1].key,revision:d.trips[1].revision,decision:'needs_transport',plan:plan()}],c(),'Edit'),/individual trip/);
 const waiting=d.trips[3];assert.throws(()=>m.applyPlanningBatch(d,[{key:waiting.key,revision:waiting.revision,decision:'no_transport',plan:{...waiting.plan,reason:'Parent confirmed'}}],c()),/why the published/);
 d=day(1);for(const t of [...d.trips])d=action(d,'save',d.trips.find(x=>x.key===t.key),planner,{decision:'no_transport',plan:{...m.emptyPlan(),reason:'Danielle confirmed'}});
 const morning=d.trips.find(t=>t.period==='Morning'),afternoon=d.trips.find(t=>t.period==='Afternoon');
 d=m.applyCommand(d,{action:'publish',keys:[afternoon.key]},c());assert.equal(d.trips.find(t=>t.key===morning.key).publishedRevision,0);assert.ok(d.trips.find(t=>t.key===afternoon.key).publishedRevision>0);
});


test('copying route details retains usual decisions, manual choices, new school data and the other period',()=>{
 const previous=scheduled(2);let current=day(2);const morning=current.trips[0],afternoon=current.trips[1];
 const configured={...settings,usualDecisions:{[morning.key]:{decision:'needs_transport',reason:'Confirmed by Danielle',confirmedBy:'planner',confirmedAt:now,effectiveFrom:date}}};
 morning.decision='needs_transport';morning.revision=1;morning.lastAt=now;morning.plan.reason='Confirmed by Danielle';
 previous.trips[0].plan={...plan('Morning'),pickup:'07:00'};
 let copied=m.copyPlanningDetails(current,previous,{...c(),settings:configured},[morning.key]);
 assert.equal(copied.trips[0].decision,'needs_transport');assert.equal(copied.trips[0].plan.pickup,'07:00');assert.equal(copied.trips[1].plan.driverId,'');
 current.trips[0].revision=2;current.trips[0].decision='no_transport';copied=m.copyPlanningDetails(current,previous,{...c(),settings:configured},[morning.key]);assert.equal(copied.trips[0].decision,'no_transport');assert.equal(copied.trips[0].plan.pickup,'');
 afternoon.plan.school='Changed School';afternoon.plan.seating='New verified restraint';copied=m.copyPlanningDetails(current,previous,c(),[afternoon.key]);assert.equal(copied.trips[1].plan.school,'Changed School');assert.equal(copied.trips[1].plan.seating,'New verified restraint');assert.equal(copied.trips[1].decision,'unresolved');
 previous.trips[1].locationId='old-location';copied=m.copyPlanningDetails(current,previous,c(),[afternoon.key]);assert.equal(copied.trips[1].plan.driverId,'');
});

test('blank or invalid optional enrollment dates cannot hide enrolled children',()=>{
 for(const value of ['',null,'invalid','2030-02-30']){
  const c=child(1);c.record_data={...c.record_data,plannedLastDay:value};
  assert.equal(roster.reconcileRoster({trips:[],closedAt:''},[c],[],[],people,settings,date,now).trips.length,2);
 }
 for(const data of [{plannedLastDay:'2020-01-01'},{plannedStartDate:'2099-01-01'}]){
  const c=child(1);c.record_data={...c.record_data,...data};
  assert.equal(roster.reconcileRoster({trips:[],closedAt:''},[c],[],[],people,settings,date,now).trips.length,0);
 }
});

test('backup driver, estimated arrival and backup alert configuration do not block publication',()=>{
 let d=day();const t=d.trips[1];
 d=action(d,'save',t,planner,{decision:'needs_transport',plan:{...plan(),backupDriverId:'',arrival:''}});
 const context=c();context.settings={...settings,backupLeaderIds:[]};
 assert.deepEqual(m.readiness(d.trips[1],d.trips,context),[]);
 d=m.applyCommand(d,{action:'publish'},context);
 assert.equal(d.trips[1].publishedRevision,d.trips[1].revision);
 d=action(d,'acknowledge',d.trips[1],driver);
 d=action(d,'pickup',d.trips[1],driver);
 assert.equal(d.trips[1].stage,'with_driver');
 const bad={...d.trips[1],plan:{...d.trips[1].plan,arrival:'01:00'}};
 assert.ok(m.readiness(bad,[bad],context).some(x=>x.includes('Estimated arrival')));
});
test('confirmed no-transport decisions do not carry unpublished-plan warnings',()=>{
 let d=day();d=action(d,'save',d.trips[0],planner,{decision:'no_transport',plan:{...m.emptyPlan(),school:'Test School',reason:'Danielle confirmed no ride'}});
 assert.ok(!m.exceptions(d.trips[0],c()).includes('Unpublished plan'));
});
