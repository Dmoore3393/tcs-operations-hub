import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';

const require=createRequire(import.meta.url);
function load(path,deps={},globals={}) {
  const context={exports:{},require:name=>Object.hasOwn(deps,name)?deps[name]:require(name),Response,Request,URL,Intl,Buffer,...globals};
  vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
  return context.exports;
}
const config=load('src/lib/location-config.ts');
const stations=load('src/lib/staff-clock-stations.ts',{'./location-config':config});
const pin=load('src/lib/server/staff-clock-pin.ts',{'server-only':{}},{process:{env:{SUPABASE_SECRET_KEY:'synthetic-test-secret'}}});
const initialNow='2026-11-10T18:00:00.000Z'; // Tuesday, 10 AM Pacific.

function fixture(options={}) {
  let now=initialNow;
  class FixedDate extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return new Date(now).getTime();}}
  const id=options.id??'danielle';
  const user={id,app_metadata:options.noPin?{}:{tcs_clock_pin_hmac:pin.staffClockPinDigest(id,'4567')}};
  const profile={organization_id:'org',user_id:id,full_name:`Synthetic ${id}`,email:`${id}@example.com`,role:options.employee?'Employee':'Owner/Admin',is_active:true,locations:['Halcom']};
  const location={id:'halcom',organization_id:'org',name:'Halcom',full_name:'Halcom',slug:'halcom',is_active:true};
  const settings={organization_id:'org',enforce_schedule_clocking:true,early_clock_in_window_minutes:4,late_clock_out_window_minutes:4,flag_scheduled_hours_overage:true,late_tracking_enabled:true,late_grace_minutes:5,early_departure_tracking_enabled:true,early_departure_grace_minutes:5,flexible_clock_user_ids:options.allow??['danielle','jen','tony']};
  const tables={
    staff_access:[profile,{...profile,user_id:'colleague',full_name:'Synthetic Colleague'},{...profile,user_id:'foreign',organization_id:'other-org'}],
    staff_lane_profiles:options.maintenance?[{staff_user_id:id,organization_id:'org',is_active:true,department:'Maintenance'}]:[],
    locations:[location,{...location,id:'division',slug:'division',name:'Division',full_name:'Division'},{...location,id:'foreign',organization_id:'other-org',name:'33rd Street',full_name:'33rd Street',slug:'33rd-street'}],
    staff_attendance_settings:options.noSettings?[]:[settings],
    staff_shifts:options.shift?[{id:'shift',organization_id:'org',location_id:'halcom',user_id:id,shift_date:'2026-11-10',start_time:options.shift[0],end_time:options.shift[1],status:'Published'}]:[],
    staff_clock_exceptions:[],audit_log:[],staff_performance_events:[],
    staff_performance_event_types:['late_arrival','early_departure','unapproved_shift_overage'].map(code=>({id:code,code,organization_id:'org',is_active:true})),
  };
  const writes=[],reads=[];
  function from(table) {
    assert.ok(table in tables,`Unexpected table ${table}`);
    let rows=[...tables[table]],columns;
    const q={select(value){columns=value.split(',');return q;},
      eq(k,v){rows=rows.filter(row=>row[k]===v);return q;},gte(k,v){rows=rows.filter(row=>row[k]>=v);return q;},
      order(k,{ascending=true}={}){rows.sort((a,b)=>String(a[k]).localeCompare(String(b[k]))*(ascending?1:-1));return q;},
      limit(n){rows=rows.slice(0,n);return q;},
      maybeSingle(){return q.then(result=>({...result,data:result.data?.[0]??null}));},
      async insert(value){
        if(table===options.failWrite)return{error:{message:'Synthetic write failure'}};
        const saved={id:`record-${writes.length}`,...JSON.parse(JSON.stringify(value))};
        tables[table].push(saved);writes.push({table,row:saved});return{data:null,error:null};
      },
      then(resolve,reject){reads.push(table);return Promise.resolve({data:columns?rows.map(row=>Object.fromEntries(columns.map(k=>[k,row[k]]))):rows,error:table===options.failRead?Error('Synthetic read failure'):null}).then(resolve,reject);},
    };return q;
  }
  const auth={admin:{from},userClient:{rpc(){assert.fail('Clock actions must not use the REVIEW/EXPORT-only manual audit RPC');}},user,profile,isOwner:!options.employee,isLicensee:false};
  const api=load('src/app/api/time-clock/route.ts',{'@/lib/location-config':config,'@/lib/staff-clock-stations':stations,'@/lib/server/staff-clock-pin':pin,'@/lib/server/require-staff':{requireStaff:async()=>{if(options.unauthenticated)throw new Response('Missing session',{status:401});return auth;},staffErrorResponse:error=>error instanceof Response?error:Response.json({error:error.message},{status:500})}},{Date:FixedDate});
  const post=(overrides={})=>api.POST(new Request('https://hub.test/api/time-clock',{method:'POST',body:JSON.stringify({event:'clock_in',source:'Flexible Manual',location:'Halcom',pin:'4567',...overrides})}));
  const get=()=>api.GET(new Request('https://hub.test/api/time-clock'));
  return {post,get,tables,writes,reads,setNow(value){now=value;}};
}

