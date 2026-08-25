"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { Modal, PageIntro, PrimaryButton, SecondaryButton, SectionCard, StatCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { usePersistentState } from "@/hooks/usePersistentState";
import { enrollmentStages, starterEnrollmentLeads, type EnrollmentLeadRecord, type EnrollmentStage } from "@/lib/admin-ops";
import { CalendarClock, CheckCircle2, ClipboardList, Plus, Search, UsersRound } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

const blankLead: EnrollmentLeadRecord = {
  id: 0,
  location: "Division",
  familyName: "",
  parentName: "",
  phone: "",
  email: "",
  childName: "",
  childAge: "",
  requestedCare: "",
  transportationNeeded: false,
  subsidy: "",
  stage: "Inquiry",
  tourDate: "",
  followUpDate: "",
  assignedTo: "",
  notes: "",
  createdAt: "",
};

function isPastDue(date: string) {
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${date}T12:00:00`);
  return target < today;
}

function stageTone(stage: EnrollmentStage) {
  if (stage === "Enrolled") return "green" as const;
  if (stage === "Declined") return "red" as const;
  if (stage === "Waitlist" || stage === "Agency Pending" || stage === "Documents Needed") return "amber" as const;
  if (stage === "Tour Scheduled" || stage === "Tour Completed") return "blue" as const;
  return "purple" as const;
}

export default function EnrollmentPipelinePage() {
  const { location } = useHubLocation();
  const [leads, setLeads] = usePersistentState<EnrollmentLeadRecord[]>("tcs-enrollment-pipeline-v1", starterEnrollmentLeads);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<EnrollmentStage | "All Stages">("All Stages");
  const [editing, setEditing] = useState<EnrollmentLeadRecord | null>(null);

  const visible = useMemo(() => leads.filter((lead) => location === "All Locations" || lead.location === location)
    .filter((lead) => stage === "All Stages" || lead.stage === stage)
    .filter((lead) => {
      const query = search.trim().toLowerCase();
      return !query || [lead.familyName, lead.parentName, lead.childName, lead.phone, lead.email, lead.requestedCare].join(" ").toLowerCase().includes(query);
    })
    .sort((a, b) => (a.followUpDate || "9999").localeCompare(b.followUpDate || "9999")), [leads, location, search, stage]);

  const scoped = leads.filter((lead) => location === "All Locations" || lead.location === location);
  const tours = scoped.filter((lead) => lead.stage === "Tour Scheduled").length;
  const followUps = scoped.filter((lead) => !["Enrolled", "Declined"].includes(lead.stage) && isPastDue(lead.followUpDate)).length;
  const enrolled = scoped.filter((lead) => lead.stage === "Enrolled").length;

  function open(lead?: EnrollmentLeadRecord) {
    setEditing(lead ? { ...lead } : { ...blankLead, id: Date.now(), location: location === "All Locations" ? "Division" : location, createdAt: new Date().toISOString().slice(0, 10) });
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const record = { ...editing, familyName: editing.familyName.trim(), parentName: editing.parentName.trim(), childName: editing.childName.trim() };
    setLeads((current) => current.some((item) => item.id === record.id) ? current.map((item) => item.id === record.id ? record : item) : [...current, record]);
    setEditing(null);
  }

  return <MainLayout><div className="mx-auto max-w-[1600px] space-y-6">
    <PageIntro eyebrow="Enrollment CRM" title="Enrollment Pipeline" description="Move inquiries from first contact through tours, forms, subsidy/agency steps, and enrollment without losing follow-ups." actions={<PrimaryButton onClick={() => open()}><Plus className="h-4 w-4" /> Add Inquiry</PrimaryButton>} />
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm leading-6 text-indigo-950"><strong>Private administrative workflow:</strong> Owner/Admin sees the company. Location Licensees see their assigned location. Standard Employees do not have access.</div>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Active Prospects" value={scoped.filter((lead) => !["Enrolled", "Declined"].includes(lead.stage)).length} icon={<UsersRound className="h-5 w-5" />} />
      <StatCard label="Tours Scheduled" value={tours} icon={<CalendarClock className="h-5 w-5" />} tone="blue" />
      <StatCard label="Follow-Ups Overdue" value={followUps} icon={<ClipboardList className="h-5 w-5" />} tone={followUps ? "amber" : "emerald"} />
      <StatCard label="Enrolled" value={enrolled} icon={<CheckCircle2 className="h-5 w-5" />} tone="emerald" />
    </section>

    <SectionCard><div className="grid gap-3 lg:grid-cols-[1fr_250px]">
      <label className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search family, parent, child, phone, or care need…" /></label>
      <select className={inputClass} value={stage} onChange={(event) => setStage(event.target.value as EnrollmentStage | "All Stages")}><option>All Stages</option>{enrollmentStages.map((item) => <option key={item}>{item}</option>)}</select>
    </div></SectionCard>

    <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {visible.map((lead) => <article key={lead.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.15em] text-slate-400">{lead.location}</p><h2 className="mt-1 text-xl font-black text-slate-950">{lead.familyName || "Family name needed"}</h2></div><StatusBadge tone={stageTone(lead.stage)}>{lead.stage}</StatusBadge></div>
        <div className="mt-4 space-y-2 text-sm text-slate-600"><p><strong className="text-slate-800">Child:</strong> {lead.childName || "Not entered"} {lead.childAge ? `• ${lead.childAge}` : ""}</p><p><strong className="text-slate-800">Care:</strong> {lead.requestedCare || "Not entered"}</p><p><strong className="text-slate-800">Transportation:</strong> {lead.transportationNeeded ? "Requested / needed" : "Not requested"}</p><p><strong className="text-slate-800">Subsidy:</strong> {lead.subsidy || "Not entered"}</p></div>
        {(lead.tourDate || lead.followUpDate) && <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm"><p className="font-bold text-slate-800">{lead.tourDate ? `Tour: ${new Date(lead.tourDate).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : "No tour scheduled"}</p>{lead.followUpDate && <p className={`mt-1 font-semibold ${isPastDue(lead.followUpDate) && !["Enrolled", "Declined"].includes(lead.stage) ? "text-red-700" : "text-slate-600"}`}>Follow-up: {lead.followUpDate}{isPastDue(lead.followUpDate) && !["Enrolled", "Declined"].includes(lead.stage) ? " • OVERDUE" : ""}</p>}</div>}
        {lead.notes && <p className="mt-4 text-xs leading-5 text-slate-500">{lead.notes}</p>}
        <div className="mt-5 flex items-center justify-between gap-3"><p className="text-xs font-bold text-slate-500">Assigned: {lead.assignedTo || "Unassigned"}</p><SecondaryButton onClick={() => open(lead)}>Update</SecondaryButton></div>
      </article>)}
    </section>

    {editing && <Modal title={leads.some((item) => item.id === editing.id) ? "Update Enrollment Lead" : "Add Enrollment Inquiry"} description="Keep follow-up dates current so the Dashboard can surface what needs attention." onClose={() => setEditing(null)} footer={<><SecondaryButton onClick={() => setEditing(null)}>Cancel</SecondaryButton><PrimaryButton onClick={() => document.getElementById("enrollment-save")?.click()}>Save</PrimaryButton></>}>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label="Location"><select className={inputClass} value={editing.location} onChange={(event) => setEditing({ ...editing, location: event.target.value })}><option>Halcom</option><option>21st Street</option><option>Division</option><option>33rd Street</option><option>42nd Street</option><option>Tehachapi</option></select></Field>
        <Field label="Stage"><select className={inputClass} value={editing.stage} onChange={(event) => setEditing({ ...editing, stage: event.target.value as EnrollmentStage })}>{enrollmentStages.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Family name"><input required className={inputClass} value={editing.familyName} onChange={(event) => setEditing({ ...editing, familyName: event.target.value })} /></Field>
        <Field label="Parent / guardian"><input required className={inputClass} value={editing.parentName} onChange={(event) => setEditing({ ...editing, parentName: event.target.value })} /></Field>
        <Field label="Phone"><input className={inputClass} value={editing.phone} onChange={(event) => setEditing({ ...editing, phone: event.target.value })} /></Field>
        <Field label="Email"><input type="email" className={inputClass} value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })} /></Field>
        <Field label="Child name"><input className={inputClass} value={editing.childName} onChange={(event) => setEditing({ ...editing, childName: event.target.value })} /></Field>
        <Field label="Child age"><input className={inputClass} value={editing.childAge} onChange={(event) => setEditing({ ...editing, childAge: event.target.value })} /></Field>
        <Field label="Requested care" wide><input className={inputClass} value={editing.requestedCare} onChange={(event) => setEditing({ ...editing, requestedCare: event.target.value })} placeholder="After school, full day, weekend care…" /></Field>
        <Field label="Subsidy / funding"><input className={inputClass} value={editing.subsidy} onChange={(event) => setEditing({ ...editing, subsidy: event.target.value })} /></Field>
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3"><input type="checkbox" checked={editing.transportationNeeded} onChange={(event) => setEditing({ ...editing, transportationNeeded: event.target.checked })} /><span className="text-sm font-bold text-slate-700">Transportation needed</span></label>
        <Field label="Tour date / time"><input type="datetime-local" className={inputClass} value={editing.tourDate} onChange={(event) => setEditing({ ...editing, tourDate: event.target.value })} /></Field>
        <Field label="Follow-up date"><input type="date" className={inputClass} value={editing.followUpDate} onChange={(event) => setEditing({ ...editing, followUpDate: event.target.value })} /></Field>
        <Field label="Assigned to"><input className={inputClass} value={editing.assignedTo} onChange={(event) => setEditing({ ...editing, assignedTo: event.target.value })} /></Field>
        <Field label="Notes" wide><textarea className={`${inputClass} min-h-24`} value={editing.notes} onChange={(event) => setEditing({ ...editing, notes: event.target.value })} /></Field>
        <button id="enrollment-save" type="submit" className="hidden">Save</button>
      </form>
    </Modal>}
  </div></MainLayout>;
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-sm font-bold text-slate-700">{label}</span>{children}</label>;
}
