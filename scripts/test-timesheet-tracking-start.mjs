import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('November cutoff archives only superseded reminders, suppresses old pushes, and leaves historical timesheets unchanged',async()=>{
 const db=new PGlite();const org=id(1),user=id(2);
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table staff_access(user_id uuid,organization_id uuid,full_name text,is_active boolean,role text);
   create table timesheets(id int,service_period text,record_data jsonb);
   create table user_notification_state(user_id uuid primary key,inbox jsonb default '[]',preferences jsonb default '{}',updated_at timestamptz);
   create table notification_push_queue(event_key text,status text,lease_until timestamptz,last_error text,updated_at timestamptz);
   grant select,insert,update on user_notification_state,staff_access to service_role;
   insert into timesheets values(1,'October 2026','{"stage":"Location Sign-Off"}');`);
  const original=readFileSync('supabase/migrations/20261101215505_timesheet_danielle_jen_workflow.sql','utf8');
  const start=original.indexOf('create or replace function public.append_timesheet_alert(');
  const end=original.indexOf("notify pgrst",start);
  await db.exec(original.slice(start,end));
  await db.query("insert into staff_access values($1,$2,'Danielle Moore',true,'Owner / Admin')",[user,org]);
  const old=`timesheet-alert:${org}:October 2026:CCCC:Overdue:2026-11-25`,current=`timesheet-alert:${org}:November 2026:CCCC:Overdue:2026-12-02`;
  const notice=key=>({id:key,eventKey:key,href:'/timesheets',readAt:''});
  await db.query('insert into user_notification_state(user_id,inbox) values($1,$2)',[user,JSON.stringify([notice(old),notice(current),notice('unrelated')])]);
  await db.query("insert into notification_push_queue(event_key,status) values($1,'pending'),($2,'pending')",[old,current]);
  await db.exec(readFileSync('supabase/migrations/20261126025512_timesheets_start_november_2026.sql','utf8'));
  const rows=(await db.query('select inbox from user_notification_state')).rows[0].inbox;
  assert.ok(rows[0].archivedAt);assert.equal(rows[1].archivedAt,undefined);assert.equal(rows[2].archivedAt,undefined);
  const states=(await db.query('select event_key,status from notification_push_queue')).rows;
  assert.equal(states.find(row=>row.event_key===old).status,'suppressed');assert.equal(states.find(row=>row.event_key===current).status,'pending');
  assert.deepEqual((await db.query('select * from timesheets')).rows,[{id:1,service_period:'October 2026',record_data:{stage:'Location Sign-Off'}}]);
  for(const [period,expected] of [['October 2026',false],['November 2026',true],['December 2026',true],['January 2027',true],['nonsense',false]]){
   assert.equal((await db.query('select timesheet_tracking_applies($1) as applies',[period])).rows[0].applies,expected);
  }
  await db.exec('set role authenticated');await assert.rejects(db.query('select timesheet_tracking_applies($1)',['November 2026']),/permission denied/);
  await db.exec('reset role;set role service_role');
  const append=key=>db.query('select append_timesheet_alert($1,$2,$3,$4) as added',[org,user,key,JSON.stringify(notice(key))]);
  assert.equal((await append(old+':retry')).rows[0].added,false);
  assert.equal((await append(current+':new')).rows[0].added,true);
 }finally{await db.close();}
});
