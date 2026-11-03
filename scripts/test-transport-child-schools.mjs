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
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;
 create function current_staff_organization_id() returns uuid language sql as $$select '${org}'::uuid$$;
 create function is_tcs_owner() returns boolean language sql as $$select auth.uid()='${owner}'::uuid$$;
 create function is_tcs_licensee() returns boolean language sql as $$select false$$;
 create table children(id uuid primary key,organization_id uuid,location_id uuid,legacy_id text,first_name text,last_name text,enrollment_status text,school_name text,record_data jsonb,unique(organization_id,legacy_id));
 create table transportation_routes(id uuid primary key default gen_random_uuid(),organization_id uuid,location_id uuid,child_id uuid references children(id),legacy_id text,child_name text,school_name text,driver_name text,vehicle_name text,route_status text,record_data jsonb,unique(organization_id,legacy_id));
 create table transportation_day_stops(snapshot jsonb);
 create table hub_state(organization_id uuid,state_key text,state_value jsonb);
 create function resolve_tcs_location_id(text,uuid) returns uuid language sql as $$select case when $1='Synthetic Care A' then '${loc}'::uuid when $1='Synthetic Care B' then '${otherLoc}'::uuid end$$;
 grant select,insert,update on children,transportation_routes to authenticated;
 grant select on hub_state to authenticated;
 alter table children enable row level security;alter table transportation_routes enable row level security;
 create policy child_read on children for select to authenticated using(organization_id=current_staff_organization_id());
 create policy child_update on children for update to authenticated using(organization_id=current_staff_organization_id() and is_tcs_owner()) with check(organization_id=current_staff_organization_id() and is_tcs_owner());
 create policy route_read on transportation_routes for select to authenticated using(organization_id=current_staff_organization_id());
 create policy route_write on transportation_routes for all to authenticated using(organization_id=current_staff_organization_id() and is_tcs_owner()) with check(organization_id=current_staff_organization_id() and is_tcs_owner());`);
 const migration=(await readdir('supabase/migrations')).find(name=>name.endsWith('_transportation_child_school_links.sql'));
 await db.exec(await readFile('supabase/migrations/'+migration,'utf8'));
});
beforeEach(async()=>{
 await db.exec('reset role;truncate transportation_routes,children,hub_state,transportation_day_stops;');
 const data={medicalNotes:'Synthetic protected medical field',brightwheel:{id:'source-identity'},schoolAgeSupport:{accommodations:'Synthetic learning support'}};
 await db.query('insert into children values($1,$2,$3,$4,$5,$6,$7,$8,$9),($10,$2,$11,$12,$5,$6,$7,$8,$9),($13,$14,$3,$15,$5,$6,$7,$8,$9)',[first,org,loc,'brightwheel:synthetic-a','Synthetic','Same Name','Active','',data,second,otherLoc,'brightwheel:synthetic-b',outside,otherOrg,'outside-child']);
 await db.query('insert into hub_state values($1,$2,$3)',[org,'tcs-schools-v2',[{school:'Synthetic School',status:'Active'},{school:'Synthetic New School',status:'Active'}]]);
 await db.query('insert into transportation_day_stops values($1)',[{school:'Historical School',child:'Synthetic Same Name'}]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated');
});
after(()=>db.close());
const row=(id,key='brightwheel:synthetic-a',location='Synthetic Care A')=>({id,childId:key,child:'Untrusted typed name',location,school:'Synthetic School',driver:'Synthetic Driver',vehicle:'Synthetic Van',pickup:'2:00 PM',days:'Mon-Fri',status:'Confirmed',tripPeriod:'Afternoon',dropoffLocation:location,expectedChildSchool:''});
const save=(rows,schools=true)=>db.query('select save_transport_school_routes($1,$2)',[rows,schools]);
test('imported stable IDs link same-name children separately and preserve unrelated profile fields',async()=>{
 await save([row(1),row(2,'brightwheel:synthetic-b','Synthetic Care B')]);
 const routes=(await db.query('select child_id,child_name,record_data from transportation_routes order by legacy_id')).rows;
 assert.deepEqual(routes.map(r=>r.child_id),[first,second]);assert.deepEqual(routes.map(r=>r.record_data.dropoffLocation),['Synthetic Care A','Synthetic Care B']);
 assert.ok(routes.every(r=>r.child_name==='Synthetic Same Name'));
 const children=(await db.query('select record_data,school_name from children order by legacy_id')).rows;
 assert.equal(children.length,2);assert.ok(children.every(c=>c.school_name==='Synthetic School'));
 assert.equal(children[0].record_data.medicalNotes,'Synthetic protected medical field');assert.equal(children[0].record_data.schoolAgeSupport.accommodations,'Synthetic learning support');
 assert.equal(children[0].record_data.brightwheel.id,'source-identity');
});
test('saving selected riders never deletes other trips or creates child profiles and rollback is atomic',async()=>{
 await save([row(1)],false);await save([row(2,'brightwheel:synthetic-b','Synthetic Care B')],false);
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
let source=await readFile('src/app/api/children/route.ts','utf8');
source=source.replace(/import \{ safeFamilyAccess \} from .*?;/,'const safeFamilyAccess=v=>Array.isArray(v)?v:[];').replace('"@/lib/location-config"',JSON.stringify(config)).replace(/import \{ requireStaff, staffErrorResponse \} from .*?;/,'const requireStaff=async()=>globalThis.transportChildTestAuth;const staffErrorResponse=e=>e instanceof Response?e:Response.json({error:String(e)},{status:500});');
const childApi=await import(url(source));
test('child API reconstructs an imported child absent from raw JSON and returns the school with a stable key',async()=>{
 const rows=[{legacy_id:'brightwheel:synthetic-a',first_name:'Synthetic',last_name:'Imported',enrollment_status:'Active',school_name:'Synthetic School',record_data:{location:'Halcom'}}];
 globalThis.transportChildTestAuth={isOwner:true,isLicensee:false,profile:{permissions:[]},userClient:{from(table){const q={select(){return q},eq(){return q},order(){return q},then(resolve,reject){return Promise.resolve({data:table==='children'?rows:[],error:null}).then(resolve,reject)}};return q}}};
 const response=await childApi.GET(new Request('https://synthetic.invalid/api/children'));assert.equal(response.status,200);
 const child=(await response.json()).children[0];assert.equal(child.legacyId,'brightwheel:synthetic-a');assert.equal(child.firstName,'Synthetic');assert.equal(child.schoolAgeSupport.schoolName,'Synthetic School');assert.ok(Number.isSafeInteger(child.id));
 const {transportChildKey,transportSchoolDirectory,transportCareLocation}=await import(url((await readFile('src/lib/transport-child-schools.ts','utf8')).replace('"./location-config"',JSON.stringify(config))));
 assert.equal(transportCareLocation('Moore Family Childcare • Halcom'),'Halcom');assert.equal(transportCareLocation('Lara Family Childcare • 42nd Street'),'42nd Street');assert.equal(transportChildKey(child),'brightwheel:synthetic-a');assert.equal(transportChildKey({}), '');assert.equal(transportSchoolDirectory([], [child])[0].school,'Synthetic School');
});
