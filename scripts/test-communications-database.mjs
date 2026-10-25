import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test, before, beforeEach, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org=id(1), otherOrg=id(2), loc=id(3), otherLoc=id(4), foreignLoc=id(5), owner=id(10), licensee=id(11), employee=id(12), otherEmployee=id(13), parent=id(14), foreign=id(15), child=id(30);
before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.actor',true),'')::uuid $$;
    grant usage on schema auth to authenticated,service_role;
    grant execute on function auth.uid() to authenticated;
    create table organizations(id uuid primary key);
    create table locations(id uuid primary key,organization_id uuid,is_active boolean);
    create table staff_access(user_id uuid primary key,organization_id uuid,full_name text,role text,is_active boolean);
    create table staff_location_assignments(user_id uuid,location_id uuid);
    create table children(id uuid primary key,organization_id uuid,location_id uuid,record_data jsonb,updated_by uuid);
    create table audit_log(organization_id uuid,location_id uuid,actor_user_id uuid,action text,table_name text,row_id uuid,metadata jsonb);
    alter table staff_access enable row level security;
    create policy own_staff on staff_access for select to authenticated using(user_id=auth.uid());
    grant select on staff_access,locations to authenticated;
    grant all on all tables in schema public to service_role;
    create function current_staff_organization_id() returns uuid language sql stable security definer as $$ select organization_id from staff_access where user_id=auth.uid() and is_active $$;
    create function is_tcs_owner() returns boolean language sql stable security definer as $$ select coalesce((select role='Owner / Admin' from staff_access where user_id=auth.uid() and is_active),false) $$;
    create function is_tcs_licensee() returns boolean language sql stable security definer as $$ select coalesce((select role='Location Licensee' from staff_access where user_id=auth.uid() and is_active),false) $$;
    create function is_approved_tcs_pilot_user() returns boolean language sql stable security definer as $$ select coalesce((select role in ('Owner / Admin','Location Licensee','Employee') from staff_access where user_id=auth.uid() and is_active),false) $$;
    create function can_access_location(uuid) returns boolean language sql stable security definer as $$ select is_tcs_owner() or exists(select 1 from staff_location_assignments a join staff_access s on s.user_id=a.user_id where a.user_id=auth.uid() and a.location_id=$1 and s.is_active) $$;
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20261025230642_hub_daily_communications.sql", import.meta.url), "utf8"));
});
beforeEach(async () => {
  await db.exec("reset role; select set_config('request.actor','',false); truncate hub_team_receipts,hub_team_replies,hub_team_threads,children,audit_log,staff_location_assignments,staff_access,locations,organizations,auth.users; drop trigger if exists fail_family_audit on audit_log;");
  await db.query("insert into organizations values($1),($2)",[org,otherOrg]);
  await db.query("insert into locations values($1,$2,true),($3,$2,true),($4,$5,true)",[loc,org,otherLoc,foreignLoc,otherOrg]);
  for(const [uid,orgId,name,role] of [[owner,org,"Demo Owner","Owner / Admin"],[licensee,org,"Demo Licensee","Location Licensee"],[employee,org,"Demo Employee","Employee"],[otherEmployee,org,"Demo Other","Employee"],[foreign,otherOrg,"Demo Foreign","Employee"]]) {
    await db.query("insert into auth.users values($1)",[uid]); await db.query("insert into staff_access values($1,$2,$3,$4,true)",[uid,orgId,name,role]);
  }
  await db.query("insert into auth.users values($1)",[parent]);
  await db.query("insert into staff_location_assignments values($1,$2),($3,$2),($4,$5),($6,$7)",[licensee,loc,employee,otherEmployee,otherLoc,foreign,foreignLoc]);
  await db.query("insert into children values($1,$2,$3,$4,null)",[child,org,loc,JSON.stringify({firstName:"Synthetic Avery",medicalNotes:"Synthetic preserved field",familyMessages:[]})]);
});
after(()=>db.close());
async function as(uid, operation) { await db.query("select set_config('request.actor',$1,false)",[uid]); await db.exec("set role authenticated"); try{return await operation();} finally{await db.exec("reset role");} }
async function post(uid,thread,location=loc,options={}) {
  const profile=(await db.query("select * from staff_access where user_id=$1",[uid])).rows[0];
  return as(uid,()=>db.query("insert into hub_team_threads(id,organization_id,location_id,title,body,author_id,author_name,pinned,requires_ack) values($1,$2,$3,'Synthetic post','Synthetic message',$4,$5,$6,$7)",[thread,options.org||profile.organization_id,location,options.author||uid,options.name||profile.full_name,options.pinned||false,options.ack||false]));
}
const readIds=(uid)=>as(uid,()=>db.query("select id from hub_team_threads order by id")).then(r=>r.rows.map(r=>r.id));
test("team conversations enforce organization and location boundaries, including direct REST-style reads",async()=>{
  await post(owner,id(100),loc); await post(owner,id(101),otherLoc); await post(owner,id(102),null); await post(foreign,id(103),foreignLoc);
  assert.deepEqual(await readIds(employee),[id(100),id(102)]); assert.deepEqual(await readIds(licensee),[id(100),id(102)]); assert.deepEqual(await readIds(parent),[]); assert.deepEqual(await readIds(foreign),[id(103)]);
});
test("employees cannot announce globally, impersonate staff, require acknowledgment or access another location",async()=>{
  for(const [location,options] of [[null,{}],[otherLoc,{}],[loc,{pinned:true}],[loc,{ack:true}],[loc,{author:owner}],[loc,{name:"Fake Director"}],[loc,{org:otherOrg}]]) await assert.rejects(post(employee,id(110),location,options),/row-level security/);
  await post(employee,id(110));
});
test("licensees can require acknowledgment locally and cannot pin global announcements",async()=>{
  await post(licensee,id(120),loc,{ack:true,pinned:true}); await post(owner,id(121),null);
  await assert.rejects(post(licensee,id(122),null),/row-level security/);
  const result=await as(licensee,()=>db.query("update hub_team_threads set pinned=true where id=$1 returning id",[id(121)])); assert.equal(result.rows.length,0);
  await assert.rejects(as(employee,()=>db.exec("update hub_team_threads set body='Changed'")),/permission denied/);
  await assert.rejects(as(owner,()=>db.exec("delete from hub_team_threads")),/permission denied/);
});
test("thread replies inherit visibility and cannot spoof their author",async()=>{
  await post(owner,id(130),loc);
  const reply=(uid,author=uid)=>as(uid,()=>db.query("insert into hub_team_replies values($1,$2,$3,'Demo Employee','Synthetic reply',now())",[id(131),id(130),author]));
  await assert.rejects(reply(otherEmployee),/row-level security/); await assert.rejects(reply(employee,owner),/row-level security/); await reply(employee);
  assert.equal((await as(parent,()=>db.query("select * from hub_team_replies"))).rows.length,0);
});
test("reading and acknowledging are separate, repeatable actions, and reads preserve acknowledgment",async()=>{
  await post(owner,id(140),loc,{ack:true});
  const receipt=(ack)=>as(employee,()=>db.query("select hub_read_team_thread($1,$2,now())",[id(140),ack]));
  await receipt(false); assert.equal((await db.query("select acknowledged_at from hub_team_receipts")).rows[0].acknowledged_at,null);
  await receipt(true); const stamp=(await db.query("select acknowledged_at from hub_team_receipts")).rows[0].acknowledged_at;
  await receipt(false); assert.deepEqual((await db.query("select acknowledged_at from hub_team_receipts")).rows[0].acknowledged_at,stamp);
  await assert.rejects(as(parent,()=>db.query("select hub_read_team_thread($1,true,now())",[id(140)])),/Conversation access/);
  await assert.rejects(as(employee,()=>db.query("insert into hub_team_receipts(thread_id,user_id,staff_name) values($1,$2,'Demo Owner')",[id(140),owner])),/row-level security/);
});
test("inactive access takes effect immediately without waiting for JWT refresh",async()=>{
  await post(owner,id(150)); await db.query("update staff_access set is_active=false where user_id=$1",[employee]);
  assert.deepEqual(await readIds(employee),[]); await assert.rejects(post(employee,id(151)),/row-level security/);
});
async function family(message=null,ids=null,direction=null) { await db.exec("set role service_role"); try{return await db.query("select hub_update_family_messages($1,$2,$3,$4,$5) messages",[child,parent,message&&JSON.stringify(message),ids,direction]);}finally{await db.exec("reset role");} }
const message=(n,direction="Family to TCS")=>({id:id(n),subject:"Synthetic subject",body:"Synthetic message",direction,createdAt:"2026-10-25T10:00:00Z",readAt:"",custom:"preserved"});
test("family messaging RPC is available only to the server role",async()=>{
  const result=await db.query("select has_function_privilege('authenticated','hub_update_family_messages(uuid,uuid,jsonb,text[],text)','execute') client,has_function_privilege('anon','hub_update_family_messages(uuid,uuid,jsonb,text[],text)','execute') anon,has_function_privilege('service_role','hub_update_family_messages(uuid,uuid,jsonb,text[],text)','execute') server"); assert.deepEqual(result.rows[0],{client:false,anon:false,server:true});
});
test("family sends preserve prior messages and unrelated fields; retry IDs cannot duplicate a send",async()=>{
  await family(message(160)); await family(message(160)); await db.query("update children set record_data=record_data || '{\"medicalNotes\":\"Newer synthetic edit\"}'"); await family(message(161,"TCS to Family"));
  const record=(await db.query("select record_data from children")).rows[0].record_data;
  assert.equal(record.familyMessages.length,2); assert.equal(record.medicalNotes,"Newer synthetic edit"); assert.equal(record.familyMessages[0].custom,"preserved"); assert.equal((await db.query("select count(*)::int n from audit_log")).rows[0].n,2);
});
test("family read receipts change only the selected incoming direction and preserve all message fields",async()=>{
  await family(message(170)); await family(message(171,"TCS to Family")); await family(null,[id(170),id(171)],"TCS to Family");
  const messages=(await db.query("select record_data->'familyMessages' messages from children")).rows[0].messages;
  assert.equal(messages[0].readAt,""); assert.ok(messages[1].readAt); assert.equal(messages[1].custom,"preserved");
});
test("an audit failure rolls back the family message instead of reporting an unaudited send",async()=>{
  await db.exec("create function fail_family_audit() returns trigger language plpgsql as $$ begin raise exception 'Synthetic audit failure'; end $$; create trigger fail_family_audit before insert on audit_log for each row execute function fail_family_audit();");
  await assert.rejects(family(message(180)),/Synthetic audit failure/); assert.deepEqual((await db.query("select record_data->'familyMessages' messages from children")).rows[0].messages,[]);
});
