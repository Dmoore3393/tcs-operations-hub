import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import test from 'node:test';
const url=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const roles=url(await readFile('src/lib/team-access.ts','utf8'));
const config=url(await readFile('src/lib/location-config.ts','utf8'));
const inviteRoleURL=url(await readFile('src/lib/staff-invite-access.ts','utf8'));
const emailErrorsURL=url(await readFile("src/lib/auth-email-errors.ts","utf8"));
const source=(await readFile('src/app/api/team-access/invite/route.ts','utf8')).replace('"@/lib/auth-email-errors"',JSON.stringify(emailErrorsURL)).replace('"@/lib/staff-invite-access"',JSON.stringify(inviteRoleURL)).replace('"@/lib/team-access"',JSON.stringify(roles)).replace('"@/lib/location-config"',JSON.stringify(config)).replace(/import \{ requireOwner, responseFromThrown \} from .*?;/,'const requireOwner=async()=>{if(!globalThis.inviteAuth)throw new Response("Owner required",{status:403});return globalThis.inviteAuth};const responseFromThrown=e=>e instanceof Response?e:Response.json({error:String(e)},{status:500});');
const setupHelpers='const issueStaffSetupLink=async()=>({tokenHash:"synthetic",redirectTo:"https://hub.test/staff-setup?setup=synthetic"});const activateStaffSetupLink=async()=>{};const revokeStaffSetupLink=async()=>{};';
const api=await import(url(source.replace(/import \{ issueStaffSetupLink, activateStaffSetupLink, revokeStaffSetupLink \} from .*?;/,setupHelpers)));
const lane='00000000-0000-4000-8000-000000000001';
let tables,events,race,readError;
function setup(){
 events=[];race=false;readError=false;
 tables={staff_lane_profiles:[{id:lane,organization_id:'org',full_name:'Synthetic Staff',job_title:'Existing Synthetic Position',secondary_title:null,primary_location:null,staff_user_id:null,is_active:true,updated_at:'2026-11-01T00:00:00Z'}],staff_personnel_imports:[{organization_id:'org',lane_id:lane,details:{Email:'SYNTHETIC@EXAMPLE.COM','Private irrelevant field':'must not leak'}}],staff_access:[],staff_invitations:[]};
 const admin={auth:{admin:{async inviteUserByEmail(email,options){events.push({kind:'send',email,options});if(race)tables.staff_lane_profiles[0].staff_user_id='first-linked-account';return{data:{user:{id:'new-account'}},error:null}},async deleteUser(id){events.push({kind:'deleteAuth',id});return {error:null}}}},from(table){let fields,action,patch;const filters=[];const query={select(value){fields=value;return query},eq(k,v){filters.push(row=>row[k]===v);return query},is(k,v){filters.push(row=>row[k]===v);return query},ilike(k,v){filters.push(row=>row[k]?.toLowerCase()===v.toLowerCase());return query},update(value){action='update';patch=value;return query},upsert(value){action='upsert';patch=value;return query},delete(){action='delete';return query},maybeSingle(){return query.then(r=>({...r,data:r.data?.[0]??null}))},then(resolve,reject){
 if(readError&&table==='staff_access'&&!action)return Promise.resolve({data:null,error:{message:'Synthetic read failure'}}).then(resolve,reject);
 let rows=(tables[table]||[]).filter(row=>filters.every(filter=>filter(row)));
 if(action){events.push({kind:action,table,patch});if(action==='update')rows.forEach(row=>Object.assign(row,patch));if(action==='upsert'){tables[table].push({...patch});rows=[patch]}if(action==='delete')tables[table]=tables[table].filter(row=>!rows.includes(row));}
 if(fields&&fields!=='*')rows=rows.map(row=>Object.fromEntries(fields.split(',').map(k=>[k,row[k]])));
 return Promise.resolve({data:rows,error:null}).then(resolve,reject);
 }};return query}};
 globalThis.inviteAuth={admin,user:{id:'owner'},profile:{organization_id:'org'}};
}
const get=()=>api.GET(new Request(`https://hub.test/api/team-access/invite?lane=${lane}`));
const post=extra=>api.POST(new Request('https://hub.test/api/team-access/invite',{method:'POST',body:JSON.stringify({lane_profile_id:lane,full_name:'Synthetic Staff',email:'synthetic@example.com',role:'Employee',locations:['Halcom'],permissions:[],...extra})}));
test('only an owner can prepare or send employee invitations; preparation exposes only the selected contact email',async()=>{
 setup();globalThis.inviteAuth=null;assert.equal((await get()).status,403);assert.equal((await post()).status,403);assert.equal(events.length,0);
 setup();const response=await get(),body=await response.json();assert.equal(response.status,200);assert.equal(body.email,'synthetic@example.com');assert.equal(body.employee.id,lane);assert.equal(body.employee.full_name,'Synthetic Staff');assert.ok(!JSON.stringify(body).includes('must not leak'));assert.match(response.headers.get('Cache-Control'),/no-store/);assert.equal(events.length,0);
 tables.staff_personnel_imports.push({organization_id:'org',lane_id:lane,details:{Email:'alternate@example.com'}});const ambiguous=await (await get()).json();assert.equal(ambiguous.email,'');assert.equal(ambiguous.emailNeedsReview,true);
});
test('a reviewed invitation links the login to the original profile without creating or renaming an employee',async()=>{
 setup();const response=await post();assert.equal(response.status,200,await response.text());assert.equal(tables.staff_lane_profiles.length,1);assert.equal(tables.staff_lane_profiles[0].staff_user_id,'new-account');assert.equal(tables.staff_lane_profiles[0].full_name,'Synthetic Staff');assert.equal(tables.staff_lane_profiles[0].job_title,'Existing Synthetic Position');assert.equal(events.filter(e=>e.kind==='send').length,1);assert.ok(!events.some(e=>e.table==='staff_lane_profiles'&&e.kind==='upsert'));assert.deepEqual(events.find(e=>e.table==='staff_lane_profiles'&&e.kind==='update').patch,{staff_user_id:'new-account'});
 assert.equal((await post()).status,409);assert.equal(events.filter(e=>e.kind==='send').length,1);
});
test('inactive, cross-organization, already linked, renamed, duplicate-email, and invalid-location requests send nothing',async()=>{
 for(const [change,expected] of [[()=>tables.staff_lane_profiles[0].is_active=false,400],[()=>tables.staff_lane_profiles[0].organization_id='elsewhere',400],[()=>tables.staff_lane_profiles[0].staff_user_id='existing',409],[()=>tables.staff_lane_profiles[0].full_name='Different employee',400],[()=>tables.staff_access.push({organization_id:'org',email:'synthetic@example.com',user_id:'existing'}),409]]){setup();change();assert.equal((await post()).status,expected);assert.equal(events.length,0);}
 setup();assert.equal((await post({locations:[]})).status,400);assert.equal((await post({email:'one@example.com,two@example.com'})).status,400);assert.equal(events.length,0);
 setup();readError=true;assert.equal((await post()).status,500);assert.equal(events.length,0);
});
test('a concurrent link cannot be overwritten and an unsuccessful new login is cleaned up',async()=>{
 setup();race=true;const result=await post();assert.equal(result.status,409);assert.equal(tables.staff_lane_profiles[0].staff_user_id,'first-linked-account');assert.equal(tables.staff_access.length,0);assert.ok(events.some(e=>e.kind==='deleteAuth'&&e.id==='new-account'));
});

