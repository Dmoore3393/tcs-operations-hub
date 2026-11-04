import type {TransportationRoute} from "@/lib/hub-data";
export type DayRoute=TransportationRoute & {routeName?:string;stopOrder?:number;dropoffLocation?:string;runDate?:string;runStatus?:string};
export type TransportCalloutReason='sick'|'no_transportation';
export type TransportDayStop={route_id:string;service_date:string;snapshot:DayRoute;plan_data:Partial<DayRoute>;is_planned:boolean;called_out:boolean;callout_reason?:TransportCalloutReason|null;version:number;updated_by_name:string;updated_at:string};
export type TransportDayEntry={routeId:string;route:DayRoute;calledOut:boolean;version:number;by:string;at:string;linkedChild:boolean};
export function validTransportDate(date:string){return /^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date+"T12:00:00Z"))&&new Date(date+"T12:00:00Z").toISOString().slice(0,10)===date;}
export function scheduledOnDate(days:string,date:string){
 if(!validTransportDate(date))return false;
 const index=new Date(date+"T12:00:00Z").getUTCDay();const names=['sun','mon','tue','wed','thu','fri','sat'];
 const text=(days||'').toLowerCase().replace(/[–—]/g,'-').replace(/monday/g,'mon').replace(/tuesday/g,'tue').replace(/wednesday/g,'wed').replace(/thursday/g,'thu').replace(/friday/g,'fri').replace(/saturday/g,'sat').replace(/sunday/g,'sun');
 if(!text.trim()||/every\s*day|daily|all days/.test(text))return true;
 if(/weekdays|m-f/.test(text)&&index>=1&&index<=5)return true;
 if(/weekends/.test(text)&&[0,6].includes(index))return true;
 for(const match of text.matchAll(/(sun|mon|tue|wed|thu|fri|sat)\s*-\s*(sun|mon|tue|wed|thu|fri|sat)/g)){const start=names.indexOf(match[1]),end=names.indexOf(match[2]);if(start<=end?index>=start&&index<=end:index>=start||index<=end)return true;}
 const singles=text.replace(/(sun|mon|tue|wed|thu|fri|sat)\s*-\s*(sun|mon|tue|wed|thu|fri|sat)/g,'');return singles.includes(names[index]);
}
export function mergeTransportDay<T extends DayRoute>(routes:T[],stops:TransportDayStop[],date:string):T[]{
 const byId=new Map(stops.filter(stop=>stop.service_date===date).map(stop=>[String(stop.snapshot.id),stop]));
 return routes.filter(route=>{const stop=byId.get(String(route.id));const onboard=route.runDate===date&&['Picked Up','Arrived'].includes(route.runStatus||'');return onboard||(!stop?.called_out&&route.status!=="Not Riding"&&(stop?.is_planned||scheduledOnDate(route.days,date)));}).map(route=>({...route,...byId.get(String(route.id))?.plan_data}));
}

/** Keep day-only absences in the assigned driver's list, with that day's overrides. */
export function transportDayCallouts(routes:DayRoute[],stops:TransportDayStop[],date:string):TransportDayStop[]{
 const byId=new Map(routes.map(route=>[String(route.id),route]));
 return stops.filter(stop=>stop.service_date===date&&stop.called_out).flatMap(stop=>{
  const route=byId.get(String(stop.snapshot.id))||stop.snapshot;
  // A stale/offline call-out must never replace a custody or completed-trip record.
  if(route.runDate===date&&['Picked Up','Arrived','Checked In','Dropped Off'].includes(route.runStatus||''))return [];
  if(route.status==='Not Riding'||(!stop.is_planned&&!scheduledOnDate(route.days,date)))return [];
  return [{...stop,snapshot:{...route,...stop.plan_data}}];
 });
}
export function transportCalloutLabel(stop:Pick<TransportDayStop,'callout_reason'>){
 return stop.callout_reason==='sick'?'No transportation — out sick':'No transportation';
}
