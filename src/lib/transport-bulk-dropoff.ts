import type {DayRoute} from './transportation-day';
import {transportDestination,transportTripPeriod} from './transport-trips';
export type DropoffRoute=DayRoute&{arrivedAt?:string;pickedUpAt?:string;droppedOffAt?:string;checkedInAt?:string;coveringDate?:string;coveringDriver?:string};
export function dropoffGroup(route:DropoffRoute,date:string):string[]{
 const covering=route.coveringDate===date?route.coveringDriver?.trim()||'':'';
 return [transportTripPeriod(route),covering?'':route.driverLaneId||'',covering||route.driver?.trim()||'',route.vehicle?.trim()||'',transportDestination(route).trim().toLowerCase()];
}
export function canSelectDropoff(route:DropoffRoute,date:string){
 const group=dropoffGroup(route,date);
 return route.runDate===date&&route.runStatus==='Arrived'&&Boolean(route.childId)&&Boolean(route.arrivedAt)&&Boolean(route.pickedUpAt)&&!route.droppedOffAt&&!route.checkedInAt&&Boolean(group[2]&&group[3]&&group[4]);
}
export function dropoffGroups(routes:DropoffRoute[],date:string){
 const groups=new Map<string,DropoffRoute[]>();
 for(const route of routes.filter(r=>canSelectDropoff(r,date))){const key=JSON.stringify(dropoffGroup(route,date));const list=groups.get(key)||[];list.push(route);groups.set(key,list);}
 return [...groups.entries()].map(([key,children])=>({key,group:JSON.parse(key) as string[],children}));
}
