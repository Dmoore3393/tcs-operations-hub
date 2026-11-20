import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('new inbox alerts and work tasks queue one phone delivery; leases prevent duplicates and retry failed sends',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table public.user_notification_state(user_id uuid primary key,inbox jsonb not null default '[]',updated_at timestamptz default now());create table public.staff_access(user_id uuid,organization_id uuid,is_active boolean,full_name text);create table public.hub_state(organization_id uuid,state_key text,state_value jsonb);`);
 await db.exec(await readFile('supabase/migrations/20261120180000_notification_push_queue.sql','utf8'));
 const user='00000000-0000-4000-8000-000000000001',org='00000000-0000-4000-8000-000000000002';await db.query('insert into auth.users values($1)',[user]);await db.query("insert into staff_access values($1,$2,true,'Nathaly Cornejo')",[user,org]);
 const item={id:'event1',eventKey:'event1',title:'Results ready',readAt:''};await db.query('insert into user_notification_state(user_id,inbox) values($1,$2)',[user,JSON.stringify([item])]);
 assert.equal((await db.query('select count(*)::int n from notification_push_queue')).rows[0].n,1);
 await db.query("update user_notification_state set inbox=jsonb_set(inbox,'{0,readAt}','\"now\"') where user_id=$1",[user]);assert.equal((await db.query('select count(*)::int n from notification_push_queue')).rows[0].n,1);
 const claim=()=>db.query('select claim_hub_push($1,$2,$3) lease',[user,'event1',JSON.stringify(item)]);assert.ok((await claim()).rows[0].lease);assert.equal((await claim()).rows[0].lease,null);await db.exec("update notification_push_queue set status='accepted'");assert.equal((await claim()).rows[0].lease,null);
 const task={id:123,title:'Update roster',owner:'Nathaly Cornejo',due:'Monday',dueAt:'2026-11-24T02:00:00Z',location:'33rd Street',completed:false};await db.query('insert into hub_state values($1,$2,$3)',[org,'tcs-work-tasks',JSON.stringify([task])]);assert.equal((await db.query('select count(*)::int n from notification_push_queue')).rows[0].n,2);
 await db.query('update hub_state set state_value=$1',[JSON.stringify([{...task,initials:'NC'}])]);assert.equal((await db.query('select count(*)::int n from notification_push_queue')).rows[0].n,2);
 await db.query('update hub_state set state_value=$1',[JSON.stringify([{...task,due:'Tuesday',dueAt:'2026-11-25T02:00:00Z'}])]);assert.equal((await db.query('select count(*)::int n from notification_push_queue')).rows[0].n,3);
 await db.exec("update notification_push_queue set status='pending',next_attempt_at=now()-interval '1 second' where event_key='event1'");assert.ok((await claim()).rows[0].lease);
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from notification_push_queue'),/permission denied/);
 }finally{await db.close();}
});
