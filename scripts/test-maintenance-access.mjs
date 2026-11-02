import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import test,{before,beforeEach,after} from 'node:test';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const url=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const teamUrl=url(await readFile('src/lib/team-access.ts','utf8')),team=await import(teamUrl);
const authorityUrl=url((await readFile('src/lib/child-schedule-authority.ts','utf8')).replace('"@/lib/team-access"',JSON.stringify(teamUrl))),authority=await import(authorityUrl);
const accessUrl=url((await readFile('src/lib/maintenance-access.ts','utf8')).replace('"@/lib/team-access"',JSON.stringify(teamUrl))),access=await import(accessUrl);
test('maintenance viewers can see only maintenance tools and explicit view-only overrides legacy editing',()=>{
 const viewer={role:'Employee',permissions:['maintenance_view']};assert.equal(access.canViewMaintenance(viewer),true);assert.equal(access.canManageMaintenance(viewer),false);
 assert.equal(team.employeeCanAccessRoute(viewer.permissions,'/maintenance'),true);for(const path of ['/children','/health-safety','/child-schedules','/family-care-calendar'])assert.equal(team.employeeCanAccessRoute(viewer.permissions,path),false);
 assert.equal(team.employeeCanWriteState(viewer.permissions,'tcs-maintenance-tickets-v1'),false);assert.equal(team.employeeCanReadState(viewer.permissions,'tcs-children-v1'),false);
 assert.equal(access.canManageMaintenance({...viewer,permissions:['maintenance_view','health_safety']}),false);assert.equal(access.canManageMaintenance({...viewer,permissions:['maintenance_manage']}),true);
 assert.deepEqual(team.toggleEmployeePermission(['maintenance_manage','health_safety'],'maintenance_view'),['health_safety','maintenance_view']);
 assert.equal(team.employeeCanWriteState(['schedules','ratios'],'tcs-child-schedules-v2'),false);
});
test('only licensees, Danielle and Jennifer approve child care schedules; staff and other admins cannot',()=>{
 for(const role of ['Employee','Teacher','Driver'])assert.equal(authority.canApproveChildSchedules({role,full_name:'Danielle Moore'}),false);
 for(const full_name of ['Danielle Moore','Jennifer Thomason'])assert.equal(authority.canApproveChildSchedules({role:'Owner / Admin',full_name}),true);
 assert.equal(authority.canApproveChildSchedules({role:'Owner / Admin',full_name:'Anthony Thomason'}),false);assert.equal(authority.canApproveChildSchedules({role:'Location Licensee',full_name:'Synthetic Licensee'}),true);
 assert.equal(authority.canApproveChildSchedules({role:'Owner / Admin',full_name:'Jennifer Thomason',is_active:false}),false);
});
const db=new PGlite();const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;const org=id(1),loc=id(2),other=id(3),dan=id(10),jen=id(11),tony=id(12),licensee=id(13),viewer=id(14),manager=id(15);
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;
 create table staff_access(user_id uuid primary key,organization_id uuid,full_name text,role text,permissions text[],is_active boolean);
 create table locations(id uuid primary key,organization_id uuid,is_active boolean);
 create table staff_location_assignments(organization_id uuid,user_id uuid,location_id uuid);
 create table hub_state(organization_id uuid,state_key text,state_value jsonb,version integer,updated_by uuid,updated_at timestamptz,primary key(organization_id,state_key));
 create table audit_log(organization_id uuid,location_id uuid,actor_user_id uuid,action text check(action in ('CREATE','UPDATE','REVIEW','EXPORT','DELETE')),table_name text,metadata jsonb);
 create table family_schedule_submissions(id uuid,organization_id uuid,location_id uuid,status text,reviewed_by uuid references auth.users(id) on delete set null,schedule_data jsonb);
 create table child_schedule_overrides(id uuid,organization_id uuid,location_id uuid,approved_by uuid references auth.users(id) on delete set null);
 create table child_schedules(id uuid primary key,organization_id uuid,location_id uuid,record_data jsonb);alter table child_schedules enable row level security;
 grant select,insert,update,delete on child_schedules to authenticated;grant select on staff_access,staff_location_assignments,locations to authenticated;grant all on all tables in schema public to service_role;
 create function is_tcs_owner() returns boolean language sql stable as $$select exists(select 1 from staff_access where user_id=auth.uid() and is_active and role='Owner / Admin')$$;
 create function is_tcs_licensee() returns boolean language sql stable as $$select exists(select 1 from staff_access where user_id=auth.uid() and is_active and role='Location Licensee')$$;
 create function is_approved_tcs_pilot_user() returns boolean language sql stable as $$select exists(select 1 from staff_access where user_id=auth.uid() and is_active)$$;
 create function current_staff_organization_id() returns uuid language sql stable as $$select organization_id from staff_access where user_id=auth.uid() and is_active$$;
 create function can_access_location(uuid) returns boolean language sql stable as $$select exists(select 1 from locations where id=$1 and organization_id=current_staff_organization_id() and is_active and (is_tcs_owner() or exists(select 1 from staff_location_assignments where user_id=auth.uid() and location_id=$1)))$$;
 create policy read_schedules on child_schedules for select to authenticated using(organization_id=current_staff_organization_id());`);
 const files=await readdir('supabase/migrations');const name=files.find(n=>n.endsWith('_maintenance_department_access.sql'));await db.exec(await readFile('supabase/migrations/'+name,'utf8'));const history=files.find(n=>n.endsWith('_child_approval_history_cleanup.sql'));await db.exec(await readFile('supabase/migrations/'+history,'utf8'));
});
beforeEach(async()=>{
 await db.exec("reset role;truncate staff_access,locations,staff_location_assignments,hub_state,audit_log,child_schedules,family_schedule_submissions,child_schedule_overrides,auth.users;");
 await db.query('insert into locations values($1,$2,true),($3,$2,true)',[loc,org,other]);
 for(const [who,name,role,permissions] of [[dan,'Danielle Moore','Owner / Admin',[]],[jen,'Jennifer Thomason','Owner / Admin',[]],[tony,'Anthony Thomason','Owner / Admin',[]],[licensee,'Synthetic Licensee','Location Licensee',[]],[viewer,'Synthetic Viewer','Employee',['maintenance_view','schedules','ratios']],[manager,'Synthetic Manager','Employee',['maintenance_manage']]]){
 await db.query('insert into auth.users values($1)',[who]);
 await db.query('insert into staff_access values($1,$2,$3,$4,$5,true)',[who,org,name,role,permissions]);await db.query('insert into staff_location_assignments values($1,$2,$3)',[org,who,loc]);}
 await db.query("insert into hub_state values($1,'tcs-maintenance-tickets-v1',$2,1,null,now())",[org,JSON.stringify([{id:'existing-other-location',title:'Preserve this ticket',location:'other'}])]);
 await db.query('insert into child_schedules values($1,$2,$3,$4),($5,$2,$6,$4)',[id(30),org,loc,JSON.stringify({status:'Existing'}),id(31),other]);
});
after(()=>db.close());
const save=(actor,site=loc,version=1)=>db.query('select save_maintenance_ticket($1,$2,$3,null,$4,$5)',[org,actor,site,JSON.stringify({id:'synthetic-ticket',title:'Synthetic repair',location:'synthetic-site',status:'Open'}),version]);
test('database denies viewer writes and unassigned locations, while a manager preserves every other ticket',async()=>{
 await assert.rejects(save(viewer),/management access/);await assert.rejects(save(manager,other),/not assigned/);assert.equal((await db.query('select version from hub_state')).rows[0].version,1);
 await save(manager);const board=(await db.query('select * from hub_state')).rows[0];assert.equal(board.version,2);assert.equal(board.state_value.length,2);assert.equal(board.state_value[0].id,'existing-other-location');
 await assert.rejects(save(manager),/changed/);assert.equal((await db.query('select count(*) n from audit_log')).rows[0].n,1);
 assert.equal((await db.query("select has_function_privilege('authenticated','save_maintenance_ticket(uuid,uuid,uuid,uuid,jsonb,integer)','execute') allowed")).rows[0].allowed,false);
});
test('real RLS blocks employee recurring schedule writes and limits licensees to assigned sites',async()=>{
 for(const [actor,site,allowed] of [[viewer,loc,false],[manager,loc,false],[tony,loc,false],[licensee,loc,true],[licensee,other,false],[dan,other,true],[jen,other,true]]){
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role authenticated');
 assert.equal((await db.query('select can_approve_child_schedules($1) allowed',[site])).rows[0].allowed,allowed);
 const insertion=db.query('insert into child_schedules values($1,$2,$3,$4)',[id(100+Number(actor.slice(-2))+(site===other?100:0)),org,site,JSON.stringify({status:'Synthetic'})]);
 if(allowed)await insertion;else await assert.rejects(insertion,/row-level security/);
 if(!allowed){assert.equal((await db.query("update child_schedules set record_data='{}' where id=$1",[site===other?id(31):id(30)])).affectedRows,0);assert.equal((await db.query('delete from child_schedules where id=$1',[site===other?id(31):id(30)])).affectedRows,0);}
 }
});

const locationUrl=url(await readFile('src/lib/location-config.ts','utf8'));
const slugUrl=url((await readFile('src/lib/server/location-slug.ts','utf8')).replace('import "server-only";','').replace('"@/lib/location-config"',JSON.stringify(locationUrl)));
let rpcCalls=[];
let maintenanceSource=(await readFile('src/app/api/maintenance/route.ts','utf8')).replace('"@/lib/maintenance-rest"',JSON.stringify(url(await readFile('src/lib/maintenance-rest.ts','utf8')))).replace('"@/lib/maintenance-access"',JSON.stringify(accessUrl)).replace('"@/lib/server/location-slug"',JSON.stringify(slugUrl)).replace('"@/lib/location-config"',JSON.stringify(locationUrl)).replace(/import \{requireStaff,staffErrorResponse\}[^;]+;/,'const requireStaff=async()=>globalThis.maintenanceAuth;const staffErrorResponse=e=>e instanceof Response?e:Response.json({error:String(e)},{status:500});');
const maintenanceApi=await import(url(maintenanceSource));
function apiSetup(permissions){
 rpcCalls=[];const rows={locations:[{id:loc,organization_id:'org',slug:'halcom',name:'Halcom',full_name:'Synthetic Halcom',is_active:true},{id:other,organization_id:'org',slug:'division',name:'Division',full_name:'Synthetic Division',is_active:true}],staff_location_assignments:[{organization_id:'org',user_id:'employee',location_id:loc}],hub_state:[{organization_id:'org',state_key:'tcs-maintenance-tickets-v1',version:7,state_value:[{id:'own',location:'Halcom',title:'Own ticket',reportedBy:'Original reporter',reportedAt:'original-time'},{id:'hidden',location:'Division',title:'Other site private note'}]}]};
 const admin={from(table){const filters=[];const q={select(){return q},in(k,values){filters.push(row=>values.includes(row[k]));return q},eq(k,v){filters.push(row=>row[k]===v);return q},maybeSingle(){return q.then(r=>({...r,data:r.data[0]||null}))},then(resolve,reject){return Promise.resolve({data:(rows[table]||[]).filter(row=>filters.every(filter=>filter(row))),error:null}).then(resolve,reject)}};return q},async rpc(name,args){rpcCalls.push({name,args});return{data:8,error:null}}};
 globalThis.maintenanceAuth={admin,profile:{organization_id:'org',role:'Employee',is_active:true,full_name:'Synthetic manager',permissions},user:{id:'employee'},isOwner:false,isLicensee:false};
}
const maintenancePost=ticket=>maintenanceApi.POST(new Request('https://hub.test/api/maintenance',{method:'POST',body:JSON.stringify({ticket,expectedVersion:7})}));
test('maintenance API filters assigned locations and rejects viewer and cross-location ticket changes',async()=>{
 apiSetup(['maintenance_view']);const result=await maintenanceApi.GET(new Request('https://hub.test/api/maintenance'));const body=await result.json();assert.equal(body.tickets.length,1);assert.equal(body.canManage,false);assert.ok(!JSON.stringify(body).includes('Other site private note'));assert.equal(body.locations.length,1);
 assert.equal((await maintenancePost({id:'own',title:'Try changing'})).status,403);assert.equal(rpcCalls.length,0);
 apiSetup(['maintenance_manage']);const packet={id:'hidden',title:'Synthetic repair',location:'Halcom',priority:'Urgent',status:'Open'};assert.equal((await maintenancePost(packet)).status,403);assert.equal(rpcCalls.length,0);
 const saved=await maintenancePost({...packet,id:'own',reportedBy:'Spoofed author',reportedAt:'fake'});assert.equal(saved.status,200);assert.equal(rpcCalls[0].args.p_ticket.reportedBy,'Original reporter');assert.equal(rpcCalls[0].args.p_ticket.reportedAt,'original-time');assert.equal(rpcCalls[0].args.p_expected_version,7);
});

const calendarSource=await readFile('src/app/api/care-calendar/route.ts','utf8');const calendarAst=ts.createSourceFile('calendar.ts',calendarSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);const declarations=calendarAst.statements.filter(node=>ts.isFunctionDeclaration(node)&&['object','text','isMissingTable','PATCH'].includes(node.name?.text)).map(node=>node.getText(calendarAst)).join('\n');
const calendarApi=await import(url(`import {canApproveChildSchedules} from ${JSON.stringify(authorityUrl)};const requireStaff=async()=>globalThis.calendarAuth;const staffErrorResponse=e=>e instanceof Response?e:Response.json({error:String(e)},{status:500});${declarations}`));
test('care-calendar approval endpoint rejects staff permissions and other admins before accessing a request',async()=>{
 for(const profile of [{role:'Employee',full_name:'Synthetic Staff',permissions:['schedules','ratios']},{role:'Owner / Admin',full_name:'Anthony Thomason',permissions:[]}]){
 let reads=0;globalThis.calendarAuth={profile,admin:{from(){reads++;throw Error('No query allowed')}},isOwner:profile.role==='Owner / Admin',isLicensee:false,user:{id:'actor'}};
 const result=await calendarApi.PATCH(new Request('https://hub.test/api/care-calendar',{method:'PATCH',body:JSON.stringify({submissionId:'synthetic',decision:'Approved'})}));assert.equal(result.status,403);assert.equal(reads,0);
 }
});

test('maintenance staff remain schedulable by canonical identity without a linked login',async()=>{
 const source=await readFile('src/lib/staff-schedule-departments.ts','utf8');const departmentModule=await import(url(source));
 const roster=[{full_name:'Synthetic Maintenance',staff_user_id:null,department:'Maintenance',is_active:true},{full_name:'Former Maintenance',staff_user_id:null,department:'Maintenance',is_active:false}];
 assert.equal(departmentModule.staffScheduleDepartment('Synthetic Maintenance',null,roster),'Maintenance');assert.equal(departmentModule.staffScheduleDepartment('Former Maintenance',null,roster),'Unassigned');assert.equal(departmentModule.staffScheduleDepartment('Unrelated',null,roster),'Unassigned');
});

test('location rest awareness is anonymous, conservative and never treats missing or stale entries as awake',async()=>{
 const {maintenanceRestSummary}=await import(url(await readFile('src/lib/maintenance-rest.ts','utf8')));
 const entry={id:'synthetic',child_id:'private-child-id',location_id:'site',entry_date:'2026-11-02',entry_time:'12:10',result:'Fell asleep'};
 const recent=maintenanceRestSummary([entry],'site','2026-11-02','12:30');assert.equal(recent.status,'resting');assert.ok(!JSON.stringify(recent).includes('private-child-id'));
 assert.equal(maintenanceRestSummary([entry],'site','2026-11-02','14:30').status,'check_with_staff');assert.equal(maintenanceRestSummary([],'site','2026-11-02','12:30').status,'check_with_staff');
 assert.equal(maintenanceRestSummary([entry,{...entry,id:'wake',entry_time:'12:25',result:'Woke up'}],'site','2026-11-02','12:30').status,'rest_ended');assert.equal(maintenanceRestSummary([entry],'other','2026-11-02','12:30').status,'check_with_staff');assert.equal(maintenanceRestSummary([entry],'site','2026-11-03','12:30').status,'check_with_staff');
});

test('database approval triggers also reject unauthorized server-side decisions and dated care',async()=>{
 await assert.rejects(db.query("insert into family_schedule_submissions values($1,$2,$3,'Approved',$4,'[]')",[id(90),org,loc,viewer]),/Only assigned licensees/);
 await assert.rejects(db.query('insert into child_schedule_overrides values($1,$2,$3,$4)',[id(91),org,loc,tony]),/Only assigned licensees/);
 await assert.rejects(db.query('insert into child_schedule_overrides values($1,$2,$3,$4)',[id(92),org,other,licensee]),/Only assigned licensees/);
 await db.query("insert into family_schedule_submissions values($1,$2,$3,'Approved',$4,'[]')",[id(93),org,loc,licensee]);await db.query('insert into child_schedule_overrides values($1,$2,$3,$4)',[id(94),org,other,jen]);
 assert.equal((await db.query('select count(*) n from child_schedule_overrides')).rows[0].n,1);
});

test('account deletion can clear reviewer references without changing approved schedules',async()=>{
 await db.query("insert into family_schedule_submissions values($1,$2,$3,'Approved',$4,'[]')",[id(97),org,loc,jen]);await db.query('insert into child_schedule_overrides values($1,$2,$3,$4)',[id(98),org,loc,jen]);
 await db.query('delete from auth.users where id=$1',[jen]);assert.equal((await db.query('select reviewed_by,status from family_schedule_submissions')).rows[0].reviewed_by,null);assert.equal((await db.query('select status from family_schedule_submissions')).rows[0].status,'Approved');assert.equal((await db.query('select approved_by from child_schedule_overrides')).rows[0].approved_by,null);
});
