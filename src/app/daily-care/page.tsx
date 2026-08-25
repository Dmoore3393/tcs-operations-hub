"use client";

import MainLayout from "@/components/layout/MainLayout";
import { DemoNotice, PageIntro, PrimaryButton, SectionCard, StatCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { initialChildren, type ChildRecord } from "@/lib/children";
import { childAttendsLocation, starterChildSchedules, type ChildScheduleRecord } from "@/lib/child-schedules";
import { type CareCategory, type CareLogEntry, starterCareLogs } from "@/lib/employee-care";
import { type LocationKey } from "@/lib/location-config";
import { starterMealServices, type MealServiceRecord } from "@/lib/meals";
import { Baby, BedDouble, Check, Clock3, Droplets, Lock, NotebookPen, Search, Trash2, Utensils, Waves } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { localIsoDate } from "@/lib/date-utils";

const today = localIsoDate();
const categories: { label: CareCategory; icon: React.ComponentType<{ className?: string }> }[] = [
  { label: "Meal", icon: Utensils },
  { label: "Bottle", icon: Baby },
  { label: "Diaper", icon: Droplets },
  { label: "Potty", icon: Waves },
  { label: "Rest", icon: BedDouble },
  { label: "Daily Note", icon: NotebookPen },
];

type LogForm = {
  date: string;
  time: string;
  category: CareCategory;
  action: string;
  result: string;
  notes: string;
  initials: string;
};

const starterForm: LogForm = {
  date: today,
  time: "10:30",
  category: "Meal",
  action: "Lunch",
  result: "Ate most",
  notes: "",
  initials: "",
};

function defaultAction(category: CareCategory) {
  return {
    Meal: "Lunch",
    Bottle: "Bottle feeding",
    Diaper: "Diaper change",
    Potty: "Potty attempt",
    Rest: "Rest period",
    "Daily Note": "Daily update",
  }[category];
}

function defaultResult(category: CareCategory) {
  return {
    Meal: "Ate most",
    Bottle: "Finished bottle",
    Diaper: "Wet",
    Potty: "Tried • did not go",
    Rest: "Fell asleep",
    "Daily Note": "Calm and engaged",
  }[category];
}

function resultOptions(category: CareCategory) {
  return {
    Meal: ["Ate all", "Ate most", "Ate some", "Ate a little", "Refused"],
    Bottle: ["Finished bottle", "Drank most", "Drank some", "Refused", "Bottle not offered"],
    Diaper: ["Wet", "Bowel movement", "Wet + bowel movement", "Dry", "Rash / skin concern"],
    Potty: ["Urinated • independent", "Urinated • reminded", "Bowel movement", "Tried • did not go", "Accident", "Asked independently"],
    Rest: ["Fell asleep", "Rested quietly", "Did not sleep", "Restless", "Woke early", "15-minute sleep check • breathing normal", "15-minute sleep check • needs attention"],
    "Daily Note": ["Calm and engaged", "Happy and social", "Needed extra support", "Tired", "Great participation"],
  }[category];
}

export default function DailyCarePage() {
  const { location: activeLocation } = useHubLocation();
  const [logs, setLogs] = usePersistentState<CareLogEntry[]>("tcs-daily-care-v1", starterCareLogs);
  const [allChildren] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const [childSchedules] = usePersistentState<ChildScheduleRecord[]>("tcs-child-schedules-v2", starterChildSchedules);
  const [mealServices] = usePersistentState<MealServiceRecord[]>("tcs-meal-services-v1", starterMealServices);
  const [form, setForm] = useState<LogForm>(starterForm);
  const [selectedChildren, setSelectedChildren] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"Quick Log" | "Timeline" | "Meal Count" | "Potty Progress">("Quick Log");
  const [timelineCategory, setTimelineCategory] = useState<"All" | CareCategory>("All");
  const [message, setMessage] = useState("");

  const currentLocation: Exclude<LocationKey, "All Locations"> = activeLocation === "All Locations" ? "Halcom" : activeLocation;
  const children = useMemo(() => allChildren.filter((child) => {
    if (child.enrollmentStatus === "Archived") return false;
    const schedule = childSchedules.find((record) => record.childId === child.id);
    return childAttendsLocation(child, schedule, currentLocation);
  }), [allChildren, childSchedules, currentLocation]);
  const searchedChildren = children.filter((child) => `${child.firstName} ${child.lastName}`.toLowerCase().includes(search.toLowerCase()));
  const locationLogs = logs.filter((entry) => entry.location === currentLocation && entry.date === form.date);
  const timeline = locationLogs.filter((entry) => timelineCategory === "All" || entry.category === timelineCategory).sort((a, b) => b.time.localeCompare(a.time));
  const pottyLogs = locationLogs.filter((entry) => entry.category === "Potty");
  const locationMealServices = mealServices.filter((service) => service.location === currentLocation && service.date === form.date).sort((a, b) => a.servedTime.localeCompare(b.servedTime));
  const mealGroups = (() => {
    const groups = new Map<string, CareLogEntry[]>();
    locationLogs.filter((entry) => entry.category === "Meal" || entry.category === "Bottle").forEach((entry) => {
      const key = `${entry.category}: ${entry.action}`;
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    });
    return [...groups.entries()];
  })();

  function chooseCategory(category: CareCategory) {
    setForm((current) => ({ ...current, category, action: defaultAction(category), result: defaultResult(category), notes: "" }));
  }

  function toggleChild(id: number) {
    setSelectedChildren((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function selectAll() {
    setSelectedChildren((current) => current.length === children.length ? [] : children.map((child) => child.id));
  }

  function saveLogs() {
    if (!selectedChildren.length) {
      setMessage("Select at least one child before saving.");
      return;
    }
    if (form.initials.trim().length < 2) {
      setMessage("Enter staff initials before saving.");
      return;
    }
    const now = new Date().toISOString();
    const matchedChildren = children.filter((child) => selectedChildren.includes(child.id));
    if (!matchedChildren.length) {
      setSelectedChildren([]);
      setMessage("The selected location changed. Choose children from the current location and try again.");
      return;
    }
    const entries = matchedChildren.map((child, index): CareLogEntry => ({
      id: `care-${Date.now()}-${index}`,
      childId: child.id,
      childName: `${child.firstName} ${child.lastName}`,
      location: currentLocation,
      date: form.date,
      time: form.time,
      category: form.category,
      action: form.action,
      result: form.result,
      notes: form.notes.trim(),
      initials: form.initials.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4),
      createdAt: now,
    }));
    setLogs((current) => [...current, ...entries]);
    setSelectedChildren([]);
    setForm((current) => ({ ...current, notes: "" }));
    setMessage(`${entries.length} ${form.category.toLowerCase()} ${entries.length === 1 ? "entry" : "entries"} saved.`);
    window.setTimeout(() => setMessage(""), 2200);
  }

  function deleteEntry(id: string) {
    if (!window.confirm("Delete this care entry?")) return;
    setLogs((current) => current.filter((entry) => entry.id !== id));
  }

  const meals = locationLogs.filter((entry) => entry.category === "Meal" || entry.category === "Bottle").length;
  const changes = locationLogs.filter((entry) => entry.category === "Diaper").length;
  const rests = locationLogs.filter((entry) => entry.category === "Rest").length;

  return <MainLayout><div className="mx-auto max-w-[1550px] space-y-6">
    <PageIntro eyebrow="Employee-only care tracking" title="Daily Care" description="Log bottles, diaper changes, potty-training progress, rest, and daily notes from one fast classroom screen. Use Meals & Menus for the full weekly menu and individual food intake." actions={<><Link href="/meals" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-emerald-700"><Utensils className="h-4 w-4" /> Open Meals & Menus</Link><div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700"><Lock className="h-4 w-4" /> Staff Access Only</div></>} />
    <DemoNotice />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard label="Children at Location" value={children.length} helper={currentLocation} icon={<Baby className="h-5 w-5" />} />
      <StatCard label="Meal / Bottle Logs" value={meals} helper={form.date} icon={<Utensils className="h-5 w-5" />} tone="blue" />
      <StatCard label="Diaper Changes" value={changes} icon={<Droplets className="h-5 w-5" />} tone="purple" />
      <StatCard label="Potty Entries" value={pottyLogs.length} icon={<Waves className="h-5 w-5" />} tone="amber" />
      <StatCard label="Rest Entries" value={rests} icon={<BedDouble className="h-5 w-5" />} tone="slate" />
    </section>

    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      {(["Quick Log", "Timeline", "Meal Count", "Potty Progress"] as const).map((item) => <button key={item} onClick={() => setView(item)} className={`rounded-xl px-4 py-2.5 text-sm font-black ${view === item ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{item}</button>)}
    </div>

    {view === "Quick Log" && <div className="grid gap-6 xl:grid-cols-[.78fr_1.22fr]">
      <SectionCard title="1. Choose Children" description={`Showing active children assigned to ${currentLocation}`} action={<button onClick={selectAll} className="text-sm font-black text-emerald-700">{selectedChildren.length === children.length && children.length ? "Clear all" : "Select all"}</button>}>
        <label className="relative mb-4 block"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-10`} placeholder="Search children…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <div className="grid max-h-[620px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          {searchedChildren.map((child) => {
            const selected = selectedChildren.includes(child.id);
            return <button key={child.id} type="button" onClick={() => toggleChild(child.id)} className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${selected ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-emerald-300"}`}>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black ${selected ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"}`}>{selected ? <Check className="h-5 w-5" /> : `${child.firstName[0]}${child.lastName[0]}`}</span>
              <span><span className="block font-black text-slate-950">{child.firstName} {child.lastName}</span><span className="text-xs font-semibold text-slate-500">{child.ageGroup} • {child.classroom}</span></span>
            </button>;
          })}
          {!searchedChildren.length && <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">No active child records are assigned to this location yet.</div>}
        </div>
      </SectionCard>

      <SectionCard title="2. Add Care Entry" description="One entry can be saved to several selected children at the same time.">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map(({ label, icon: Icon }) => <button key={label} type="button" onClick={() => chooseCategory(label)} className={`rounded-2xl border px-3 py-4 text-center transition ${form.category === label ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:border-emerald-300"}`}><Icon className="mx-auto h-5 w-5" /><span className="mt-2 block text-xs font-black">{label}</span></button>)}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Date"><input type="date" className={inputClass} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></Field>
          <Field label="Time"><input type="time" className={inputClass} value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} /></Field>
          <Field label="Care action"><input className={inputClass} value={form.action} onChange={(event) => setForm({ ...form, action: event.target.value })} /></Field>
          <Field label="Result"><select className={inputClass} value={form.result} onChange={(event) => setForm({ ...form, result: event.target.value })}>{resultOptions(form.category).map((option) => <option key={option}>{option}</option>)}</select></Field>
          <Field label={form.category === "Bottle" ? "Bottle / milk details" : form.category === "Diaper" ? "Condition, cream, or rash notes" : form.category === "Potty" ? "Prompt, accident, or clothing notes" : "Optional notes"} wide><textarea className={`${inputClass} min-h-28`} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Add only the details staff need to document…" /></Field>
          <Field label="Staff initials"><input className={`${inputClass} uppercase`} maxLength={4} value={form.initials} onChange={(event) => setForm({ ...form, initials: event.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} placeholder="DM" /></Field>
          <div className="flex items-end"><PrimaryButton onClick={saveLogs}><Check className="h-4 w-4" /> Save for {selectedChildren.length || 0} {selectedChildren.length === 1 ? "Child" : "Children"}</PrimaryButton></div>
        </div>
        {message && <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-bold ${message.includes("saved") ? "border border-emerald-200 bg-emerald-50 text-emerald-900" : "border border-amber-200 bg-amber-50 text-amber-900"}`}>{message}</div>}
      </SectionCard>
    </div>}

    {view === "Timeline" && <SectionCard title="Daily Care Timeline" description={`All employee entries for ${currentLocation} on ${form.date}`} action={<div className="flex gap-2"><input type="date" className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /><select className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold" value={timelineCategory} onChange={(event) => setTimelineCategory(event.target.value as "All" | CareCategory)}><option>All</option>{categories.map((category) => <option key={category.label}>{category.label}</option>)}</select></div>}>
      <div className="space-y-3">{timeline.map((entry) => <article key={entry.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 md:flex-row md:items-center">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800"><Clock3 className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-950">{entry.childName}</p><StatusBadge tone={entry.category === "Potty" ? "amber" : entry.category === "Diaper" ? "purple" : entry.category === "Meal" ? "green" : "blue"}>{entry.category}</StatusBadge><span className="text-xs font-bold text-slate-500">{entry.time}</span></div><p className="mt-1 text-sm font-bold text-slate-800">{entry.action} • {entry.result}</p>{entry.notes && <p className="mt-1 text-sm leading-6 text-slate-500">{entry.notes}</p>}</div>
        <div className="flex items-center gap-3"><span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">{entry.initials}</span><button onClick={() => deleteEntry(entry.id)} className="rounded-xl p-2 text-red-600 hover:bg-red-50" aria-label="Delete entry"><Trash2 className="h-4 w-4" /></button></div>
      </article>)}{!timeline.length && <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">No care entries match this date and category.</div>}</div>
    </SectionCard>}

    {view === "Meal Count" && <SectionCard title="Meal & Bottle Count" description={`Internal meal participation review for ${currentLocation} on ${form.date}. Weekly menus and structured meal entries are managed in Meals & Menus.`} action={<div className="flex flex-wrap gap-2"><input type="date" className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /><Link href="/meals" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-black text-white hover:bg-emerald-700"><Utensils className="h-4 w-4" /> Enter Meals</Link></div>}>
      {!!locationMealServices.length && <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{locationMealServices.map((service) => <article key={service.id} className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-emerald-700">Actual food served</p><h3 className="mt-1 text-lg font-black text-slate-950">{service.meal}</h3></div><span className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-600">{service.servedTime}</span></div><p className="mt-3 text-sm font-bold leading-6 text-slate-800">{service.actualFoods}</p><p className="mt-2 text-xs text-slate-500">Drink: {service.drinkServed || "Not recorded"} • {service.childrenLogged} children • {service.initials}</p></article>)}</div>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{mealGroups.map(([group, entries]) => <article key={group} className="rounded-2xl border border-slate-200 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-emerald-700">{group.split(":")[0]}</p><h3 className="mt-1 text-lg font-black text-slate-950">{group.split(": ").slice(1).join(": ")}</h3></div><span className="rounded-2xl bg-emerald-50 px-3 py-2 text-xl font-black text-emerald-800">{entries.length}</span></div><div className="mt-4 space-y-2">{entries.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2"><div><p className="text-sm font-black text-slate-800">{entry.childName}</p><p className="text-xs text-slate-500">{entry.result}{entry.foodServed ? ` • ${entry.foodServed}` : ""}{entry.notes ? ` • ${entry.notes}` : ""}</p></div><span className="text-xs font-black text-slate-500">{entry.initials}</span></div>)}</div></article>)}{!mealGroups.length && <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">No meal or bottle entries have been logged for this date.</div>}</div>
      <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900"><strong>Internal tracking only:</strong> Meals & Menus records what was planned, what was actually served, and what each child ate. Continue using KidKare for the official CACFP claim.</div>
    </SectionCard>}

    {view === "Potty Progress" && <SectionCard title="Potty-Training Progress" description="A neutral staff view of attempts, successes, accidents, and independence. This is not a scorecard.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children.filter((child) => child.ageGroup === "Toddler" || child.ageGroup === "Preschool").map((child) => {
        const entries = logs.filter((entry) => entry.childId === child.id && entry.category === "Potty");
        const independent = entries.filter((entry) => entry.result.toLowerCase().includes("independent")).length;
        const accidents = entries.filter((entry) => entry.result.toLowerCase().includes("accident")).length;
        const successful = entries.filter((entry) => entry.result.toLowerCase().includes("urinated") || entry.result.toLowerCase().includes("bowel")).length;
        return <article key={child.id} className="rounded-2xl border border-slate-200 p-5"><div className="flex items-center justify-between"><div><h3 className="font-black text-slate-950">{child.firstName} {child.lastName}</h3><p className="text-xs font-semibold text-slate-500">{entries.length} recorded potty entries</p></div><Waves className="h-5 w-5 text-emerald-700" /></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><ProgressBox label="Used potty" value={successful} /><ProgressBox label="Independent" value={independent} /><ProgressBox label="Accidents" value={accidents} /></div><div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Staff should document patterns and supports without comparing children or using shame-based language.</div></article>;
      })}</div>
    </SectionCard>}
  </div></MainLayout>;
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-sm font-black text-slate-700">{label}</span>{children}</label>;
}

function ProgressBox({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xl font-black text-slate-950">{value}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p></div>;
}
