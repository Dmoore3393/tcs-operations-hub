"use client";

import MainLayout from "@/components/layout/MainLayout";
import { DemoNotice, Modal, PageIntro, PrimaryButton, SecondaryButton, StatCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { dayNames, formatClock, locationThemes, starterLocationHours, summarizeHours, type DayName, type LocationHoursRecord, type LocationKey } from "@/lib/location-config";
import { Building2, Check, MapPin, Palette, Pencil, Plus, Users } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { initialChildren, type ChildRecord } from "@/lib/children";
import { childAttendsLocation, starterChildSchedules, type ChildScheduleRecord } from "@/lib/child-schedules";

type LocationRecord = { id: string; name: string; shortName: Exclude<LocationKey, "All Locations">; type: string; capacity: number; facilityNumber: string; address: string; phone: string; status: "Active" | "Planning" };

const starter: LocationRecord[] = (Object.keys(locationThemes) as LocationKey[]).filter((item): item is Exclude<LocationKey, "All Locations"> => item !== "All Locations").map((key) => ({
  id: key.toLowerCase().replaceAll(" ", "-"),
  name: locationThemes[key].fullName,
  shortName: key,
  type: locationThemes[key].programType,
  capacity: locationThemes[key].capacity,

  facilityNumber: "Add facility number",
  address: key === "Halcom" ? "Lancaster, CA" : "Add site address",
  phone: "(760) 382-5742",
  status: "Active",
}));

export default function LocationsPage() {
  const [locations, setLocations] = usePersistentState<LocationRecord[]>("tcs-locations-v2", starter);
  const [hours, setHours] = usePersistentState<LocationHoursRecord[]>("tcs-location-hours-v2", starterLocationHours);
  const [children] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const [childSchedules] = usePersistentState<ChildScheduleRecord[]>("tcs-child-schedules-v2", starterChildSchedules);
  const { location: activeLocation, setLocation: setActiveLocation } = useHubLocation();
  const [editing, setEditing] = useState<LocationRecord | null>(null);
  const [showModal, setShowModal] = useState(false);

  function openNew() {
    setEditing({ id: `location-${Date.now()}`, name: "", shortName: "42nd Street", type: "Family Childcare", capacity: 14, facilityNumber: "", address: "", phone: "(760) 382-5742", status: "Planning" });
    setShowModal(true);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setLocations((current) => current.some((item) => item.id === editing.id) ? current.map((item) => item.id === editing.id ? editing : item) : [...current, editing]);
    if (!hours.some((item) => item.location === editing.shortName)) setHours((current) => [...current, starterLocationHours.find((item) => item.location === editing.shortName) ?? starterLocationHours[0]]);
    setShowModal(false);
  }

  function updateHours(location: Exclude<LocationKey, "All Locations">, day: DayName, patch: Partial<LocationHoursRecord["days"][DayName]>) {
    setHours((current) => current.map((record) => record.location === location ? { ...record, days: { ...record.days, [day]: { ...record.days[day], ...patch } } } : record));
  }

  const totalCapacity = locations.reduce((sum, item) => sum + item.capacity, 0);
  const activeChildren = useMemo(() => children.filter((child) => child.enrollmentStatus === "Active"), [children]);
  const totalEnrollment = activeChildren.length;
  const todayName = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date()) as DayName;

  return <MainLayout><div className="mx-auto max-w-[1550px] space-y-6">
    <PageIntro eyebrow="Facility management" title="Locations & Operating Hours" description="Enter the actual open and close time for every day. The Daily Ratio Plan uses these hours, and choosing a location changes the Hub’s buttons, headers, highlights, and printable images." actions={<PrimaryButton onClick={openNew}><Plus className="h-4 w-4" /> Add Location</PrimaryButton>} />
    <DemoNotice />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Active Locations" value={locations.filter((item) => item.status === "Active").length} icon={<Building2 className="h-5 w-5" />} />
      <StatCard label="Licensed Capacity" value={totalCapacity} helper="Combined current entries" icon={<Users className="h-5 w-5" />} tone="blue" />
      <StatCard label="Children Enrolled" value={totalEnrollment} helper={`${Math.max(totalCapacity - totalEnrollment, 0)} spaces available`} icon={<Users className="h-5 w-5" />} tone="purple" />
      <StatCard label="Active Theme" value={activeLocation} helper="Selected at the top of every page" icon={<Palette className="h-5 w-5" />} tone="amber" />
    </section>

    <section className="grid gap-5 xl:grid-cols-2">
      {locations.map((location) => {
        const theme = locationThemes[location.shortName];
        const locationHours = hours.find((item) => item.location === location.shortName) ?? starterLocationHours.find((item) => item.location === location.shortName)!;
        const todayHours = locationHours.days[todayName];
        const locationChildren = activeChildren.filter((child) => childAttendsLocation(child, childSchedules.find((record) => record.childId === child.id), location.shortName));
        const locationEnrolled = locationChildren.length;
        const selected = activeLocation === location.shortName;
        return <article key={location.id} className={`overflow-hidden rounded-3xl border bg-white shadow-sm ${selected ? "ring-4" : "border-slate-200"}`} style={selected ? { borderColor: theme.primary, boxShadow: `0 0 0 4px ${theme.primarySoft}` } : undefined}>
          <div className="p-5" style={{ background: `linear-gradient(135deg, ${theme.primaryDark}, ${theme.primary})`, color: theme.textOnPrimary }}>
            <div className="flex items-start justify-between gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><Building2 className="h-6 w-6" /></div><div className="flex gap-2"><StatusBadge tone={location.status === "Active" ? "green" : "amber"}>{location.status}</StatusBadge><button onClick={() => { setEditing(location); setShowModal(true); }} className="rounded-xl bg-white/15 p-2 hover:bg-white/25" aria-label={`Edit ${location.shortName}`}><Pencil className="h-4 w-4" /></button></div></div>
            <h2 className="mt-4 text-2xl font-black">{location.shortName}</h2><p className="mt-1 text-sm font-bold opacity-85">{location.name} • {location.type}</p>
            <button onClick={() => setActiveLocation(location.shortName)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black" style={{ color: theme.ink }}>{selected ? <><Check className="h-4 w-4" /> Active Location</> : "Use This Location"}</button>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-3 text-center"><div><p className="text-xs font-bold text-slate-400">CAPACITY</p><p className="text-xl font-black">{location.capacity}</p></div><div><p className="text-xs font-bold text-slate-400">ENROLLED</p><p className="text-xl font-black">{locationEnrolled}</p></div><div><p className="text-xs font-bold text-slate-400">AVAILABLE</p><p className="text-xl font-black" style={{ color: theme.primaryDark }}>{Math.max(location.capacity - locationEnrolled, 0)}</p></div></div>
            <div className="mt-5 rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between"><p className="font-black text-slate-950">Today: {todayName}</p><StatusBadge tone={todayHours.closed ? "red" : "green"}>{todayHours.closed ? "Closed" : `${formatClock(todayHours.open)}–${formatClock(todayHours.close)}`}</StatusBadge></div><p className="mt-2 text-xs leading-5 text-slate-500">{summarizeHours(locationHours)}</p></div>
            <div className="mt-4 space-y-2 text-sm text-slate-600"><p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 text-slate-400" />{location.address}</p><p className="font-semibold text-slate-700">{location.facilityNumber}</p></div>
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200"><div className="grid grid-cols-[100px_1fr_1fr] bg-slate-50 px-3 py-2 text-[11px] font-black uppercase text-slate-400"><span>Day</span><span>Open</span><span>Close</span></div>{dayNames.map((day) => { const entry = locationHours.days[day]; return <div key={day} className="grid grid-cols-[100px_1fr_1fr] items-center gap-2 border-t border-slate-100 px-3 py-2"><label className="flex items-center gap-2 text-xs font-black text-slate-700"><input type="checkbox" checked={!entry.closed} onChange={(event) => updateHours(location.shortName, day, { closed: !event.target.checked })} />{day.slice(0, 3)}</label>{entry.closed ? <span className="col-span-2 text-xs font-black text-red-600">Closed</span> : <><input aria-label={`${location.shortName} ${day} opening time`} type="time" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold" value={entry.open} onChange={(event) => updateHours(location.shortName, day, { open: event.target.value })} /><input aria-label={`${location.shortName} ${day} closing time`} type="time" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold" value={entry.close} onChange={(event) => updateHours(location.shortName, day, { close: event.target.value })} /></>}</div>; })}</div>
          </div>
        </article>;
      })}
    </section>

    {showModal && editing && <Modal title={locations.some((item) => item.id === editing.id) ? "Edit Location" : "Add Location"} description="Update the site information shown throughout the Operations Hub." onClose={() => setShowModal(false)} footer={<><SecondaryButton onClick={() => setShowModal(false)}>Cancel</SecondaryButton><PrimaryButton type="submit" onClick={() => document.getElementById("location-form-submit")?.click()}>Save Location</PrimaryButton></>}>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-bold">Location name</span><input required className={inputClass} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
        <label><span className="mb-1.5 block text-sm font-bold">Short name / color identity</span><select className={inputClass} value={editing.shortName} onChange={(event) => setEditing({ ...editing, shortName: event.target.value as LocationRecord["shortName"] })}>{(Object.keys(locationThemes) as LocationKey[]).filter((item) => item !== "All Locations").map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span className="mb-1.5 block text-sm font-bold">Program type</span><input className={inputClass} value={editing.type} onChange={(event) => setEditing({ ...editing, type: event.target.value })} /></label>
        <label><span className="mb-1.5 block text-sm font-bold">Capacity</span><input type="number" min="0" className={inputClass} value={editing.capacity} onChange={(event) => setEditing({ ...editing, capacity: Number(event.target.value) })} /></label>
        <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-bold">Address</span><input className={inputClass} value={editing.address} onChange={(event) => setEditing({ ...editing, address: event.target.value })} /></label>
        <label><span className="mb-1.5 block text-sm font-bold">Facility number</span><input className={inputClass} value={editing.facilityNumber} onChange={(event) => setEditing({ ...editing, facilityNumber: event.target.value })} /></label>
        <label><span className="mb-1.5 block text-sm font-bold">Status</span><select className={inputClass} value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value as LocationRecord["status"] })}><option>Active</option><option>Planning</option></select></label>
        <button id="location-form-submit" type="submit" className="hidden">Submit</button>
      </form>
    </Modal>}
  </div></MainLayout>;
}