test('employee invite dialog prefills the saved email, requires a location, and sends only after review',async()=>{
 const {createRequire}=await import('node:module');const {default:vm}=await import('node:vm');const require=createRequire(import.meta.url);
 let cursor=0;const state=[],effects=[],requests=[];let token='synthetic-token',completed=0;
 const react={useState(initial){const slot=cursor++;if(!(slot in state))state[slot]=initial;return[state[slot],value=>state[slot]=typeof value==='function'?value(state[slot]):value]},useRef(initial){return react.useState({current:initial})[0]},useEffect(effect,deps){const slot=cursor++;if(!state[slot]||deps.some((value,i)=>value!==state[slot][i]))effects.push(effect);state[slot]=deps}};
 const deps={react,'next/link':()=>null,'@/components/hub/HubUI':{Modal:()=>null,inputClass:''},'@/components/providers/AuthProvider':{useAuth:()=>({session:{access_token:token}})},'@/lib/hub-request':{hubRequest:async(url,_token,init)=>{requests.push({url,init});return init?{ok:true}:{employee:{id:lane,full_name:'Synthetic Staff',job_title:'Existing Position',primary_location:null},email:'saved@example.com',emailNeedsReview:false}}},'@/lib/location-config':{careLocations:['Halcom','Division']},'@/lib/team-access':{ACCESS_ROLES:['Employee','Location Licensee','Owner / Admin'],DEFAULT_EMPLOYEE_PERMISSIONS:[],EMPLOYEE_PERMISSION_OPTIONS:[]}};
 const context={exports:{},require:name=>deps[name]||require(name)};vm.runInNewContext(ts.transpileModule(await readFile('src/components/employees/EmployeeInviteDialog.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'?[node,...nodes(node.props?.children)]:[];
 const render=()=>{cursor=0;return nodes(context.exports.default({employee:{id:lane,full_name:'Synthetic Staff'},onClose(){},onInvited:async()=>completed++}))};
 const flush=async()=>{for(const effect of effects.splice(0))effect();await new Promise(setImmediate)};
 render();await flush();let tree=render();assert.equal(requests.length,1);assert.equal(tree.find(n=>n.type==='input'&&n.props.type==='email').props.value,'saved@example.com');assert.equal(tree.find(n=>n.type==='button'&&n.props.type==='submit').props.disabled,true);
 tree.find(n=>n.type==='input'&&n.props.type==='email').props.onChange({target:{value:'reviewed@example.com'}});
 token='refreshed-synthetic-token';render();await flush();tree=render();assert.equal(requests.length,1);assert.equal(tree.find(n=>n.type==='input'&&n.props.type==='email').props.value,'reviewed@example.com');
 tree.find(n=>n.type==='input'&&n.props.name==='invite-location').props.onChange();tree=render();assert.equal(tree.find(n=>n.type==='button'&&n.props.type==='submit').props.disabled,false);
 await tree.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(requests.length,2);const body=JSON.parse(requests[1].init.body);assert.equal(body.lane_profile_id,lane);assert.equal(body.full_name,'Synthetic Staff');assert.equal(body.email,'reviewed@example.com');assert.deepEqual(body.locations,['Halcom']);assert.equal(completed,1);
});

test('maintenance invitations preserve job identity and include transportation for all staff',async()=>{
 setup();tables.staff_lane_profiles[0].department='Maintenance';const result=await post({permissions:['children_basic','daily_care','schedules','health_safety','maintenance_view']});assert.equal(result.status,200);assert.deepEqual(events.find(event=>event.kind==='send').options.data.tcs_permissions,['maintenance_view','transportation']);assert.equal(tables.staff_lane_profiles[0].department,'Maintenance');
 setup();tables.staff_lane_profiles[0].department='Maintenance';assert.equal((await post({permissions:['maintenance_manage','schedules']})).status,200);assert.deepEqual(events.find(event=>event.kind==='send').options.data.tcs_permissions,['maintenance_manage','transportation']);
});


test('reviewed maintenance invitations retain transportation and strip unrelated child permissions',async()=>{
 for(const access of ['maintenance_view','maintenance_manage']){
  setup();tables.staff_lane_profiles[0].department='Maintenance';const result=await post({permissions:[access,'transportation','children_basic','schedules','daily_care','health_safety']});assert.equal(result.status,200);assert.deepEqual(events.find(event=>event.kind==='send').options.data.tcs_permissions,[access,'transportation']);
 }
});


test('a recorded executive owner is recommended Owner/Admin and cannot be invited as maintenance-only staff',async()=>{
 setup();Object.assign(tables.staff_lane_profiles[0],{department:'Maintenance',job_title:'Owner • Director of Maintenance',lane_level:1,lane_group:'Executive'});
 const prepared=await(await get()).json();assert.equal(prepared.recommendedRole,'Owner / Admin');assert.equal(events.length,0);
 assert.equal((await post()).status,400);assert.equal(events.length,0);
 const response=await post({role:'Owner / Admin',locations:['All Locations']});assert.equal(response.status,200);
 const sent=events.find(event=>event.kind==='send');assert.equal(sent.options.data.tcs_role,'Owner / Admin');assert.deepEqual(sent.options.data.tcs_locations,['All Locations']);
 setup();Object.assign(tables.staff_lane_profiles[0],{job_title:'Maintenance helper',lane_level:1,lane_group:'Executive'});assert.equal((await(await get()).json()).recommendedRole,'Employee');
});
