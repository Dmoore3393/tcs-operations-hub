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
const notificationUrl=url(await source('src/lib/notifications.ts')),teamUrl=url(await source('src/lib/team-access.ts')),locationUrl=url(await source('src/lib/location-config.ts'));
const accessUrl=url((await source('src/lib/notification-access.ts')).replace('"@/lib/team-access"',JSON.stringify(teamUrl)).replace('"@/lib/location-config"',JSON.stringify(locationUrl)).replace('"@/lib/notifications"',JSON.stringify(notificationUrl)));
const names=new Set(['isTransportAlertLeader','parsePushSubscriptions','savePushSubscriptions','deliverPushChannels','deliverStoredTransportAlert']);
const declarations=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.has(node.name?.text)).map(node=>node.getText(ast)).join('\n');
const server=await import(url(`
 const MAX_PUSH_SUBSCRIPTIONS=8,PUSH_KEY='tcs_push_subscriptions';
 const withStaffBackupLocations=async(_admin,p)=>p;
 import {canReceiveHubNotification} from ${JSON.stringify(accessUrl)};
 import {isRequiredTransportConfirmation} from ${JSON.stringify(notificationUrl)};
 import {isEmployeeAccessRole,isOwnerAccessRole,isLicenseeAccessRole} from ${JSON.stringify(teamUrl)};
 const quietHoursActive=p=>p.quietHoursEnabled;
 const loadNotificationState=async()=>globalThis.deliveryFixture.state;
 const sendWebPush=async(subscription,payload)=>{globalThis.deliveryFixture.sent.push({subscription,payload});return {ok:true,stale:false}};
 const parseNativePushRegistrations=user=>user.app_metadata.native||[];const sendApplePush=async(device,payload)=>{globalThis.deliveryFixture.native.push(payload);return {ok:true,stale:false}};const saveNativePushRegistrations=async()=>{};
 ${declarations}
`));
test('stored route and cancellation notices use background Web Push for registered devices',async()=>{
 const user={id:'driver',app_metadata:{tcs_push_subscriptions:[{endpoint:'https://push.example.test/synthetic',keys:{p256dh:'synthetic',auth:'synthetic'}}]}};
 const f={state:{user,preferences:{enabled:true,transportation:true,quietHoursEnabled:false}},sent:[]};globalThis.deliveryFixture=f;
 const admin={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:"Employee",permissions:["transportation"],locations:["All Locations"],is_active:true},error:null})})})}),auth:{admin:{getUserById:async()=>({data:{user}})}}};
 for(const title of ['Your route assignment','Transportation cancelled','Transportation restored'])await server.deliverStoredTransportAlert(admin,user.id,{title,category:'transportation',body:'Synthetic change',href:'/transportation',eventKey:title});
 assert.equal(f.sent.length,3);assert.equal(f.sent[1].payload.title,'Transportation cancelled');
 f.state.preferences.transportation=false;await server.deliverStoredTransportAlert(admin,user.id,{title:'Disabled'});assert.equal(f.sent.length,3);
});

test('confirmed custody reaches registered Web and native phones with the same child, driver, place and actual time',async()=>{
 const user={id:'driver',app_metadata:{native:[{deviceToken:'mock'}],tcs_push_subscriptions:[{endpoint:'https://push.example.test/mock',keys:{p256dh:'mock',auth:'mock'}}]}};
 const f={state:{user,preferences:{enabled:true,transportation:true}},sent:[],native:[]};globalThis.deliveryFixture=f;
 const admin={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:'Employee',permissions:['transportation'],locations:['All Locations'],is_active:true,organization_id:'org'},error:null})})})}),auth:{admin:{getUserById:async()=>({data:{user}})}}};
 const note={category:'transportation',title:'Synthetic Rider picked up',body:'Jan 7, 1:15 PM · Assigned Driver · Gray van. Picked up at School Two. Heading to South.',href:'/transportation?view=all#transportation-status',eventKey:'transport-custody:test'};
 await server.deliverStoredTransportAlert(admin,user.id,note,'another-org');assert.equal(f.native.length,0);assert.equal(f.sent.length,0);
 await server.deliverStoredTransportAlert(admin,user.id,note,'org');
 assert.deepEqual(f.native[0],{title:note.title,body:note.body,href:note.href,tag:note.eventKey});assert.deepEqual(f.sent[0].payload,f.native[0]);
});

