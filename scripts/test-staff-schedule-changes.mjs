import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';import ts from 'typescript';import vm from 'node:vm';
test('private schedule notices validate dates and OFF, notify administration, and close once without altering schedules',async()=>{
 const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,org=id(1),owner=id(2),staff=id(3),site=id(4),lic=id(5);
 try{await db.exec(`create role anon;create role authenticated;create role service_role;create table locations(id uuid primary key);create table staff_access(user_id uuid,organization_id uuid,is_active boolean,role text,full_name text);create table user_notification_state(user_id uuid primary key,inbox jsonb,updated_at timestamptz);create function is_tcs_owner_role_text(text) returns boolean language sql as $$select $1='Owner / Admin'$$;`);
 await db.query('insert into locations values($1)',[site]);for(const [user,role] of [[owner,'Owner / Admin'],[staff,'Employee'],[lic,'Location Licensee']])await db.query('insert into staff_access values($1,$2,true,$3,$3)',[user,org,role]);
 await db.exec(readFileSync('supabase/migrations/20261125010000_staff_schedule_change_notices.sql','utf8'));
 const insert=(start='2026-11-24',end='2026-11-26',off=true,from=null,to=null)=>db.query("insert into staff_schedule_changes(organization_id,location_id,staff_user_id,staff_name,start_date,end_date,is_off,start_time,end_time,reason,submitted_by,submitted_by_name) values($1,$2,$3,'Staff',$4,$5,$6,$7,$8,'Private appointment reason',$9,'Licensee') returning id",[org,site,staff,start,end,off,from,to,lic]);
 await assert.rejects(insert('2026-11-25','2026-11-24'),/check constraint/);await assert.rejects(insert(undefined,undefined,false,'16:00','11:00'),/check constraint/);await assert.rejects(insert(undefined,undefined,true,'11:00','16:00'),/check constraint/);
 const notice=(await insert()).rows[0].id;await insert('2026-11-27','2026-11-27',false,'11:00','16:00');
 const inbox=(await db.query('select * from user_notification_state')).rows;assert.equal(inbox.length,1);assert.equal(inbox[0].user_id,owner);assert.equal(inbox[0].inbox.length,2);assert.ok(!JSON.stringify(inbox).includes('Private appointment'));
 const close=(actor=owner,tenant=org,note='Schedule updated and published')=>db.query("select resolve_staff_schedule_change($1,$2,$3,'Completed',$4)",[tenant,actor,notice,note]);
 await assert.rejects(close(lic),/Only administration/);await assert.rejects(close(owner,id(99)),/Only administration/);await assert.rejects(close(owner,org,''),/closeout note/);
 await close();await assert.rejects(close(),/changed/);const saved=(await db.query('select * from staff_schedule_changes where id=$1',[notice])).rows[0];assert.equal(saved.status,'Completed');assert.equal(saved.resolved_by,owner);assert.equal(saved.reason,'Private appointment reason');
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from staff_schedule_changes'),/permission denied/);await assert.rejects(close(),/permission denied/);
 }finally{await db.close();}
});
test('schedule changes API enforces leadership and tenant scoping, validates before writes',async()=>{
 const code=ts.transpileModule(readFileSync('src/app/api/staff-scheduling/changes/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 let role='employee',writes=0;const q={select(){return this},eq(){return this},maybeSingle(){return Promise.resolve({data:{locations:['Halcom']}})},order(){return Promise.resolve({data:[{id:'site',name:'Halcom'}]})},insert(){writes++;return Promise.resolve({})}};
 const auth=()=>({admin:{from:()=>q},user:{id:'admin'},profile:{organization_id:'org',locations:['Halcom']},isOwner:role==='owner',isLicensee:role==='licensee'});
 const ctx={exports:{},Response,Date,Number,Error,require:name=>name.includes('require-staff')?{requireStaff:async()=>auth(),staffErrorResponse:e=>e instanceof Response?e:Response.json({error:'error'},{status:500})}:{normalizeLocation:v=>v}};vm.runInNewContext(code,ctx);
 const request=b=>new Request('https://hub/api/staff-scheduling/changes',{method:'POST',body:JSON.stringify(b)});
 assert.equal((await ctx.exports.POST(request({}))).status,403);role='licensee';assert.equal((await ctx.exports.POST(request({action:'resolve'}))).status,403);
 role='owner';assert.equal((await ctx.exports.POST(request({locationId:'foreign'}))).status,403);assert.equal((await ctx.exports.POST(request({locationId:'site',startDate:'2026-02-30',endDate:'2026-03-01'}))).status,400);assert.equal(writes,0);
});
