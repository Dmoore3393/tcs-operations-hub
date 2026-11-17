import 'server-only';
import {transportRollout} from '../transport-accountability/rollout';
import {reconcileRoster} from '../transport-accountability/roster';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {AuthorizedStaff} from './require-staff';
import {isOwnerAccessRole,isLicenseeAccessRole} from '../team-access';
import {defaultSettings,type Day,type Trip,type Settings,type Person,type Context,exceptions} from '../transport-accountability/model';
import {transportServiceDate,transportTimeInput} from '../transportation-day';
import type {HubNotification} from '../notifications';
import {deliverStoredTransportAlert} from './notifications';
type Child={created_at?:string;id:string;legacy_id:string;location_id:string;first_name:string;last_name:string;age_group:string;enrollment_status:string;school_name:string;record_data:Record<string,unknown>};
type Location={id:string;name:string};
export function isTransportPlanner(c:AuthorizedStaff){return c.isOwner&&c.profile.email.toLowerCase()===(process.env.TCS_TRANSPORT_PLANNER_EMAIL||'youngmoore19@gmail.com').toLowerCase();}
export function accountabilityEnabled(){return process.env.TCS_TRANSPORT_ACCOUNTABILITY==='true';}
export async function transportLedgerActive(c:AuthorizedStaff){
 if(!accountabilityEnabled())return false;
 const result=await c.admin.from('transport_accountability_rollout').select('enabled_from').eq('organization_id',c.profile.organization_id).maybeSingle();
 if(result.error)throw new Error('Could not verify transportation cutover. Refresh before continuing.');
 return transportRollout(true,result.data?.enabled_from||null,transportServiceDate(),false).active;
}
function check<T extends {error: {message:string}|null}>(r:T){if(r.error)throw new Error(r.error.message);return r;}
async function collect<T>(page:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:{message:string}|null}>){const data:T[]=[];for(let from=0;;from+=500){const result=check(await page(from,from+499));data.push(...result.data||[]);if((result.data||[]).length<500)return {data,error:null};}}
export async function loadTransportAccountability(c:AuthorizedStaff,date:string){
 const org=c.profile.organization_id;
 const [dayResult,settingResult,childResult,routeResult,locationResult,staffResult,assignmentResult,schoolResult,laneResult]=await Promise.all([
  c.admin.from('transport_accountability_days').select('document,version,updated_at').eq('organization_id',org).eq('service_date',date).maybeSingle(),
  c.admin.from('transport_accountability_settings').select('document,version').eq('organization_id',org).maybeSingle(),
  collect((from,to)=>c.admin.from('children').select('id,legacy_id,location_id,first_name,last_name,age_group,enrollment_status,school_name,record_data,created_at').eq('organization_id',org).order('id').range(from,to)),
  collect((from,to)=>c.admin.from('transportation_routes').select('child_id,record_data').eq('organization_id',org).order('id').range(from,to)),
  c.admin.from('locations').select('id,name').eq('organization_id',org).eq('is_active',true),
  collect((from,to)=>c.admin.from('staff_access').select('user_id,full_name,role,permissions,email').eq('organization_id',org).eq('is_active',true).order('user_id').range(from,to)),
  collect((from,to)=>c.admin.from('staff_location_assignments').select('user_id,location_id').eq('organization_id',org).order('user_id').range(from,to)),
  c.admin.from('hub_state').select('state_value').eq('organization_id',org).eq('state_key','tcs-schools-v2').maybeSingle(),
  c.admin.from('staff_lane_profiles').select('id,staff_user_id').eq('organization_id',org).eq('is_active',true),
 ]);
 for(const r of [dayResult,settingResult,childResult,routeResult,locationResult,staffResult,assignmentResult,schoolResult,laneResult])check(r);
 const locations=(locationResult.data||[]) as Location[],assignments=assignmentResult.data||[],people:Person[]=(staffResult.data||[]).map(s=>({id:s.user_id,laneId:laneResult.data?.find(l=>l.staff_user_id===s.user_id)?.id,name:s.full_name,driver:isOwnerAccessRole(s.role)||s.permissions?.includes('transportation'),leader:isOwnerAccessRole(s.role)||isLicenseeAccessRole(s.role),globalLeader:isOwnerAccessRole(s.role),locationIds:assignments.filter(a=>a.user_id===s.user_id).map(a=>a.location_id)}));
 const planner=isTransportPlanner(c),actor={id:c.user.id,name:c.profile.full_name,planner,leader:c.isOwner||c.isLicensee,locationIds:c.isOwner?locations.map(l=>l.id):people.find(p=>p.id===c.user.id)?.locationIds||[]};
 const settings:Settings=settingResult.data?.document||structuredClone(defaultSettings);
 // Preserve the existing school directory as the default. Settings add date/grade/classroom overrides.
 const directory=Array.isArray(schoolResult.data?.state_value)?schoolResult.data.state_value:[];
 for(const s of directory)if(s.school&&!settings.schedules.some(r=>r.school===s.school&&!r.childId&&!r.grade&&!r.classroom))settings.schedules.push({id:`directory:${s.id}`,school:s.school,grade:'',classroom:'',childId:'',regular:transportTimeInput(s.dismissal||''),minimum:transportTimeInput(s.minimumDay||''),weekdays:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].flatMap((day,i)=>s.minimumDayName===day?[i]:[]),overrides:{}});
 const day:Day=dayResult.data?.document||{trips:[],closedAt:''};
 const children=(childResult.data||[]) as Child[];
 reconcileRoster(day,children,routeResult.data||[],locations,people,settings,date,new Date().toISOString());
 const context:Context={date,now:new Date().toISOString(),actor,people,settings};
 return {day,version:dayResult.data?.version||0,updatedAt:dayResult.data?.updated_at||'',settings,settingsVersion:settingResult.data?.version||0,context,locations,routeTemplates:routeResult.data||[]};
}
export function canSeeTrip(t:Trip,c:Context){return c.actor.planner||c.actor.leader&&(c.actor.locationIds.includes(t.locationId)||c.actor.locationIds.includes(t.plan.destinationId))||t.pendingDriverIds.includes(c.actor.id)||t.plan.driverId===c.actor.id||t.plan.backupDriverId===c.actor.id||c.actor.locationIds.includes(t.plan.destinationId);}
export type Notice={recipient:string;key:string;notification:HubNotification};
function notice(recipient:string,key:string,title:string,body:string,location:string,now:string,urgent=false):Notice{return {recipient,key,notification:{id:key,category:'transportation',severity:urgent?'urgent':'attention',title,body,href:(title==='Child arrived'?'/transportation-arrivals':'/transportation-v2')+'?routeDate='+key.split(':')[1],location,createdAt:now,readAt:'',eventKey:key}};}
export function actionNotices(before:Day,after:Day,c:Context,action:string){
 const notices:Notice[]=[];
 for(const t of after.trips){const prev=before.trips.find(x=>x.key===t.key);if(!prev)continue;
  if(t.publishedRevision!==prev.publishedRevision){
   const recipients=new Set([t.plan.driverId,prev.plan.driverId,...c.people.filter(p=>p.locationIds.includes(t.plan.destinationId)||p.locationIds.includes(prev.plan.destinationId)).map(p=>p.id)]);
   for(const id of recipients)if(id)notices.push(notice(id,`accountability:${c.date}:${t.key}:publish:${t.revision}`,'Transportation plan changed',`${c.date}: ${t.childName}, ${t.period}: ${t.decision}; pickup ${t.plan.pickup}; destination ${t.plan.destination}. Review the published plan.`,t.location,c.now));
  }
  if(t.stage==='arrived'&&prev.stage!=='arrived')for(const p of c.people.filter(p=>p.locationIds.includes(t.plan.destinationId)))notices.push(notice(p.id,`accountability:${c.date}:${t.key}:arrived:${t.revision}`,'Child arrived',`${t.childName} has arrived at ${t.plan.destination}. Physically confirm the child received.`,t.plan.destination,c.now));
  if(t.problem&&t.problem!==prev.problem)for(const p of c.people.filter(p=>p.globalLeader||p.leader&&(p.locationIds.includes(t.locationId)||p.locationIds.includes(t.plan.destinationId))))notices.push(notice(p.id,`accountability:${c.date}:${t.key}:problem:${t.problemAt}`,'Transportation problem—confirm child whereabouts',`${t.childName}: ${t.problem}. Open transportation and confirm the responsible adult and outcome.`,t.location,c.now,true));
 }
 void action;return notices;
}
export async function flushAccountabilityNotices(admin:SupabaseClient,org:string){
 const result=check(await admin.rpc('claim_transport_accountability_notices',{p_org:org}));
 for(const row of result.data||[]){try{
  // In-app history is durable even when the recipient has push notifications disabled.
  await deliverStoredTransportAlert(admin,row.recipient_id,row.notification,org);
  check(await admin.from('transport_accountability_outbox').update({delivered_at:new Date().toISOString(),lease_until:null}).eq('organization_id',org).eq('id',row.id));
 }catch{/* Retain the leased row for retry; never claim a failed dispatch succeeded. */}}
}
export async function scanAccountabilityAlerts(admin:SupabaseClient,org:string,day:Day,c:Context){
 const notices:Notice[]=[];
 for(const t of day.trips){for(const issue of exceptions(t,c).filter(i=>i==='Overdue pickup'||i==='Incomplete handoff'||i.startsWith('Problem—'))){
  const token=issue.startsWith('Problem—')?t.problemAt:String(t.revision),base=issue.startsWith('Problem—')?`accountability:${c.date}:${t.key}:problem:${token}`:`accountability:${c.date}:${t.key}:${issue.split(':')[0]}:${token}`;
  const leaders=c.people.filter(p=>p.globalLeader||p.leader&&(p.locationIds.includes(t.locationId)||p.locationIds.includes(t.plan.destinationId)));for(const p of leaders)notices.push(notice(p.id,base,'Transportation needs attention',`${t.childName}: ${issue}. Confirm the child’s status in transportation.`,t.location,c.now,true));
  const anchor=t.problemAt||t.arrivedAt||t.lastAt;
  if(anchor&&!t.problemAcknowledgedAt&&Date.parse(c.now)-Date.parse(anchor)>=c.settings.escalationMinutes*60000)for(const id of c.settings.backupLeaderIds.filter(id=>c.people.some(p=>p.id===id&&(p.globalLeader||p.locationIds.includes(t.locationId)||p.locationIds.includes(t.plan.destinationId)))))notices.push(notice(id,base+':escalated','Unanswered transportation alert',`${t.childName}: ${issue}. Backup leadership must follow up now.`,t.location,c.now,true));
 }}
 if(notices.length)check(await admin.rpc('queue_transport_accountability_notices',{p_org:org,p_notices:notices}));
 await flushAccountabilityNotices(admin,org);
}
