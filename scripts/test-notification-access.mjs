import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const url=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const teamUrl=url(await readFile('src/lib/team-access.ts','utf8')),locationUrl=url(await readFile('src/lib/location-config.ts','utf8')),notificationUrl=url(await readFile('src/lib/notifications.ts','utf8'));
const accessUrl=url((await readFile('src/lib/notification-access.ts','utf8')).replace('"@/lib/team-access"',JSON.stringify(teamUrl)).replace('"@/lib/location-config"',JSON.stringify(locationUrl)).replace('"@/lib/notifications"',JSON.stringify(notificationUrl)));
const {canReceiveHubNotification:allowed,visibleHubNotifications:visible}=await import(accessUrl);
const employee={role:'Employee',locations:['Halcom'],permissions:['children_basic','daily_care','schedules','health_safety']},licensee={role:'Location Licensee',locations:['Halcom'],permissions:[]},owner={role:'Owner / Admin',locations:['All Locations'],permissions:[]};
const item=patch=>({id:'synthetic',category:'system',severity:'attention',title:'Synthetic file notice',body:'Synthetic',href:'/child-file-audits',location:'Halcom',createdAt:'2026-11-01T12:00:00Z',readAt:'',eventKey:'child-file-audit:synthetic:reviewed',...patch});
test('regular staff never receive file, tour or administrative notifications, including inherited inbox entries',()=>{
 for(const notice of [item(),item({href:'/files'}),item({href:'/team-access'}),item({category:'tour',href:'/notifications'}),item({category:'transportation',href:'/payroll-ops'})])assert.equal(allowed({...employee,permissions:[...employee.permissions,'transportation']},notice),false);
 assert.equal(visible(employee,[item()]).length,0);assert.equal(allowed({...employee,permissions:['maintenance_view']},item()),false);
});
test('licensees receive reviewed file alerts only for assigned locations and setup placeholders stay hidden for everyone',()=>{
 assert.equal(allowed(licensee,item()),true);assert.equal(allowed(licensee,item({location:'Division'})),false);assert.equal(allowed(licensee,item({href:'/payroll-ops/private'})),false);
 for(const profile of [employee,licensee,owner])assert.equal(allowed(profile,item({eventKey:'child-file-audit:none:synthetic:2026-11-01'})),false);
 assert.equal(visible(licensee,[item({archivedAt:'2026-11-01T12:00:00Z'})]).length,0);
});
test('staff schedules, shared staff areas and destination arrival alerts remain available',()=>{
 for(const href of ['/my-schedule','/communications','/training-center','/employee-bulletin','/team-store'])assert.equal(allowed(employee,item({href,eventKey:'manual:synthetic'})),true);
 assert.equal(allowed(employee,item({href:'/transportation',category:'transportation',title:'Child arrived',eventKey:'arrival:synthetic'})),true);
 assert.equal(allowed({...employee,permissions:['maintenance_view']},item({href:'/transportation',category:'transportation',title:'Child arrived',eventKey:'arrival:synthetic'})),false);
});
const auditUrl=url(await readFile('src/lib/child-file-audits.ts','utf8')),audit=await import(auditUrl);
const auditSource=await readFile('src/app/api/child-file-audits/alerts/route.ts','utf8');const auditAst=ts.createSourceFile('audit.ts',auditSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const auditNames=new Set(['object','text','stringArray','dayDistance','weekKey','safeAuditItem','safeAudit','latestAudit','dueBucket','buildAlert']);
const functions=auditAst.statements.filter(node=>ts.isFunctionDeclaration(node)&&auditNames.has(node.name?.text)).map(node=>node.getText(auditAst)).join('\n');
const {buildAlert}=await import(url(`import {auditSummary, latestFileAudit} from ${JSON.stringify(auditUrl)};import {normalizeLocation} from ${JSON.stringify(locationUrl)};const AUDIT_LOCATIONS=new Set(['Halcom','Division']);const itemStatuses=new Set(['Not Checked','On File','Missing','N/A']);${functions}\nexport {buildAlert};`));
test('imported children and untouched file templates generate no missing-file warnings',()=>{
 const row={legacy_id:'synthetic-child',record_data:{location:'Halcom'}};assert.equal(buildAlert(row,'2026-11-01'),null);
 const template=audit.createBlankChildFileAudit('Synthetic Staff');assert.equal(buildAlert({...row,record_data:{...row.record_data,fileAudits:[template]}},'2026-11-01'),null);
 template.items[0].status='Missing';const alert=buildAlert({...row,record_data:{...row.record_data,fileAudits:[template]}},'2026-11-01');assert.ok(alert);assert.ok(!alert.eventKey.includes(':none:'));
});
test('a reviewed N/A row never contributes a missing or expiration alert, even with a stored date',()=>{
 for(const template of ['In-Home','School Age Center']){
  const file=audit.createBlankChildFileAudit('Synthetic Reviewer',template);file.nextAuditDue='2031-02-01';
  for(const row of file.items) row.status='On File';
  const [a,b]=file.items;Object.assign(a,{status:'N/A',expirationDate:'2029-11-01'});Object.assign(b,{status:'N/A',expirationDate:'2030-01-10'});
  const input={legacy_id:'synthetic',record_data:{location:template==='In-Home'?'Halcom':'Division',fileAudits:[file]}};
  assert.equal(buildAlert(input,'2030-01-01'),null);
  const extended=file.items.find(item=>item.documentId===42);extended.status='Missing';
  const alert=buildAlert(input,'2030-01-01');assert.match(alert.eventKey,/missing:42/);assert.doesNotMatch(alert.body,/expire/);
 }
});
const serverSource=await readFile('src/lib/server/notifications.ts','utf8'),serverAst=ts.createSourceFile('server.ts',serverSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const serverNames=new Set(['stringArray','minutesFromClock','pacificMinutesNow','quietHoursActive','locationMatches','acceptsManualCategory','targetGroupMatches','dispatchManualHubNotification','dispatchFileAuditOversightNotification']);
const declarations=serverAst.statements.filter(node=>ts.isFunctionDeclaration(node)&&serverNames.has(node.name?.text)).map(node=>node.getText(serverAst)).join('\n');
const dispatch=await import(url(`import {isOwnerAccessRole,isLicenseeAccessRole} from ${JSON.stringify(teamUrl)};import {normalizeLocation} from ${JSON.stringify(locationUrl)};import {canReceiveHubNotification} from ${JSON.stringify(accessUrl)};import {defaultNotificationPreferences} from ${JSON.stringify(notificationUrl)};const MAX_NOTIFICATIONS=100;const loadNotificationState=async(_admin,id)=>({user:{id},inbox:[],preferences:defaultNotificationPreferences});const saveNotificationState=async(_admin,user)=>globalThis.notificationWrites.push(user.id);const deliverPushChannels=async({user})=>globalThis.notificationPushes.push(user.id);${declarations}`));
function admin(){const rows=[{user_id:'owner',...owner},{user_id:'licensee',...licensee},{user_id:'employee',...employee},{user_id:'maintenance',role:'Employee',permissions:['maintenance_view'],locations:['Halcom']}].map(row=>({...row,organization_id:'org',is_active:true}));return{from(){const filters=[];const query={select(){return query},eq(key,value){filters.push([key,value]);return query},then(resolve,reject){return Promise.resolve({data:rows.filter(row=>filters.every(([key,value])=>row[key]===value)),error:null}).then(resolve,reject)}};return query}};}
test('both oversight and All Staff broadcasts filter file recipients before inbox writes and push delivery',async()=>{
 for(const method of ['oversight','manual']){globalThis.notificationWrites=[];globalThis.notificationPushes=[];const args={admin:admin(),organizationId:'org',senderUserId:'owner',title:'Synthetic file reminder',body:'Synthetic',href:'/child-file-audits'};if(method==='oversight')await dispatch.dispatchFileAuditOversightNotification({...args,location:'Halcom',eventKey:'child-file-audit:synthetic:reviewed'});else await dispatch.dispatchManualHubNotification({...args,targetLocation:'Halcom',targetGroup:'All Staff',category:'system'});assert.deepEqual(globalThis.notificationWrites,['owner','licensee']);assert.deepEqual(globalThis.notificationPushes,['owner','licensee']);}
});
const routeSource=(await readFile('src/app/api/notifications/route.ts','utf8'))
 .replace(/import \{ after \} from "next\/server";/,'const after=fn=>fn();')
 .replace(/import \{ flushTransportCustodyPushes \}[^;]+;/,'const flushTransportCustodyPushes=async()=>{};')
 .replace(/import \{flushTransportAssignmentNotices\}[^;]+;/,'const flushTransportAssignmentNotices=async()=>{};').replace('"@/lib/notifications"',JSON.stringify(notificationUrl)).replace('"@/lib/notification-access"',JSON.stringify(accessUrl)).replace(/import \{ dispatchHubNotification, isTransportAlertLeader, loadNotificationState, saveNotificationState \}[^;]+;/,'const isTransportAlertLeader=async()=>false;const dispatchHubNotification=async()=>({});const loadNotificationState=async()=>globalThis.notificationState;const saveNotificationState=async()=>{};').replace(/import \{ requireStaff, staffErrorResponse \}[^;]+;/,'const requireStaff=async()=>globalThis.notificationAuth;const staffErrorResponse=e=>e instanceof Response?e:Response.json({error:String(e)},{status:500});');
const api=await import(url(routeSource));
test('notification API and badge counts exclude inaccessible and archived setup alerts',async()=>{
 globalThis.notificationAuth={admin:{},user:{id:'synthetic'},profile:employee};globalThis.notificationState={user:{id:'synthetic'},preferences:{},inbox:[item(),item({id:'shared',href:'/communications',eventKey:'manual:shared'}),item({id:'setup',eventKey:'child-file-audit:none:synthetic:week'})]};let payload=await(await api.GET(new Request('https://hub.test/api/notifications'))).json();assert.equal(payload.unreadCount,1);assert.deepEqual(payload.notifications.map(item=>item.id),['shared']);
 payload=await(await api.PATCH(new Request('https://hub.test/api/notifications',{method:'PATCH',body:JSON.stringify({markAllRead:true})}))).json();assert.equal(payload.unreadCount,0);assert.equal(payload.notifications.length,1);
});

test('required movement alerts cross sites only for active leaders in the same organization',()=>{
 const notice=item({category:'transportation',eventKey:'transport-custody:route:handoff:1900000000.00',requiredTransportConfirmation:true,transportOrganizationId:'one',href:'/transportation?view=all',location:'South'});
 const profile={...licensee,organization_id:'one',transportAlertLeader:true};
 assert.equal(allowed(profile,notice),true);assert.equal(allowed({...profile,locations:[]},notice),true);
 assert.equal(allowed({...profile,is_active:false},notice),false);assert.equal(allowed({...profile,transportAlertLeader:false},notice),false);
 assert.equal(allowed({...owner,organization_id:'different',transportAlertLeader:true},notice),false);
 assert.equal(allowed(profile,{...notice,eventKey:'manual:forged'}),false);assert.equal(allowed(profile,{...notice,href:'/settings'}),false);
 assert.equal(allowed(profile,{...notice,href:'https://outside.example/transportation'}),false);
});
