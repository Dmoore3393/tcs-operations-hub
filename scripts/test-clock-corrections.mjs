import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import vm from 'node:vm';
const context={exports:{},Intl,Date,Map,Error};vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/clock-corrections.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
test('corrections replace effective time without mutating original receipts or introducing clock actions',()=>{
 const original={id:'one',occurred_at:'2026-11-10T18:00:00Z',metadata:{event:'clock_in'}};
 const rows=context.exports.correctedClockRows([original,{id:'fix',occurred_at:'2026-11-11T18:00:00Z',metadata:{kind:'staff_time_clock_correction',eventId:'one',correctedAt:'2026-11-10T18:10:00Z',reason:'Missed scan'}}]);
 assert.equal(rows.length,1);assert.equal(rows[0].occurred_at,'2026-11-10T18:10:00Z');assert.equal(original.occurred_at,'2026-11-10T18:00:00Z');
 assert.equal(context.exports.pacificCorrectionTime('2026-11-10T18:00:00Z','10:15'),'2026-11-10T18:15:00.000Z');
 assert.equal(context.exports.pacificCorrectionTime('2026-07-10T17:00:00Z','10:15'),'2026-07-10T17:15:00.000Z');
 assert.throws(()=>context.exports.pacificCorrectionTime('2026-03-08T09:00:00Z','02:30'),/does not exist/);
});
test('atomic correction enforces roles, locations, tenant, reason, chronology and stale-write guards',async()=>{
 const db=new PGlite();const org='00000000-0000-4000-8000-000000000001',owner='00000000-0000-4000-8000-000000000002',licensee='00000000-0000-4000-8000-000000000003',staff='00000000-0000-4000-8000-000000000004',site='00000000-0000-4000-8000-000000000005',punch='22044';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create table staff_access(user_id uuid,organization_id uuid,role text,full_name text,is_active boolean,locations text[]);create table locations(id uuid,organization_id uuid,name text);create table audit_log(id bigserial primary key,organization_id uuid,actor_user_id uuid,action text,table_name text,row_id uuid,location_id uuid,metadata jsonb,occurred_at timestamptz);`);
 for(const [id,role,locations] of [[owner,'Owner / Admin',['All Locations']],[licensee,'Location Licensee',['Halcom']],[staff,'Employee',['Halcom']]])await db.query('insert into staff_access values($1,$2,$3,$3,true,$4)',[id,org,role,locations]);
 await db.query('insert into locations values($1,$2,$3)',[site,org,'Halcom']);
 for(const [id,event,time] of [[punch,'clock_in','18:00'],['22045','clock_out','23:00']])await db.query("insert into audit_log values($1,$2,$3,'CREATE','time_clock',null,$4,$5,$6)",[id,org,staff,site,JSON.stringify({event}),`2026-11-10T${time}:00Z`]);
 await db.exec(readFileSync('supabase/migrations/20261123161203_staff_clock_time_corrections.sql','utf8'));
 await assert.rejects(db.query("select correct_staff_clock_time($1,$2,'22044',$3,$3,'Check numeric clock ID')",[org,owner,'2026-11-10T18:00:00Z']),/invalid input syntax for type uuid/);
 await db.exec(readFileSync('supabase/migrations/20261123162408_fix_clock_correction_audit_ids.sql','utf8'));
 assert.equal((await db.query("select count(*) from pg_proc where proname='correct_staff_clock_time'")).rows[0].count,1);
 const call=(actor,expected='18:00',time='18:10',reason='Forgot to scan')=>db.query('select correct_staff_clock_time($1,$2,$3,$4,$5,$6)',[org,actor,punch,`2026-11-10T${expected}:00Z`,`2026-11-10T${time}:00Z`,reason]);
 await assert.rejects(call(staff),/require administration/);
 await assert.rejects(call(owner,'18:00','23:10'),/preceding and following/);
 await assert.rejects(call(owner,'18:00','18:10',''),/reason/);
 await call(licensee);
 await assert.rejects(call(owner),/changed/);
 await call(owner,'18:10','18:15');
 await db.query("update staff_access set locations=array['33rd Street'] where user_id=$1",[licensee]);
 await assert.rejects(call(licensee,'18:15','18:20'),/outside/);
 const rows=await db.query('select * from audit_log where id=$1',[punch]);assert.equal(rows.rows[0].occurred_at.toISOString(),'2026-11-10T18:00:00.000Z');
 const receipts=await db.query("select row_id,metadata->>'eventId' as event_id from audit_log where metadata->>'kind'='staff_time_clock_correction'");assert.equal(receipts.rows.length,2);assert.ok(receipts.rows.every(row=>row.row_id===null&&row.event_id==='22044'));
 await db.exec('set role authenticated');await assert.rejects(call(owner,'18:15','18:20'),/permission denied/);
 }finally{await db.close();}
});
