import type {TransportationRoute} from './hub-data';
export type TripPeriod='Morning'|'Afternoon';
export type TripRoute=TransportationRoute&{routeName?:string;dropoffLocation?:string;pickupArea?:string};
/** Legacy records are afternoon pickups. Morning schools are external destinations. */
export function transportTripPeriod(route:Pick<TransportationRoute,'tripPeriod'>):TripPeriod{return route.tripPeriod==='Morning'?'Morning':'Afternoon';}
export function transportPickup(route:TripRoute){return transportTripPeriod(route)==='Morning'?(route.pickupLocation||route.location):route.school;}
export function transportDestination(route:TripRoute){return transportTripPeriod(route)==='Morning'?route.school:(route.dropoffLocation||route.location);}
export function transportRouteGroup(route:TripRoute){const name=route.routeName?.trim()||`${route.location} • ${route.driver||'Transportation Route'}`;return transportTripPeriod(route)==='Morning'?`Morning • ${name}`:name;}
