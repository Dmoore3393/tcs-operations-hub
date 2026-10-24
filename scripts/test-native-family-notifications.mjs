import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = p => readFile(new URL('../'+p, import.meta.url),'utf8');
const moduleUrl = s => 'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const familyUrl = moduleUrl(await source('src/lib/family-access.ts'));
let helper = await source('src/lib/server/family-native-notifications.ts');
helper=helper.replace('import "server-only";','')
.replace(/import \{ safeFamilyAccess \} from .*?;/,`import { safeFamilyAccess } from '${familyUrl}';`)
.replace(/import \{ defaultNotificationPreferences, type HubNotification \} from .*?;/,'const defaultNotificationPreferences={enabled:true,transportation:true,emergency:true,schedule:true,quietHoursEnabled:false};')
.replace(/import \{ loadStoredNotificationState, saveStoredNotificationState \} from .*?;/,'const loadStoredNotificationState=async()=>globalThis.fixture.state;const saveStoredNotificationState=async(...args)=>{globalThis.fixture.saved.push(args);};')
.replace(/import \{ nativePushServerReady, parseNativePushRegistrations, sendApplePush \} from .*?;/,'const nativePushServerReady=()=>globalThis.fixture.ready;const parseNativePushRegistrations=u=>u.devices||[];const sendApplePush=async(d,p)=>{globalThis.fixture.pushes.push({device:d,payload:p});return {ok:true};};');
const {notifyAuthorizedFamily}=await import(moduleUrl(helper));
function setup(){
 const adult=(overrides={})=>({id:'parent-1',name:'Synthetic Guardian',email:'guardian@example.test',authUserId:'guardian',status:'Active',permissions:{viewAttendance:true,viewIncidents:true,viewSchedule:true},...overrides});
 const fixture={ready:true,queries:[],pushes:[],saved:[],state:{inbox:[],preferences:{enabled:true,transportation:true,emergency:true,schedule:true,quietHoursEnabled:false}},child:{id:'child-1',organization_id:'demo-org',record_data:{firstName:'Sensitive Child Name',medicalNotes:'Private medical details',familyAccess:[adult()]}},users:{guardian:{id:'guardian',email:'guardian@example.test',devices:[{bundleId:'com.thomasonchildcaresolutions.thehub',deviceToken:'fake-test-token'}]}}};
 globalThis.fixture=fixture;
 const admin={from(table){let filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);fixture.queries.push([table,k,v]);return q},async maybeSingle(){return {data:filters.every(([k,v])=>fixture.child[k]===v)?fixture.child:null,error:null}}};return q},auth:{admin:{getUserById:async id=>({data:{user:fixture.users[id]||null}})}}};
 return {fixture,admin,adult};
}
const send=(admin,extra={})=>notifyAuthorizedFamily({admin,organizationId:'demo-org',childRowId:'child-1',event:'incident',eventKey:'incident:1',...extra});
test('family alerts require the exact child organization',async()=>{const {fixture,admin}=setup();assert.equal((await send(admin,{organizationId:'other-org'})).delivered,0);assert.equal(fixture.pushes.length,0);});
test('paused guardians and guardians without incident permission receive nothing',async()=>{const {fixture,admin,adult}=setup();fixture.child.record_data.familyAccess=[adult({status:'Suspended'}),adult({id:'other',email:'other@example.test',permissions:{viewIncidents:false}})];await send(admin);assert.equal(fixture.pushes.length,0);});
test('a stale or mismatched auth identity cannot receive a child alert',async()=>{const {fixture,admin}=setup();fixture.users.guardian.email='someone-else@example.test';await send(admin);assert.equal(fixture.pushes.length,0);});
test('incident push is generic, uses the approved app, and contains no child or medical details',async()=>{const {fixture,admin}=setup();assert.equal((await send(admin)).delivered,1);assert.equal(fixture.pushes.length,1);assert.equal(fixture.saved[0][1],'guardian');assert.equal(fixture.pushes[0].payload.href,'/support');assert.doesNotMatch(JSON.stringify(fixture.pushes),/Sensitive Child|Private medical/);});
test('repeated incidents are not sent again after a recorded delivery',async()=>{const {fixture,admin}=setup();fixture.state.inbox=[{eventKey:'incident:1'}];await send(admin);assert.equal(fixture.pushes.length,0);});
test('synthetic children never trigger real family notifications',async()=>{const {fixture,admin}=setup();fixture.child.record_data.isAppReviewDemo=true;await send(admin);assert.equal(fixture.pushes.length,0);assert.equal(fixture.saved.length,0);});
test('missing APNs configuration is reported without changing a user inbox',async()=>{const {fixture,admin}=setup();fixture.ready=false;assert.match((await send(admin)).reason,/not configured/);assert.equal(fixture.queries.length,0);assert.equal(fixture.saved.length,0);});
test('disabled alerts and unapproved app bundle IDs are respected',async()=>{let f=setup();f.fixture.state.preferences.enabled=false;await send(f.admin);assert.equal(f.fixture.pushes.length,0);f=setup();f.fixture.users.guardian.devices[0].bundleId='some.other.app';await send(f.admin);assert.equal(f.fixture.pushes.length,0);});
test('pickup and schedule permissions are checked separately',async()=>{const {fixture,admin}=setup();fixture.child.record_data.familyAccess[0].permissions.viewAttendance=false;assert.equal((await send(admin,{event:'pickup'})).delivered,0);assert.equal((await send(admin,{event:'schedule',eventKey:'schedule:1'})).delivered,1);});
let account=await source('src/lib/server/require-notification-account.ts');account=account.replace('import "server-only";','').replace(/import \{ requireStaff \} from .*?;/,'const requireStaff=(...args)=>globalThis.staffCheck(...args);').replace(/import \{ requireParent \} from .*?;/,'const requireParent=(...args)=>globalThis.parentCheck(...args);');
const {requireNotificationAccount}=await import(moduleUrl(account));
test('approved staff can register their own device without a parent lookup',async()=>{globalThis.staffCheck=async()=>({admin:'admin',user:{id:'staff'}});globalThis.parentCheck=async()=>{throw Error('must not be called')};assert.equal((await requireNotificationAccount(new Request('https://hub.test'))).user.id,'staff');});
test('approved parents can register but an unrelated login cannot',async()=>{globalThis.staffCheck=async()=>{throw new Response('not staff',{status:403})};globalThis.parentCheck=async()=>({admin:'admin',user:{id:'parent'}});assert.equal((await requireNotificationAccount(new Request('https://hub.test'))).user.id,'parent');globalThis.parentCheck=async()=>{throw new Response('not linked',{status:403})};await assert.rejects(requireNotificationAccount(new Request('https://hub.test')),e=>e.status===403);});
test('database failures are not mistaken for a parent authorization fallback',async()=>{globalThis.staffCheck=async()=>{throw Error('database unavailable')};globalThis.parentCheck=async()=>{throw Error('must not be called')};await assert.rejects(requireNotificationAccount(new Request('https://hub.test')),/database unavailable/);});
