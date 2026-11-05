"use client";

import Link from "next/link";
import {useAuth} from "@/components/providers/AuthProvider";
import {canApproveChildSchedules} from "@/lib/child-schedule-authority";
import MainLayout from "@/components/layout/MainLayout";
import { Modal, PrimaryButton, PageIntro, SecondaryButton, SectionCard, StatCard, inputClass } from "@/components/hub/HubUI";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { mergeScheduleFragments, usePersistentState } from "@/hooks/usePersistentState";
import { dayNames, normalizeLocation, type DayName, type LocationKey } from "@/lib/location-config";
import { emptyWeek, type CareBlock, type ChildScheduleRecord, scheduleSummary, starterChildSchedules } from "@/lib/child-schedules";
import { CalendarDays, Clock3, Copy, Plus, Search, ShieldCheck, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDatedCarePlan } from "@/hooks/useDatedCarePlan";
import { isoDateInTimeZone } from "@/lib/family-care-calendar";
import { supabase } from "@/lib/supabase/client";
import { hubRequest } from "@/lib/hub-request";
import { type PlannerChild } from "@/lib/weekly-care-planner";
import { currentDayName } from "@/lib/date-utils";



function newBlock(location: Exclude<LocationKey, "All Locations">): CareBlock {
  return { id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, start: "08:00", end: "17:00", location };
}

