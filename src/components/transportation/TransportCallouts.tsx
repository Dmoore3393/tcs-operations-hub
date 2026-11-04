"use client";
import {transportCalloutLabel,type DayRoute,type TransportDayStop} from "@/lib/transportation-day";
import {transportTripPeriod,transportPickup,transportDestination} from "@/lib/transport-trips";
export default function TransportCallouts({stops,date,canRestore=false,onRestore,saving=false,driverFor}:{stops:TransportDayStop[];date:string;canRestore?:boolean;onRestore?:(route:DayRoute)=>void;saving?:boolean;driverFor?:(route:DayRoute)=>{name:string}}){
 const out=stops.filter(stop=>stop.called_out);if(!out.length)return null;
 const dateLabel=new Date(date+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
 return <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-base text-red-950" aria-label={`No transportation for ${dateLabel}`}>
  <h3 className="text-xl font-black"><span>No transportation</span> · <time dateTime={date}>{dateLabel}</time></h3>
  <p className="mt-2">Keep these children on the assigned driver’s list, but skip their pickups for this date.</p>
  <div className="mt-3 grid gap-3 md:grid-cols-2">{out.map(stop=>{const route={...stop.snapshot,...stop.plan_data};return <article key={stop.route_id} className="rounded-xl bg-white p-3">
   <strong><span translate="no" className="contents">{route.child}</span></strong>
   <p className="mt-1 font-bold">{transportCalloutLabel(stop)}</p>
   <p>{transportTripPeriod(route)}: {transportPickup(route)} → {transportDestination(route)}</p>
   <p>Assigned driver: <span translate="no">{driverFor?.(route).name||route.driver||'Not assigned'}</span> · {route.vehicle||'Vehicle not set'}</p>
   <p className="mt-1">Marked by <span translate="no">{stop.updated_by_name}</span></p>
   {canRestore&&onRestore&&<button disabled={saving} onClick={()=>onRestore(route)} className="mt-2 min-h-11 rounded-xl border border-red-300 px-4 py-2 font-bold disabled:opacity-50">Restore transportation</button>}
  </article>;})}</div>
 </section>;
}
