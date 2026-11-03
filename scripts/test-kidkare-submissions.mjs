import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test, { before, beforeEach, after } from 'node:test';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const url = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64');
const helperUrl = url(await readFile('src/lib/kidkare-submissions.ts', 'utf8'));
const helper = await import(helperUrl);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org=id(1), otherOrg=id(2), owner=id(3), licensee=id(4), employee=id(5), home=id(6), secondHome=id(7), center=id(8), closed=id(9), outside=id(10);
const db = new PGlite();
before(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    create table organizations(id uuid primary key);
    create table staff_access(user_id uuid,full_name text,is_active boolean);
    create table locations(id uuid primary key,organization_id uuid,program_type text,is_active boolean);
    create table document_records(organization_id uuid,location_id uuid,document_type text,status text,source_reference text);
    create table audit_events(actor uuid,old_data jsonb,new_data jsonb);
    create function current_staff_organization_id() returns uuid language sql as $$select '${org}'::uuid$$;
    create function is_tcs_owner() returns boolean language sql as $$select auth.uid()='${owner}'::uuid$$;
    create function is_tcs_licensee() returns boolean language sql as $$select auth.uid()='${licensee}'::uuid$$;
    create function can_write_location_module(uuid,text) returns boolean language sql as $$select is_tcs_owner() or (is_tcs_licensee() and $1='${home}'::uuid)$$;
    create function can_read_location_module(uuid,text) returns boolean language sql as $$select can_write_location_module($1,$2)$$;
    create function audit_location_row_change() returns trigger language plpgsql security definer as $$begin insert into audit_events values(auth.uid(),case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));return new;end$$;
    grant select on locations,staff_access to authenticated;
    insert into organizations values('${org}'),('${otherOrg}');
    insert into auth.users values('${owner}'),('${licensee}'),('${employee}');
    insert into staff_access values('${owner}','Synthetic Owner',true),('${licensee}','Synthetic Licensee',true),('${employee}','Synthetic Employee',true);
    insert into locations values('${home}','${org}','Family Childcare',true),('${secondHome}','${org}','Family Childcare',true),('${center}','${org}','School Age Center',true),('${closed}','${org}','Family Childcare',false),('${outside}','${otherOrg}','Family Childcare',true);`);
  const migration = (await readdir('supabase/migrations')).find(file => file.endsWith('_kidkare_daily_submissions.sql'));
  await db.exec(await readFile('supabase/migrations/'+migration,'utf8'));
});
beforeEach(async () => {
  await db.exec('reset role;truncate kidkare_daily_submissions,audit_events;');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]); await db.exec('set role authenticated');
});
after(() => db.close());
const save = (location, date='2026-10-30', status='Submitted', revision=0) => db.query('select save_kidkare_submission($1,$2,$3,$4) as day',[location,date,status,revision]);

test('weekdays and monthly progress handle month boundaries, weekends, future days and LA midnight', () => {
  assert.equal(helper.weekdaysInMonth('2026-10').length,22);
  assert.equal(helper.weekdaysInMonth('2026-11')[0],'2026-11-02');
  assert.equal(helper.validKidKareDay('2026-10-31'),false);
  assert.equal(helper.validKidKareDay('2026-02-30'),false);
  assert.equal(helper.validClaimMonth('2026-13'),false);
  assert.equal(helper.kidKareToday(new Date('2026-11-03T01:00:00Z')),'2026-11-02');
  assert.deepEqual(helper.kidKareProgress([{service_date:'2026-11-02',status:'Submitted'}],'2026-11','2026-11-02'),{submitted:1,closed:0,unmarked:0});
  assert.deepEqual(helper.kidKareProgress([{service_date:'2026-10-30',status:'Closed / no care'}],'2026-10','2026-11-02'),{submitted:0,closed:1,unmarked:21});
});
test('each home has an independent daily record, server-stamped staff name and audit history', async () => {
  let row=(await save(home)).rows[0].day;
  assert.equal(row.updated_by,owner); assert.equal(row.updated_by_name,'Synthetic Owner'); assert.equal(row.revision,1);
  await save(secondHome,'2026-10-30','Closed / no care');
  await save(home,'2026-10-30','Not submitted',1);
  const rows=(await db.query('select status,revision from kidkare_daily_submissions order by location_id')).rows;
  assert.deepEqual(rows,[{status:'Not submitted',revision:2},{status:'Closed / no care',revision:1}]);
  await db.exec('reset role'); const logs=(await db.query('select * from audit_events')).rows;
  assert.equal(logs.length,3); assert.equal(logs[2].old_data.status,'Submitted'); assert.equal(logs[2].new_data.status,'Not submitted');
});
test('stale changes and repeated saves cannot duplicate or silently overwrite another device', async () => {
  await save(home); await assert.rejects(save(home,'2026-10-30','Closed / no care',0),/changed on another device/);
  await save(home,'2026-10-30','Submitted',1);
  const rows=(await db.query('select status,revision from kidkare_daily_submissions')).rows;
  assert.deepEqual(rows,[{status:'Submitted',revision:1}]);
});
test('weekends, future dates, centers, wrong organizations and moving an existing date are rejected', async () => {
  await assert.rejects(save(home,'2026-10-31'),/check constraint/);
  await assert.rejects(save(home,'2099-01-05'),/Future/);
  await assert.rejects(save(center),/in-home/);
  await assert.rejects(save(outside),/in-home/);
  await save(home);
  await assert.rejects(db.query('update kidkare_daily_submissions set service_date=$1',['2026-10-29']),/cannot be moved/);
  assert.equal((await db.query('select count(*) n from kidkare_daily_submissions')).rows[0].n,1);
});
test('licensees stay in scope, staff cannot read/write and anon cannot call the mutation', async () => {
  await save(home); await save(secondHome);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[licensee]);
  assert.equal((await db.query('select count(*) n from kidkare_daily_submissions')).rows[0].n,1);
  assert.equal((await save(home,'2026-10-30','Closed / no care',1)).rows[0].day.updated_by_name,'Synthetic Licensee');
  await assert.rejects(save(secondHome,'2026-10-30','Not submitted',1),/access/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[employee]);
  assert.equal((await db.query('select count(*) n from kidkare_daily_submissions')).rows[0].n,0);
  await assert.rejects(save(home),/access/);
  assert.equal((await db.query("select has_function_privilege('anon','save_kidkare_submission(uuid,date,text,integer)','execute') ok")).rows[0].ok,false);
});
test('closed homes allow historical records, and supplied actor identities are overwritten', async () => {
  await save(closed,'2020-01-06');
  await db.query('insert into kidkare_daily_submissions(organization_id,location_id,service_date,status,updated_by_name,updated_by) values($1,$2,$3,$4,$5,$6)',[org,home,'2026-10-30','Submitted','Fake actor',employee]);
  assert.equal((await db.query('select updated_by_name from kidkare_daily_submissions where location_id=$1',[home])).rows[0].updated_by_name,'Synthetic Owner');
});

const locationConfig=url(await readFile('src/lib/location-config.ts','utf8'));
const locationHelper=url((await readFile('src/lib/server/location-slug.ts','utf8')).replace('import "server-only";','').replace('"@/lib/location-config"',JSON.stringify(locationConfig)));
function prepared(source) {
  return source.replace('"@/lib/kidkare-submissions"',JSON.stringify(helperUrl)).replace('"@/lib/server/location-slug"',JSON.stringify(locationHelper))
    .replace(/import \{ requireStaff, staffErrorResponse \} from .*?;/,'const requireStaff=async()=>globalThis.kidkareAuth;const staffErrorResponse=e=>e instanceof Response?e:Response.json({error:String(e)},{status:500});');
}
const api=await import(url(prepared(await readFile('src/app/api/kidkare/submissions/route.ts','utf8'))));
let uploaded=[],inserted=[],removed=[],queries=[],duplicate=null, homeType='Family Childcare', homeActive=true, recordError=false;
function setupApi() {
  uploaded=[];inserted=[];removed=[];queries=[];duplicate=null;homeType='Family Childcare';homeActive=true;recordError=false;
  const client={async rpc(){return {data:true,error:null}},from(table){let patch;const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},gte(){return q},lte(){return q},order(){return q},limit(){return q},insert(v){patch=v;inserted.push(v);return q},maybeSingle(){queries.push({table,filters});return Promise.resolve({data:table==='locations'?{id:home,program_type:homeType,is_active:homeActive}:table==='retention_policies'?{id:id(11),retention_years:3}:duplicate,error:null})},single(){return Promise.resolve({data:recordError?null:{id:patch.id},error:recordError?new Error('synthetic database outage'):null})},then(resolve,reject){queries.push({table,filters});return Promise.resolve({data:[],error:null}).then(resolve,reject)}};return q}};
  globalThis.kidkareAuth={isOwner:true,isLicensee:false,profile:{organization_id:org},userClient:client,admin:{storage:{
    from(bucket) {
      assert.equal(bucket,'tcs-sensitive-documents');
      return {
        async upload(path,bytes) { uploaded.push({path,bytes}); return {error:null}; },
        async remove(paths) { removed.push(...paths); return {error:null}; },
      };
    },
  }}};
}
const documentApi=await import(url(prepared(await readFile('src/app/api/documents/route.ts','utf8')).replace(/import \{ encryptDocument \} from .*?;/,'const encryptDocument=bytes=>({encrypted:Buffer.from("encrypted synthetic image"),sha256:"synthetic-hash",iv:"synthetic-iv"});')));
const png=new Uint8Array([137,80,78,71,13,10,26,10,0]);
function uploadRequest({month='2026-10',type='image/png',bytes=png}={}) {
  const form=new FormData();form.set('file',new File([bytes],'synthetic-claim.png',{type}));form.set('location','Halcom');form.set('documentType',helper.KIDKARE_CLAIM_DOCUMENT);form.set('claimMonth',month);
  return new Request('https://synthetic.invalid/api/documents',{method:'POST',body:form});
}
test('API denies ordinary staff and rejects invalid dates without sending a database mutation', async () => {
  setupApi();globalThis.kidkareAuth.isOwner=false;
  assert.equal((await api.GET(new Request('https://synthetic.invalid/api/kidkare/submissions?month=2026-10'))).status,403);
  assert.equal((await api.POST(new Request('https://synthetic.invalid/api/kidkare/submissions',{method:'POST',body:'{}'}))).status,403);
  setupApi();assert.equal((await api.POST(new Request('https://synthetic.invalid/api/kidkare/submissions',{method:'POST',body:JSON.stringify({date:'2026-10-31',status:'Submitted',expectedRevision:0,locationId:home})}))).status,400);
  assert.equal((await api.GET(new Request('https://synthetic.invalid/api/kidkare/submissions?month=invalid'))).status,400);
});
test('monthly upload is encrypted and linked to the selected home/month with the CACFP retention policy', async () => {
  setupApi();const response=await documentApi.POST(uploadRequest());assert.equal(response.status,200,await response.text());
  assert.equal(uploaded.length,1);assert.equal(uploaded[0].bytes.toString(),'encrypted synthetic image');
  assert.ok(uploaded[0].path.startsWith(`${org}/${home}/`));
  assert.equal(inserted[0].source_reference,'2026-10');assert.equal(inserted[0].source_system,'KidKare');assert.equal(inserted[0].child_id,null);
  assert.equal(inserted[0].retention_until,'2029-10-31');assert.equal(inserted[0].confidentiality,'Location Leadership');
  assert.ok(queries.some(q=>q.table==='retention_policies'&&q.filters.some(([k,v])=>k==='document_type'&&v==='CACFP / Meal Record')));
});
test('invalid screenshot, file size, month, location type and denied access never upload a file', async () => {
  for(const options of [{month:'2099-01'},{month:'2026-13'},{type:'application/pdf'},{bytes:new Uint8Array([1,2,3])},{bytes:new Uint8Array(helper.KIDKARE_SCREENSHOT_LIMIT+1)}]) {
    setupApi();assert.equal((await documentApi.POST(uploadRequest(options))).status,400);assert.equal(uploaded.length,0);
  }
  setupApi();homeType='School Age Center';assert.equal((await documentApi.POST(uploadRequest())).status,400);assert.equal(uploaded.length,0);
  setupApi();globalThis.kidkareAuth.userClient.rpc=async()=>({data:false});assert.equal((await documentApi.POST(uploadRequest())).status,403);assert.equal(uploaded.length,0);
  setupApi();globalThis.kidkareAuth.isOwner=false;assert.equal((await documentApi.POST(uploadRequest())).status,403);assert.equal(uploaded.length,0);
});
test('retries reuse an existing monthly screenshot and failed metadata writes clean up only the new upload', async () => {
  setupApi();duplicate={id:id(12)};assert.equal((await documentApi.POST(uploadRequest())).status,200);assert.equal(uploaded.length,0);assert.equal(inserted.length,0);
  setupApi();recordError=true;assert.equal((await documentApi.POST(uploadRequest())).status,500);assert.deepEqual(removed,[uploaded[0].path]);
});
test('monthly overview requests only the selected month and organization', async () => {
  setupApi();const response=await api.GET(new Request('https://synthetic.invalid/api/kidkare/submissions?month=2026-10'));
  assert.equal(response.status,200);const query=queries.find(q=>q.table==='document_records');
  assert.ok(query.filters.some(([k,v])=>k==='source_reference'&&v==='2026-10'));
  assert.ok(query.filters.some(([k,v])=>k==='organization_id'&&v===org));
  assert.equal(response.headers.get('cache-control'),'private, no-store');
});
