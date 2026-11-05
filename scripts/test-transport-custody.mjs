import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('committed custody events create specific staff inboxes and durable pushes once, scoped to the team and involved sites',async()=>{
 const db=new PGlite();
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const org=id(1),otherOrg=id(2),site=id(3),dest=id(4),route=id(5),day='2030-01-07';
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create function auth.uid() returns uuid language sql as $$select null::uuid$$;
   create table organizations(id uuid primary key);
   create table locations(id uuid primary key,organization_id uuid,name text,slug text);
   create table staff_access(user_id uuid primary key, organization_id uuid,full_name text,role text,locations text[],permissions text[],is_active boolean);
   create table staff_location_assignments(user_id uuid,organization_id uuid,location_id uuid);
   create table transportation_routes(id uuid primary key,organization_id uuid,location_id uuid,child_name text,record_data jsonb);
   create table transportation_day_stops(organization_id uuid,route_id uuid,service_date date,plan_data jsonb);
   create table user_notification_state(user_id uuid primary key,inbox jsonb not null default '[]',updated_at timestamptz);
   create function is_tcs_owner_role_text(text) returns boolean language sql as $$select $1='Owner / Admin'$$;
   create function tcs_location_slug(text) returns text language sql as $$select lower($1)$$;`);
  await db.query('insert into organizations values($1),($2)',[org,otherOrg]);
  await db.query("insert into locations values($1,$2,'North','north'),($3,$2,'South','south')",[site,org,dest]);
  const accounts = [
   [10,'Owner / Admin',[],[],true,org], [11,'Employee',['North'],['transportation'],true,org],
   [12,'Location Licensee',['North'],[],true,org], [13,'Employee',['South'],['daily_care'],true,org],
   [14,'Employee',['North'],['children_basic'],true,org], [15,'Employee',['Other'],['daily_care'],true,org],
   [16,'Employee',['South'],['maintenance_view'],true,org], [17,'Employee',['North'],['transportation'],false,org],
   [18,'Owner / Admin',['North'],[],true,otherOrg]
  ];
  for(const [n,role,sites,permissions,active,organization] of accounts){
   await db.query("insert into staff_access values($1,$2,'Synthetic Staff',$3,$4,$5,$6)",[id(n),organization,role,sites,permissions,active]);
   await db.query('insert into staff_location_assignments values($1,$2,$3)',[id(n),organization,site]);
  }
  const base={id:1,child:'Synthetic Rider',school:'School One',driver:'Usual Driver',vehicle:'Van One',location:'North',dropoffLocation:'North'};
  await db.query("insert into transportation_routes values($1,$2,$3,'Synthetic Rider',$4)",[route,org,site,base]);
  await db.query('insert into transportation_day_stops values($1,$2,$3,$4)',[org,route,day,{driver:'Daily Driver',school:'School Two',dropoffLocation:'South',vehicle:'Van Two'}]);
  const migration=(await readdir('supabase/migrations')).find(f=>f.endsWith('_transport_custody_updates.sql'));
  await db.exec(await readFile('supabase/migrations/'+migration,'utf8'));
  const update=record=>db.query('update transportation_routes set record_data=$1 where id=$2',[record,route]);
  const pickup={...base,runDate:day,runStatus:'Picked Up',pickedUpAt:'2030-01-07T21:15:00Z',pickedUpBy:'Daily Driver'};
  const finished={...pickup,runStatus:'Dropped Off',arrivedAt:'2030-01-07T21:32:00Z',droppedOffAt:'2030-01-07T21:38:00Z',droppedOffBy:'Receiving Staff'};
  await db.exec('begin'); await update(pickup); await db.exec('rollback');
  assert.equal((await db.query('select * from transport_custody_deliveries')).rows.length,0);
  await update(pickup); await update(finished); await update({...finished,notes:'Unrelated edit'});
  const {rows}=await db.query('select user_id,notification from transport_custody_deliveries order by id');
  assert.equal(rows.length,15);
  assert.deepEqual([...new Set(rows.map(r=>r.user_id))],[10,11,12,13,14].map(id));
  const owner=rows.filter(r=>r.user_id===id(10)).map(r=>r.notification);
  assert.deepEqual(owner.map(n=>n.title),['Synthetic Rider picked up','Synthetic Rider arrived','Synthetic Rider handed off']);
  for(const token of ['1:15 PM','Daily Driver','Van Two','School Two','South'])assert.ok(owner[0].body.includes(token),token);
  assert.match(owner[1].body,/1:32 PM.*At South.*Awaiting handoff/);
  assert.match(owner[2].body,/1:38 PM.*Handoff complete at South.*Recorded by Receiving Staff/);
  assert.match(owner[0].href,/view=all/);
  assert.equal(rows.find(r=>r.user_id===id(13)).notification.href,'/notifications');
  assert.equal(rows.find(r=>r.user_id===id(13)).notification.location,'South');
  assert.equal((await db.query('select inbox from user_notification_state where user_id=$1',[id(10)])).rows[0].inbox[0].title,owner[2].title);
  await db.exec('set role authenticated');
  assert.equal((await db.query("select has_function_privilege(current_user,'claim_transport_custody_pushes(uuid,uuid,integer)','execute') allowed")).rows[0].allowed,false);
  await assert.rejects(db.exec('select * from transport_custody_deliveries'),/permission denied/); await db.exec('reset role');
  await db.exec('set role service_role');
  const claim=(lease)=>db.query('select * from claim_transport_custody_pushes($1,$2)',[org,lease]);
  assert.equal((await claim(id(30))).rows.length,5);
  assert.equal((await claim(id(31))).rows.length,0);
  await db.query("update transport_custody_deliveries set claimed_until=now()-interval '3 minutes' where lease_id=$1",[id(30)]);
  assert.equal((await claim(id(32))).rows.length,5);
  await db.query('update transport_custody_deliveries set delivered_at=now() where lease_id=$1',[id(32)]);
  assert.equal((await claim(id(33))).rows.length,5);
  await db.query('update transport_custody_deliveries set delivered_at=now() where lease_id=$1',[id(33)]);
  assert.equal((await claim(id(34))).rows.length,5);
  await db.query('update transport_custody_deliveries set delivered_at=now() where lease_id=$1',[id(34)]);
  assert.equal((await claim(id(35))).rows.length,0);
 } finally { await db.close(); }
});
