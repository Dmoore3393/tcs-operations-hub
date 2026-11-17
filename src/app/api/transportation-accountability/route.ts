import {transportRollout} from '@/lib/transport-accountability/rollout';
import {requireStaff,staffErrorResponse} from '@/lib/server/require-staff';
import {loadTransportAccountability,canSeeTrip,actionNotices,flushAccountabilityNotices,accountabilityEnabled,scanAccountabilityAlerts,isTransportPlanner} from '@/lib/server/transport-accountability';
import {applyCommand,readiness,exceptions,schoolTime,type Command,type Plan,type Settings} from '@/lib/transport-accountability/model';
import {transportServiceDate,validTransportDate,transportTimeInput} from '@/lib/transportation-day';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Vary':'Authorization'};
function bad(error:string,status=400){return Response.json({error},{status,headers});}
function validatePlan(value:unknown):value is Plan{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const keys=['school','pickupLocation','destination','destinationId','driverId','backupDriverId','vehicle','pickup','arrival','dismissal','scheduleLabel','seating','route','reason'];
 return Object.keys(value).length===keys.length&&keys.every(k=>typeof (value as Record<string,unknown>)[k]==='string'&&String((value as Record<string,unknown>)[k]).length<=1000);
}
function validateSettings(s:Settings){
 if(!s||!Array.isArray(s.schedules)||s.schedules.length>500||!Array.isArray(s.backupLeaderIds)||s.backupLeaderIds.some(x=>typeof x!=='string'))return false;
 for(const n of [s.pickupGraceMinutes,s.handoffGraceMinutes,s.escalationMinutes])if(!Number.isInteger(n)||n<1||n>60)return false;
 if(s.schedules.some(r=>!r||typeof r!=='object'||!['id','school','grade','classroom','childId','regular','minimum'].every(k=>typeof r[k as keyof typeof r]==='string')))return false;
 const identities=s.schedules.map(r=>JSON.stringify([r.school?.trim().toLowerCase(),r.grade,r.classroom,r.childId]));if(new Set(identities).size!==identities.length)return false;
 return s.schedules.every(r=>r&&r.school.trim()&&['id','school','grade','classroom','childId','regular','minimum'].every(k=>typeof r[k as keyof typeof r]==='string'&&String(r[k as keyof typeof r]).length<300)&&(!r.regular||transportTimeInput(r.regular))&&(!r.minimum||transportTimeInput(r.minimum))&&Array.isArray(r.weekdays)&&r.weekdays.every(n=>Number.isInteger(n)&&n>=0&&n<=6)&&r.overrides&&typeof r.overrides==='object'&&!Array.isArray(r.overrides)&&Object.keys(r.overrides).length<=500&&Object.entries(r.overrides).every(([date,o])=>validTransportDate(date)&&o&&['minimum','special','closed'].includes(o.kind)&&typeof o.time==='string'&&(!o.time||transportTimeInput(o.time))&&typeof o.reason==='string'&&o.reason.trim().length>0&&o.reason.length<=1000));
}
export async function GET(request:Request){try{
 const c=await requireStaff(request);if(!accountabilityEnabled())return Response.json({enabled:false},{headers});
 if(!c.isOwner&&!c.isLicensee&&!c.profile.permissions.some(p=>['transportation','children_basic','daily_care','schedules','ratios'].includes(p)))return bad('Transportation or receiving-staff access required',403);
 const rollout=await c.admin.from('transport_accountability_rollout').select('enabled_from').eq('organization_id',c.profile.organization_id).maybeSingle();if(rollout.error)return bad('Could not verify transportation cutover. Contact administration.',409);if(!rollout.data)return Response.json({enabled:false},{headers});
 const requestedDate=new URL(request.url).searchParams.get('date')||'';
 const futureReview=validTransportDate(requestedDate)&&requestedDate>=rollout.data.enabled_from;
 const configuration=transportRollout(true,rollout.data.enabled_from,transportServiceDate(),isTransportPlanner(c)||futureReview);
 if(futureReview)configuration.planningDate=requestedDate;
 if(!isTransportPlanner(c))configuration.preparing=false;
 if(!configuration.enabled||new URL(request.url).searchParams.get('configuration')==='1')return Response.json(configuration,{headers});
 const date=new URL(request.url).searchParams.get('date')||transportServiceDate();if(!validTransportDate(date)||date<rollout.data.enabled_from)return bad('Choose a date on or after the new workflow start date');
 const loaded=await loadTransportAccountability(c,date),{day,context}=loaded;
 // Alert scanning is also scheduled; this refresh supplies an additional retry path.
 let alertWarning='';try{await scanAccountabilityAlerts(c.admin,c.profile.organization_id,day,context);}catch{alertWarning='Alert delivery is pending. Contact transportation leadership directly for urgent problems.';}
 const trips=day.trips.filter(t=>canSeeTrip(t,context));
 const events=await c.admin.from('transport_accountability_events').select('id,action,reason,actor_id,created_at,before_data,after_data').eq('organization_id',c.profile.organization_id).eq('service_date',date).order('id',{ascending:false}).limit(100);
 if(events.error)throw new Error(events.error.message);
 return Response.json({enabled:true,operationalFrom:rollout.data.enabled_from,day:{...day,trips},version:loaded.version,settingsVersion:loaded.settingsVersion,settings:context.actor.planner?loaded.settings:undefined,actor:context.actor,people:loaded.context.people.filter(p=>context.actor.planner||trips.some(t=>[t.plan.driverId,t.plan.backupDriverId,t.receivedBy].includes(p.id))),locations:loaded.locations.filter(l=>context.actor.planner||context.actor.locationIds.includes(l.id)),serverAt:context.now,updatedAt:loaded.updatedAt,alertWarning,issues:Object.fromEntries(trips.map(t=>[t.key,[...readiness(t,day.trips,context),...exceptions(t,context)]])),history:(events.data||[]).flatMap(e=>{const visible=e.after_data.trips?.filter((t:import('@/lib/transport-accountability/model').Trip)=>canSeeTrip(t,context)&&JSON.stringify(t)!==JSON.stringify(e.before_data.trips?.find((b:import('@/lib/transport-accountability/model').Trip)=>b.key===t.key)))||[];return visible.length||context.actor.planner?[{id:e.id,action:e.action,reason:e.reason,by:context.people.find(p=>p.id===e.actor_id)?.name||'Staff',at:e.created_at,children:visible.map((t:import('@/lib/transport-accountability/model').Trip)=>t.childName)}]:[];})},{headers});
 }catch(e){return staffErrorResponse(e);}}
