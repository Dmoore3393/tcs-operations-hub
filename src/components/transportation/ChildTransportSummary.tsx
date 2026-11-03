"use client";

import Link from "next/link";
import { usePersistentState } from "@/hooks/usePersistentState";
import { starterRoutes } from "@/lib/hub-data";
import type { ChildRecord } from "@/lib/children";
import type { SchoolStopRoute } from "@/lib/school-pickup-stops";
import { childSchool, transportChildKey } from "@/lib/transport-child-schools";
import { transportDestination, transportPickup, transportTripPeriod } from "@/lib/transport-trips";

export default function ChildTransportSummary({ child, canManage }: { child: ChildRecord; canManage: boolean }) {
  const [routes, , ready, state] = usePersistentState<SchoolStopRoute[]>("tcs-routes", starterRoutes);
  const childKey = transportChildKey(child);
  const linked = routes.filter(route => route.childId === childKey && route.status !== "Not Riding");
  const base = `/transportation-setup?child=${encodeURIComponent(childKey)}`;
  return <section className="mt-5 space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-base">
    <h3 className="text-xl font-black text-emerald-950">School & Transportation</h3>
    <p>School: <strong translate="no">{childSchool(child) || "School not recorded"}</strong></p>
    <p>Care location: <span translate="no">{child.location}</span></p>
    {state.error ? <p role="alert">{state.error} <button onClick={state.retry} className="min-h-11 underline">Try again</button></p> : !ready ? <p role="status">Loading linked trips… <button onClick={state.retry} className="min-h-11 underline">Try again</button></p> : linked.length ? linked.map(route => <div key={route.id} className="rounded-xl bg-white p-3">
      <p className="font-bold">{transportTripPeriod(route)} · {route.days} · {route.pickup || "Time not set"}</p>
      <p><span translate="no">{transportPickup(route)}</span> → <span translate="no">{transportDestination(route)}</span></p>
      <p>Driver: <span translate="no">{route.driver || "Not assigned"}</span> · {route.vehicle || "Vehicle not assigned"}</p>
      {canManage && <Link className="inline-flex min-h-11 items-center font-bold text-emerald-900 underline" href={`${base}&trip=${transportTripPeriod(route)}&route=${route.id}`}>Edit this trip</Link>}
    </div>) : <p>No regular school trips assigned.</p>}
    {canManage && child.enrollmentStatus === "Active" && <div className="flex flex-wrap gap-2">
      {(["Morning", "Afternoon"] as const).map(period => <Link key={period} href={`${base}&trip=${period}`} className="inline-flex min-h-11 items-center rounded-xl bg-emerald-800 px-4 py-2 font-bold text-white">{period === "Morning" ? "Morning drop-off" : "Afternoon pickup"}</Link>)}
      <Link href={base} className="inline-flex min-h-11 items-center rounded-xl border border-emerald-700 px-4 font-bold text-emerald-900">School & route setup</Link>
    </div>}
  </section>;
}
