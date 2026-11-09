import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';

const source=path=>readFile(path,'utf8');
const moduleUrl=text=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const configUrl=moduleUrl(await source('src/lib/location-config.ts'));
const config=await import(configUrl);
const slug=await import(moduleUrl((await source('src/lib/server/location-slug.ts')).replace('import "server-only";','').replace('"@/lib/location-config"',JSON.stringify(configUrl))));
const rolesUrl=moduleUrl(await source('src/lib/team-access.ts'));
const coverage=await import(moduleUrl((await source('src/lib/server/staff-location-coverage.ts')).replace('import "server-only";','').replace('"@/lib/location-config"',JSON.stringify(configUrl)).replace('"@/lib/team-access"',JSON.stringify(rolesUrl))));

test('Newgrove is a zero-capacity worksite with closed care hours, excluded from childcare choices',()=>{
 for(const name of ['Newgrove','New Grove','Newgrove (Not open yet)']){
  assert.equal(config.normalizeLocation(name),'Newgrove');
  assert.equal(slug.tcsLocationSlug(name),'newgrove');
 }
 assert.ok(config.workLocations.includes('Newgrove'));
 assert.ok(!config.careLocations.includes('Newgrove'));
 assert.equal(config.locationFromSlug('newgrove'),'Newgrove');
 assert.equal(config.locationThemes.Newgrove.capacity,0);
 assert.match(config.locationOptionLabel('Newgrove'),/Not open yet/);
 assert.ok(Object.values(config.starterLocationHours.find(row=>row.location==='Newgrove').days).every(day=>day.closed&&!day.open&&!day.close));
});

const sites=[
 {id:'open',name:'Halcom',organization_id:'org',is_active:true,program_type:'Family Childcare'},
 {id:'work',name:'Newgrove',organization_id:'org',is_active:false,program_type:'Maintenance Site'},
 {id:'closed',name:'21st Street',organization_id:'org',is_active:false,program_type:'Family Childcare'},
 {id:'foreign',name:'Foreign Worksite',organization_id:'foreign',is_active:false,program_type:'Maintenance Site'},
];
function query(rows){
 let values=[...rows],columns;
 const q={select(value){columns=value.split(',');return q},eq(k,v){values=values.filter(row=>row[k]===v);return q},
  or(value){assert.equal(value,config.WORK_LOCATION_FILTER);values=values.filter(row=>row.is_active||row.program_type==='Maintenance Site');return q},
  order(){return q},then(resolve,reject){return Promise.resolve({data:columns?values.map(row=>Object.fromEntries(columns.map(k=>[k,row[k]]))):values,error:null}).then(resolve,reject)}};
 return q;
}
test('staff backup access includes a pre-opening site only when explicitly assigned',async()=>{
 const admin={from(table){assert.equal(table,'locations');return query(sites)}};
 const base={organization_id:'org',role:'Employee',locations:['Halcom'],permissions:['maintenance_manage']};
 assert.deepEqual((await coverage.withStaffBackupLocations(admin,base)).locations,['Halcom']);
 const assigned=await coverage.withStaffBackupLocations(admin,{...base,locations:['Halcom','Newgrove']});
 assert.deepEqual(assigned.locations,['Halcom','Newgrove']);
 assert.deepEqual(assigned.permissions,base.permissions);
 const sole=await coverage.withStaffBackupLocations(admin,{...base,locations:['Newgrove']});
 assert.equal(sole.primary_location,'Newgrove');
 assert.ok(!sole.locations.includes('21st Street'));
 assert.ok(!sole.locations.includes('Foreign Worksite'));
});

const childHelpers=moduleUrl('export const dateToDayName=()=>"Monday"; export const timeToMinutes=t=>{const [h,m]=t.split(":").map(Number);return h*60+m};');
const staffing=await import(moduleUrl((await source('src/lib/staffing-command.ts')).replace('"@/lib/location-config"',JSON.stringify(configUrl)).replaceAll('"@/lib/child-schedules"',JSON.stringify(childHelpers))));
test('maintenance work is never presented as childcare floor coverage',()=>{
 const location={id:'work',name:'Newgrove',slug:'newgrove',full_name:'Newgrove',capacity:0,program_type:'Maintenance Site'};
 const shift={id:'shift',location_id:'work',staff_name:'Synthetic Staff',user_id:'staff',shift_date:'2026-11-09',start_time:'10:30',end_time:'18:30',status:'Draft'};
 assert.deepEqual(staffing.buildCoverageWindows({date:'2026-11-09',location,schedules:[],shifts:[shift],activities:[],rules:[]}),[]);
});

