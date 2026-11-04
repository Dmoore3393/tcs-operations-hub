import type {TransportationRoute} from "@/lib/hub-data";
export type SchoolStopRoute=TransportationRoute & {pickupStopId?:string;routeName?:string;stopOrder?:number;pickupArea?:string;dropoffLocation?:string};
export type SchoolPickupStop<T extends SchoolStopRoute=SchoolStopRoute>={key:string;school:string;pickup:string;driver:string;vehicle:string;routes:T[]};
const keyText=(value:string|undefined)=>(value||'').trim().toLowerCase().replace(/\s+/g,' ');
function pickupMinutes(value:string){
 const match=value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
 if(!match)return Infinity;
 const hour=Number(match[1]),minute=Number(match[2]||0),period=match[3]?.toLowerCase();
 if(minute>59||hour>(period?12:23)||(period&&hour<1))return Infinity;
 return (period?hour%12+(period==='pm'?12:0):hour)*60+minute;
}
export function groupSchoolPickupStops<T extends SchoolStopRoute>(routes:T[],recurring=false,driverFor?:(route:T)=>{key:string;name:string}):SchoolPickupStop<T>[]{
 const groups=new Map<string,SchoolPickupStop<T>>();
 for(const route of routes){
  const driver=driverFor?.(route);
  const key=JSON.stringify([route.tripPeriod||'Afternoon',route.tripPeriod==='Morning'?keyText(route.pickupLocation||route.location):'',driver?.key||route.driverLaneId||keyText(route.driver),keyText(route.vehicle),keyText(route.school),keyText(route.pickup),keyText(route.pickupArea),recurring?keyText(route.days):'']);
  const group=groups.get(key);if(group)group.routes.push(route);else groups.set(key,{key,school:route.school,pickup:route.pickup,driver:driver?.name||route.driver,vehicle:route.vehicle,routes:[route]});
 }
 return [...groups.values()].sort((a,b)=>Number(a.routes[0].tripPeriod!=='Morning')-Number(b.routes[0].tripPeriod!=='Morning')||Math.min(...a.routes.map(route=>route.stopOrder||999))-Math.min(...b.routes.map(route=>route.stopOrder||999))||pickupMinutes(a.pickup)-pickupMinutes(b.pickup)||a.school.localeCompare(b.school));
}
export function mergeSchoolStopRows<T extends SchoolStopRoute>(current:T[],updates:SchoolStopRoute[]):T[]{
 const patches=new Map(updates.map(row=>[row.id,row]));
 return [...current.map(row=>patches.has(row.id)?{...row,...patches.get(row.id)}:row),...updates.filter(row=>!current.some(existing=>existing.id===row.id)) as T[]];
}
export function newSchoolRouteId(){const values=new Uint32Array(2);crypto.getRandomValues(values);return(values[0]&0xfffff)*4294967296+values[1];}
export function childForSchoolRoute<T extends {id:number;legacyId?:string;firstName:string;lastName:string}>(route:SchoolStopRoute,children:T[]):T|undefined{
 if(route.childId)return children.find(child=>String(child.legacyId||child.id)===String(route.childId));
 const name=keyText(route.child);const matches=children.filter(child=>keyText(`${child.firstName} ${child.lastName}`)===name);return matches.length===1?matches[0]:undefined;
}
