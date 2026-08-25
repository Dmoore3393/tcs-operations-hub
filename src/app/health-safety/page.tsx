"use client";

import MainLayout from "@/components/layout/MainLayout";
import { DemoNotice, PageIntro, PrimaryButton, SectionCard, StatCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { initialChildren, type ChildRecord } from "@/lib/children";
import { childAttendsLocation, starterChildSchedules, type ChildScheduleRecord } from "@/lib/child-schedules";
import { type HealthSafetyRecord, type HealthSafetyType, starterHealthSafety } from "@/lib/employee-care";
import { careLocations, type LocationKey } from "@/lib/location-config";
import { AlertTriangle, Check, FileWarning, HeartPulse, Lock, Pill, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { localIsoDate } from "@/lib/date-utils";
import { recordAuditEvent } from "@/lib/audit";

const today = localIsoDate();

type HealthForm = Omit<HealthSafetyRecord, "id" | "childName" | "createdAt">;

function createForm(location: Exclude<LocationKey, "All Locations">): HealthForm {
  return {
    childId: 0,
    location,
    date: today,
    time: "10:30",
    type: "Boo-Boo / Incident",
    summary: "",
    actionTaken: "",
    parentContact: "Needs Contact",
    formalReport: false,
    initials: "",
    status: "Open",
  };
}

export default function HealthSafetyPage() {
  const { location: activeLocation } = useHubLocation();
  const currentLocation: Exclude<LocationKey, "All Locations"> = activeLocation === "All Locations" ? "Halcom" : activeLocation;
  const [records, setRecords] = usePersistentState<HealthSafetyRecord[]>("tcs-health-safety-v1", starterHealthSafety);
  const [allChildren] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const [childSchedules] = usePersistentState<ChildScheduleRecord[]>("tcs-child-schedules-v2", starterChildSchedules);
  const [form, setForm] = useState<HealthForm>(() => createForm(currentLocation));
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | HealthSafetyType>("All");
  const [message, setMessage] = useState("");

  const children = allChildren.filter((child) => {
    if (child.enrollmentStatus === "Archived") return false;
    const schedule = childSchedules.find((record) => record.childId === child.id);
    return childAttendsLocation(child, schedule, form.location);
  });
  const visible = useMemo(() => records.filter((record) => {
    const locationMatch = activeLocation === "All Locations" || record.location === activeLocation;
    const typeMatch = typeFilter === "All" || record.type === typeFilter;
    const term = search.toLowerCase();
    const searchMatch = [record.childName, record.summary, record.actionTaken].join(" ").toLowerCase().includes(term);
    return locationMatch && typeMatch && searchMatch;
  }).sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)), [records, activeLocation, typeFilter, search]);

  function saveRecord() {
    const child = allChildren.find((item) => item.id === form.childId);
    if (!child) {
      setMessage("Select a child before saving.");
      return;
    }
    if (!form.summary.trim() || !form.actionTaken.trim()) {
      setMessage("Add the concern and action taken.");
      return;
    }
    if (form.initials.trim().length < 2) {
      setMessage("Enter staff initials before saving.");
      return;
    }
    const record: HealthSafetyRecord = {
      ...form,
      id: `health-${Date.now()}`,
      childName: `${child.firstName} ${child.lastName}`,
      initials: form.initials.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4),
      createdAt: new Date().toISOString(),
    };
    setRecords((current) => [record, ...current]);
    setForm(createForm(record.location));
    setMessage("Internal health and safety entry saved.");
    window.setTimeout(() => setMessage(""), 2200);
  }

  async function updateStatus(id: string, status: HealthSafetyRecord["status"]) {
    const record = records.find((item) => item.id === id);
    if (!record) return;
    setRecords((current) => current.map((item) => item.id === id ? { ...item, status } : item));
    if (status === "Director Review" || status === "Resolved") {
      await recordAuditEvent({ action: "REVIEW", tableName: "incidents", legacyId: id, location: record.location, metadata: { childName: record.childName, status, incidentType: record.type } });
    }
  }

  return <MainLayout><div className="mx-auto max-w-[1450px] space-y-6">
    <PageIntro eyebrow="Employee-only safety records" title="Health & Safety" description="Document boo-boos, incidents, illness pickups, medications, allergy alerts, first aid, and parent-contact follow-up. This page records communication—it does not send messages to families." actions={<div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700"><Lock className="h-4 w-4" /> Authorized Staff</div>} />
    <DemoNotice />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Open Items" value={records.filter((record) => record.status === "Open").length} icon={<AlertTriangle className="h-5 w-5" />} tone="red" />
      <StatCard label="Director Review" value={records.filter((record) => record.status === "Director Review").length} icon={<FileWarning className="h-5 w-5" />} tone="amber" />
      <StatCard label="Parent Follow-up" value={records.filter((record) => record.parentContact === "Needs Contact" || record.parentContact === "Pickup Requested").length} icon={<HeartPulse className="h-5 w-5" />} tone="blue" />
      <StatCard label="Resolved" value={records.filter((record) => record.status === "Resolved").length} icon={<ShieldCheck className="h-5 w-5" />} />
    </section>

    <div className="grid gap-6 xl:grid-cols-[.82fr_1.18fr]">
      <SectionCard title="Add Health / Safety Entry" description="Use the formal licensing report separately when required. This log keeps the staff workflow together.">
        <div className="space-y-4">
          <Field label="Location"><select className={inputClass} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value as Exclude<LocationKey, "All Locations">, childId: 0 })}>{careLocations.map((location) => <option key={location}>{location}</option>)}</select></Field>
          <Field label="Child"><select className={inputClass} value={form.childId} onChange={(event) => setForm({ ...form, childId: Number(event.target.value) })}><option value={0}>Select child</option>{children.map((child) => <option key={child.id} value={child.id}>{child.firstName} {child.lastName}</option>)}</select></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Date"><input type="date" className={inputClass} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></Field><Field label="Time"><input type="time" className={inputClass} value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} /></Field></div>
          <Field label="Entry type"><select className={inputClass} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as HealthSafetyType })}><option>Boo-Boo / Incident</option><option>Illness / Pickup</option><option>Medication</option><option>Allergy / Medical Alert</option></select></Field>
          <Field label="What happened / reason"><textarea className={`${inputClass} min-h-24`} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} placeholder="Document only observable facts and necessary details…" /></Field>
          <Field label="Action taken"><textarea className={`${inputClass} min-h-24`} value={form.actionTaken} onChange={(event) => setForm({ ...form, actionTaken: event.target.value })} placeholder="First aid, comfort, medication details, pickup request, monitoring…" /></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Parent contact"><select className={inputClass} value={form.parentContact} onChange={(event) => setForm({ ...form, parentContact: event.target.value as HealthSafetyRecord["parentContact"] })}><option>Not Needed</option><option>Needs Contact</option><option>Contacted</option><option>Pickup Requested</option></select></Field><Field label="Status"><select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as HealthSafetyRecord["status"] })}><option>Open</option><option>Director Review</option><option>Resolved</option></select></Field></div>
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3"><input type="checkbox" checked={form.formalReport} onChange={(event) => setForm({ ...form, formalReport: event.target.checked })} /><span className="text-sm font-black text-slate-700">Formal incident / medication report completed</span></label>
          <Field label="Staff initials"><input className={`${inputClass} uppercase`} maxLength={4} value={form.initials} onChange={(event) => setForm({ ...form, initials: event.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} placeholder="LM" /></Field>
          {message && <div className={`rounded-xl px-4 py-3 text-sm font-bold ${message.includes("saved") ? "border border-emerald-200 bg-emerald-50 text-emerald-900" : "border border-amber-200 bg-amber-50 text-amber-900"}`}>{message}</div>}
          <PrimaryButton onClick={saveRecord}><Check className="h-4 w-4" /> Save Internal Entry</PrimaryButton>
        </div>
      </SectionCard>

      <SectionCard title="Health & Safety Log" description="Open items stay visible until staff resolve or review them.">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row"><label className="relative flex-1"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search child or details…" /></label><select className={`${inputClass} sm:w-56`} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "All" | HealthSafetyType)}><option>All</option><option>Boo-Boo / Incident</option><option>Illness / Pickup</option><option>Medication</option><option>Allergy / Medical Alert</option></select></div>
        <div className="space-y-4">{visible.map((record) => <article key={record.id} className="rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${record.type === "Medication" ? "bg-purple-50 text-purple-700" : record.type === "Illness / Pickup" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{record.type === "Medication" ? <Pill className="h-5 w-5" /> : <HeartPulse className="h-5 w-5" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-950">{record.childName}</h3><StatusBadge tone={record.status === "Resolved" ? "green" : record.status === "Director Review" ? "amber" : "red"}>{record.status}</StatusBadge><StatusBadge tone="blue">{record.type}</StatusBadge></div><p className="mt-1 text-xs font-bold text-slate-500">{record.location} • {record.date} at {record.time} • {record.initials}</p><p className="mt-3 text-sm font-black text-slate-800">{record.summary}</p><p className="mt-1 text-sm leading-6 text-slate-600">{record.actionTaken}</p><div className="mt-3 flex flex-wrap gap-2"><StatusBadge tone={record.parentContact === "Contacted" || record.parentContact === "Not Needed" ? "green" : "amber"}>{record.parentContact}</StatusBadge>{record.formalReport && <StatusBadge tone="purple">Formal report completed</StatusBadge>}</div></div></div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3"><button onClick={() => void updateStatus(record.id, "Director Review")} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-black text-slate-700">Send to Review</button><button onClick={() => void updateStatus(record.id, "Resolved")} className="tcs-primary-button rounded-xl px-3 py-2 text-xs font-black">Resolve</button></div>
        </article>)}{!visible.length && <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">No health or safety entries match the filters.</div>}</div>
      </SectionCard>
    </div>

    <SectionCard title="Important Workflow Boundary" description="This keeps documentation accurate and family communication intentional."><div className="grid gap-4 md:grid-cols-3"><Boundary title="Internal Log" text="Staff document the event, action taken, initials, and follow-up status here." /><Boundary title="Required Form" text="Licensing, medication, and incident forms are still completed whenever required." /><Boundary title="Family Communication" text="Staff contact families separately. This page records that contact but never sends the internal note." /></div></SectionCard>
  </div></MainLayout>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className="mb-1.5 block text-sm font-black text-slate-700">{label}</span>{children}</label>; }
function Boundary({ title, text }: { title: string; text: string }) { return <div className="rounded-2xl bg-slate-50 p-4"><p className="font-black text-slate-950">{title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{text}</p></div>; }
