import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('saved routes notify exact staff identities atomically; employee access is automatic without dispatch-edit rights',async()=>{
 const db=new PGlite(),org=id(1),loc=id(2),owner=id(3),driver=id(4),other=id(5),lane=id(6),otherLane=id(7),route=id(8),nextRoute=id(9),day='2030-01-07';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;
 create table organizations(id uuid primary key);create table locations(id uuid primary key,organization_id uuid,is_active boolean,name text);
 create table staff_access(user_id uuid primary key,organization_id uuid,full_name text,role text,permissions text[],is_active boolean);
 create table staff_location_assignments(organization_id uuid,user_id uuid,location_id uuid);
 create table staff_lane_profiles(id uuid primary key,organization_id uuid,full_name text,staff_user_id uuid,is_active boolean);
 create table children(id uuid primary key,organization_id uuid,location_id uuid,legacy_id text,first_name text,last_name text);
 create table transportation_routes(id uuid primary key default gen_random_uuid(),organization_id uuid,location_id uuid,child_id uuid,record_data jsonb,legacy_id text,unique(organization_id,legacy_id));
 create table audit_log(organization_id uuid,location_id uuid,actor_user_id uuid,action text,table_name text,metadata jsonb);
 create table user_notification_state(user_id uuid primary key,inbox jsonb default '[]',preferences jsonb default '{}',updated_at timestamptz default now());
 grant select on children,staff_access,locations,staff_location_assignments,staff_lane_profiles to authenticated;
 grant select,insert,update,delete on transportation_routes to authenticated;
 create function current_staff_organization_id() returns uuid language sql stable as $$select organization_id from staff_access where user_id=auth.uid() and is_active$$;
 create function is_approved_tcs_pilot_user() returns boolean language sql stable as $$select exists(select 1 from staff_access where user_id=auth.uid() and is_active)$$;
 create function is_tcs_owner() returns boolean language sql stable as $$select exists(select 1 from staff_access where user_id=auth.uid() and is_active and role='Owner / Admin')$$;
 create function is_tcs_licensee() returns boolean language sql stable as $$select exists(select 1 from staff_access where user_id=auth.uid() and is_active and role='Location Licensee')$$;
 create function can_access_location(uuid) returns boolean language sql stable as $$select is_tcs_owner() or exists(select 1 from staff_location_assignments where user_id=auth.uid() and location_id=$1)$$;
 alter table transportation_routes enable row level security;
 create policy "location read" on transportation_routes for select to authenticated using(organization_id=current_staff_organization_id() and can_access_location(location_id));
 create policy "location insert" on transportation_routes for insert to authenticated with check(organization_id=current_staff_organization_id() and can_access_location(location_id));
 create policy "location update" on transportation_routes for update to authenticated using(organization_id=current_staff_organization_id() and can_access_location(location_id));
 create policy "location delete" on transportation_routes for delete to authenticated using(organization_id=current_staff_organization_id());`);
 const names=await readdir('supabase/migrations');for(const suffix of ['_daily_transport_plans.sql','_transportation_driver_assignments.sql','_morning_transportation.sql','_daily_transport_absence_reasons.sql','_transport_callout_push_notices.sql'])await db.exec(await readFile('supabase/migrations/'+names.find(name=>name.endsWith(suffix)),'utf8'));
 await db.query('insert into organizations values($1)',[org]);await db.query("insert into locations values($1,$2,true,'Synthetic Site')",[loc,org]);
 for(const [user,role] of [[owner,'Owner / Admin'],[driver,'Employee'],[other,'Employee']]){await db.query('insert into auth.users values($1)',[user]);await db.query("insert into staff_access values($1,$2,'Synthetic Same',$3,$4,true)",[user,org,role,[]]);await db.query('insert into staff_location_assignments values($1,$2,$3)',[org,user,loc]);}
 assert.deepEqual((await db.query('select permissions from staff_access where user_id=$1',[driver])).rows[0].permissions,['transportation']);
 await db.query('update staff_access set permissions=$1 where user_id=$2',[['maintenance_view'],driver]);assert.deepEqual((await db.query('select permissions from staff_access where user_id=$1',[driver])).rows[0].permissions,['maintenance_view','transportation']);
 await db.query("insert into staff_lane_profiles values($1,$2,'Synthetic Same',$3,true),($4,$2,'Synthetic Same',$5,true)",[lane,org,driver,otherLane,other]);
 const data=n=>({id:n,child:'Synthetic Child '+n,location:'Synthetic Site',school:'Synthetic School',driver:'Synthetic Same',driverLaneId:lane,vehicle:'Synthetic Van',pickup:'3 PM',days:'Mon-Fri',status:'Confirmed'});
 const add=(uuid,n)=>db.query('insert into transportation_routes(id,organization_id,location_id,record_data,legacy_id) values($1,$2,$3,$4,$5)',[uuid,org,loc,JSON.stringify(data(n)),String(n)]);
 const flush=()=>db.query('select * from deliver_transport_assignment_notices($1,null,null)',[org]);
 await db.exec('begin');await add(route,1);await db.exec('rollback');assert.equal((await db.query('select * from transport_assignment_notices')).rows.length,0);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated;begin');await add(route,1);await add(nextRoute,2);await db.exec('commit;reset role');
 let delivered=(await flush()).rows;assert.equal(delivered.length,1);assert.equal(delivered[0].user_id,driver);assert.ok(!delivered[0].notification.body.includes('Child'));assert.equal((await flush()).rows.length,0);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[driver]);await db.exec('set role authenticated');
 await db.query('insert into transportation_routes(organization_id,location_id,record_data,legacy_id) values($1,$2,$3,$4) on conflict(organization_id,legacy_id) do update set record_data=excluded.record_data',[org,loc,JSON.stringify({...data(1),runDate:day,runStatus:'Checked In'}),'1']);
 await assert.rejects(db.query('update transportation_routes set record_data=record_data||$1 where id=$2',[JSON.stringify({driverLaneId:otherLane}),route]),/Only administration/);
 await assert.rejects(add(id(10),3),/Only administration/);assert.equal((await db.query('delete from transportation_routes returning id')).rows.length,0);
 await assert.rejects(db.query('insert into transport_assignment_notices(organization_id,route_id,location_id,lane_id,actor_id,event_key) values($1,$2,$3,$4,$5,$6)',[org,route,loc,lane,driver,'forged']),/row-level security/);
 assert.equal((await db.query("select has_function_privilege('authenticated','deliver_transport_assignment_notices(uuid,uuid,uuid)','execute') allowed")).rows[0].allowed,false);await db.exec('reset role');assert.equal((await flush()).rows.length,0);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
 await db.query('select save_transport_day_stop($1,$2,$3,$4,$5,$6,0)',[org,owner,route,day,'save',JSON.stringify({driver:'Synthetic Same',driverLaneId:otherLane,school:'Synthetic New School',vehicle:'Synthetic Other Van'})]);
 delivered=(await flush()).rows;assert.equal(delivered.length,1);assert.equal(delivered[0].user_id,other);assert.equal(delivered[0].notification.href,'/transportation?routeDate='+day);
 await db.query('select save_transport_day_stop($1,$2,$3,$4,$5,$6,1)',[org,owner,route,day,'save',JSON.stringify({driver:'Synthetic Same',driverLaneId:otherLane,school:'Synthetic New School',vehicle:'Synthetic Other Van'})]);assert.equal((await flush()).rows.length,0);
 await db.query('select save_transport_day_stop($1,$2,$3,$4,$5,$6,0)',[org,owner,route,'2030-01-08','save',JSON.stringify({driver:'Synthetic Same',driverLaneId:otherLane,tripPeriod:'Morning',pickupLocation:'Synthetic Home',school:'Synthetic School',pickup:'7 AM',dropoff:'7:45 AM'})]);
 delivered=(await flush()).rows;assert.equal(delivered.length,1);assert.match(delivered[0].notification.body,/Morning/);
 assert.equal((await db.query("select plan_data->>'pickupLocation' source from transportation_day_stops where service_date='2030-01-08'")).rows[0].source,'Synthetic Home');
 await assert.rejects(db.query('select save_transport_day_stop($1,$2,$3,$4,$5,$6,0)',[org,owner,route,'2030-01-09','save',JSON.stringify({tripPeriod:'Night'})]),/Choose Morning or Afternoon/);
 // Call-outs target that day's driver, without the driver opening or polling the Hub.
 const callDay='2030-01-10';
 const change=async(uuid,action,plan={},date=callDay)=>{
  const version=(await db.query('select version from transportation_day_stops where route_id=$1 and service_date=$2',[uuid,date])).rows[0]?.version||0;
  return db.query('select save_transport_day_stop($1,$2,$3,$4,$5,$6,$7)',[org,owner,uuid,date,action,JSON.stringify(plan),version]);
 };
 await change(route,'save',{driver:'Synthetic Same',driverLaneId:otherLane});await flush();
 await change(route,'callout',{calloutReason:'sick'});
 delivered=(await flush()).rows;assert.equal(delivered.length,1);assert.equal(delivered[0].user_id,other);
 assert.equal(delivered[0].notification.title,'Transportation cancelled');assert.match(delivered[0].notification.body,/Synthetic Child 1.*Do not pick up/);assert.doesNotMatch(delivered[0].notification.body,/sick/i);assert.equal(delivered[0].notification.href,'/transportation?routeDate='+callDay);
 await change(route,'callout',{calloutReason:'no_transportation'});assert.equal((await flush()).rows.length,0,'repeat call-out and reason edits do not spam the driver');
 await change(route,'restore');delivered=(await flush()).rows;assert.equal(delivered.length,1);assert.equal(delivered[0].notification.title,'Transportation restored');assert.equal(delivered[0].user_id,other);
 await change(route,'callout');await change(route,'restore');await change(route,'callout');
 delivered=(await flush()).rows;assert.equal(delivered.length,1,'only the latest pending state is delivered');assert.equal(delivered[0].notification.title,'Transportation cancelled');
 await change(route,'restore');await flush();
 await db.exec('begin');await change(route,'callout');await db.exec('rollback');assert.equal((await flush()).rows.length,0,'rolled-back call-outs send nothing');
 await assert.rejects(db.query('select save_transport_day_stop($1,$2,$3,$4,$5,$6,0)',[org,owner,route,callDay,'callout','{}']),/changed/);assert.equal((await flush()).rows.length,0,'failed saves send nothing');
 // One child on two remaining trips: one notice per actual driver, no unrelated staff.
 const child=id(20),linkedA=id(21),linkedB=id(22);
 await db.query("insert into children values($1,$2,$3,'synthetic-linked','Synthetic','Linked')",[child,org,loc]);
 await add(linkedA,21);await add(linkedB,22);
 await db.query("update transportation_routes set child_id=$1,record_data=record_data||$2 where id=any($3::uuid[])",[child,JSON.stringify({child:'Synthetic Linked'}),[linkedA,linkedB]]);await flush();
 await change(linkedA,'callout');delivered=(await flush()).rows;assert.equal(delivered.length,1,'linked trips sharing a driver are deduped');assert.equal(delivered[0].user_id,driver);
 await change(linkedA,'restore');await flush();
 await change(linkedB,'save',{driver:'Synthetic Same',driverLaneId:otherLane});await flush();
 await change(linkedA,'callout');delivered=(await flush()).rows;assert.deepEqual(delivered.map(n=>n.user_id).sort(),[driver,other].sort(),'both assigned drivers receive linked-trip cancellation');
 await change(linkedA,'restore');await flush();
 await db.query('update transportation_routes set record_data=record_data||$1 where id=$2',[JSON.stringify({runDate:callDay,runStatus:'Dropped Off',tripPeriod:'Morning'}),linkedA]);await flush();
 await change(linkedB,'callout');delivered=(await flush()).rows;assert.equal(delivered.length,1,'a completed morning trip creates no new cancellation');assert.equal(delivered[0].user_id,other);
 // A different day's recurring stop is not part of today's route.
 await change(linkedB,'restore');await flush();
 await db.query('update transportation_routes set record_data=record_data||$1 where id=$2',[JSON.stringify({runDate:'',runStatus:'',days:'Friday'}),linkedA]);await flush();
 await change(linkedB,'callout');delivered=(await flush()).rows;assert.equal(delivered.length,1);assert.equal(delivered[0].user_id,other);
 // Access revocation between save and dispatch prevents the alert.
 await change(nextRoute,'callout');await db.query('update staff_access set is_active=false where user_id=$1',[driver]);assert.equal((await flush()).rows.length,0);await db.query('update staff_access set is_active=true where user_id=$1',[driver]);await change(nextRoute,'restore');await flush();
 // Date-specific coverage resolves a unique staff identity rather than an old driver.
 await db.query("update staff_lane_profiles set full_name='Synthetic Cover' where id=$1",[otherLane]);
 await db.query('update transportation_routes set record_data=record_data||$1 where id=$2',[JSON.stringify({coveringDriver:'Synthetic Cover',coveringDate:'2030-01-11'}),nextRoute]);
 await change(nextRoute,'callout',{},'2030-01-11');delivered=(await flush()).rows;assert.equal(delivered.length,1);assert.equal(delivered[0].user_id,other);
 for(const [days,date,expected] of [['Monday-Friday',callDay,true],['Friday',callDay,false],['Sat-Sun',callDay,false],['Fri-Mon','2030-01-07',true],['weekends','2030-01-12',true],['Mon, Thu',callDay,true],['',callDay,true]])assert.equal((await db.query('select transport_scheduled_on_date($1,$2) yes',[days,date])).rows[0].yes,expected);
 await db.query('update staff_lane_profiles set is_active=false where id=$1',[lane]);await assert.rejects(add(id(10),3),/active driver/);
 }finally{await db.close();}
});