test('the scheduling roster includes assigned worksites but excludes closed care sites and other organizations',async()=>{
 const rows={locations:sites,staff_access:[{user_id:'worker',full_name:'Synthetic Worker',role:'Employee',organization_id:'org',is_active:true}],staff_location_assignments:[{user_id:'worker',location_id:'work',organization_id:'org'}]};
 globalThis.preopeningRosterAuth={isOwner:true,isLicensee:false,user:{id:'owner'},profile:{organization_id:'org',locations:['All Locations']},admin:{from:table=>query(rows[table])}};
 const routeSource=(await source('src/app/api/staff-scheduling/roster/route.ts')).replace('"@/lib/location-config"',JSON.stringify(configUrl)).replace(/import \{ requireStaff, staffErrorResponse \}[^;]+;/,'const requireStaff=async()=>globalThis.preopeningRosterAuth;const staffErrorResponse=e=>Response.json({error:String(e)},{status:500});');
 const api=await import(moduleUrl(routeSource));
 const response=await api.GET(new Request('https://example.test/api/staff-scheduling/roster'));
 assert.equal(response.status,200);
 const body=await response.json();
 assert.deepEqual(body.staff[0].locations,['Newgrove']);
 assert.deepEqual(Object.keys(body.staff[0]).sort(),['full_name','locations','role','user_id']);
});

test('database worksite assignments are explicit, remain closed to care, and retain maintenance authorization',async()=>{
 const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const org=id(1),foreign=id(2),open=id(3),work=id(4),closed=id(5),foreignSite=id(6),owner=id(10),assigned=id(11),ordinary=id(12),paused=id(13);
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table staff_access(user_id uuid primary key,organization_id uuid,role text,is_active boolean,locations text[],permissions text[]);
   create table locations(id uuid primary key,organization_id uuid,name text,slug text,is_active boolean,program_type text);
   create table staff_location_assignments(organization_id uuid,user_id uuid,location_id uuid,primary key(user_id,location_id));
   create table hub_state(organization_id uuid,state_key text,state_value jsonb,version integer,updated_by uuid,updated_at timestamptz,primary key(organization_id,state_key));
   create table audit_log(organization_id uuid,location_id uuid,actor_user_id uuid,action text,table_name text,metadata jsonb);
   create function is_tcs_owner_role_text(text) returns boolean language sql as $$select $1='Owner / Admin'$$;`);
  const file=(await readdir('supabase/migrations')).find(name=>name.endsWith('_preopening_maintenance_locations.sql'));
  await db.exec(await source('supabase/migrations/'+file));
  await db.query("insert into locations values($1,$2,'Halcom','halcom',true,'Family Childcare'),($3,$2,'Newgrove','newgrove',false,'Maintenance Site'),($4,$2,'21st Street','21st-street',false,'Family Childcare'),($5,$6,'Foreign','newgrove',false,'Maintenance Site')",[open,org,work,closed,foreignSite,foreign]);
  for(const [who,role,active,places] of [[owner,'Owner / Admin',true,['All Locations']],[assigned,'Employee',true,['Halcom','Newgrove']],[ordinary,'Employee',true,['Halcom']],[paused,'Employee',false,['Newgrove']]]){
   await db.query('insert into staff_access values($1,$2,$3,$4,$5,$6)',[who,org,role,active,places,['maintenance_manage']]);
   await db.query('select sync_staff_location_assignments_for_user($1)',[who]);
  }
  for(const who of [owner,assigned])assert.deepEqual((await db.query('select location_id from staff_location_assignments where user_id=$1 order by location_id',[who])).rows.map(row=>row.location_id),[open,work]);
  assert.deepEqual((await db.query('select location_id from staff_location_assignments where user_id=$1',[ordinary])).rows.map(row=>row.location_id),[open]);
  assert.equal((await db.query('select * from staff_location_assignments where user_id=$1',[paused])).rows.length,0);
  const save=(actor,site,version,previous=null)=>db.query('select save_maintenance_ticket($1,$2,$3,$4,$5,$6)',[org,actor,site,previous,{id:'synthetic',title:'Prepare worksite',location:'Newgrove'},version]);
  await save(owner,work,0);
  await save(assigned,work,1,work);
  await assert.rejects(save(ordinary,work,2,work),/Location not assigned/);
  await assert.rejects(save(owner,closed,2),/Location not assigned/);
  await assert.rejects(save(owner,foreignSite,2),/Location not assigned/);
  assert.equal((await db.query('select is_active from locations where id=$1',[work])).rows[0].is_active,false);
  assert.equal((await db.query("select has_function_privilege('authenticated','sync_staff_location_assignments_for_user(uuid)','execute') allowed")).rows[0].allowed,false);
  assert.equal((await db.query("select has_function_privilege('anon','save_maintenance_ticket(uuid,uuid,uuid,uuid,jsonb,integer)','execute') allowed")).rows[0].allowed,false);
 }finally{await db.close()}
});
