import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source=path=>readFile(path,'utf8');
const url=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64');
const dayUrl=url((await source('src/lib/transportation-day.ts')));
const routeSource=(await source('src/app/api/transportation-day/route.ts'))
 .replace('"@/lib/transportation-day"',JSON.stringify(dayUrl))
 .replace(/import \{flushTransportAssignmentNotices\}[^;]+;/,'const flushTransportAssignmentNotices=(...args)=>globalThis.pushFixture.flush(...args);')
 .replace(/import \{requireStaff,staffErrorResponse\}[^;]+;/,'const requireStaff=async()=>globalThis.pushFixture.auth;const staffErrorResponse=e=>e instanceof Response?e:Response.json({error:String(e)},{status:500});');
const api=await import(url(routeSource));
const request=(action,extra={})=>new Request('https://hub.test/api/transportation-day',{method:'POST',body:JSON.stringify({routeId:'00000000-0000-4000-8000-000000000001',date:'2030-01-07',action,expectedVersion:0,...extra})});
function setup(){
 const fixture={saved:false,dispatched:false,calls:[],auth:{isOwner:true,isLicensee:false,profile:{organization_id:'org'},user:{id:'admin'}}};
 fixture.auth.admin={rpc:async(name,args)=>{fixture.calls.push({name,args});fixture.saved=true;return {data:1,error:null}}};
 fixture.flush=async auth=>{assert.equal(auth,fixture.auth);assert.equal(fixture.saved,true);await new Promise(setImmediate);fixture.dispatched=true;};
 globalThis.pushFixture=fixture;return fixture;
}
for(const action of ['save','callout','restore'])test(`${action} awaits server push dispatch before returning without any driver session`,async()=>{
 const fixture=setup();const response=await api.POST(request(action));assert.equal(response.status,200);assert.equal(fixture.dispatched,true);assert.equal(fixture.calls.length,1);
});
test('unauthorized or failed daily changes never dispatch',async()=>{
 let f=setup();f.auth.isOwner=false;assert.equal((await api.POST(request('callout'))).status,403);assert.equal(f.dispatched,false);
 f=setup();f.auth.admin.rpc=async()=>({error:{message:'Daily route changed'},data:null});assert.equal((await api.POST(request('callout'))).status,409);assert.equal(f.dispatched,false);
});
test('a location licensee can immediately dispatch their authorized call-out',async()=>{
 const f=setup();f.auth.isOwner=false;f.auth.isLicensee=true;assert.equal((await api.POST(request('callout',{reason:'sick'}))).status,200);assert.equal(f.dispatched,true);
});

const worker=await source('public/sw.js');
for(const open of [false,true])test(`service worker displays push with the app ${open?'open':'closed'}`,async()=>{
 const listeners={},shown=[],opened=[],focused=[];let pending;
 const self={addEventListener:(name,fn)=>listeners[name]=fn,registration:{showNotification:async(title,options)=>shown.push({title,options})},clients:{matchAll:async()=>open?[{navigate:href=>opened.push(href),focus:()=>focused.push(true)}]:[],openWindow:async href=>opened.push(href)}};
 vm.runInNewContext(worker,{self});
 const payload={title:'Transportation cancelled',body:'Synthetic Child • No transportation today',href:'/transportation?routeDate=2030-01-07',tag:'synthetic-callout'};
 listeners.push({data:{json:()=>payload},waitUntil:promise=>pending=promise});await pending;
 assert.equal(shown.length,1);assert.equal(shown[0].title,payload.title);assert.equal(shown[0].options.body,payload.body);
 listeners.notificationclick({notification:{data:shown[0].options.data,close(){}},waitUntil:promise=>pending=promise});await pending;
 assert.deepEqual(opened,[payload.href]);assert.equal(focused.length,open?1:0);
});

// Exercise the actual server transport delivery without a browser/window or user session.
const serverSource=await source('src/lib/server/notifications.ts');
const ast=ts.createSourceFile('notifications.ts',serverSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const names=new Set(['parsePushSubscriptions','savePushSubscriptions','deliverPushChannels','deliverStoredTransportAlert']);
const declarations=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.has(node.name?.text)).map(node=>node.getText(ast)).join('\n');
const server=await import(url(`
 const MAX_PUSH_SUBSCRIPTIONS=8,PUSH_KEY='tcs_push_subscriptions';
 const withStaffBackupLocations=async(_admin,p)=>p;
 const canReceiveHubNotification=()=>true;
 const quietHoursActive=p=>p.quietHoursEnabled;
 const loadNotificationState=async()=>globalThis.deliveryFixture.state;
 const sendWebPush=async(subscription,payload)=>{globalThis.deliveryFixture.sent.push({subscription,payload});return {ok:true,stale:false}};
 const parseNativePushRegistrations=()=>[];const sendApplePush=async()=>{};const saveNativePushRegistrations=async()=>{};
 ${declarations}
`));
test('stored route and cancellation notices use background Web Push for registered devices',async()=>{
 const user={id:'driver',app_metadata:{tcs_push_subscriptions:[{endpoint:'https://push.example.test/synthetic',keys:{p256dh:'synthetic',auth:'synthetic'}}]}};
 const f={state:{user,preferences:{enabled:true,transportation:true,quietHoursEnabled:false}},sent:[]};globalThis.deliveryFixture=f;
 const admin={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{is_active:true},error:null})})})}),auth:{admin:{getUserById:async()=>({data:{user}})}}};
 for(const title of ['Your route assignment','Transportation cancelled','Transportation restored'])await server.deliverStoredTransportAlert(admin,user.id,{title,body:'Synthetic change',href:'/transportation',eventKey:title});
 assert.equal(f.sent.length,3);assert.equal(f.sent[1].payload.title,'Transportation cancelled');
 f.state.preferences.transportation=false;await server.deliverStoredTransportAlert(admin,user.id,{title:'Disabled'});assert.equal(f.sent.length,3);
});
