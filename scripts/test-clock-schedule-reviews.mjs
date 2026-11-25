import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=readFileSync('supabase/migrations/20261125023258_clock_schedule_reviews.sql','utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('flags atomically queue notices for the location licensee and administration, and require a scoped explanation without changing actual time',async()=>{
 const db=new PGlite();const org=id(1),staff=id(2),owner=id(3),licensee=id(4),otherLicensee=id(5),site=id(6),otherSite=id(7),foreignOrg=id(8),foreignOwner=id(9),backup=id(10);
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema auth;create table auth.users(id uuid primary key);
   create table public.staff_access(user_id uuid,organization_id uuid,role text,full_name text,is_active boolean,locations text[]);
   create table public.locations(id uuid primary key,organization_id uuid,name text,slug text,full_name text);
   create table public.audit_log(id bigserial primary key,organization_id uuid,actor_user_id uuid,action text,table_name text,location_id uuid,metadata jsonb,occurred_at timestamptz);
   create function public.is_tcs_owner_role_text(text) returns boolean language sql as $$select $1='Owner / Admin'$$;
   grant select on public.staff_access,public.locations to service_role;`);
  await db.exec(readFileSync('supabase/migrations/20261009172654_store_notification_inbox_outside_auth.sql','utf8').split('-- Preserve existing state;')[0]);
  // Reuse the production push-queue trigger, excluding unrelated work-plan objects.
  await db.exec(readFileSync('supabase/migrations/20261120180000_notification_push_queue.sql','utf8').split('-- Work Plan assignments')[0]);
  await db.query('insert into auth.users values($1),($2),($3),($4),($5),($6)',[staff,owner,licensee,otherLicensee,foreignOwner,backup]);
  const addStaff=(who,o,role,sites)=>db.query('insert into staff_access values($1,$2,$3,$4,true,$5)',[who,o,role,`Person ${who.slice(-2)}`,sites]);
  await addStaff(staff,org,'Employee',['Halcom']);await addStaff(owner,org,'Owner / Admin',[]);await addStaff(licensee,org,'Location Licensee',['Halcom']);
  await addStaff(otherLicensee,org,'Location Licensee',['33rd Street']);await addStaff(foreignOwner,foreignOrg,'Owner / Admin',[]);await addStaff(backup,org,'Location Licensee',['Halcom','33rd Street']);
  await db.query("insert into locations values($1,$2,'Halcom','halcom','Halcom'),($3,$2,'33rd Street','33rd-street','33rd Street')",[site,org,otherSite]);
  await db.exec(migration);
  const punch=async(reasons=['Clocked in more than 4 minutes before shift.'],action='CREATE')=>(await db.query("insert into audit_log(organization_id,actor_user_id,action,table_name,location_id,metadata,occurred_at) values($1,$2,$3,'time_clock',$4,$5,'2026-11-25T16:55:00Z') returning id",[org,staff,action,site,JSON.stringify({kind:'staff_time_clock',event:'clock_in',targetStaffUserId:staff,targetStaffName:'Synthetic Staff',location:'Halcom',scheduleReview:reasons})])).rows[0].id;
  const eventId=await punch();
  assert.equal((await db.query('select * from clock_schedule_reviews')).rows.length,1);
  const notices=(await db.query('select * from user_notification_state order by user_id')).rows;
  assert.deepEqual(notices.map(row=>row.user_id).sort(),[owner,licensee].sort());
  assert.equal((await db.query('select * from notification_push_queue')).rows.length,2);
  assert.ok(notices.every(row=>row.inbox[0].href==='/time-clock#schedule-reviews'&&row.inbox[0].title.includes('explanation required')));
  assert.ok(notices.every(row=>!row.inbox[0].body.includes('Synthetic Staff')));
  const explain=(who=licensee,note='Schedule changed to cover another employee.',o=org)=>db.query('select explain_clock_schedule_review($1,$2,$3,$4)',[o,who,eventId,note]);
  for(const who of [staff,otherLicensee,backup])await assert.rejects(explain(who),/Only administration/);
  await assert.rejects(explain(foreignOwner,undefined,foreignOrg),/not found/);
  await assert.rejects(explain(licensee,'  '),/Enter an explanation/);
  await assert.rejects(explain(licensee,'x'.repeat(2001)),/Enter an explanation/);
  assert.equal((await db.query('select explained_at from clock_schedule_reviews')).rows[0].explained_at,null);
  await explain();
  const review=(await db.query('select * from clock_schedule_reviews')).rows[0];
  assert.equal(review.explained_by,licensee);assert.ok(review.explained_at);assert.equal(review.explanation,'Schedule changed to cover another employee.');
  await assert.rejects(explain(owner,'Replace existing note'),/already has an explanation/);
  const actual=(await db.query('select * from audit_log where id=$1',[eventId])).rows[0];
  assert.equal(actual.occurred_at.toISOString(),'2026-11-25T16:55:00.000Z');assert.equal(actual.metadata.scheduleReview.length,1);
  await punch([]);await punch(['forged review'],'REVIEW');assert.equal((await db.query('select count(*) from clock_schedule_reviews')).rows[0].count,1);
  // A clock-out has a separate required explanation and separate deduplicated phone notice.
  await db.query("insert into audit_log(organization_id,actor_user_id,action,table_name,location_id,metadata,occurred_at) values($1,$2,'CREATE','time_clock',$3,$4,'2026-11-26T02:05Z')",[org,staff,site,JSON.stringify({...actual.metadata,event:'clock_out',scheduleReview:['Clocked out more than 4 minutes after shift.']})]);
  assert.equal((await db.query('select count(*) from clock_schedule_reviews where explained_at is null')).rows[0].count,1);
  assert.equal((await db.query('select count(*) from notification_push_queue')).rows[0].count,4);
  await db.exec('set role authenticated');await assert.rejects(explain(),/permission denied/);await assert.rejects(db.query('select * from clock_schedule_reviews'),/permission denied/);
  await db.exec('reset role;alter role service_role bypassrls;set role service_role');
  assert.equal((await db.query('select count(*) from clock_schedule_reviews')).rows[0].count,2);
 }finally{await db.close();}
});

import ts from 'typescript';
import vm from 'node:vm';
function apiFixture({owner=false,licensee=false,primary='Halcom'}={}){
 const calls=[],filters=[];
 const reviews=[{event_id:1,location_id:'halcom',explanation:null}];
 const admin={from(table){
  const data=table==='locations'?[{id:'halcom',name:'Halcom',slug:'halcom',full_name:'Halcom'},{id:'division',name:'Division',slug:'division',full_name:'Division'}]:reviews;
  const q={select(){return q;},eq(k,v){filters.push([table,k,v]);return q;},in(k,v){filters.push([table,k,v]);return q;},or(){return q;},order(){return q;},limit(){return q;},then(resolve){return Promise.resolve({data,error:null}).then(resolve);}};return q;
 },async rpc(name,args){calls.push([name,args]);return{error:null};}};
 const context={exports:{},Response,Date,Error,require(name){
  if(name==='@/lib/location-config')return{normalizeLocation:value=>value.includes('Halcom')||value.includes('halcom')?'Halcom':'Division'};
  return{requireStaff:async()=>({admin,user:{id:'verified-actor'},profile:{organization_id:'verified-org',primary_location:primary},isOwner:owner,isLicensee:licensee}),staffErrorResponse:()=>Response.json({error:'Failed'},{status:500})};
 }};
 vm.runInNewContext(ts.transpileModule(readFileSync('src/app/api/time-clock/reviews/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 return{...context.exports,calls,filters};
}
test('review API rejects employees, scopes licensees to their main site and derives the note author from verified Auth',async()=>{
 const request=(body={})=>new Request('https://hub.test/api/time-clock/reviews',{method:'POST',body:JSON.stringify(body)});
 const employee=apiFixture();assert.equal((await employee.GET(request())).status,403);assert.equal((await employee.POST(request({eventId:'1',note:'cover shift'}))).status,403);
 const licensee=apiFixture({licensee:true});assert.equal((await licensee.GET(request())).status,200);
 const siteFilter=licensee.filters.find(row=>row[0]==='clock_schedule_reviews'&&row[1]==='location_id');assert.deepEqual(Array.from(siteFilter[2]),['halcom']);
 const noMain=apiFixture({licensee:true,primary:null});assert.equal((await (await noMain.GET(request())).json()).reviews.length,0);
 for(const note of ['', '   ', 'x'.repeat(2001)])assert.equal((await licensee.POST(request({eventId:'1',note}))).status,400);
 assert.equal((await licensee.POST(request({eventId:'1',note:'  Schedule changed for coverage.  ',p_actor:'forged',p_org:'forged'}))).status,200);
 assert.equal(licensee.calls[0][0],'explain_clock_schedule_review');assert.equal(licensee.calls[0][1].p_actor,'verified-actor');assert.equal(licensee.calls[0][1].p_org,'verified-org');assert.equal(licensee.calls[0][1].p_note,'Schedule changed for coverage.');
 const owner=apiFixture({owner:true});await owner.GET(request());assert.equal(owner.filters.some(row=>row[1]==='location_id'),false);
});
