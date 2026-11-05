import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import test,{before,beforeEach,after} from 'node:test';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const url=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const ids=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=ids(1),otherOrg=ids(2),owner=ids(3),staff=ids(4),loc=ids(5),otherLoc=ids(6),first=ids(7),second=ids(8),outside=ids(9);
const db=new PGlite();
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;
 create function current_staff_organization_id() returns uuid language sql as $$select '${org}'::uuid$$;
 create function is_tcs_owner() returns boolean language sql as $$select auth.uid()='${owner}'::uuid$$;
 create function is_tcs_licensee() returns boolean language sql as $$select false$$;
 create table children(id uuid primary key,organization_id uuid,location_id uuid,legacy_id text,first_name text,last_name text,enrollment_status text,school_name text,record_data jsonb,unique(organization_id,legacy_id));
 create table transportation_routes(id uuid primary key default gen_random_uuid(),organization_id uuid,location_id uuid,child_id uuid references children(id),legacy_id text,child_name text,school_name text,driver_name text,vehicle_name text,route_status text,record_data jsonb,unique(organization_id,legacy_id));
 create table transportation_day_stops(snapshot jsonb,organization_id uuid,route_id uuid,service_date date,is_planned boolean,called_out boolean default false);
 grant select,insert,update on transportation_day_stops to authenticated;
 create table hub_state(organization_id uuid,state_key text,state_value jsonb);
 create table locations(id uuid primary key,organization_id uuid,slug text,is_active boolean);
 grant select on locations to authenticated,service_role;
 alter table locations enable row level security;
 create policy location_read on locations for select to authenticated using(organization_id=current_staff_organization_id() and (is_tcs_owner() or (auth.uid()='${staff}'::uuid and id='${loc}'::uuid)));
 grant select,insert,update on children,transportation_routes to authenticated;
 grant select on hub_state to authenticated;
 alter table children enable row level security;alter table transportation_routes enable row level security;
 create policy child_read on children for select to authenticated using(organization_id=current_staff_organization_id());
 create policy child_update on children for update to authenticated using(organization_id=current_staff_organization_id() and is_tcs_owner()) with check(organization_id=current_staff_organization_id() and is_tcs_owner());
 create policy route_read on transportation_routes for select to authenticated using(organization_id=current_staff_organization_id());
 create policy route_write on transportation_routes for all to authenticated using(organization_id=current_staff_organization_id() and is_tcs_owner()) with check(organization_id=current_staff_organization_id() and is_tcs_owner());`);
 // Use the actual production lookup and original grants, not an always-callable stub.
 const production=await readFile('supabase/production-hardening.sql','utf8');
 for(const name of ['tcs_location_slug','resolve_tcs_location_id']){
  const start=production.indexOf('create or replace function public.'+name+'('),end=production.indexOf('\n$$;',start)+4;
  assert.ok(start>=0&&end>start);await db.exec(production.slice(start,end));
 }
 await db.exec('revoke execute on function resolve_tcs_location_id(text,uuid) from public,anon,authenticated;grant execute on function resolve_tcs_location_id(text,uuid) to service_role;set role authenticated;');
 await assert.rejects(db.query('select resolve_tcs_location_id($1,$2)',['Halcom',org]),/permission denied for function resolve_tcs_location_id/);
 await db.exec('reset role');
 const lookup=(await readdir('supabase/migrations')).find(name=>name.endsWith('_transport_location_lookup_access.sql'));
 await db.exec(await readFile('supabase/migrations/'+lookup,'utf8'));
 const migration=(await readdir('supabase/migrations')).find(name=>name.endsWith('_transportation_child_school_links.sql'));
 await db.exec(await readFile('supabase/migrations/'+migration,'utf8'));
 const connected=(await readdir('supabase/migrations')).find(name=>name.endsWith('_connected_child_transport.sql'));
 await db.exec(await readFile('supabase/migrations/'+connected,'utf8'));
 const patches=(await readdir('supabase/migrations')).find(name=>name.endsWith('_targeted_transport_updates.sql'));
 await db.exec(await readFile('supabase/migrations/'+patches,'utf8'));
 const exclusion=(await readdir('supabase/migrations')).find(name=>name.endsWith('_child_transport_exclusion.sql'));
 await db.exec(await readFile('supabase/migrations/'+exclusion,'utf8'));
});
beforeEach(async()=>{
 await db.exec('reset role;truncate transportation_routes,children,hub_state,transportation_day_stops,locations;');
 await db.query("insert into locations values($1,$2,'halcom',true),($3,$2,'42nd-street',true),($4,$5,'halcom',true),($6,$2,'21st-street',false)",[loc,org,otherLoc,ids(11),otherOrg,ids(12)]);
 const data={medicalNotes:'Synthetic protected medical field',brightwheel:{id:'source-identity'},schoolAgeSupport:{accommodations:'Synthetic learning support'}};
 await db.query('insert into children values($1,$2,$3,$4,$5,$6,$7,$8,$9),($10,$2,$11,$12,$5,$6,$7,$8,$9),($13,$14,$3,$15,$5,$6,$7,$8,$9)',[first,org,loc,'brightwheel:synthetic-a','Synthetic','Same Name','Active','',data,second,otherLoc,'brightwheel:synthetic-b',outside,otherOrg,'outside-child']);
 await db.query('insert into hub_state values($1,$2,$3)',[org,'tcs-schools-v2',[{school:'Synthetic School',status:'Active'},{school:'Synthetic New School',status:'Active'}]]);
 await db.query('insert into transportation_day_stops(snapshot) values($1)',[{school:'Historical School',child:'Synthetic Same Name'}]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated');
});
after(()=>db.close());
const row=(id,key='brightwheel:synthetic-a',location='Halcom')=>({id,childId:key,child:'Untrusted typed name',location,school:'Synthetic School',driver:'Synthetic Driver',vehicle:'Synthetic Van',pickup:'2:00 PM',days:'Mon-Fri',status:'Confirmed',tripPeriod:'Afternoon',dropoffLocation:location,expectedChildSchool:''});
const save=(rows,schools=true)=>db.query('select save_transport_school_routes($1,$2)',[rows,schools]);
test('imported stable IDs link same-name children separately and preserve unrelated profile fields',async()=>{
 await save([row(1),row(2,'brightwheel:synthetic-b','42nd Street')]);
 const routes=(await db.query('select child_id,child_name,record_data from transportation_routes order by legacy_id')).rows;
 assert.deepEqual(routes.map(r=>r.child_id),[first,second]);assert.deepEqual(routes.map(r=>r.record_data.dropoffLocation),['Halcom','42nd Street']);
 assert.ok(routes.every(r=>r.child_name==='Synthetic Same Name'));
 const children=(await db.query('select record_data,school_name from children order by legacy_id')).rows;
 assert.equal(children.length,2);assert.ok(children.every(c=>c.school_name==='Synthetic School'));
 assert.equal(children[0].record_data.medicalNotes,'Synthetic protected medical field');assert.equal(children[0].record_data.schoolAgeSupport.accommodations,'Synthetic learning support');
 assert.equal(children[0].record_data.brightwheel.id,'source-identity');
});
test('saving selected riders never deletes other trips or creates child profiles and rollback is atomic',async()=>{
 await save([row(1)],false);await save([row(2,'brightwheel:synthetic-b','42nd Street')],false);
 await db.query("update transportation_routes set record_data=record_data||$1 where legacy_id='1'",[{runHistory:[{date:'2020-01-01',status:'Picked Up'}]}]);
 await save([{...row(1),vehicle:'Updated van'}],false);
 assert.equal((await db.query('select count(*) n from transportation_routes')).rows[0].n,2);
 assert.equal((await db.query("select record_data from transportation_routes where legacy_id='1'")).rows[0].record_data.runHistory.length,1);
 await assert.rejects(save([row(3),row(4,'missing-child')]),/existing child/);
 assert.equal((await db.query('select count(*) n from transportation_routes')).rows[0].n,2);
 assert.ok((await db.query('select school_name from children')).rows.every(c=>c.school_name===''));
 await assert.rejects(save([row(5),row(6)]),/only once/);
 assert.equal((await db.query('select count(*) n from children')).rows[0].n,2);
});
test('school changes follow child IDs while historical daily plans and special destinations stay intact',async()=>{
 await save([row(1)]);await save([{...row(2),school:'Dojo'}],true);
 await db.query('select set_transport_child_school($1,$2,$3)',['brightwheel:synthetic-a','Synthetic New School','Synthetic School']);
 const routes=(await db.query('select school_name from transportation_routes order by legacy_id')).rows;
 assert.deepEqual(routes.map(r=>r.school_name),['Synthetic New School','Dojo']);
 await db.exec('reset role');assert.equal((await db.query('select snapshot from transportation_day_stops')).rows[0].snapshot.school,'Historical School');
});
test('stale school edits, unknown schools, archived riders, cross-organization IDs and ordinary staff are rejected',async()=>{
 await assert.rejects(db.query('select set_transport_child_school($1,$2,$3)',['brightwheel:synthetic-a','Synthetic School','old value']),/changed/);
 await assert.rejects(save([{...row(1),school:'Invented School'}]),/school directory/);
 await assert.rejects(save([row(1,'outside-child')]),/existing child/);
 await db.query("update children set enrollment_status='Archived' where id=$1",[first]);await assert.rejects(save([row(1)]),/active existing child/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[staff]);await assert.rejects(save([row(2,'brightwheel:synthetic-b')]),/access required/);
 assert.equal((await db.query("select has_function_privilege('anon','save_transport_school_routes(jsonb,boolean)','execute') allowed")).rows[0].allowed,false);
 assert.equal((await db.query('select count(*) n from transportation_routes')).rows[0].n,0);
});
test('an in-transit child cannot have their trip or school redirected',async()=>{
 await save([row(1)]);await db.query("update transportation_routes set record_data=record_data||jsonb_build_object('runDate',(now() at time zone 'America/Los_Angeles')::date::text,'runStatus','Picked Up')");
 await assert.rejects(save([{...row(1),expectedChildSchool:'Synthetic School'}]),/in transit/);
 await assert.rejects(db.query('select set_transport_child_school($1,$2,$3)',['brightwheel:synthetic-a','Synthetic New School','Synthetic School']),/in transit/);
});

const config=url(await readFile('src/lib/location-config.ts','utf8'));
const auditUrl=url(await readFile('src/lib/child-file-audits.ts','utf8'));
let source=await readFile('src/app/api/children/route.ts','utf8');
source=source.replace('"@/lib/child-file-audits"',JSON.stringify(auditUrl)).replace(/import \{ flushTransportAssignmentNotices \} from .*?;/,'const flushTransportAssignmentNotices=async()=>{};').replace(/import \{ safeFamilyAccess \} from .*?;/,'const safeFamilyAccess=v=>Array.isArray(v)?v:[];').replace('"@/lib/location-config"',JSON.stringify(config)).replace(/import \{ requireStaff, staffErrorResponse \} from .*?;/,'const requireStaff=async()=>globalThis.transportChildTestAuth;const staffErrorResponse=e=>e instanceof Response?e:Response.json({error:String(e)},{status:500});');
const childApi=await import(url(source));
test('child API reconstructs an imported child absent from raw JSON and returns the school with a stable key',async()=>{
 const rows=[{legacy_id:'brightwheel:synthetic-a',first_name:'Synthetic',last_name:'Imported',enrollment_status:'Active',school_name:'Synthetic School',record_data:{location:'Halcom'}}];
 globalThis.transportChildTestAuth={isOwner:true,isLicensee:false,profile:{permissions:[]},userClient:{from(table){const q={select(){return q},eq(){return q},order(){return q},then(resolve,reject){return Promise.resolve({data:table==='children'?rows:[],error:null}).then(resolve,reject)}};return q}}};
 const response=await childApi.GET(new Request('https://synthetic.invalid/api/children'));assert.equal(response.status,200);
 const child=(await response.json()).children[0];assert.equal(child.legacyId,'brightwheel:synthetic-a');assert.equal(child.firstName,'Synthetic');assert.equal(child.schoolAgeSupport.schoolName,'Synthetic School');assert.ok(Number.isSafeInteger(child.id));
 const {transportChildKey,transportSchoolDirectory,transportCareLocation}=await import(url((await readFile('src/lib/transport-child-schools.ts','utf8')).replace('"./location-config"',JSON.stringify(config))));
 assert.equal(transportCareLocation('Moore Family Childcare • Halcom'),'Halcom');assert.equal(transportCareLocation('Lara Family Childcare • 42nd Street'),'42nd Street');assert.equal(transportChildKey(child),'brightwheel:synthetic-a');assert.equal(transportChildKey({}), '');assert.equal(transportSchoolDirectory([], [child])[0].school,'Synthetic School');
});


test('profile school and care moves update both sessions, retain custom destinations and preserve funding/history',async()=>{
 await save([{...row(1),tripPeriod:'Morning',pickupLocation:'Halcom',dropoffLocation:'Synthetic School'}]);
 await save([{...row(2),expectedChildSchool:'Synthetic School'}]);
 await save([{...row(3),school:'Dojo',dropoffLocation:'Synthetic Custom Destination'}],false);
 await db.query('update children set record_data=record_data||$1 where id=$2',[{location:'Halcom',fundingLocation:'Synthetic Funding Office',familyMessages:[{body:'Existing private message'}]},first]);
 await db.query('update children set location_id=$1,school_name=$2,record_data=record_data||$3 where id=$4',[otherLoc,'Synthetic New School',{location:'42nd Street'},first]);
 const rows=(await db.query('select record_data from transportation_routes order by legacy_id')).rows.map(r=>r.record_data);
 assert.equal(rows[0].pickupLocation,'42nd Street');assert.equal(rows[0].dropoffLocation,'Synthetic New School');
 assert.equal(rows[1].dropoffLocation,'42nd Street');assert.equal(rows[1].school,'Synthetic New School');
 assert.equal(rows[2].school,'Dojo');assert.equal(rows[2].dropoffLocation,'Synthetic Custom Destination');
 const child=(await db.query('select record_data from children where id=$1',[first])).rows[0].record_data;
 assert.equal(child.fundingLocation,'Synthetic Funding Office');assert.equal(child.familyMessages[0].body,'Existing private message');
 assert.equal(child.schoolAgeSupport.schoolName,'Synthetic New School');assert.equal(child.schoolAgeSupport.accommodations,'Synthetic learning support');
 await db.exec('reset role');
 assert.equal((await db.query('select snapshot from transportation_day_stops')).rows[0].snapshot.school,'Historical School');
});
test('archiving stops regular trips and an in-transit move rolls back the whole profile change',async()=>{
 await save([row(1)]);
 await db.query("update transportation_routes set record_data=record_data||jsonb_build_object('runDate',(now() at time zone 'America/Los_Angeles')::date::text,'runStatus','Picked Up')");
 await assert.rejects(db.query('update children set location_id=$1,record_data=record_data||$2 where id=$3',[otherLoc,{location:'42nd Street'},first]),/in transit/);
 assert.equal((await db.query('select location_id from children where id=$1',[first])).rows[0].location_id,loc);
 await db.query("update transportation_routes set record_data=record_data||$1",[{runStatus:"Dropped Off"}]);
 await db.query("update children set enrollment_status='Archived' where id=$1",[first]);
 assert.equal((await db.query('select route_status from transportation_routes')).rows[0].route_status,'Not Riding');
});


test('pickup patches never delete another newly added route; stale writes roll back atomically',async()=>{
 await save([row(1)],false);
 const original=(await db.query("select record_data from transportation_routes where legacy_id='1'")).rows[0].record_data;
 await save([row(2,'brightwheel:synthetic-b','42nd Street')],false);
 const after={...original,runStatus:'Picked Up',runDate:'2030-01-01'};
 await db.query('select patch_transport_records($1)',[[{id:'1',before:original,after}]]);
 assert.equal((await db.query('select count(*) n from transportation_routes')).rows[0].n,2);
 await assert.rejects(db.query('select patch_transport_records($1)',[[{id:'1',before:original,after:{...original,runStatus:'Arrived'}}]]),/changed on another screen/);
 assert.equal((await db.query("select record_data from transportation_routes where legacy_id='1'")).rows[0].record_data.runStatus,'Picked Up');
 assert.equal((await db.query('select patch_transport_records($1) n',[[{id:'1',before:original,after}]])).rows[0].n,0);
 await assert.rejects(db.query('select patch_transport_records($1)',[[{id:'1',before:after,after:{...after,childId:'outside-child'}}]]),/linked child/);
 await assert.rejects(db.query('select patch_transport_records($1)',[[{id:'1',before:after,after:{...after,runStatus:'Arrived'}},{id:'not-found',before:{},after:{}}]]),/no longer available/);
 assert.equal((await db.query("select record_data from transportation_routes where legacy_id='1'")).rows[0].record_data.runStatus,'Picked Up');
});

const exclude=(value,expected=!value,key='brightwheel:synthetic-a')=>db.query('select set_child_transportation_exclusion($1,$2,$3)',[key,value,expected]);
test('no-transport checkbox stops both sessions, keeps profile and history, and restoring never silently resumes old trips',async()=>{
 await save([{...row(1),tripPeriod:'Morning',pickupLocation:'Halcom',dropoffLocation:'Synthetic School'}]);
 await save([{...row(2),expectedChildSchool:'Synthetic School'}]);
 await save([row(3,'brightwheel:synthetic-b','42nd Street')]);
 await db.query("update transportation_routes set record_data=record_data||$1 where child_id=$2",[{runDate:'2020-01-01',runStatus:'Dropped Off',runHistory:[{date:'2020-01-01',status:'Dropped Off'}]},first]);
 await exclude(true);
 const trips=(await db.query('select record_data,route_status from transportation_routes where child_id=$1',[first])).rows;
 assert.equal(trips.length,2);assert.ok(trips.every(r=>r.route_status==='Not Riding'&&r.record_data.status==='Not Riding'&&r.record_data.runHistory.length===1));
 let child=(await db.query('select * from children where id=$1',[first])).rows[0];
 assert.equal(child.record_data.noTransportationNeeded,true);assert.equal(child.enrollment_status,'Active');assert.equal(child.school_name,'Synthetic School');assert.equal(child.record_data.brightwheel.id,'source-identity');
 assert.equal((await db.query('select route_status from transportation_routes where child_id=$1',[second])).rows[0].route_status,'Confirmed');
 await exclude(false);child=(await db.query('select record_data from children where id=$1',[first])).rows[0];assert.equal(child.record_data.noTransportationNeeded,false);
 assert.ok((await db.query('select route_status from transportation_routes where child_id=$1',[first])).rows.every(r=>r.route_status==='Not Riding'));
 await db.exec('reset role');assert.equal((await db.query('select snapshot from transportation_day_stops')).rows[0].snapshot.school,'Historical School');
});
test('exclusion cannot hide a child in transit; rejection leaves profile and both trips unchanged',async()=>{
 await save([row(1)]);await save([{...row(2),expectedChildSchool:'Synthetic School'}]);
 await db.query("update transportation_routes set record_data=record_data||jsonb_build_object('runDate',(now() at time zone 'America/Los_Angeles')::date::text,'runStatus','Picked Up') where legacy_id='2'");
 await assert.rejects(exclude(true),/in transit/);
 assert.ok((await db.query('select route_status from transportation_routes')).rows.every(r=>r.route_status==='Confirmed'));
 assert.notEqual((await db.query('select record_data from children where id=$1',[first])).rows[0].record_data.noTransportationNeeded,true);
});
test('stale tabs cannot add or reactivate excluded riders and ordinary staff cannot toggle the preference',async()=>{
 await save([row(1)]);await exclude(true);
 await assert.rejects(save([{...row(2),expectedChildSchool:'Synthetic School'}]),/Transportation is turned off/);
 await assert.rejects(db.query("update transportation_routes set route_status='Confirmed',record_data=record_data||$1",[{status:'Confirmed'}]),/Transportation is turned off/);
 await assert.rejects(exclude(false,false),/changed/);
 await assert.rejects(exclude(true,false,'outside-child'),/existing child/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[staff]);await assert.rejects(exclude(false),/access required/);
 assert.equal((await db.query("select has_function_privilege('anon','set_child_transportation_exclusion(text,boolean,boolean)','execute') allowed")).rows[0].allowed,false);
});
test('combined profile edit keeps removed riders off trips even when their school is cleared',async()=>{
 await save([row(1)]);
 await db.query("update children set school_name=null,record_data=record_data||$1 where id=$2",[{noTransportationNeeded:true},first]);
 assert.equal((await db.query('select route_status from transportation_routes')).rows[0].route_status,'Not Riding');
});

test('a stale daily planner cannot assign an excluded child, and saved historical snapshots remain intact',async()=>{
 await save([row(1)]);await exclude(true);
 const trip=(await db.query('select id,record_data from transportation_routes')).rows[0];
 await assert.rejects(db.query("insert into transportation_day_stops(snapshot,organization_id,route_id,service_date,is_planned) values($1,$2,$3,(now() at time zone 'America/Los_Angeles')::date,true)",[trip.record_data,org,trip.id]),/Transportation is turned off/);
 assert.equal((await db.query('select count(*) n from transportation_day_stops')).rows[0].n,1);
 await exclude(false);await db.query("insert into transportation_day_stops(snapshot,organization_id,route_id,service_date,is_planned) values($1,$2,$3,(now() at time zone 'America/Los_Angeles')::date,true)",[trip.record_data,org,trip.id]);
 assert.equal((await db.query('select count(*) n from transportation_day_stops')).rows[0].n,2);
});

test('location lookup uses live grants and row security: allowed sites work, other organizations and closed sites remain hidden',async()=>{
 assert.equal((await db.query('select resolve_tcs_location_id($1,$2) id',['Moore Family Childcare • Halcom',org])).rows[0].id,loc);
 assert.equal((await db.query('select resolve_tcs_location_id($1,$2) id',['Halcom',otherOrg])).rows[0].id,null);
 assert.equal((await db.query('select resolve_tcs_location_id($1,$2) id',['21st Street',org])).rows[0].id,null);
 assert.equal((await db.query("select prosecdef from pg_proc where proname='resolve_tcs_location_id'")).rows[0].prosecdef,false);
 assert.equal((await db.query("select has_function_privilege('anon','resolve_tcs_location_id(text,uuid)','execute') allowed")).rows[0].allowed,false);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[staff]);
 assert.equal((await db.query('select resolve_tcs_location_id($1,$2) id',['Halcom',org])).rows[0].id,loc);
 assert.equal((await db.query('select resolve_tcs_location_id($1,$2) id',['42nd Street',org])).rows[0].id,null);
 await db.exec('reset role;set role service_role');
 assert.equal((await db.query('select resolve_tcs_location_id($1,$2) id',['Halcom',otherOrg])).rows[0].id,ids(11));
});

test('editing a school stop without a group field preserves old per-child route metadata',async()=>{
 await save([{...row(1),routeName:'Legacy A'}, {...row(2,'brightwheel:synthetic-b','42nd Street'),routeName:'Legacy B'}]);
 await save([{...row(1),expectedChildSchool:'Synthetic School',pickup:'3:00 PM'}, {...row(2,'brightwheel:synthetic-b','42nd Street'),expectedChildSchool:'Synthetic School',pickup:'3:00 PM'}]);
 assert.deepEqual((await db.query('select record_data from transportation_routes order by legacy_id')).rows.map(r=>r.record_data.routeName),['Legacy A','Legacy B']);
});
