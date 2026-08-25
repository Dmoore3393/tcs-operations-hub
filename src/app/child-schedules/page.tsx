"use client";

import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import { DemoNotice, Modal, PageIntro, SecondaryButton, SectionCard, StatCard, inputClass } from "@/components/hub/HubUI";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { careLocations, dayNames, normalizeLocation, type DayName, type LocationKey } from "@/lib/location-config";
import { createBlankChildSchedule, type CareBlock, type ChildScheduleRecord, scheduleSummary, starterChildSchedules } from "@/lib/child-schedules";
import { CalendarDays, Check, Clock3, Copy, Plus, Search, ShieldCheck, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { initialChildren, type ChildRecord } from "@/lib/children";
import { currentDayName, localIsoDate } from "@/lib/date-utils";

const today = localIsoDate();

function newBlock(location: Exclude<LocationKey, "All Locations">): CareBlock {
  return { id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, start: "08:00", end: "17:00", location };
}

export default function ChildSchedulesPage() {
  const [records, setRecords, recordsReady] = usePersistentState<ChildScheduleRecord[]>("tcs-child-schedules-v2", starterChildSchedules);
  const [children, , childrenReady] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const { location: activeLocation } = useHubLocation();
  const [locationFilter, setLocationFilter] = useState<LocationKey>(activeLocation);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<DayName>(() => currentDayName());

  useEffect(() => { const timeoutId = window.setTimeout(() => setLocationFilter(activeLocation), 0); return () => window.clearTimeout(timeoutId); }, [activeLocation]);

  useEffect(() => {
    if (!recordsReady || !childrenReady) return;
    const enrolledChildren = children.filter((child) => child.enrollmentStatus !== "Archived");
    setRecords((current) => {
      const byId = new Map(current.map((record) => [record.childId, record]));
      let changed = false;
      const synced = enrolledChildren.map((child) => {
        const existing = byId.get(child.id);
        if (!existing) {
          changed = true;
          return createBlankChildSchedule(child);
        }
        const nextName = `${child.firstName} ${child.lastName}`;
        const nextLocation = normalizeLocation(child.location);
        const defaultLocation = nextLocation === "All Locations" ? existing.defaultLocation : nextLocation;
        if (existing.childName !== nextName || existing.ageGroup !== child.ageGroup || existing.defaultLocation !== defaultLocation) {
          changed = true;
          return { ...existing, childName: nextName, ageGroup: child.ageGroup, defaultLocation };
        }
        return existing;
      });
      const enrolledIds = new Set(enrolledChildren.map((child) => child.id));
      const archivedRecords = current.filter((record) => !enrolledIds.has(record.childId));
      if (archivedRecords.length) changed = true;
      return changed ? synced : current;
    });
  }, [children, childrenReady, recordsReady, setRecords]);

  const editing = records.find((record) => record.childId === editingId) ?? null;
  const filtered = useMemo(() => records.filter((record) => {
    const matchesSearch = record.childName.toLowerCase().includes(search.toLowerCase());
    const matchesLocation = locationFilter === "All Locations" || record.defaultLocation === locationFilter || dayNames.some((day) => record.days[day].blocks.some((block) => block.location === locationFilter));
    return matchesSearch && matchesLocation;
  }), [records, search, locationFilter]);

  const scheduledToday = filtered.filter((record) => !record.days[selectedDay].noCare && record.days[selectedDay].blocks.length > 0).length;
  const noCareToday = filtered.length - scheduledToday;
  const splitSchedules = filtered.filter((record) => record.days[selectedDay].blocks.length > 1).length;

  function updateRecord(next: ChildScheduleRecord) {
    setRecords((current) => current.map((record) => record.childId === next.childId ? next : record));
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
    <PageIntro eyebrow="Exact care times" title="Child Schedules" description="Enter each child’s actual drop-off and pick-up times for every day. These schedules feed the Daily Ratio Plan, including split care blocks and location changes." actions={<Link href={`/ratios?date=${today}`} className="tcs-primary-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold shadow-sm"><ShieldCheck className="h-4 w-4" /> Build Ratio Plan</Link>} />
    <DemoNotice />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Children Shown" value={filtered.length} icon={<UsersRound className="h-5 w-5" />} />
      <StatCard label={`${selectedDay} Care`} value={scheduledToday} helper="At least one entered time block" icon={<CalendarDays className="h-5 w-5" />} tone="blue" />
      <StatCard label="No Care" value={noCareToday} helper={`For ${selectedDay}`} icon={<X className="h-5 w-5" />} tone="slate" />
      <StatCard label="Split Schedules" value={splitSchedules} helper="Multiple blocks or locations" icon={<Clock3 className="h-5 w-5" />} tone="purple" />
    </section>

    <SectionCard>
      <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
        <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-10`} placeholder="Search child…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <select className={inputClass} value={locationFilter} onChange={(event) => setLocationFilter(event.target.value as LocationKey)}><option>All Locations</option>{careLocations.map((item) => <option key={item}>{item}</option>)}</select>
        <select className={inputClass} value={selectedDay} onChange={(event) => setSelectedDay(event.target.value as DayName)}>{dayNames.map((day) => <option key={day}>{day}</option>)}</select>
      </div>
    </SectionCard>

    <SectionCard title="Weekly Care Grid" description="Click any child to enter or change exact daily times. Each day can have more than one care block.">
      <div className="overflow-x-auto">
        <table className="min-w-[1250px] w-full border-separate border-spacing-y-2 text-sm">
          <thead><tr className="text-left text-xs font-black uppercase tracking-wider text-slate-400"><th className="px-3 py-2">Child</th>{dayNames.map((day) => <th key={day} className={`px-2 py-2 ${selectedDay === day ? "tcs-themed-text" : ""}`}>{day.slice(0, 3)}</th>)}<th className="px-3 py-2">Action</th></tr></thead>
          <tbody>{filtered.map((record) => <tr key={record.childId} className="bg-white shadow-sm">
            <td className="rounded-l-2xl border-y border-l border-slate-200 px-4 py-3"><p className="font-black text-slate-950">{record.childName}</p><p className="mt-1 text-xs text-slate-500">{record.ageGroup} • {record.defaultLocation}</p></td>
            {dayNames.map((day) => { const entry = record.days[day]; return <td key={day} className={`border-y border-slate-200 px-2 py-3 align-top ${selectedDay === day ? "tcs-themed-surface" : ""}`}><div className={`min-h-14 rounded-xl px-2 py-2 text-xs leading-5 ${entry.noCare || !entry.blocks.length ? "bg-slate-50 text-slate-400" : "tcs-themed-surface text-slate-700"}`}><p className="font-bold">{entry.noCare || !entry.blocks.length ? "No care" : entry.blocks.map((block) => `${block.start.replace(/^0/, "")}–${block.end.replace(/^0/, "")}`).join(" + ")}</p>{!entry.noCare && entry.blocks.some((block) => block.location !== record.defaultLocation) && <p className="mt-1 font-semibold tcs-themed-text">Location change</p>}</div></td>; })}
            <td className="rounded-r-2xl border-y border-r border-slate-200 px-3 py-3"><button onClick={() => setEditingId(record.childId)} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">Edit Week</button></td>
          </tr>)}</tbody>
        </table>
      </div>
    </SectionCard>

    {editing && <Modal title={`${editing.childName} — Weekly Schedule`} description="Enter exact times for each day. Turn on No Care when the child is not scheduled." onClose={() => setEditingId(null)} footer={<><SecondaryButton onClick={() => setEditingId(null)}>Done</SecondaryButton><Link href="/ratios" className="tcs-primary-button inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold"><ShieldCheck className="h-4 w-4" /> View Ratios</Link></>}>
      <div className="space-y-5">
        <div className="rounded-2xl border tcs-themed-border tcs-themed-surface p-4"><p className="font-black text-slate-950">Default location: {editing.defaultLocation}</p><p className="mt-1 text-sm text-slate-600">A day or block can be assigned to a different location when a child moves between sites.</p></div>
        <div className="flex flex-wrap gap-2"><button onClick={() => copyDay("Monday", ["Tuesday", "Wednesday", "Thursday", "Friday"])} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-black"><Copy className="h-3.5 w-3.5" /> Copy Monday to Tue–Fri</button></div>
        {dayNames.map((day) => {
          const entry = editing.days[day];
          return <section key={day} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-black text-slate-950">{day}</h3><p className="mt-1 text-xs text-slate-500">{scheduleSummary(entry)}</p></div><label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold"><input type="checkbox" checked={entry.noCare} onChange={(event) => updateDay(day, (current) => ({ ...current, noCare: event.target.checked, blocks: event.target.checked ? [] : current.blocks.length ? current.blocks : [newBlock(editing.defaultLocation)] }))} /> No care</label></div>
            {!entry.noCare && <div className="mt-4 space-y-3">{entry.blocks.map((careBlock) => <div key={careBlock.id} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_1.2fr_auto]">
              <label><span className="mb-1 block text-[11px] font-black uppercase text-slate-400">Drop-off</span><input type="time" className={inputClass} value={careBlock.start} onChange={(event) => updateDay(day, (current) => ({ ...current, blocks: current.blocks.map((item) => item.id === careBlock.id ? { ...item, start: event.target.value } : item) }))} /></label>
              <label><span className="mb-1 block text-[11px] font-black uppercase text-slate-400">Pick-up</span><input type="time" className={inputClass} value={careBlock.end} onChange={(event) => updateDay(day, (current) => ({ ...current, blocks: current.blocks.map((item) => item.id === careBlock.id ? { ...item, end: event.target.value } : item) }))} /></label>
              <label><span className="mb-1 block text-[11px] font-black uppercase text-slate-400">Location</span><select className={inputClass} value={careBlock.location} onChange={(event) => updateDay(day, (current) => ({ ...current, blocks: current.blocks.map((item) => item.id === careBlock.id ? { ...item, location: event.target.value as CareBlock["location"] } : item) }))}>{careLocations.map((item) => <option key={item}>{item}</option>)}</select></label>
              <button aria-label="Remove care block" onClick={() => updateDay(day, (current) => ({ ...current, blocks: current.blocks.filter((item) => item.id !== careBlock.id), noCare: current.blocks.length === 1 }))} className="self-end rounded-xl border border-red-200 p-3 text-red-700 hover:bg-red-50"><X className="h-4 w-4" /></button>
            </div>)}
            <div className="flex flex-wrap items-center gap-3"><button onClick={() => updateDay(day, (current) => ({ ...current, blocks: [...current.blocks, newBlock(editing.defaultLocation)] }))} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-black"><Plus className="h-3.5 w-3.5" /> Add another time block</button><label className="min-w-56 flex-1"><span className="sr-only">Schedule note</span><input className={inputClass} placeholder="Optional note, transportation, school pickup…" value={entry.note} onChange={(event) => updateDay(day, (current) => ({ ...current, note: event.target.value }))} /></label></div>
            </div>}
          </section>;
        })}
        <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900"><Check className="h-5 w-5" /><span>Changes save automatically to the shared TCS operations database.</span></div>
      </div>
    </Modal>}
  </div></MainLayout>;
}
