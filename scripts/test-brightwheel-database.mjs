import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {test,before,beforeEach,after} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=id(1),otherOrg=id(2),loc=id(3),otherLoc=id(4),foreignLoc=id(5),owner=id(10),licensee=id(11),employee=id(12);
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls; create table organizations(id uuid primary key);create table locations(id uuid primary key,organization_id uuid,is_active boolean);create table staff_access(user_id uuid primary key,organization_id uuid,role text,is_active boolean);create table staff_location_assignments(user_id uuid,location_id uuid);create table children(id uuid primary key default gen_random_uuid(),organization_id uuid,location_id uuid,legacy_id text,first_name text,last_name text,date_of_birth date,age_group text,enrollment_status text,attendance_status text,guardian_name text,record_data jsonb,created_by uuid,updated_by uuid,updated_at timestamptz not null default now(),unique(organization_id,legacy_id));create table audit_log(organization_id uuid,actor_user_id uuid,action text,table_name text,row_id uuid,metadata jsonb);grant all on all tables in schema public to service_role;`);
 const folder=new URL('../supabase/migrations/',import.meta.url);const name=(await readdir(folder)).find(name=>name.endsWith('_safe_brightwheel_import.sql'));assert.ok(name);
 await db.exec(await readFile(new URL(name,folder),'utf8'));
});
beforeEach(async()=>{
 await db.exec('reset role; truncate children,audit_log,staff_location_assignments,staff_access,locations,organizations;drop trigger if exists fail_import_audit on audit_log;');
 await db.query('insert into organizations values($1),($2)',[org,otherOrg]);await db.query('insert into locations values($1,$2,true),($3,$2,true),($4,$5,true)',[loc,org,otherLoc,foreignLoc,otherOrg]);
 for(const [actor,role] of [[owner,'Owner / Admin'],[licensee,'Location Licensee'],[employee,'Employee']])await db.query('insert into staff_access values($1,$2,$3,true)',[actor,org,role]);
 await db.query('insert into staff_location_assignments values($1,$2)',[licensee,loc]);
});
after(()=>db.close());
const row=(legacy='synthetic-child',location=loc)=>({targetId:'',payload:{location_id:location,legacy_id:legacy,first_name:'Synthetic',last_name:'Child',date_of_birth:'2020-01-02',age_group:'School Age',enrollment_status:'Active',attendance_status:'Not Scheduled',guardian_name:'Synthetic Guardian',record_data:{source:'synthetic',familyAccess:[],familyMessages:[]}}});
async function save(rows,actor=owner,snapshot=[],organization=org){await db.exec('set role service_role');try{return (await db.query('select hub_import_brightwheel_roster($1,$2,$3,$4) result',[actor,organization,JSON.stringify(snapshot),JSON.stringify(rows)])).rows[0].result;}finally{await db.exec('reset role');}}
async function snapshot(){return (await db.query('select id,updated_at as "updatedAt" from children order by id')).rows;}
test('import RPC is server-only and cannot be called directly by staff or public clients',async()=>{
 const result=(await db.query("select has_function_privilege('anon','hub_import_brightwheel_roster(uuid,uuid,jsonb,jsonb)','execute') anon,has_function_privilege('authenticated','hub_import_brightwheel_roster(uuid,uuid,jsonb,jsonb)','execute') client,has_function_privilege('service_role','hub_import_brightwheel_roster(uuid,uuid,jsonb,jsonb)','execute') server")).rows[0];assert.deepEqual(result,{anon:false,client:false,server:true});
});
test('batch creates only requested synthetic children and audit; stale retry cannot create another child',async()=>{
 assert.deepEqual(await save([row()]),{inserted:1,updated:0});await assert.rejects(save([row('another')]),/Roster changed/);assert.equal((await db.query('select count(*)::int n from children')).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from audit_log')).rows[0].n,1);
});
test('a failure on the second child rolls back the first child and every audit entry',async()=>{
 const invalid=row('invalid');invalid.payload.first_name='';await assert.rejects(save([row(),invalid]),/Missing child details/);assert.equal((await db.query('select count(*)::int n from children')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from audit_log')).rows[0].n,0);
});
test('ordinary/inactive staff, foreign organizations and unassigned destinations cannot import',async()=>{
 await assert.rejects(save([row()],employee),/Roster import access/);await assert.rejects(save([row()],owner,[],otherOrg),/Active staff access/);await assert.rejects(save([row('foreign',foreignLoc)]),/Location access/);await assert.rejects(save([row('other',otherLoc)],licensee),/Location access/);
 await db.query('update staff_access set is_active=false where user_id=$1',[owner]);await assert.rejects(save([row()]),/Active staff access/);
});
test('licensee can import only at their current assigned site',async()=>{assert.deepEqual(await save([row()],licensee),{inserted:1,updated:0});});
test('intervening edits and missing update targets abort all changes',async()=>{
 await save([row()]);const before=await snapshot();await db.exec("update children set updated_at=updated_at+interval '1 second'");await assert.rejects(save([row('another')],owner,before),/Roster changed/);
 const change=row();change.targetId=id(99);await assert.rejects(save([change],owner,await snapshot()),/Roster changed/);assert.equal((await db.query('select count(*)::int n from children')).rows[0].n,1);
});
test('existing UUID, legacy identity and attendance survive an authorized reviewed update',async()=>{
 await save([row()]);const before=await snapshot();const change=row();change.targetId=before[0].id;change.payload.first_name='Synthetic Updated';await db.exec("update children set attendance_status='Present'");await save([change],owner,before);
 const saved=(await db.query('select id,legacy_id,first_name,attendance_status from children')).rows[0];assert.deepEqual(saved,{id:before[0].id,legacy_id:'synthetic-child',first_name:'Synthetic Updated',attendance_status:'Present'});
});
test('failure to record the import audit rolls back the entire roster',async()=>{
 await db.exec("create or replace function fail_import_audit() returns trigger language plpgsql as $$ begin raise exception 'Synthetic audit failure';end $$;create trigger fail_import_audit before insert on audit_log for each row execute function fail_import_audit();");await assert.rejects(save([row()]),/Synthetic audit failure/);assert.equal((await db.query('select count(*)::int n from children')).rows[0].n,0);
});