export default function ChildSchedulesPage() {
  const {profile,session}=useAuth();
  const canEdit=canApproveChildSchedules(profile);
  const [stored, , recordsReady, recordsLoad] = usePersistentState<ChildScheduleRecord[]>("tcs-child-schedules-v2", starterChildSchedules);
  const today = isoDateInTimeZone();
  const planner = useDatedCarePlan(today,today);
  const { location: activeLocation } = useHubLocation();
  const [locationFilter, setLocationFilter] = useState<LocationKey>(activeLocation);
  const [search, setSearch] = useState("");
  const [editing,setEditing] = useState<ChildScheduleRecord | null>(null);
  const [editScope,setEditScope] = useState<{child:PlannerChild; version:string|null} | null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [selectedDay, setSelectedDay] = useState<DayName>(() => currentDayName());

  useEffect(() => { const timeoutId = window.setTimeout(() => setLocationFilter(activeLocation), 0); return () => window.clearTimeout(timeoutId); }, [activeLocation]);

  const records = useMemo(() => planner.data.children.flatMap(child => {
    const site = planner.data.locations.find(s => s.id === child.location_id);
    const home = site ? normalizeLocation(site.name) : "All Locations";
    if (home === "All Locations") return [];
    const base = stored.find(record => [child.record_key,child.legacy_id].includes(String(record.childId)));
    return [{ childId:base?.childId ?? child.record_key ?? child.legacy_id, childName:`${child.first_name} ${child.last_name}`,
      defaultLocation:home, ageGroup:child.age_group || "Unknown", days:base?.days ?? emptyWeek() } satisfies ChildScheduleRecord];
  }),[planner.data,stored]);

  async function openEditor(record: ChildScheduleRecord) {
    const child = planner.data.children.find(c => [c.record_key,c.legacy_id].includes(String(record.childId)));
    if (!child || !supabase || !profile || !canEdit || busy) return;
    setBusy(true); setMessage("");
    try {
      const {data,error} = await supabase.from("child_schedules").select("legacy_id,child_id,record_data,updated_at,is_primary").eq("organization_id",profile.organization_id);
      if (error) throw new Error(error.message);
      const fragments = (data ?? []).filter(r => r.child_id === child.id || (!r.child_id && r.record_data?.childId != null && [child.record_key,child.legacy_id].includes(String(r.record_data.childId))));
      const merged = mergeScheduleFragments(fragments.map(r => ({...r,record_data:{...r.record_data,childId:record.childId}})))[0];
      setEditScope({child,version:fragments.map(r=>r.updated_at as string).sort().at(-1) ?? null});
      setEditing({...record,days:merged ? merged.days as ChildScheduleRecord["days"] : emptyWeek()});
    } catch(reason) {setMessage(reason instanceof Error ? reason.message : "Could not open the current hours.");}
    finally {setBusy(false);}
  }
  async function saveUsual() {
    if (!editing || !editScope || !session || busy) return;
    setBusy(true);setMessage("");
    try {
      await hubRequest("/api/child-schedule-planner",session.access_token,{method:"POST",body:JSON.stringify({
        kind:"usual-hours",childId:editScope.child.id,version:editScope.version,days:editing.days,
      })});
      setMessage("Usual weekly hours saved."); setEditing(null); setEditScope(null); recordsLoad.retry();
    } catch(reason) {setMessage(reason instanceof Error ? reason.message : "Could not save usual hours.");}
    finally {setBusy(false);}
  }
  const filtered = useMemo(() => records.filter((record) => {
    const matchesSearch = record.childName.toLowerCase().includes(search.toLowerCase());
    const matchesLocation = locationFilter === "All Locations" || record.defaultLocation === locationFilter || dayNames.some((day) => record.days[day].blocks.some((block) => block.location === locationFilter));
    return matchesSearch && matchesLocation;
  }), [records, search, locationFilter]);

  const scheduledToday = filtered.filter((record) => !record.days[selectedDay].noCare && record.days[selectedDay].blocks.length > 0).length;
  const noCareToday = filtered.length - scheduledToday;
  const splitSchedules = filtered.filter((record) => record.days[selectedDay].blocks.length > 1).length;

  function updateRecord(next: ChildScheduleRecord) {
    if(!canEdit)return;
    setEditing(next);
  }

  function updateDay(day: DayName, updater: (current: ChildScheduleRecord["days"][DayName]) => ChildScheduleRecord["days"][DayName]) {
    if (!editing) return;
    updateRecord({ ...editing, days: { ...editing.days, [day]: updater(editing.days[day]) } });
  }

  function copyDay(source: DayName, targets: DayName[]) {
    if (!editing) return;
    const sourceDay = editing.days[source];
    const nextDays = { ...editing.days };
    targets.forEach((day) => {
      nextDays[day] = {
        ...sourceDay,
        blocks: sourceDay.blocks.map((block, index) => ({ ...block, id: `${block.id}-${day}-${index}` })),
      };
    });
    updateRecord({ ...editing, days: nextDays });
  }

  return <MainLayout><div className="mx-auto max-w-[1600px] space-y-6">
    <PageIntro eyebrow="Exact care times" title="Usual weekly hours" description="These hours repeat every week. A dated plan takes priority for the days you select." actions={<Link href="/child-schedules" className="tcs-primary-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold shadow-sm"><ShieldCheck className="h-4 w-4" /> Open dated schedules</Link>} />
    {message && !editing && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm">{message}</p>}
    {(planner.error || recordsLoad.error) && <p role="alert">{planner.error || recordsLoad.error}</p>}
    {(!planner.ready || !recordsReady) && <p role="status">Loading usual hours…</p>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Children Shown" value={filtered.length} icon={<UsersRound className="h-5 w-5" />} />
      <StatCard label={`${selectedDay} Care`} value={scheduledToday} helper="At least one entered time block" icon={<CalendarDays className="h-5 w-5" />} tone="blue" />
      <StatCard label="No Care" value={noCareToday} helper={`For ${selectedDay}`} icon={<X className="h-5 w-5" />} tone="slate" />
      <StatCard label="Split Schedules" value={splitSchedules} helper="Multiple blocks or locations" icon={<Clock3 className="h-5 w-5" />} tone="purple" />
    </section>

    <SectionCard>
      <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
        <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" /><input className={`${inputClass} pl-10`} placeholder="Search child…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <select className={inputClass} value={locationFilter} onChange={(event) => setLocationFilter(event.target.value as LocationKey)}><option>All Locations</option>{planner.data.locations.map(site => normalizeLocation(site.name)).filter(item => item !== "All Locations").map(item => <option key={item}>{item}</option>)}</select>
        <select className={inputClass} value={selectedDay} onChange={(event) => setSelectedDay(event.target.value as DayName)}>{dayNames.map((day) => <option key={day}>{day}</option>)}</select>
      </div>
    </SectionCard>

    <SectionCard title="Weekly Care Grid" description="Click any child to enter or change exact daily times. Each day can have more than one care block.">
      <div className="overflow-x-auto">
        <table className="min-w-[1250px] w-full border-separate border-spacing-y-2 text-sm">
          <thead><tr className="text-left text-xs font-black uppercase tracking-wider text-slate-600"><th className="px-3 py-2">Child</th>{dayNames.map((day) => <th key={day} className={`px-2 py-2 ${selectedDay === day ? "tcs-themed-text" : ""}`}>{day.slice(0, 3)}</th>)}<th className="px-3 py-2">Action</th></tr></thead>
          <tbody>{filtered.map((record) => <tr key={record.childId} className="bg-white shadow-sm">
            <td className="rounded-l-2xl border-y border-l border-slate-200 px-4 py-3"><p className="font-black text-slate-950"><span translate="no" className="contents">{record.childName}</span></p><p className="mt-1 text-xs text-slate-500">{record.ageGroup} • {record.defaultLocation}</p></td>
            {dayNames.map((day) => { const entry = record.days[day]; return <td key={day} className={`border-y border-slate-200 px-2 py-3 align-top ${selectedDay === day ? "tcs-themed-surface" : ""}`}><div className={`min-h-14 rounded-xl px-2 py-2 text-xs leading-5 ${entry.noCare || !entry.blocks.length ? "bg-slate-50 text-slate-600" : "tcs-themed-surface text-slate-700"}`}><p className="font-bold">{entry.noCare || !entry.blocks.length ? "No care" : entry.blocks.map((block) => `${block.start.replace(/^0/, "")}–${block.end.replace(/^0/, "")}`).join(" + ")}</p>{!entry.noCare && entry.blocks.some((block) => block.location !== record.defaultLocation) && <p className="mt-1 font-semibold tcs-themed-text">Location change</p>}</div></td>; })}
            <td className="rounded-r-2xl border-y border-r border-slate-200 px-3 py-3"><button disabled={!canEdit || busy || !recordsReady || !planner.ready} onClick={() => void openEditor(record)} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">{canEdit?"Edit Week":"View only"}</button></td>
          </tr>)}</tbody>
        </table>
      </div>
    </SectionCard>

    {canEdit && editing && <Modal title={`${editing.childName} — Weekly Schedule`} description="Enter exact times for each day. Turn on No Care when the child is not scheduled." onClose={() => { if(!busy) setEditing(null); }} footer={<><SecondaryButton disabled={busy} onClick={() => setEditing(null)}>Cancel</SecondaryButton><PrimaryButton disabled={busy} onClick={() => void saveUsual()}>{busy ? "Saving…" : "Save usual hours"}</PrimaryButton></>}>
      <div className="space-y-5">
        <div className="rounded-2xl border tcs-themed-border tcs-themed-surface p-4"><p className="font-black text-slate-950">Default location: {editing.defaultLocation}</p><p className="mt-1 text-sm text-slate-600">A day or block can be assigned to a different location when a child moves between sites.</p></div>
        <div className="flex flex-wrap gap-2"><button onClick={() => copyDay("Monday", ["Tuesday", "Wednesday", "Thursday", "Friday"])} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-black"><Copy className="h-3.5 w-3.5" /> Copy Monday to Tue–Fri</button></div>
        {dayNames.map((day) => {
          const entry = editing.days[day];
          return <section key={day} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-black text-slate-950">{day}</h3><p className="mt-1 text-xs text-slate-500">{scheduleSummary(entry)}</p></div><label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold"><input type="checkbox" checked={entry.noCare} onChange={(event) => updateDay(day, (current) => ({ ...current, noCare: event.target.checked, blocks: event.target.checked ? [] : current.blocks.length ? current.blocks : [newBlock(editing.defaultLocation)] }))} /> No care</label></div>
            {!entry.noCare && <div className="mt-4 space-y-3">{entry.blocks.map((careBlock) => <div key={careBlock.id} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_1.2fr_auto]">
              <label><span className="mb-1 block text-base font-black uppercase text-slate-600">Drop-off</span><input type="time" className={inputClass} value={careBlock.start} onChange={(event) => updateDay(day, (current) => ({ ...current, blocks: current.blocks.map((item) => item.id === careBlock.id ? { ...item, start: event.target.value } : item) }))} /></label>
              <label><span className="mb-1 block text-base font-black uppercase text-slate-600">Pick-up</span><input type="time" className={inputClass} value={careBlock.end} onChange={(event) => updateDay(day, (current) => ({ ...current, blocks: current.blocks.map((item) => item.id === careBlock.id ? { ...item, end: event.target.value } : item) }))} /></label>
              <label><span className="mb-1 block text-base font-black uppercase text-slate-600">Location</span><select className={inputClass} value={careBlock.location} onChange={(event) => updateDay(day, (current) => ({ ...current, blocks: current.blocks.map((item) => item.id === careBlock.id ? { ...item, location: event.target.value as CareBlock["location"] } : item) }))}>{planner.data.locations.map(site => normalizeLocation(site.name)).filter(item => item !== "All Locations").map(item => <option key={item}>{item}</option>)}</select></label>
              <button aria-label="Remove care block" onClick={() => updateDay(day, (current) => ({ ...current, blocks: current.blocks.filter((item) => item.id !== careBlock.id), noCare: current.blocks.length === 1 }))} className="self-end rounded-xl border border-red-200 p-3 text-red-700 hover:bg-red-50"><X className="h-4 w-4" /></button>
            </div>)}
            <div className="flex flex-wrap items-center gap-3"><button onClick={() => updateDay(day, (current) => ({ ...current, blocks: [...current.blocks, newBlock(editing.defaultLocation)] }))} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-black"><Plus className="h-3.5 w-3.5" /> Add another time block</button><label className="min-w-56 flex-1"><span className="sr-only">Schedule note</span><input className={inputClass} placeholder="Optional note, transportation, school pickup…" value={entry.note} onChange={(event) => updateDay(day, (current) => ({ ...current, note: event.target.value }))} /></label></div>
            </div>}
          </section>;
        })}
        {message && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-900">{message}</p>}
      </div>
    </Modal>}
  </div></MainLayout>;
}
