"use client";
import type {DayRoute,TransportDayStop} from "@/lib/transportation-day";
export default function TransportCallouts({stops,canRestore,onRestore,saving}:{stops:TransportDayStop[];canRestore:boolean;onRestore:(route:DayRoute)=>void;saving:boolean}){
 const out=stops.filter(stop=>stop.called_out);if(!out.length)return null;
 return <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-base text-red-950"><h2 className="text-xl font-black">Called out today — skip these pickups</h2><p className="mt-2">A child already in transit stays on the handoff list. Complete the handoff and contact leadership.</p><div className="mt-3 grid gap-3 md:grid-cols-2">{out.map(stop=><article key={stop.route_id} className="rounded-xl bg-white p-3"><strong><span translate="no" className="contents">{stop.snapshot.child}</span></strong><p>{stop.snapshot.school} • {stop.snapshot.location}</p><p>Called out by {stop.updated_by_name}</p>{canRestore&&<button disabled={saving} onClick={()=>onRestore(stop.snapshot)} className="mt-2 min-h-11 rounded-xl border border-red-300 px-4 py-2 font-bold">Restore for today</button>}</article>)}</div></section>;
}
