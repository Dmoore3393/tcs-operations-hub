import type {TransportationRoute} from './hub-data';
const pacificClock = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });

export function transportTimeLabel(value?: string) {
  const stamp = Date.parse(value || "");
  return Number.isFinite(stamp) ? pacificClock.format(stamp) : "";
}

export type TripPeriod='Morning'|'Afternoon';
export type TripRoute=TransportationRoute&{routeName?:string;dropoffLocation?:string;pickupArea?:string};
/** Legacy records are afternoon pickups. Morning schools are external destinations. */
export function transportTripPeriod(route:Pick<TransportationRoute,'tripPeriod'>):TripPeriod{return route.tripPeriod==='Morning'?'Morning':'Afternoon';}
export function transportPickup(route:TripRoute){return transportTripPeriod(route)==='Morning'?(route.pickupLocation||route.location):route.school;}
export function transportDestination(route:TripRoute){return transportTripPeriod(route)==='Morning'?route.school:(route.dropoffLocation||route.location);}
/** A school stop is identified by its actual trip details, not a manually named group. */
export function transportRouteGroup(route:TripRoute){
 const parts=[transportTripPeriod(route),route.school?.trim()||'Pickup location not set',route.pickup?.trim()||'Time not set',route.driver?.trim()||'Driver not assigned',route.vehicle?.trim()||'Vehicle not assigned'];
 if(transportTripPeriod(route)==='Morning')parts.push(transportPickup(route));
 return parts.join(' • ');
}

/** Keep the existing duty reference so a display change cannot strand an open staff shift. */
export function transportCoverageGroup(route:TripRoute){const name=route.routeName?.trim()||`${route.location} • ${route.driver||'Transportation Route'}`;return transportTripPeriod(route)==='Morning'?`Morning • ${name}`:name;}
/** Emergency-card filters also accept the saved legacy route reference. */
export function transportEmergencyGroup(route:TripRoute){return route.routeName?.trim()||`${route.location} • ${route.driver||'Transportation Route'}`;}

/** A school stop can contain children from several older route references. */
export function transportEmergencyHref(selected:TripRoute[],recurring:TripRoute[]=[]){
 const byId=new Map(recurring.map(route=>[route.id,route]));
 const query=new URLSearchParams();
 for(const reference of new Set(selected.map(route=>transportEmergencyGroup(byId.get(route.id)||route))))query.append('route',reference);
 return query.size?`/emergency-cards?${query}`:'/emergency-cards';
}