export async function POST(request:Request){try{
 const c=await requireStaff(request);if(!accountabilityEnabled())return bad('Transportation accountability has not been activated',409);
 const body=await request.json();if(!validTransportDate(body.date)||!Number.isInteger(body.version)||body.version<0)return bad('Check the date and version');
 const rollout=await c.admin.from('transport_accountability_rollout').select('enabled_from').eq('organization_id',c.profile.organization_id).maybeSingle();if(rollout.error||!rollout.data||rollout.data.enabled_from>body.date)return bad('Transportation ledger is not active for this date',409);
 const loaded=await loadTransportAccountability(c,body.date),{context,day}=loaded;
 if(body.version!==loaded.version)return bad('Transportation changed. Refresh and review before continuing.',409);
 if(body.action==='settings'){
  if(!context.actor.planner)return bad('Only Danielle can edit school schedules and alert settings',403);
  if(!validateSettings(body.settings)||!Number.isInteger(body.settingsVersion)||body.settingsVersion!==loaded.settingsVersion)return bad('Check school times, reasons, alert intervals and settings version');
  if(!body.settings.backupLeaderIds.length||body.settings.backupLeaderIds.some((id:string)=>!context.people.some(p=>p.id===id&&p.leader&&id!==c.user.id)))return bad('Choose at least one active backup leader');
  // Settings CAS and audit share the same database transaction via the dedicated RPC.
  const result=await c.admin.rpc('save_transport_accountability_settings',{p_org:c.profile.organization_id,p_actor:c.user.id,p_version:loaded.settingsVersion,p_document:body.settings,p_day:body.date});
  if(result.error)return bad(result.error.message,/changed/.test(result.error.message)?409:400);
  return Response.json({ok:true},{headers});
 }
 if(body.date<transportServiceDate()&&!['close','reopen','receive','resolve_problem','sweep','ack_problem','problem'].includes(body.action))return bad('Past plans and pickup history cannot be rewritten');
 const todayOnly=['pickup','arriving','arrive','adult_handoff'];if(todayOnly.includes(body.action)&&body.date!==transportServiceDate())return bad('Physical pickups and arrivals can only be confirmed for today');
 if(body.plan&&!validatePlan(body.plan))return bad('Invalid trip details');
 for(const key of ['reason','adult'])if(body[key]!==undefined&&(typeof body[key]!=='string'||body[key].length>1000))return bad('Invalid confirmation details');
 let next;
 if(body.action==='copy'){
  if(!context.actor.planner||!validTransportDate(body.sourceDate)||body.sourceDate>=body.date)return bad('Danielle can copy an earlier plan for review',403);
  if(day.closedAt)return bad('Reopen the day first');
  const previous=await loadTransportAccountability(c,body.sourceDate);
  next=structuredClone(day);
  for(const t of next.trips){if(t.revision||t.publishedRevision||t.stage!=='awaiting_pickup')continue;const p=previous.day.trips.find(x=>x.key===t.key);if(!p)continue;t.plan={...p.plan,reason:''};if(t.period==='Afternoon'){const s=schoolTime(context.settings,t,body.date);t.plan.dismissal=s.time;t.plan.scheduleLabel=s.label;}t.decision='unresolved';}
 }else{
  const cmd=body as Command;
  if(body.action==='save'&&body.plan){
   const target=day.trips.find(t=>t.key===body.key);if(!target)return bad('Trip no longer exists');
   if(body.plan.destinationId&&!loaded.locations.some(l=>l.id===body.plan.destinationId&&l.name===body.plan.destination))return bad('Choose a valid destination location');
   // School calendar remains authoritative; a child override is saved through schedules, not by editing the pickup time.
   if(target.period==='Afternoon'&&target.stage==='awaiting_pickup'){const s=schoolTime(context.settings,{...target,plan:body.plan},body.date);body.plan.dismissal=s.time;body.plan.scheduleLabel=s.label;}
  }
  try{next=applyCommand(day,cmd,context);}catch(e){return bad(e instanceof Error?e.message:'Transportation action rejected');}
 }
 // Retired drivers must acknowledge removal as well as replacement drivers acknowledging assignment.
 const notices=actionNotices(day,next,context,body.action);
 const result=await c.admin.rpc('commit_transport_accountability',{p_org:c.profile.organization_id,p_day:body.date,p_actor:c.user.id,p_action:body.action,p_reason:body.reason||'',p_version:loaded.version,p_document:next,p_notices:notices,p_settings_version:loaded.settingsVersion});
 if(result.error)return bad(result.error.message,/changed/.test(result.error.message)?409:400);
 let alertWarning='';try{await flushAccountabilityNotices(c.admin,c.profile.organization_id);}catch{alertWarning='Saved, but alert delivery is pending. Contact leadership directly for urgent changes.';}
 return Response.json({ok:true,version:result.data,alertWarning},{headers});
 }catch(e){return staffErrorResponse(e);}}
