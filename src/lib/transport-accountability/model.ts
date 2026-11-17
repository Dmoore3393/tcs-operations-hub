import {transportTimeInput, validTransportDate} from '../transportation-day';

export type Period='Morning'|'Afternoon';
export type Decision='unresolved'|'needs_transport'|'no_transport'|'absent';
export type Stage='awaiting_pickup'|'with_driver'|'arriving'|'arrived'|'received';
export type Plan={school:string;pickupLocation:string;destination:string;destinationId:string;driverId:string;backupDriverId:string;vehicle:string;pickup:string;arrival:string;dismissal:string;scheduleLabel:string;seating:string;route:string;reason:string};
export type Trip={key:string;childId:string;childName:string;locationId:string;location:string;grade:string;classroom:string;period:Period;decision:Decision;plan:Plan;revision:number;publishedRevision:number;ackRevision:number;pendingDriverIds:string[];stage:Stage;problem:string;problemAt:string;problemAcknowledgedAt:string;pickedUpAt:string;arrivedAt:string;receivedAt:string;receivedBy:string;receivedAdult:string;lastAt:string;sweptAt:string;changeReason:string};
export type Day={trips:Trip[];closedAt:string};
export type SchoolSchedule={id:string;school:string;grade:string;classroom:string;childId:string;regular:string;minimum:string;weekdays:number[];overrides:Record<string,{kind:'minimum'|'special'|'closed';time:string;reason:string}>};
export type UsualDecision={decision:'needs_transport'|'no_transport';reason:string;confirmedBy:string;confirmedAt:string;effectiveFrom:string};
export type Settings={usualDecisions?:Record<string,UsualDecision>;schedules:SchoolSchedule[];backupLeaderIds:string[];pickupGraceMinutes:number;handoffGraceMinutes:number;escalationMinutes:number};
export type Actor={id:string;name:string;planner:boolean;leader:boolean;locationIds:string[]};
export type Person={id:string;name:string;locationIds:string[];driver:boolean;leader:boolean;globalLeader:boolean;laneId?:string};
export type Context={date:string;now:string;actor:Actor;people:Person[];settings:Settings};
export type Command={action:'save'|'publish'|'acknowledge'|'pickup'|'arriving'|'arrive'|'receive'|'adult_handoff'|'problem'|'ack_problem'|'resolve_problem'|'sweep'|'close'|'reopen';key?:string;revision?:number;decision?:Decision;plan?:Plan;reason?:string;adult?:string;confirmed?:boolean};
export const defaultSettings:Settings={schedules:[],backupLeaderIds:[],pickupGraceMinutes:5,handoffGraceMinutes:5,escalationMinutes:5};
export const emptyPlan=():Plan=>({school:'',pickupLocation:'',destination:'',destinationId:'',driverId:'',backupDriverId:'',vehicle:'',pickup:'',arrival:'',dismissal:'',scheduleLabel:'',seating:'',route:'',reason:''});
export const statusLabels:Record<Stage,string>={awaiting_pickup:'Awaiting pickup',with_driver:'With driver',arriving:'Arriving',arrived:'Arrived—awaiting receiving confirmation',received:'Received'};
export const finished=(t:Trip)=>!t.problem&&(t.stage==='received'||(['no_transport','absent'].includes(t.decision)&&Boolean(t.plan.reason.trim())));
export const routeKey=(t:Trip)=>JSON.stringify([t.period,t.plan.driverId,t.plan.vehicle,t.plan.route]);
function requireValue(ok:unknown,message:string):asserts ok {if(!ok)throw new Error(message);}
export function schoolTime(settings:Settings,t:Pick<Trip,'childId'|'grade'|'classroom'|'plan'>,date:string){
 const schedules=settings.schedules.filter(s=>s.school.toLowerCase().trim()===t.plan.school.toLowerCase().trim()&&(!s.childId||s.childId===t.childId)&&(!s.grade||s.grade===t.grade)&&(!s.classroom||s.classroom===t.classroom));
 schedules.sort((a,b)=>(Number(Boolean(b.childId))*4+Number(Boolean(b.classroom))*2+Number(Boolean(b.grade)))-(Number(Boolean(a.childId))*4+Number(Boolean(a.classroom))*2+Number(Boolean(a.grade))));
 // Date overrides on the school apply to everyone unless a more specific date override exists.
 const override=schedules.find(s=>s.overrides[date])?.overrides[date];
 if(override)return {time:override.kind==='closed'?'':transportTimeInput(override.time||schedules[0]?.minimum||''),label:override.kind==='closed'?'School closed':override.kind==='minimum'?'One-time minimum day':'Special dismissal',closed:override.kind==='closed'};
 const s=schedules[0];if(!s)return {time:'',label:'Dismissal not recorded',closed:false};
 const minimum=s.weekdays.includes(new Date(date+'T12:00:00Z').getUTCDay());
 return {time:transportTimeInput(minimum?s.minimum:s.regular),label:minimum?'Recurring minimum day':'Regular dismissal',closed:false};
}
export function readiness(t:Trip,all:Trip[],c:Pick<Context,'settings'|'date'|'people'>):string[]{
 if(t.decision==='unresolved')return ['Transportation decision missing'];
 if(t.decision!=='needs_transport')return t.plan.reason.trim()?[]:['Reason / confirmation source missing'];
 const p=t.plan,issues:string[]=[];
 if(!c.settings.backupLeaderIds.length)issues.push('Backup alert leadership missing');
 if(!p.school.trim())issues.push('School missing');
 if(!p.driverId||!c.people.some(x=>x.id===p.driverId&&x.driver))issues.push('Active driver missing');
 if(!p.backupDriverId||!c.people.some(x=>x.id===p.backupDriverId&&x.driver)||p.backupDriverId===p.driverId)issues.push('Separate backup driver missing');
 if(!p.pickupLocation.trim())issues.push('Pickup location missing');
 if(!p.destination.trim())issues.push('Destination missing');
 if(!p.vehicle.trim())issues.push('Vehicle missing');
 if(!p.route.trim())issues.push('Route name missing');
 if(!p.seating.trim())issues.push('Seating information missing');
 const pickup=transportTimeInput(p.pickup),arrival=transportTimeInput(p.arrival);
 if(!pickup||!arrival||arrival<=pickup)issues.push('Valid pickup and later planned arrival required');
 if(t.period==='Afternoon'){
  const s=schoolTime(c.settings,t,c.date);
  if(s.closed)issues.push('School closed: confirm no transportation or review a special trip');
  if(!transportTimeInput(p.dismissal))issues.push('Dismissal time missing');
  if(t.stage==='awaiting_pickup'&&s.time&&p.dismissal!==s.time)issues.push('School schedule changed: review and republish dismissal time');
  if(p.dismissal&&pickup&&pickup<p.dismissal)issues.push('Pickup is before dismissal');
 }
 // Children sharing a route may share stops. Different routes cannot overlap the same driver or vehicle.
 if(pickup&&arrival&&all.some(o=>o.key!==t.key&&o.decision==='needs_transport'&&routeKey(o)!==routeKey(t)&&(o.plan.driverId===p.driverId||o.plan.vehicle===p.vehicle)&&transportTimeInput(o.plan.pickup)<arrival&&transportTimeInput(o.plan.arrival)>pickup))issues.push('Driver or vehicle overlaps another route');
 return issues;
}
export function exceptions(t:Trip,c:Pick<Context,'now'|'date'|'settings'>):string[]{
 const issues:string[]=[];
 if(!t.plan.school.trim())issues.push('School information missing');
 if(t.problem)issues.push('Problem—needs attention: '+t.problem);
 if(t.decision==='unresolved')issues.push('Decision unresolved');
 if(t.revision!==t.publishedRevision)issues.push('Unpublished plan');
 if(t.publishedRevision>0&&(t.ackRevision!==t.publishedRevision&&t.plan.driverId||t.pendingDriverIds.length))issues.push('Awaiting driver acknowledgment');
 const pacific=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(c.now));
 const hm=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Los_Angeles',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(c.now));
 const minutes=(v:string)=>{const [h,m]=v.split(':').map(Number);return h*60+m;};
 if(t.decision==='needs_transport'&&!finished(t)){
  if(t.stage==='awaiting_pickup'&&transportTimeInput(t.plan.pickup)&&(c.date<pacific||(c.date===pacific&&minutes(hm)>minutes(t.plan.pickup)+c.settings.pickupGraceMinutes)))issues.push('Overdue pickup');
  if(t.stage==='arrived'&&Date.parse(c.now)-Date.parse(t.arrivedAt)>c.settings.handoffGraceMinutes*60000)issues.push('Incomplete handoff');
 }
 if(t.pickedUpAt&&transportTimeInput(t.plan.pickup)){const picked=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Los_Angeles',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t.pickedUpAt));if(minutes(picked)>minutes(t.plan.pickup)+c.settings.pickupGraceMinutes)issues.push('Late pickup');}
 if(t.stage==='received'&&!t.sweptAt)issues.push('Vehicle sweep missing');
 return issues;
}
/** Pure state transitions shared by server and behavioral tests. Never trust client timestamps or actor fields. */
export function applyCommand(original:Day,cmd:Command,c:Context):Day{
 requireValue(validTransportDate(c.date),'Invalid service date');
 const d=structuredClone(original),a=c.actor,now=c.now;
 if(cmd.action==='reopen'){requireValue(a.planner&&cmd.reason?.trim(),'Danielle must document why the day is reopened');d.closedAt='';return d;}
 requireValue(!d.closedAt,'Day is closed. Danielle must reopen it with a reason.');
 if(cmd.action==='publish'){
  requireValue(a.planner,'Only Danielle can publish the plan');let count=0;
  for(const t of d.trips)if(t.revision!==t.publishedRevision&&!readiness(t,d.trips,c).length){t.publishedRevision=t.revision;t.lastAt=now;count++;}
  requireValue(count,'No ready changes to publish. Resolve missing information first.');return d;
 }
 if(cmd.action==='close'){
  requireValue(a.planner,'Only Danielle can close the day');
  requireValue(d.trips.every(t=>finished(t)&&t.revision===t.publishedRevision&&!t.pendingDriverIds.length&&(!t.plan.driverId||t.ackRevision===t.publishedRevision)&&(t.stage!=='received'||t.sweptAt)),'Unresolved trips, unacknowledged changes, handoffs or vehicle sweeps prevent closing');d.closedAt=now;return d;
 }
 const t=d.trips.find(x=>x.key===cmd.key);requireValue(t,'Child / trip not found');
 requireValue(cmd.revision===t.revision,'This trip changed. Refresh and review before continuing.');
 const driver=a.id===t.plan.driverId;
 if(cmd.action==='save'){
  requireValue(a.planner,'Only Danielle can change transportation decisions or assignments');
  requireValue(t.stage!=='received','Completed handoff history is locked');
  requireValue(cmd.plan&&['needs_transport','no_transport','absent','unresolved'].includes(cmd.decision||''),'Choose a transportation decision');
  requireValue(t.stage==='awaiting_pickup'||cmd.decision==='needs_transport','A child in custody cannot be cancelled');
  requireValue(!t.publishedRevision||cmd.reason?.trim(),'Document why the published trip is changing');
  requireValue(t.stage==='awaiting_pickup'||(['pickup','dismissal','school','pickupLocation'] as const).every(k=>cmd.plan![k]===t.plan[k]),'Pickup and dismissal details are locked after physical pickup');
  requireValue(t.stage==='awaiting_pickup'||(cmd.plan.driverId===t.plan.driverId&&cmd.plan.vehicle===t.plan.vehicle),'A child in custody requires a documented handoff before changing driver or vehicle');
  requireValue(!t.problem||cmd.decision==='needs_transport','Confirm child whereabouts before cancelling a problem trip');
  if(cmd.decision!=='needs_transport'&&cmd.decision!=='unresolved')requireValue(cmd.plan.reason.trim(),'Record a reason and confirmation source');
  t.pendingDriverIds=[...new Set([...t.pendingDriverIds,t.plan.driverId,cmd.plan.driverId].filter(Boolean))];
  t.plan=structuredClone(cmd.plan);t.decision=cmd.decision!;t.changeReason=cmd.reason?.trim()||'';t.revision++;t.ackRevision=0;t.sweptAt='';t.lastAt=now;return d;
 }
 if(cmd.action==='problem'){
  requireValue(driver||a.leader||a.locationIds.includes(t.locationId)||a.locationIds.includes(t.plan.destinationId),'This trip is outside your assignment');
  requireValue(cmd.reason?.trim(),'Describe the problem');t.problem=cmd.reason!.trim();t.problemAt=now;t.problemAcknowledgedAt='';t.lastAt=now;return d;
 }
 if(cmd.action==='ack_problem'){
  requireValue(a.leader&&(a.planner||a.locationIds.includes(t.locationId)||a.locationIds.includes(t.plan.destinationId))&&(t.problem||exceptions(t,c).some(i=>['Overdue pickup','Incomplete handoff'].includes(i))),'Leadership must acknowledge an open transportation exception');t.problemAcknowledgedAt=now;return d;
 }
 if(cmd.action==='resolve_problem'){
  requireValue(a.planner&&t.problem&&cmd.reason?.trim()&&cmd.adult?.trim()&&cmd.confirmed,'Danielle must confirm the child’s whereabouts, responsible adult, and outcome');
  t.problem='';t.problemAt='';t.problemAcknowledgedAt='';t.changeReason=cmd.reason!.trim()+'; responsible adult: '+cmd.adult!.trim();t.lastAt=now;return d;
 }
 requireValue(t.publishedRevision===t.revision&&t.publishedRevision>0,'Trip changes must be published before continuing');
 if(cmd.action==='acknowledge'){requireValue(driver||t.pendingDriverIds.includes(a.id),'An affected driver must acknowledge this revision');t.pendingDriverIds=t.pendingDriverIds.filter(id=>id!==a.id);if(driver)t.ackRevision=t.publishedRevision;t.lastAt=now;return d;}
 requireValue(t.decision==='needs_transport','This child is not marked for transportation');
 requireValue(!t.problem,'Confirm the problem outcome before continuing');
 requireValue(t.ackRevision===t.revision,'Assigned driver must acknowledge the current plan');
 if(cmd.action==='pickup'){
  requireValue(driver&&t.stage==='awaiting_pickup','Only the assigned driver can confirm this pickup');
  requireValue(!readiness(t,d.trips,c).length,'Trip is incomplete. Contact Danielle');t.stage='with_driver';t.pickedUpAt=now;
 }else if(cmd.action==='arriving'){
  requireValue(driver&&t.stage==='with_driver','Only the assigned driver can mark an onboard child arriving');t.stage='arriving';
 }else if(cmd.action==='arrive'){
  requireValue(driver&&['with_driver','arriving'].includes(t.stage),'Confirm the individual pickup before arrival');t.stage='arrived';t.arrivedAt=now;
 }else if(cmd.action==='receive'){
  requireValue(t.stage==='arrived'&&a.locationIds.includes(t.plan.destinationId)&&!driver,'Receiving staff at the destination must physically confirm this child');t.stage='received';t.receivedAt=now;t.receivedBy=a.id;t.receivedAdult=a.name;
 }else if(cmd.action==='adult_handoff'){
  requireValue(driver&&t.stage==='arrived'&&!t.plan.destinationId&&cmd.adult?.trim()&&cmd.confirmed,'Record the receiving adult and confirm their pickup authorization');t.stage='received';t.receivedAt=now;t.receivedBy=a.id;t.receivedAdult=cmd.adult!.trim();
 }else if(cmd.action==='sweep'){
  requireValue(driver&&cmd.confirmed,'The assigned driver must confirm the final physical vehicle sweep');
  const group=d.trips.filter(o=>routeKey(o)===routeKey(t)&&o.decision==='needs_transport');
  requireValue(group.every(o=>finished(o)&&o.revision===o.publishedRevision&&o.ackRevision===o.revision),'All children on this route must be accounted for before the sweep');
  for(const o of group){o.sweptAt=now;o.lastAt=now;}return d;
 }else throw new Error('Unknown transportation action');
 t.lastAt=now;return d;
}