test('only explicitly configured active owners get flexible access and GET does not expose the allowlist',async()=>{
  for(const id of ['danielle','jen','tony','another-owner']) {
    const f=fixture({id});const response=await f.get();assert.equal(response.status,200);
    const data=await response.json();assert.equal(data.myClockAccess.flexibleAllowed,id!=='another-owner');
    assert.equal(data.myClockAccess.pinConfigured,true);assert.ok(!JSON.stringify(data).includes('flexible_clock_user_ids'));
  }
  for(const options of [{employee:true},{noSettings:true}])assert.equal((await (await fixture(options).get()).json()).myClockAccess.flexibleAllowed,false);
});

test('each approved owner clocks an unscheduled shift, break, and clock-out with actual server timestamps and their own identity',async()=>{
  for(const id of ['danielle','jen','tony']) {
    const f=fixture({id});
    const first=await f.post({clientTimestamp:'2000-01-01T00:00:00Z',actor_user_id:'forged',organization_id:'other-org',flexibleAllowed:false});
    assert.equal(first.status,200);assert.equal((await first.json()).needsLeadershipReview,false);
    f.setNow('2026-11-10T19:00:00.000Z');assert.equal((await f.post({event:'break_start',source:'Active Shift',pin:''})).status,200);
    f.setNow('2026-11-10T19:15:00.000Z');assert.equal((await f.post({event:'break_end',source:'Active Shift',pin:''})).status,200);
    f.setNow('2026-11-10T22:30:00.000Z');
    const out=await f.post({event:'clock_out',location:'Division'});assert.equal(out.status,200);
    const result=await out.json();assert.equal(result.location,'Halcom');assert.equal(result.needsLeadershipReview,false);
    assert.equal(f.tables.audit_log[0].occurred_at,initialNow);assert.equal(f.tables.audit_log.at(-1).occurred_at,'2026-11-10T22:30:00.000Z');
    for(const row of f.tables.audit_log){assert.equal(row.actor_user_id,id);assert.equal(row.metadata.targetStaffUserId,id);assert.equal(row.organization_id,'org');assert.equal(row.location_id,'halcom');assert.equal(row.table_name,'time_clock');assert.equal(row.action,'CREATE');assert.equal(row.metadata.flexibleClocking,true);assert.ok(!JSON.stringify(row).includes('4567'));}
    assert.equal(f.tables.staff_performance_events.length,0);
    const events=(await (await f.get()).json()).events;assert.equal(events.at(-1).source,'Flexible Manual');assert.equal(events.at(-1).actorUserId,id);
  }
});

test('flexible clocking records offsite work and retains its location on clock-out',async()=>{
  const f=fixture();assert.equal((await f.post({location:'Administration / Offsite'})).status,200);
  f.setNow('2026-11-10T19:00:00.000Z');assert.equal((await f.post({event:'clock_out',location:'Halcom'})).status,200);
  assert.ok(f.tables.audit_log.every(row=>row.location_id===null&&row.metadata.location==='Administration / Offsite'));
});

test('flexible users can start before or after scheduled hours and QR use creates no schedule penalties',async()=>{
  for(const source of ['Flexible Manual','Location QR'])for(const shift of [['14:00','16:00'],['06:00','08:00']]) {
    const f=fixture({shift});assert.equal((await f.post({source})).status,200);
    f.setNow('2026-11-10T23:00:00.000Z');const out=await f.post({event:'clock_out',source});assert.equal(out.status,200);assert.equal((await out.json()).needsLeadershipReview,false);
    assert.equal(f.tables.staff_performance_events.length,0);
  }
});

test('PIN, authentication, configured access, tenant boundaries, and transitions fail closed without writes',async()=>{
  const cases=[
    [{unauthenticated:true},{},401],[{noPin:true},{},409],[{},{pin:'0000'},403],
    [{id:'another-owner'},{flexibleAllowed:true},403],[{employee:true},{},403],[{noSettings:true},{},403],
    [{employee:true},{targetUserId:'jen'},403],[{},{targetUserId:'foreign'},404],
    [{},{location:'33rd Street'},400],[{},{event:'clock_out'},400],
    [{failRead:'staff_attendance_settings'},{},500],
  ];
  for(const [options,body,status] of cases){const f=fixture(options);assert.equal((await f.post(body)).status,status,JSON.stringify({options,body}));assert.equal(f.writes.length,0);}
  const f=fixture();await f.post();assert.equal((await f.post()).status,400);assert.equal(f.writes.length,1);
});

