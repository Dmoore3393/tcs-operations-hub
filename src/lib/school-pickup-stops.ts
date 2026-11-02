import type {TransportationRoute} from "@/lib/hub-data";
export type SchoolStopRoute=TransportationRoute & {pickupStopId?:string;routeName?:string;stopOrder?:number;pickupArea?:string;dropoffLocation?:string};
export type SchoolPickupStop<T extends SchoolStopRoute=SchoolStopRoute>={key:string;school:string;pickup:string;driver:string;vehicle:string;routes:T[]};
const keyText=(value:string|undefined)=>(value||'').trim().toLowerCase().replace(/\s+/g,' ');
export function groupSchoolPickupStops<T extends SchoolStopRoute>(routes:T[],recurring=false):SchoolPickupStop<T>[]{
 const groups=new Map<string,SchoolPickupStop<T>>();
 for(const route of routes){
  const key=JSON.stringify([route.tripPeriod||'Afternoon',route.tripPeriod==='Morning'?keyText(route.pickupLocation||route.location):'',keyText(route.routeName)||keyText(route.driver),keyText(route.driver),keyText(route.vehicle),keyText(route.school),keyText(route.pickup),keyText(route.pickupArea),recurring?keyText(route.days):'']);
  const group=groups.get(key);if(group)group.routes.push(route);else groups.set(key,{key,school:route.school,pickup:route.pickup,driver:route.driver,vehicle:route.vehicle,routes:[route]});
 }
 return [...groups.values()].sort((a,b)=>Math.min(...a.routes.map(route=>route.stopOrder||999))-Math.min(...b.routes.map(route=>route.stopOrder||999))||a.pickup.localeCompare(b.pickup)||a.school.localeCompare(b.school));
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
