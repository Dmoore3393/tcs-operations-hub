import type { TransportationRoute } from "@/lib/hub-data";
import { transportDriverFor, type TransportDriver } from "@/lib/transport-driver-view";
import { transportPickup, transportDestination, transportTimeLabel as time, type TripRoute } from "@/lib/transport-trips";
import { transportCalloutLabel, type TransportDayStop } from "@/lib/transportation-day";

type ConfirmedRoute = TripRoute & {
  runDate?: string; runStatus?: string; coveringDriver?: string; coveringDate?: string;
  pickedUpAt?: string; arrivedAt?: string; droppedOffAt?: string; checkedInAt?: string;
  pickedUpBy?: string; arrivedBy?: string; droppedOffBy?: string; checkedInBy?: string;
  runHistory?: Array<{ date: string; status: string; at: string; location: string }>;
};
function confirmation(route: ConfirmedRoute, date: string) {
  if (route.runDate !== date) return null;
  const stage = route.runStatus;
  const last = route.runHistory?.findLast(item => item.date === date && item.status === stage);
  const pickup = transportPickup(route);
  const dest = transportDestination(route);
  if (stage === "Picked Up") return { label: "On board", where: last?.location || pickup, at: route.pickedUpAt || last?.at, by: route.pickedUpBy, detail: `Heading to ${dest}` };
  if (stage === "Arrived") return { label: "Awaiting handoff", where: last?.location || dest, at: route.arrivedAt || last?.at, by: route.arrivedBy, detail: "Arrived at destination" };
  if (stage === "Checked In" || stage === "Dropped Off") return { label: "Handed off", where: last?.location || dest, at: route.droppedOffAt || route.checkedInAt || last?.at, by: route.droppedOffBy || route.checkedInBy, detail: "Handoff complete" };
  return null;
}

export default function TransportTeamStatus({ routes, callouts, date, staff }: {
  routes: ConfirmedRoute[]; callouts: TransportDayStop[]; date: string; staff: TransportDriver[];
}) {
  const groups = new Map<string, { name: string; routes: ConfirmedRoute[]; callouts: TransportDayStop[] }>();
  function group(route: TransportationRoute) {
    const driver = transportDriverFor(route, date, staff);
    const found = groups.get(driver.key);
    if (found) return found;
    const added = { name: driver.name, routes: [] as ConfirmedRoute[], callouts: [] as TransportDayStop[] };
    groups.set(driver.key, added);
    return added;
  }
  for (const route of routes) group(route).routes.push(route);
  for (const absent of callouts) group(absent.snapshot).callouts.push(absent);
  if (!groups.size) return null;

  return <section id="transportation-status" className="scroll-mt-4 space-y-3" aria-labelledby="transport-status-heading">
    <h2 id="transport-status-heading" className="text-2xl font-black text-emerald-950">Where drivers and children are</h2>
    <p className="text-sm text-slate-700">Updated when staff confirm a pickup, arrival, or handoff. Times are Pacific.</p>
    {Array.from(groups.entries()).sort(([,a],[,b]) => a.name.localeCompare(b.name)).map(([key, driver]) => {
      const entries = driver.routes.map(route => ({ route, event: confirmation(route, date) }));
      const confirmed = entries.filter(row => row.event).sort((a,b) => (Date.parse(b.event?.at || "") || 0) - (Date.parse(a.event?.at || "") || 0));
      const last = confirmed.find(row => row.event?.at && time(row.event.at))?.event;
      const onBoard = confirmed.filter(row => row.event?.label === "On board").length;
      const arriving = confirmed.filter(row => row.event?.label === "Awaiting handoff").length;
      const waiting = entries.filter(row => !row.event);
      const vehicles = [...new Set(driver.routes.map(row => row.vehicle).filter(Boolean))];
      return <article key={key} className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-xl font-bold text-emerald-950"><span translate="no">{driver.name}</span></h3>
          <span className="text-sm font-semibold text-slate-700">{vehicles.join(" · ")}</span>
        </div>
        <p className="mt-1 font-semibold">{last ? `Last confirmed at ${last.where} · ${time(last.at)}` : "No stop confirmed today"}</p>
        <p className="mt-1 text-sm text-slate-700">{onBoard} on board · {arriving} awaiting handoff · {confirmed.length-onBoard-arriving} handed off</p>
        {confirmed.length > 0 && <ul className="mt-3 divide-y divide-slate-200">{confirmed.map(({ route, event }) =>
          <li key={route.id} className="py-2">
            <div className="flex flex-wrap items-baseline gap-x-2"><strong translate="no">{route.child}</strong><span className="font-semibold text-emerald-800">{event?.label}</span></div>
            <p className="text-sm text-slate-800">{[time(event?.at),event?.where,event?.detail].filter(Boolean).join(" · ")}</p>
            {event?.label !== "On board" && route.pickedUpAt && <p className="text-sm text-slate-600">Picked up {time(route.pickedUpAt)} at {route.runHistory?.findLast(item=>item.date===date && item.status==="Picked Up")?.location || transportPickup(route)}</p>}
            {event?.by && event.by !== driver.name && <p className="text-sm text-slate-600">Recorded by <span translate="no">{event.by}</span></p>}
          </li>
        )}</ul>}
        {(waiting.length>0 || driver.callouts.length>0) && <details className="mt-2">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold text-emerald-900">{waiting.length} awaiting pickup · {driver.callouts.length} called out</summary>
          <ul className="space-y-1 text-sm">{waiting.map(({route})=><li key={route.id}><strong translate="no">{route.child}</strong> · Scheduled {route.pickup || "time pending"} at {transportPickup(route)}</li>)}
          {driver.callouts.map(stop=><li key={stop.route_id}><strong translate="no">{stop.snapshot.child}</strong> · {transportCalloutLabel(stop)}</li>)}</ul>
        </details>}
      </article>;
    })}
  </section>;
}
