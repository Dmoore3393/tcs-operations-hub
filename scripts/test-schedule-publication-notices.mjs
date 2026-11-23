import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('publication queues exactly one notice and push per active assigned staff and home licensee, including removed staff on revisions',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key);
 create table public.locations(id uuid primary key,organization_id uuid,name text,slug text);
 create table public.staff_access(user_id uuid,organization_id uuid,role text,is_active boolean,locations text[]);
 create table public.schedule_publications(id uuid primary key,organization_id uuid,location_id uuid,week_of date,status text,revision integer);
 create table public.staff_schedule_publication_shifts(publication_id uuid,organization_id uuid,user_id uuid,revision integer);
 create table public.user_notification_state(user_id uuid primary key,inbox jsonb default '[]',updated_at timestamptz default now());
 create function public.publish_staff_schedule(uuid,date,text) returns table(publication_id uuid,revision integer,shift_count integer,unlinked_shift_count integer) language plpgsql as $body$
 declare v_publication_id uuid; v_revision integer; v_shift_count integer; v_unlinked_count integer;
 begin
  return query
  select v_publication_id, v_revision, v_shift_count, v_unlinked_count;
 end $body$;`);
 const queue=await readFile('supabase/migrations/20261120180000_notification_push_queue.sql','utf8');await db.exec(queue.slice(0,queue.indexOf('create function public.claim_hub_push')));
 await db.exec(await readFile('supabase/migrations/20261123011454_schedule_publication_notices.sql','utf8'));
 for(let n=1;n<=6;n++)await db.query('insert into auth.users values($1)',[id(n)]);
 await db.query("insert into locations values($1,$2,'Halcom','halcom')",[id(20),id(30)]);
 await db.query("insert into schedule_publications values($1,$2,$3,'2026-11-23','Published',2)",[id(40),id(30),id(20)]);
 for(const [n,org,role,active,locations] of [[1,30,'Employee',true,['Halcom']],[2,30,'Employee',true,['Halcom']],[3,30,'Location Licensee',true,['Halcom']],[4,30,'Location Licensee',true,['33rd Street']],[5,30,'Employee',false,['Halcom']],[6,99,'Employee',true,['Halcom']]])await db.query('insert into staff_access values($1,$2,$3,$4,$5)',[id(n),id(org),role,active,locations]);
 for(const [user,revision] of [[1,2],[1,2],[2,1],[5,2],[6,2]])await db.query('insert into staff_schedule_publication_shifts values($1,$2,$3,$4)',[id(40),id(30),id(user),revision]);
 await db.query('select tcs_schedule_private.queue_publication($1)',[id(40)]);
 await db.query('select tcs_schedule_private.queue_publication($1)',[id(40)]);
 const states=(await db.query('select user_id,inbox from user_notification_state order by user_id')).rows;
 assert.deepEqual(states.map(r=>r.user_id),[id(1),id(2),id(3)]);
 assert.ok(states.every(r=>r.inbox.length===1));
 assert.equal(states[0].inbox[0].href,'/my-schedule?week=2026-11-23');assert.equal(states[2].inbox[0].href,'/staff-schedules?week=2026-11-23');
 assert.equal((await db.query('select count(*)::int n from notification_push_queue')).rows[0].n,3);
 await db.query('update schedule_publications set revision=3 where id=$1',[id(40)]);
 await db.query('insert into staff_schedule_publication_shifts values($1,$2,$3,3)',[id(40),id(30),id(1)]);
 await db.query('select tcs_schedule_private.queue_publication($1)',[id(40)]);
 assert.equal((await db.query('select count(*)::int n from notification_push_queue')).rows[0].n,5);
 const permissions=(await db.query("select has_function_privilege('authenticated','tcs_schedule_private.queue_publication(uuid)','EXECUTE') allowed")).rows[0];assert.equal(permissions.allowed,false);
 const definition=(await db.query("select pg_get_functiondef('public.publish_staff_schedule(uuid,date,text)'::regprocedure) d")).rows[0].d;assert.match(definition,/perform tcs_schedule_private.queue_publication/);
 }finally{await db.close();}
});
