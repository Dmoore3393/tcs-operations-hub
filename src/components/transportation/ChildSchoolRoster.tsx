"use client";

import { compareChildrenByLastName } from "@/lib/child-sort";

import Link from "next/link";
import { transportPickup, transportDestination, transportTripPeriod } from "@/lib/transport-trips";
import { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { inputClass } from "@/components/hub/HubUI";
import type { ChildRecord } from "@/lib/children";
import type { SchoolRecord, TransportationRoute } from "@/lib/hub-data";
import { childSchool, childSchoolLabel, schoolProfileApplies, transportChildKey, transportCareLocation } from "@/lib/transport-child-schools";
import { hubRequest } from "@/lib/hub-request";

export default function ChildSchoolRoster({ roster, schools, routes, location, canManage, onSaved, onAddTrip, focusChildId = "", onClearFocus }: {
  focusChildId?: string; onClearFocus?: () => void;
  roster: ChildRecord[]; schools: SchoolRecord[]; routes: TransportationRoute[]; location: string; canManage: boolean;
  onSaved: () => Promise<void>; onAddTrip: (child: ChildRecord) => void;
}) {
  const { session } = useAuth();
  const [search, setSearch] = useState("");
  const [view, setView] = useState("transportation");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ child: ChildRecord; school: string; expectedSchool: string } | null>(null);
  const rows = roster.filter(child => child.enrollmentStatus === "Active" && (focusChildId ? transportChildKey(child) === focusChildId : location === "All Locations" || transportCareLocation(child.location) === transportCareLocation(location)))
    .filter(child => Boolean(focusChildId) || view === "all" || (view === "excluded" ? child.noTransportationNeeded === true : child.noTransportationNeeded !== true))
    .filter(child => `${child.firstName} ${child.lastName} ${childSchool(child)} ${child.location}`.toLowerCase().includes(search.toLowerCase())).sort(compareChildrenByLastName);
  async function saveSchool() {
    if (!editing || !session?.access_token || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await hubRequest("/api/transportation-setup", session.access_token, { method: "POST", body: JSON.stringify({ action: "school", childId: transportChildKey(editing.child), school: editing.school, expectedSchool: editing.expectedSchool }) });
      setEditing(null); setNotice("School saved on the existing child profile and linked regular school trips.");
      await onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the school. Try again."); }
    finally { setSaving(false); }
  }
  async function saveTransportation(child: ChildRecord, excluded: boolean) {
    if (!session?.access_token || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await hubRequest("/api/transportation-setup", session.access_token, { method: "POST", body: JSON.stringify({ action: "transportation-needed", childId: transportChildKey(child), excluded, expectedExcluded: child.noTransportationNeeded === true }) });
      setEditing(null);
      setNotice(excluded ? "Saved. This child is removed from transportation planning. Their profile and care enrollment are unchanged." : "Transportation is available again. Add or review their trips before scheduling a ride.");
      await onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save transportation. Try again."); }
    finally { setSaving(false); }
  }
  return <section className="space-y-4 rounded-2xl border border-emerald-200 bg-white p-5 text-base">
    <h2 className="text-2xl font-black text-emerald-950">Children & Schools</h2>
    <p>Check No school / no pickup needed for children who need no TCS rides. They will leave this list, but stay in Children. Children in TK can still have trips. To bring a child back, choose No transportation needed below and uncheck their box.</p>
    {!focusChildId && <label className="block font-bold">Children to show<select aria-label="Children to show" className={`${inputClass} mt-1 min-h-11 text-base`} value={view} onChange={event => setView(event.target.value)}><option value="transportation">Transportation roster</option><option value="excluded">No transportation needed</option><option value="all">All active children</option></select></label>}
    {focusChildId && <button className="min-h-11 font-bold text-emerald-900 underline" onClick={onClearFocus}>Show all children</button>}
    <label className="block font-bold">Find a child<input type="search" className={`${inputClass} mt-1 min-h-11 text-base`} value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, school or care location" /></label>
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-950">{notice}</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-900">{error}</p>}
    <div className="grid gap-3 lg:grid-cols-2">{rows.map(child => {
      const key = transportChildKey(child);
      const linked = routes.filter(route => route.childId === key && route.status !== "Not Riding");
      const isEditing = editing && transportChildKey(editing.child) === key;
      return <article key={key} className="rounded-xl border border-slate-200 p-4">
        <h3 className="text-lg font-black" translate="no">{child.firstName} {child.lastName}</h3>
        <p>Care location: {child.location}</p><p>School: <strong translate={childSchool(child) ? "no" : undefined}>{childSchoolLabel(child)}</strong></p>
        {child.noTransportationNeeded ? <p className="font-bold text-emerald-900">No transportation needed</p> : linked.length ? linked.map(route => <div key={route.id} className="mt-2 rounded-lg bg-emerald-50 p-3"><p className="font-bold">{transportTripPeriod(route)} · {route.days} · {route.pickup || "Time not set"}</p><p>{transportPickup(route)} → {transportDestination(route)}</p><p>{route.driver || "Driver not assigned"} · {route.vehicle || "Vehicle not assigned"}</p></div>) : schoolProfileApplies(child) ? <p>No school trip assigned</p> : <p>School transportation is only needed for children who attend school or TK.</p>}
        {canManage && <label className="mt-2 flex min-h-11 items-center gap-3 font-bold text-emerald-950"><input type="checkbox" className="h-5 w-5 accent-emerald-700" aria-label={`No school / no pickup needed for ${child.firstName} ${child.lastName}`} checked={child.noTransportationNeeded === true} disabled={saving} onChange={event => { void saveTransportation(child, event.target.checked); }} />No school / no pickup needed</label>}
        <Link href={`/children?child=${encodeURIComponent(key)}`} className="inline-flex min-h-11 items-center font-bold text-emerald-900 underline">Open child profile</Link>
        {canManage && <div className="mt-3 flex flex-wrap gap-2">
          <button disabled={saving} onClick={() => { setEditing({ child, school: childSchool(child), expectedSchool: childSchool(child) }); setError(""); }} className="min-h-11 rounded-xl border border-emerald-700 px-4 font-bold text-emerald-900">Choose / change school</button>
          {!child.noTransportationNeeded && <button disabled={saving} onClick={() => onAddTrip(child)} className="min-h-11 rounded-xl bg-emerald-800 px-4 font-bold text-white">Add school trip</button>}
        </div>}
        {isEditing && <form className="mt-3 space-y-3 rounded-xl bg-emerald-50 p-3" onSubmit={event => { event.preventDefault(); void saveSchool(); }}>
          <label className="block font-bold">Child’s school<select aria-label={`School for ${child.firstName} ${child.lastName}`} className={`${inputClass} mt-1 min-h-11 w-full text-base`} value={editing.school} onChange={event => setEditing({ ...editing, school: event.target.value })}>
            <option value="">Not attending school / not recorded</option>
            {schools.filter(school => school.status === "Active" || school.school === editing.school).map(school => <option key={school.school}>{school.school}</option>)}
          </select></label>
          <div className="flex gap-2"><button disabled={saving} className="min-h-11 rounded-xl bg-emerald-800 px-4 font-bold text-white">{saving ? "Saving…" : "Save school"}</button><button type="button" disabled={saving} onClick={() => setEditing(null)} className="min-h-11 rounded-xl border px-4 font-bold">Cancel</button></div>
        </form>}
      </article>;
    })}</div>
    {!rows.length && <p>No active children match this search and location.</p>}
  </section>;
}