const recordApiSource=(await source('src/app/api/transportation-records/route.ts'))
 .replace(/import \{ after \}[^;]+;/,'const after=work=>globalThis.custodySaveFixture.after.push(work);')
 .replace(/import \{ requireStaff, staffErrorResponse \}[^;]+;/,'const requireStaff=async()=>globalThis.custodySaveFixture.auth;const staffErrorResponse=e=>Response.json({error:String(e)},{status:500});')
 .replace(/import \{ flushTransportAssignmentNotices \}[^;]+;/,'const flushTransportAssignmentNotices=async()=>{};')
 .replace(/import \{ flushTransportCustodyPushes \}[^;]+;/,'const flushTransportCustodyPushes=(...args)=>globalThis.custodySaveFixture.flush(...args);');
const recordApi=await import(url(recordApiSource));
test('a custody save schedules server delivery only after the signed-in write commits',async()=>{
 const calls=[];const auth={isOwner:false,isLicensee:false,profile:{organization_id:'org',permissions:['transportation']},admin:{},
  userClient:{rpc:async(name,args)=>{calls.push([name,args]);return {data:1,error:null}}}};
 const f={auth,after:[],flush:async(...args)=>calls.push(args)};globalThis.custodySaveFixture=f;
 const changes=[{routeId:'mock',patch:{runStatus:'Picked Up'}}];
 const post=()=>recordApi.POST(new Request('https://hub.test/api/transportation-records',{method:'POST',body:JSON.stringify({changes})}));
 assert.equal((await post()).status,200);assert.deepEqual(calls,[['patch_transport_records',{p_changes:changes}]]);assert.equal(f.after.length,1);
 await f.after.pop()();assert.deepEqual(calls[1],[auth.admin,'org']);
 auth.userClient.rpc=async()=>({error:{message:'Trip changed'},data:null});assert.equal((await post()).status,409);assert.equal(f.after.length,0);
 auth.profile.permissions=[];assert.equal((await post()).status,403);assert.equal(f.after.length,0);
});

test('leadership pickup and drop-off push with the Hub closed even if optional Hub alerts are muted',async()=>{
 const user={id:'leader',app_metadata:{native:[{deviceToken:'mock'}],tcs_push_subscriptions:[{endpoint:'https://push.example.test/mock',keys:{p256dh:'mock',auth:'mock'}}]}};
 const f={state:{user,preferences:{enabled:false,transportation:false,quietHoursEnabled:true}},sent:[],native:[]};globalThis.deliveryFixture=f;
 let role='Location Licensee',lane=false,active=true,org='org';
 const admin={rpc:async(_name,args)=>({data:lane&&args.p_org===org&&args.p_user===user.id,error:null}),from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role,organization_id:org,is_active:active,locations:['Other'],permissions:[]},error:null})})})}),auth:{admin:{getUserById:async()=>({data:{user}})}}};
 const note={title:'Sample rider',category:'transportation',body:'Confirmed at 2:35 PM',href:'/notifications',location:'North',requiredTransportConfirmation:true,transportOrganizationId:org};
 const deliver=kind=>server.deliverStoredTransportAlert(admin,user.id,{...note,eventKey:'transport-custody:route:'+kind+':1900000000.00'},'org');
 for(const kind of ['pickup','handoff'])await deliver(kind);
 await deliver('arrival');assert.equal(f.native.length,2);assert.equal(f.sent.length,2);
 role='Owner / Admin';await deliver('pickup');assert.equal(f.native.length,3);
 role='Employee';lane=true;await deliver('pickup');assert.equal(f.native.length,4);
 lane=false;await deliver('pickup');active=false;role='Owner / Admin';await deliver('handoff');
 active=true;org='other-org';await deliver('handoff');assert.equal(f.native.length,4);
});
