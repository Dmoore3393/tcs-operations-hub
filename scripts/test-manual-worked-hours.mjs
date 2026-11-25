import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
const context={exports:{},Intl,Date,Error};vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/manual-worked-hours.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
test('manual dates use Pacific time, reject invalid calendar dates and DST gaps or ambiguity',()=>{
 const convert=context.exports.pacificWorkedTime;
 assert.equal(convert('2026-11-23T08:15'),'2026-11-23T16:15:00.000Z');
 assert.equal(convert('2026-07-23T08:15'),'2026-07-23T15:15:00.000Z');
 for(const value of ['2026-02-30T10:00','2026-03-08T02:30','2026-11-01T01:30','nonsense',null,{},'2026-11-23T25:00'])assert.throws(()=>convert(value));
});
test('manual shifts save an atomic pair attributed to the employee and administrator, and enforce conflicts and access',async()=>{
 const db=new PGlite();const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;const org=id(1),owner=id(2),staff=id(3),site=id(4),other=id(5);
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table staff_access(user_id uuid,organization_id uuid,role text,full_name text,is_active boolean);
 create table locations(id uuid,organization_id uuid,is_active boolean);
 create table audit_log(id bigserial primary key,organization_id uuid,actor_user_id uuid,action text,table_name text,row_id uuid,location_id uuid,metadata jsonb,occurred_at timestamptz);
 create function is_tcs_owner_role_text(text) returns boolean language sql as $$select $1='Owner / Admin'$$;`);
 await db.query("insert into staff_access values($1,$2,'Owner / Admin','Admin Name',true),($3,$2,'Employee','Staff Name',true),($4,$2,'Employee','Other Staff',true)",[owner,org,staff,other]);
 await db.query('insert into locations values($1,$2,true)',[site,org]);
 await db.exec(readFileSync('supabase/migrations/20261124190000_manual_worked_hours.sql','utf8'));
 const save=(start='2026-11-20T16:00Z',end='2026-11-20T20:00Z',who=owner,target=staff,location=site,reason='Missed Hub clock')=>db.query('select add_staff_worked_hours($1,$2,$3,$4,$5,$6,$7)',[org,who,target,location,start,end,reason]);
 await assert.rejects(save(undefined,undefined,staff),/Only administration/);
 await assert.rejects(save(undefined,undefined,owner,id(99)),/active employee/);
 await assert.rejects(save(undefined,undefined,owner,staff,id(99)),/active work location/);
 await assert.rejects(save(undefined,undefined,owner,staff,site,''),/reason/);
 await assert.rejects(save('2026-11-20T20:00Z','2026-11-20T16:00Z'),/past times/);
 await assert.rejects(save('2099-01-01T16:00Z','2099-01-01T20:00Z'),/past times/);
 await assert.rejects(save('2026-11-19T16:00Z','2026-11-20T20:00Z'),/24 hours/);
 await save();
 let rows=(await db.query('select * from audit_log order by occurred_at')).rows;
 assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.metadata.event),['clock_in','clock_out']);
 for(const row of rows){assert.equal(row.actor_user_id,owner);assert.equal(row.metadata.targetStaffUserId,staff);assert.equal(row.metadata.performedByName,'Admin Name');assert.equal(row.metadata.clockSource,'Manual Entry');assert.equal(row.metadata.reason,'Missed Hub clock');assert.ok(row.metadata.enteredAt);}
 assert.equal(rows[0].metadata.manualEntryId,rows[1].metadata.manualEntryId);
 await assert.rejects(save(),/already exists|overlap/);
 await assert.rejects(save('2026-11-20T15:00Z','2026-11-20T21:00Z'),/overlap/);
 await assert.rejects(save('2026-11-20T17:00Z','2026-11-20T18:00Z'),/overlap/);
 await save('2026-11-20T20:00Z','2026-11-20T22:00Z'); // adjacent split shift
 await save('2026-11-21T07:00Z','2026-11-21T10:00Z'); // overnight Pacific
 await save('2026-11-20T16:00Z','2026-11-20T20:00Z',owner,other); // other employee
 // Correction overlay must be respected: original first clock-in moved earlier.
 await db.query("insert into audit_log(organization_id,actor_user_id,table_name,occurred_at,metadata) values($1,$2,'time_clock',now(),$3)",[org,owner,JSON.stringify({kind:'staff_time_clock_correction',eventId:String(rows[0].id),correctedAt:'2026-11-20T15:00:00Z'})]);
 await assert.rejects(save('2026-11-20T15:15Z','2026-11-20T15:45Z'),/overlap/);
 // Reject an interval crossing an open punch, including an opening before the requested interval.
 await db.query("insert into audit_log(organization_id,actor_user_id,table_name,occurred_at,metadata) values($1,$2,'time_clock','2026-11-22T16:00Z',$3)",[org,staff,JSON.stringify({event:'clock_in'})]);
 await assert.rejects(save('2026-11-22T18:00Z','2026-11-22T20:00Z'),/open shift/);
 const before=(await db.query('select count(*) from audit_log')).rows[0].count;
 await assert.rejects(save('2026-11-22T18:00Z','2026-11-22T20:00Z'),/open shift/);
 assert.equal((await db.query('select count(*) from audit_log')).rows[0].count,before);
 await db.exec('set role authenticated');await assert.rejects(save(),/permission denied/);
 }finally{await db.close();}
});
const source=readFileSync('src/lib/weekly-worked-minutes.ts','utf8');
const weekContext={exports:{},require:()=>context.exports,Date,Math,Number};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,weekContext);
test('manual and existing completed hours flow into payroll, with overnight week boundaries and unpaid breaks',()=>{
 const count=weekContext.exports.weeklyWorkedMinutes;
 const e=(event,occurredAt)=>({event,occurredAt});
 const overnight=[e('clock_in','2026-11-23T06:00Z'),e('clock_out','2026-11-23T10:00Z')];
 assert.equal(count(overnight,'2026-11-16'),120);assert.equal(count(overnight,'2026-11-23'),120);
 const shifts=[e('clock_in','2026-11-20T16:00Z'),e('clock_in','2026-11-20T20:00Z'),e('clock_out','2026-11-20T20:00Z'),e('break_start','2026-11-20T21:00Z'),e('break_end','2026-11-20T21:30Z'),e('clock_out','2026-11-20T22:00Z')];
 assert.equal(count(shifts,'2026-11-16'),330);
 assert.equal(count([e('clock_in','2026-11-20T16:00Z')],'2026-11-16'),0);
});
