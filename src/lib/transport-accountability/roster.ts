import {emptyPlan,schoolTime,type Day,type Trip,type Plan,type Person,type Settings} from './model';
import {transportServiceDate,transportTimeInput} from '../transportation-day';
import {normalizeLocation} from '../location-config';
export type RosterChild={created_at?:string;id:string;legacy_id:string;location_id:string;first_name:string;last_name:string;age_group:string;enrollment_status:string;school_name:string;record_data:Record<string,unknown>};
export type RosterLocation={id:string;name:string};
/** Start with enrollment, never route membership. Retain existing trips even after archival/transfer. */
export function reconcileRoster(day:Day,children:RosterChild[],routes:{child_id:string|null;record_data:Record<string,unknown>}[],locations:RosterLocation[],people:Person[],settings:Settings,date:string,now:string){
 for(const child of children){
  const data=child.record_data,school=(data.schoolAgeSupport||{}) as {schoolName?:string;grade?:string};
  const applicable=child.age_group==='School Age'||data.ageGroup==='School Age'||Boolean(child.school_name||school.schoolName)||/^(tk|k|kindergarten|[1-9]|1[0-2])$/i.test(school.grade||'');
  if(child.enrollment_status!=='Active'||!applicable)continue;
  if(child.created_at&&transportServiceDate(new Date(child.created_at))>date)continue;
  if(typeof data.plannedStartDate==='string'&&data.plannedStartDate>date)continue;
  if(typeof data.plannedLastDay==='string'&&data.plannedLastDay<date)continue;
  for(const period of ['Morning','Afternoon'] as const){
   const key=`${child.id}:${period}`,existing=day.trips.find(t=>t.key===key);
   const location=locations.find(l=>l.id===child.location_id)?.name||'Location not recorded';
   if(existing){
    // A transfer cannot silently move a published trip. It becomes a visible exception.
    if(existing.locationId!==child.location_id&&existing.stage!=='received'&&date>=transportServiceDate(new Date(now))){existing.locationId=child.location_id;existing.location=location;existing.problem=`Enrollment location changed to ${location}. Danielle must review pickup and destination.`;existing.problemAt=now;}
    continue;
   }
   const route=routes.find(r=>r.child_id===child.id&&(r.record_data.tripPeriod||'Afternoon')===period)?.record_data||{};
   const matching=people.filter(p=>p.driver&&(route.driverLaneId?p.laneId===route.driverLaneId:p.name===route.driver));
   const driver=matching.length===1?matching[0]:undefined,destination=period==='Morning'?String(school.schoolName||child.school_name||route.school||''):String(route.dropoffLocation||location);
   const plan:Plan={...emptyPlan(),school:String(school.schoolName||child.school_name||route.school||''),pickupLocation:period==='Morning'?String(route.pickupLocation||location):String(school.schoolName||child.school_name||route.school||''),destination,destinationId:period==='Morning'?'':locations.find(l=>normalizeLocation(l.name)===normalizeLocation(destination))?.id||'',driverId:driver?.id||'',vehicle:String(route.vehicle||''),pickup:transportTimeInput(String(route.pickup||'')),arrival:transportTimeInput(String(route.dropoff||'')),route:String(route.routeName||''),seating:String(data.transportRestraint||'')};
   const t:Trip={key,childId:child.id,childName:`${child.first_name} ${child.last_name}`,locationId:child.location_id,location,grade:school.grade||'',classroom:String(data.classroom||''),period,decision:'unresolved',plan,revision:0,publishedRevision:0,ackRevision:0,pendingDriverIds:[],stage:'awaiting_pickup',problem:'',problemAt:'',problemAcknowledgedAt:'',pickedUpAt:'',arrivedAt:'',receivedAt:'',receivedBy:'',receivedAdult:'',lastAt:'',sweptAt:'',changeReason:''};
   const usual=settings.usualDecisions?.[key];
   // Only explicitly confirmed children get a usual decision. New enrollments remain unresolved.
   if(usual&&usual.effectiveFrom<=date&&typeof usual.reason==='string'&&usual.reason.trim()&&usual.confirmedBy&&usual.confirmedAt&&['needs_transport','no_transport'].includes(usual.decision)){t.decision=usual.decision;t.plan.reason=usual.reason;t.changeReason='Usual plan: '+usual.reason;t.lastAt=usual.confirmedAt;t.revision=1;}
   const schedule=schoolTime(settings,t,date);if(period==='Afternoon'){t.plan.dismissal=schedule.time;t.plan.scheduleLabel=schedule.label;}
   day.trips.push(t);
  }
 }
 return day;
}
