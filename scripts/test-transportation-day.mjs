import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import test,{before,beforeEach,after} from 'node:test';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const url=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const libSource=await readFile('src/lib/transportation-day.ts','utf8'),libUrl=url(libSource),{scheduledOnDate,mergeTransportDay,validTransportDate}=await import(libUrl);
const day='2030-01-07';
test('date planner handles weekdays, ranges, full day names and weekends without changing recurrence',()=>{
 assert.equal(scheduledOnDate('Mon–Fri',day),true);assert.equal(scheduledOnDate('Monday-Friday','2030-01-05'),false);assert.equal(scheduledOnDate('Friday-Monday','2030-01-06'),true);assert.equal(scheduledOnDate('Mon, Wed, Fri','2030-01-08'),false);assert.equal(validTransportDate('2030-02-30'),false);
 const routes=[{id:1,child:'Synthetic Child',days:'Mon-Fri',status:'Confirmed',driver:'Regular',vehicle:'Regular van'}];const original=structuredClone(routes);
 const stops=[{snapshot:{...routes[0]},service_date:day,is_planned:true,called_out:false,plan_data:{driver:'Tomorrow driver',vehicle:'Synthetic van'}}];
 assert.equal(mergeTransportDay(routes,stops,day)[0].driver,'Tomorrow driver');assert.equal(mergeTransportDay(routes,stops,'2030-01-08')[0].driver,'Regular');assert.deepEqual(routes,original);
 stops[0].called_out=true;assert.equal(mergeTransportDay(routes,stops,day).length,0);assert.equal(mergeTransportDay(routes,stops,'2030-01-08').length,1);
 assert.equal(mergeTransportDay([{...routes[0],days:'Sat'}],[{...stops[0],is_planned:false,called_out:false}],day).length,0);
});
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;const org=id(1),otherOrg=id(2),loc=id(3),otherLoc=id(4),owner=id(10),licensee=id(11),driver=id(12),paused=id(13),child=id(20),r1=id(30),r2=id(31),r3=id(32),r4=id(33),r5=id(34);
const db=new PGlite();
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;
 create table organizations(id uuid primary key);create table locations(id uuid primary key,organization_id uuid,is_active boolean);
 create table staff_access(user_id uuid primary key,organization_id uuid,full_name text,role text,permissions text[],is_active boolean);
 create table staff_location_assignments(organization_id uuid,user_id uuid,location_id uuid);
 create table children(id uuid primary key,organization_id uuid,location_id uuid,legacy_id text,first_name text,last_name text);
 create table transportation_routes(id uuid primary key,organization_id uuid,location_id uuid,child_id uuid,record_data jsonb);
 create table audit_log(organization_id uuid,location_id uuid,actor_user_id uuid,action text,table_name text,metadata jsonb);
 grant select on staff_access,locations,staff_location_assignments to authenticated;
 create function current_staff_organization_id() returns uuid language sql stable as $$select organization_id from staff_access where user_id=auth.uid() and is_active$$;
 create function is_approved_tcs_pilot_user() returns boolean language sql stable as $$select exists(select 1 from staff_access where user_id=auth.uid() and is_active)$$;
 create function is_tcs_owner() returns boolean language sql stable as $$select exists(select 1 from staff_access where user_id=auth.uid() and is_active and role='Owner / Admin')$$;
 create function is_tcs_licensee() returns boolean language sql stable as $$select exists(select 1 from staff_access where user_id=auth.uid() and is_active and role='Location Licensee')$$;
 create function can_access_location(uuid) returns boolean language sql stable as $$select is_tcs_owner() or exists(select 1 from staff_location_assignments where user_id=auth.uid() and location_id=$1)$$;`);
 const name=(await readdir('supabase/migrations')).find(name=>name.endsWith('_daily_transport_plans.sql'));await db.exec(await readFile('supabase/migrations/'+name,'utf8'));
});
beforeEach(async()=>{
 await db.exec('reset role;truncate transportation_day_stops,audit_log,transportation_routes,children,staff_location_assignments,staff_access,locations,organizations,auth.users;');
 await db.query('insert into organizations values($1),($2)',[org,otherOrg]);await db.query('insert into locations values($1,$2,true),($3,$2,true)',[loc,org,otherLoc]);
 for(const [actor,role,active,perms] of [[owner,'Owner / Admin',true,[]],[licensee,'Location Licensee',true,[]],[driver,'Employee',true,['transportation']],[paused,'Owner / Admin',false,[]]]){await db.query('insert into auth.users values($1)',[actor]);await db.query('insert into staff_access values($1,$2,$3,$4,$5,$6)',[actor,org,'Synthetic Staff',role,perms,active]);await db.query('insert into staff_location_assignments values($1,$2,$3)',[org,actor,loc]);}
 await db.query('insert into children values($1,$2,$3,$4,$5,$6),($7,$2,$8,$9,$5,$6)',[child,org,loc,'synthetic-child','Synthetic','Same Name',id(21),otherLoc,'other-child']);
 await db.query('insert into children values($1,$2,$3,$4,$5,$6)',[id(22),org,loc,'same-name-other','Synthetic','Same Name']);
 for(const [route,site,childId] of [[r1,loc,child],[r2,loc,child],[r3,otherLoc,id(21)],[r4,loc,null],[r5,loc,null]])await db.query('insert into transportation_routes values($1,$2,$3,$4,$5)',[route,org,site,childId,JSON.stringify({id:route,childId:childId===child?'synthetic-child':childId?'other-child':undefined,child:'Synthetic Same Name',driver:'Regular Driver',vehicle:'Regular Van',days:'Mon-Fri',status:'Confirmed'})]);
});
after(()=>db.close());
const save=(actor,route=r1,action='save',version=0,plan={driver:'Synthetic Tomorrow Driver',vehicle:'Synthetic Van',stopOrder:1},date=day)=>db.query('select save_transport_day_stop($1,$2,$3,$4,$5,$6,$7)',[org,actor,route,date,action,JSON.stringify(plan),version]);
test('daily assignments retain recurring routes and reject stale versions, invalid fields and unauthorized writers',async()=>{
 const before=(await db.query('select record_data from transportation_routes where id=$1',[r1])).rows[0].record_data;
 await save(owner);assert.deepEqual((await db.query('select record_data from transportation_routes where id=$1',[r1])).rows[0].record_data,before);assert.equal((await db.query('select is_planned from transportation_day_stops')).rows[0].is_planned,true);
 await assert.rejects(save(owner),/changed/);await assert.rejects(save(licensee),/Only administration/);await assert.rejects(save(driver),/Leadership/);await assert.rejects(save(paused),/Active staff/);
 await assert.rejects(save(owner,r3,'save',0,{child:'Do not rename'}),/Invalid daily route fields/);await assert.rejects(save(owner,r3,'save',0,{stopOrder:1.5}),/Invalid daily route values/);
 assert.equal((await db.query('select count(*) n from transportation_day_stops')).rows[0].n,1);
});
test('licensee call-outs apply to linked child stops on one day and restore without losing assignments',async()=>{
 await save(owner);await save(licensee,r1,'callout',1);const stops=(await db.query('select * from transportation_day_stops order by route_id')).rows;assert.equal(stops.length,2);assert.ok(stops.every(stop=>stop.called_out));assert.equal(stops[0].plan_data.driver,'Synthetic Tomorrow Driver');assert.equal(stops[1].is_planned,false);
 await save(licensee,r1,'restore',2);assert.equal((await db.query('select count(*) n from transportation_day_stops where called_out')).rows[0].n,0);assert.equal((await db.query('select plan_data from transportation_day_stops where route_id=$1',[r1])).rows[0].plan_data.driver,'Synthetic Tomorrow Driver');
 await save(owner,r1,'save',0,{driver:'Another day'},'2030-01-08');assert.equal((await db.query('select count(*) n from transportation_day_stops')).rows[0].n,3);
});
test('same-name unlinked children are never combined, cross-location writes are blocked, and onboard children cannot disappear',async()=>{
 await save(licensee,r4,'callout');assert.equal((await db.query('select count(*) n from transportation_day_stops')).rows[0].n,1);await assert.rejects(save(licensee,r3,'callout'),/Location not assigned/);
 await db.query("update transportation_routes set record_data=record_data||$1 where id=$2",[JSON.stringify({runDate:day,runStatus:'Picked Up'}),r2]);await assert.rejects(save(owner,r1,'callout'),/already picked up/);assert.equal((await db.query('select count(*) n from transportation_day_stops where route_id=$1',[r1])).rows[0].n,0);
 await assert.rejects(save(owner,r1,'callout',0,{},'2020-01-01'),/Past dispatch/);
});
test('direct clients cannot write plans or invoke the server writer; read RLS stays location-scoped',async()=>{
 await save(owner);await save(owner,r3);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[licensee]);await db.exec('set role authenticated');assert.equal((await db.query('select * from transportation_day_stops')).rows.length,1);
 await assert.rejects(db.query('delete from transportation_day_stops'),/permission denied/);assert.equal((await db.query("select has_function_privilege('authenticated','save_transport_day_stop(uuid,uuid,uuid,date,text,jsonb,integer)','execute') allowed")).rows[0].allowed,false);
});
test('account deletion retains dispatch history while clearing the actor reference',async()=>{await save(owner);await db.query('delete from auth.users where id=$1',[owner]);const stop=(await db.query('select * from transportation_day_stops')).rows[0];assert.equal(stop.updated_by,null);assert.equal(stop.updated_by_name,'Synthetic Staff');});
const source=(await readFile('src/app/api/transportation-day/route.ts','utf8')).replace('"@/lib/transportation-day"',JSON.stringify(libUrl)).replace(/import \{flushTransportAssignmentNotices\}[^;]+;/,'const flushTransportAssignmentNotices=async()=>{};').replace(/import \{requireStaff,staffErrorResponse\}[^;]+;/,'const requireStaff=async()=>globalThis.dispatchAuth;const staffErrorResponse=e=>e instanceof Response?e:Response.json({error:String(e)},{status:500});');const api=await import(url(source));
test('API rejects staff call-outs and licensee dispatch edits before touching records',async()=>{
 for(const [isOwner,isLicensee,action] of [[false,false,'callout'],[false,true,'save']]){let calls=0;globalThis.dispatchAuth={isOwner,isLicensee,profile:{organization_id:org},user:{id:driver},admin:{rpc(){calls++;throw Error('must not call')}}};const result=await api.POST(new Request('https://hub.test/api/transportation-day',{method:'POST',body:JSON.stringify({date:day,routeId:r1,action,expectedVersion:0})}));assert.equal(result.status,403);assert.equal(calls,0);}
});
test('setup link reaches a distinct editor route instead of rewriting to the live page',async()=>{
 const live=await readFile('src/app/(portal)/transportation-v2/page.tsx','utf8');assert.match(live,/href="\/transportation-setup"/);assert.match(await readFile('src/app/(portal)/transportation-setup/page.tsx','utf8'),/export \{default\}/);assert.ok(!(await readFile('next.config.ts','utf8')).includes('source: "/transportation-setup"'));
});


test('a stale pickup is blocked after call-out while an offline in-transit child remains visible for handoff',async()=>{
 await save(licensee,r1,'callout');await assert.rejects(db.query('update transportation_routes set record_data=record_data||$1 where id=$2',[JSON.stringify({runDate:day,runStatus:'Picked Up'}),r1]),/called out/);
 const route={id:1,days:'Mon-Fri',status:'Confirmed',runDate:day,runStatus:'Arrived'};assert.equal(mergeTransportDay([route],[{snapshot:{id:1},service_date:day,called_out:true,is_planned:false,plan_data:{}}],day).length,1);
});


test('explicit child identity wins over same-name guesses and ambiguous unlinked names stay separate',async()=>{
 const rows=(await db.query('select id,child_id from transportation_routes order by id')).rows;assert.equal(rows.find(row=>row.id===r1).child_id,child);assert.equal(rows.find(row=>row.id===r4).child_id,null);
 await assert.rejects(db.query('update transportation_routes set record_data=record_data||$1 where id=$2',[JSON.stringify({childId:'missing-profile'}),r1]),/existing child profile/);
});

test('planner exposes next-day dispatch for admins, call-outs for licensees, and no edit buttons for drivers',async()=>{
 const {createRequire}=await import('node:module'),{default:vm}=await import('node:vm');const require=createRequire(import.meta.url);let index=0,mode='owner',selectedDate;const states=[],calls=[];
 const react={useState(initial){const slot=index++;if(!(slot in states))states[slot]=typeof initial==='function'?initial():initial;return[states[slot],value=>states[slot]=typeof value==='function'?value(states[slot]):value]}};
 const trips=await import(url(await readFile('src/lib/transport-trips.ts','utf8')));
 const deps={'@/components/forms/ChoiceSelect':{default:()=>null},'@/lib/transport-child-schools':{transportCareLocation:value=>value},'@/lib/transport-trips':trips,'./TransportDriverSelect':{default:()=>null},'./TransportSchoolSelect':{default:()=>null},react,'@/lib/date-utils':{localIsoDate:()=>day},'@/lib/transportation-day':{scheduledOnDate},'@/components/hub/HubUI':{Modal:()=>null,inputClass:''},'@/components/transportation/SchoolStopGroups':{default:({routes,children})=>routes.map(children)},'@/hooks/useTransportDay':{useTransportDay:(_routes,date)=>{selectedDate=date;return{ready:true,stops:[],saving:false,canPlan:mode==='owner',canCallOut:mode!=='driver',stopFor:()=>null,sourceFor:()=>({child_id:child}),change:async(...args)=>{calls.push(args);return true},refresh:async()=>{}}}}};
 const context={exports:{},require:name=>deps[name]||require(name)};vm.runInNewContext(ts.transpileModule(await readFile('src/components/transportation/DailyTransportPlanner.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 const flatten=node=>Array.isArray(node)?node.flatMap(flatten):node&&typeof node==='object'?(typeof node.type==='function'?flatten(node.type(node.props)):[node,...flatten(node.props?.children)]):[];const props={location:'Synthetic',routes:[{id:1,location:'Synthetic',child:'Synthetic Child',school:'Synthetic School',driver:'Synthetic Driver',vehicle:'Synthetic Van',days:'Mon-Fri',status:'Confirmed'}]};const render=()=>{index=0;return flatten(context.exports.default(props));};
 let nodes=render();assert.ok(nodes.some(node=>node.type==='button'&&node.props.children==='Edit this day'));nodes.find(node=>node.type==='button'&&node.props.children==='Tomorrow').props.onClick();nodes=render();assert.equal(selectedDate,'2030-01-08');mode='licensee';nodes=render();assert.ok(!nodes.some(node=>node.props?.children==='Edit this day'));nodes.find(node=>node.type==='button'&&node.props.children==='Call Out').props.onClick();await new Promise(setImmediate);assert.equal(calls[0][1],'callout');assert.equal(calls[0][0].id,1);mode='driver';nodes=render();assert.ok(!nodes.some(node=>node.type==='button'&&['Edit this day','Call Out','Restore'].includes(node.props.children)));
});

test('daily-route connection failures retain cached offline routes and never hide an in-transit handoff',async()=>{
 const {createRequire}=await import('node:module'),{default:vm}=await import('node:vm');const require=createRequire(import.meta.url);let cursor=0,fail=false;const states=[],effects=[],timers=[];
 const react={useState(initial){const slot=cursor++;if(!(slot in states))states[slot]=typeof initial==='function'?initial():initial;return[states[slot],value=>states[slot]=typeof value==='function'?value(states[slot]):value]},useRef(initial){const slot=cursor++;if(!(slot in states))states[slot]={current:initial};return states[slot]},useCallback:fn=>fn,useMemo:fn=>fn(),useEffect:fn=>effects.push(fn)};
 const trips=await import(url(await readFile('src/lib/transport-trips.ts','utf8')));
 const deps={'@/components/forms/ChoiceSelect':{default:()=>null},'@/lib/transport-child-schools':{transportCareLocation:value=>value},'@/lib/transport-trips':trips,'./TransportDriverSelect':{default:()=>null},'./TransportSchoolSelect':{default:()=>null},react,'@/components/providers/AuthProvider':{useAuth:()=>({session:{access_token:'synthetic'}})},'@/lib/transportation-day':{mergeTransportDay},'@/lib/hub-request':{hubRequest:async()=>{if(fail)throw Error('Synthetic connection lost');return{stops:[],sources:[],canPlan:false,canCallOut:false}}}};
 const context={exports:{},window:{setTimeout:fn=>{timers.push(fn);return 1},setInterval:()=>2,clearTimeout(){},clearInterval(){}},require:name=>deps[name]||require(name)};vm.runInNewContext(ts.transpileModule(await readFile('src/hooks/useTransportDay.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 const routes=[{id:1,days:'Mon-Fri',status:'Confirmed'},{id:2,days:'Mon-Fri',status:'Confirmed',runDate:day,runStatus:'Picked Up'}];const render=()=>{cursor=0;return context.exports.useTransportDay(routes,day)};
 let result=render();assert.equal(result.ready,false);assert.deepEqual(Array.from(result.activeRoutes,route=>route.id),[2]);effects[0]();timers[0]();await new Promise(setImmediate);result=render();assert.equal(result.ready,true);assert.equal(result.activeRoutes.length,2);fail=true;await result.refresh();result=render();assert.equal(result.ready,true);assert.equal(result.activeRoutes.length,2);assert.ok(result.error);
});