test('regular QR clocking still enforces schedules and site access; valid clock records and late-out review are saved',async()=>{
  for(const options of [{employee:true},{employee:true,shift:['14:00','16:00']},{employee:true,shift:['06:00','08:00']}]){
    const f=fixture(options);assert.equal((await f.post({source:'Location QR'})).status,409);assert.equal(f.writes.length,0);
  }
  const f=fixture({employee:true,shift:['10:00','11:00']});
  assert.equal((await f.post({source:'Location QR',location:'Division'})).status,403);
  assert.equal((await f.post({source:'Location QR'})).status,200);
  f.setNow('2026-11-10T20:00:00.000Z');const out=await f.post({event:'clock_out',source:'Location QR'});
  assert.equal(out.status,200);assert.equal((await out.json()).needsLeadershipReview,true);
  assert.equal(f.tables.audit_log.length,2);assert.equal(f.tables.staff_performance_events.length,1);
  assert.equal(f.tables.audit_log[0].metadata.flexibleClocking,false);
});

test('maintenance manual and owner staff override retain their distinct PIN-protected audit identities',async()=>{
  const m=fixture({id:'maintenance',employee:true,maintenance:true});assert.equal((await m.post({source:'Maintenance Manual',location:'Maintenance / Offsite'})).status,200);
  assert.equal(m.tables.audit_log[0].metadata.clockSource,'Maintenance Manual');
  const a=fixture();assert.equal((await a.post({targetUserId:'colleague',source:'Admin Override',pin:'0000'})).status,403);
  assert.equal((await a.post({targetUserId:'colleague',source:'Admin Override'})).status,200);
  const row=a.tables.audit_log[0];assert.equal(row.actor_user_id,'danielle');assert.equal(row.metadata.targetStaffUserId,'colleague');assert.equal(row.metadata.clockSource,'Admin Override');assert.equal(row.metadata.flexibleClocking,false);
});

test('a failed audit insert does not report a successful clock action',async()=>{
  const f=fixture({failWrite:'audit_log'});const response=await f.post();assert.equal(response.status,500);assert.match((await response.json()).error,/Could not save/);assert.equal(f.writes.length,0);
});

function flatten(node){if(Array.isArray(node))return node.flatMap(flatten);if(!node||typeof node!=='object')return[];if(typeof node.type==='function')return flatten(node.type(node.props));return[node,...flatten(node.props?.children)];}
const Panel=load('src/components/time-clock/FlexibleClockPanel.tsx',{'lucide-react':{LogIn:()=>null,LogOut:()=>null}}).default;
test('flexible panel offers direct personal actions, hides PIN, and prevents duplicate or incomplete actions',()=>{
  const calls=[];const props={locations:['All Locations','Halcom','Division'],location:'Halcom',pin:'4567',pinConfigured:true,state:'Off Clock',busy:false,onClock:event=>calls.push(event),onPinChange:()=>{},onLocationChange:()=>{}};
  let nodes=flatten(Panel(props));let buttons=nodes.filter(node=>node.type==='button');
  assert.equal(buttons[0].props.disabled,false);assert.equal(buttons[1].props.disabled,true);buttons[0].props.onClick();assert.deepEqual(calls,['clock_in']);
  assert.equal(nodes.find(node=>node.type==='input').props.type,'password');assert.ok(nodes.some(node=>node.type==='option'&&node.props.children==='Administration / Offsite'));
  for(const patch of [{pin:''},{pinConfigured:false},{busy:true},{state:'On Break'}])assert.ok(flatten(Panel({...props,...patch})).filter(node=>node.type==='button').every(node=>node.props.disabled));
  nodes=flatten(Panel({...props,state:'Working'}));buttons=nodes.filter(node=>node.type==='button');assert.equal(buttons[0].props.disabled,true);assert.equal(buttons[1].props.disabled,false);buttons[1].props.onClick();assert.deepEqual(calls,['clock_in','clock_out']);assert.equal(nodes.find(node=>node.type==='select').props.disabled,true);
});

test('migration defaults existing organizations to no flexible users and preserves read-only staff policy',async()=>{
  const db=new PGlite();try {
    await db.exec("create role authenticated; create table staff_attendance_settings(organization_id uuid primary key); insert into staff_attendance_settings values('00000000-0000-4000-8000-000000000001'); alter table staff_attendance_settings enable row level security; grant select,update on staff_attendance_settings to authenticated; create policy settings_read on staff_attendance_settings for select to authenticated using(true);");
    const sql=readFileSync('supabase/migrations/20261109052134_flexible_clock_access.sql','utf8');await db.exec(sql);
    assert.deepEqual((await db.query('select flexible_clock_user_ids from staff_attendance_settings')).rows[0].flexible_clock_user_ids,[]);
    await db.exec('set role authenticated');assert.equal((await db.query("update staff_attendance_settings set flexible_clock_user_ids=array['00000000-0000-4000-8000-000000000002'::uuid] returning *")).rows.length,0);
    await db.exec('reset role');assert.deepEqual((await db.query('select flexible_clock_user_ids from staff_attendance_settings')).rows[0].flexible_clock_user_ids,[]);
    assert.deepEqual((await db.query("select cmd from pg_policies where tablename='staff_attendance_settings'")).rows.map(row=>row.cmd),['SELECT']);
  } finally {await db.close();}
});
