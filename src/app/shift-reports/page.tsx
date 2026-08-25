"use client";

import MainLayout from "@/components/layout/MainLayout";
import { DemoNotice, PageIntro, PrimaryButton, SecondaryButton, SectionCard, StatCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  closingChecklist,
  type CareLogEntry,
  type HandoffItem,
  type HealthSafetyRecord,
  openingChecklist,
  starterCareLogs,
  starterHandoffs,
  starterHealthSafety,
  starterShiftReports,
  type ShiftReport,
  type ShiftReportType,
} from "@/lib/employee-care";
import { starterEmployees } from "@/lib/hub-data";
import { careLocations, type LocationKey } from "@/lib/location-config";
import { Check, Eye, FileText, Lock, MessageSquareText, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { localIsoDate } from "@/lib/date-utils";
import { recordAuditEvent } from "@/lib/audit";

const today = localIsoDate();

type ReportForm = Omit<ShiftReport, "id" | "status" | "submittedAt" | "reviewedBy" | "reviewerInitials" | "reviewedAt">;

function createForm(type: ShiftReportType, location: Exclude<LocationKey, "All Locations">): ReportForm {
  const items = type === "Opening" ? openingChecklist : closingChecklist;
  return {
    type,
    location,
    date: today,
    shiftWindow: type === "Opening" ? "6:00 AM–12:00 PM" : "12:00 PM–Close",
    completedBy: "",
    initials: "",
    positiveBehaviors: "",
    babyUpdates: "",
    misbehaviors: "",
    booBoos: "",
    parentCommunication: "",
    pickupInformation: "",
    operationsNotes: "",
    checklist: Object.fromEntries(items.map((item) => [item, false])),
  };
}

export default function ShiftReportsPage() {
  const { location: activeLocation } = useHubLocation();
  const selectedLocation: Exclude<LocationKey, "All Locations"> = activeLocation === "All Locations" ? "Halcom" : activeLocation;
  const [reports, setReports] = usePersistentState<ShiftReport[]>("tcs-shift-reports-v1", starterShiftReports);
  const [handoffs, setHandoffs] = usePersistentState<HandoffItem[]>("tcs-shift-handoffs-v1", starterHandoffs);
  const [careLogs] = usePersistentState<CareLogEntry[]>("tcs-daily-care-v1", starterCareLogs);
  const [healthRecords] = usePersistentState<HealthSafetyRecord[]>("tcs-health-safety-v1", starterHealthSafety);
  const [tab, setTab] = useState<"New Report" | "Report History" | "Pickup Handoff">("New Report");
  const [form, setForm] = useState<ReportForm>(() => createForm("Opening", selectedLocation));
  const [message, setMessage] = useState("");
  const [reviewInitials, setReviewInitials] = useState<Record<string, string>>({});
  const [handoffInitials, setHandoffInitials] = useState<Record<string, string>>({});

  const locationReports = useMemo(() => reports.filter((report) => activeLocation === "All Locations" || report.location === activeLocation).sort((a, b) => `${b.date}${b.submittedAt ?? ""}`.localeCompare(`${a.date}${a.submittedAt ?? ""}`)), [reports, activeLocation]);
  const openHandoffs = handoffs.filter((item) => !item.completed && (activeLocation === "All Locations" || item.location === activeLocation));
  const reviewed = locationReports.filter((report) => report.status === "Reviewed").length;
  const careSnapshot = careLogs.filter((entry) => entry.location === form.location && entry.date === form.date);
  const healthSnapshot = healthRecords.filter((entry) => entry.location === form.location && entry.date === form.date);
  const careCounts = {
    meals: careSnapshot.filter((entry) => entry.category === "Meal" || entry.category === "Bottle").length,
    diapers: careSnapshot.filter((entry) => entry.category === "Diaper").length,
    potty: careSnapshot.filter((entry) => entry.category === "Potty").length,
    rest: careSnapshot.filter((entry) => entry.category === "Rest").length,
  };

  function changeType(type: ShiftReportType) {
    setForm(createForm(type, form.location));
  }

  function changeLocation(location: Exclude<LocationKey, "All Locations">) {
    setForm((current) => ({ ...current, location }));
  }

  function setText(field: keyof Pick<ReportForm, "positiveBehaviors" | "babyUpdates" | "misbehaviors" | "booBoos" | "parentCommunication" | "pickupInformation" | "operationsNotes">, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function saveReport(status: "Draft" | "Submitted") {
    if (!form.completedBy.trim() || form.initials.trim().length < 2) {
      setMessage("Enter the employee name and initials before saving.");
      return;
    }
    const report: ShiftReport = {
      ...form,
      id: `report-${Date.now()}`,
      initials: form.initials.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4),
      status,
      submittedAt: status === "Submitted" ? new Date().toISOString() : undefined,
    };
    setReports((current) => [report, ...current]);
    if (status === "Submitted" && form.pickupInformation.trim()) {
      const item: HandoffItem = {
        id: `handoff-${Date.now()}`,
        sourceReportId: report.id,
        location: report.location,
        date: report.date,
        category: "Pickup Information",
        details: report.pickupInformation.trim(),
        priority: "Important",
        completed: false,
        completedByInitials: "",
      };
      setHandoffs((current) => [item, ...current]);
    }
    setMessage(status === "Submitted" ? `${report.type} report submitted for the incoming team.` : "Draft saved.");
    setForm(createForm(report.type, report.location));
    window.setTimeout(() => setMessage(""), 2400);
  }

  async function reviewReport(id: string) {
    const initials = (reviewInitials[id] ?? "").trim().toUpperCase();
    if (initials.length < 2) return;
    const report = reports.find((item) => item.id === id);
    if (!report) return;
    setReports((current) => current.map((item) => item.id === id ? { ...item, status: "Reviewed", reviewedBy: "Director / Licensee", reviewerInitials: initials.slice(0, 4), reviewedAt: new Date().toISOString() } : item));
    await recordAuditEvent({ action: "REVIEW", tableName: "shift_reports", legacyId: id, location: report.location, metadata: { reportType: report.type, reportDate: report.date, reviewerInitials: initials.slice(0, 4) } });
  }

  function completeHandoff(id: string) {
    const initials = (handoffInitials[id] ?? "").trim().toUpperCase();
    if (initials.length < 2) return;
    setHandoffs((current) => current.map((item) => item.id === id ? { ...item, completed: true, completedByInitials: initials.slice(0, 4), completedAt: new Date().toISOString() } : item));
  }

  function addCareSnapshot() {
    const summary = `Daily Care shows ${careCounts.meals} meal/bottle entries, ${careCounts.diapers} diaper changes, ${careCounts.potty} potty entries, and ${careCounts.rest} rest/sleep entries today.`;
    setForm((current) => ({ ...current, babyUpdates: [current.babyUpdates, summary].filter(Boolean).join("\n\n") }));
  }

  function addHealthSnapshot() {
    const summary = healthSnapshot.map((entry) => `${entry.childName}: ${entry.type} — ${entry.summary}`).join("\n");
    setForm((current) => ({ ...current, booBoos: [current.booBoos, summary].filter(Boolean).join("\n\n") }));
  }

  const checklistItems = Object.keys(form.checklist);
  const checklistComplete = Object.values(form.checklist).filter(Boolean).length;

  return <MainLayout><div className="mx-auto max-w-[1450px] space-y-6">
    <PageIntro eyebrow="Private team communication" title="Opening & Closing Reports" description="Use the same general update format your team already follows. These reports are internal staff records and will never appear in a family portal or family-facing feed." actions={<div className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-800"><Lock className="h-4 w-4" /> Never Shared With Families</div>} />
    <DemoNotice />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Reports Saved" value={locationReports.length} icon={<FileText className="h-5 w-5" />} />
      <StatCard label="Awaiting Review" value={locationReports.filter((report) => report.status === "Submitted").length} icon={<Eye className="h-5 w-5" />} tone="amber" />
      <StatCard label="Reviewed" value={reviewed} icon={<ShieldCheck className="h-5 w-5" />} tone="blue" />
      <StatCard label="Open Pickup Handoffs" value={openHandoffs.length} icon={<MessageSquareText className="h-5 w-5" />} tone="red" />
    </section>

    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">{(["New Report", "Report History", "Pickup Handoff"] as const).map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-xl px-4 py-2.5 text-sm font-black ${tab === item ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{item}</button>)}</div>

    {tab === "New Report" && <div className="grid gap-6 xl:grid-cols-[1.22fr_.78fr]">
      <SectionCard title={`${form.type} Report`} description="One general location update. Mention individual children only when it is necessary for the team handoff.">
        <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Report type"><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => changeType("Opening")} className={`rounded-xl border px-3 py-2.5 text-sm font-black ${form.type === "Opening" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200"}`}>Opening</button><button type="button" onClick={() => changeType("Closing")} className={`rounded-xl border px-3 py-2.5 text-sm font-black ${form.type === "Closing" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200"}`}>Closing</button></div></Field>
          <Field label="Location"><select className={inputClass} value={form.location} onChange={(event) => changeLocation(event.target.value as Exclude<LocationKey, "All Locations">)}>{careLocations.map((location) => <option key={location}>{location}</option>)}</select></Field>
          <Field label="Date"><input type="date" className={inputClass} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></Field>
          <Field label="Shift window"><input className={inputClass} value={form.shiftWindow} onChange={(event) => setForm({ ...form, shiftWindow: event.target.value })} /></Field>
        </div>

        <div className="space-y-4">
          <ReportArea title="💚 Positive Behaviors" helper="Overall arrivals, mood, activities, interactions, and what went well." value={form.positiveBehaviors} onChange={(value) => setText("positiveBehaviors", value)} />
          <ReportArea title="💚 Baby Updates 👶🏼🍼" helper="General bottles, meals, diapers, sleep, mood, or infant concerns. Detailed entries remain in Daily Care." value={form.babyUpdates} onChange={(value) => setText("babyUpdates", value)} />
          <ReportArea title="💚 Misbehaviors or Concerns" helper="General behavior concerns, triggers, redirection, and anything the incoming team should continue watching." value={form.misbehaviors} onChange={(value) => setText("misbehaviors", value)} />
          <ReportArea title="💚 Boo-Boo Reports" helper="Injuries, first aid, incident reports, or whether a parent still needs to be contacted." value={form.booBoos} onChange={(value) => setText("booBoos", value)} />
          <ReportArea title="💚 Parent Communication" helper="Information received at drop-off, changes, requests, and conversations already completed." value={form.parentCommunication} onChange={(value) => setText("parentCommunication", value)} />
          <ReportArea title="💚 Information for Pickup" helper="Anything the next team needs to remember to tell families at pickup. This stays internal until staff communicates it separately." value={form.pickupInformation} onChange={(value) => setText("pickupInformation", value)} emphasized />
          <ReportArea title="💚 Operations / Team Notes" helper="Staffing, ratios, supplies, transportation, cleaning, or unfinished items for the next shift." value={form.operationsNotes} onChange={(value) => setText("operationsNotes", value)} />
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Completed by"><select className={inputClass} value={form.completedBy} onChange={(event) => setForm({ ...form, completedBy: event.target.value })}><option value="">Select employee</option>{starterEmployees.map((employee) => <option key={employee.id}>{employee.name}</option>)}</select></Field>
          <Field label="Staff initials"><input className={`${inputClass} uppercase`} maxLength={4} value={form.initials} onChange={(event) => setForm({ ...form, initials: event.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} placeholder="LM" /></Field>
        </div>
        {message && <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-bold ${message.includes("submitted") || message.includes("saved") ? "border border-emerald-200 bg-emerald-50 text-emerald-900" : "border border-amber-200 bg-amber-50 text-amber-900"}`}>{message}</div>}
        <div className="mt-5 flex flex-wrap justify-end gap-3"><SecondaryButton onClick={() => saveReport("Draft")}>Save Draft</SecondaryButton><PrimaryButton onClick={() => saveReport("Submitted")}><Check className="h-4 w-4" /> Submit to Team</PrimaryButton></div>
      </SectionCard>

      <div className="space-y-6">
        <SectionCard title="Today’s Care Snapshot" description="Pulls from employee Daily Care and Health & Safety entries so the shift report is easier to finish.">
          <div className="grid grid-cols-2 gap-3"><Snapshot label="Meals / bottles" value={careCounts.meals} /><Snapshot label="Diapers" value={careCounts.diapers} /><Snapshot label="Potty entries" value={careCounts.potty} /><Snapshot label="Rest / sleep" value={careCounts.rest} /></div>
          <div className="mt-3 rounded-xl bg-slate-50 p-3"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Health / safety entries</p><p className="mt-1 text-2xl font-black text-slate-950">{healthSnapshot.length}</p></div>
          <div className="mt-4 space-y-2">
            <button type="button" onClick={addCareSnapshot} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-left text-xs font-black text-slate-700 hover:bg-slate-50">Add care-count summary to Baby Updates</button>
            {healthSnapshot.length > 0 && <button type="button" onClick={addHealthSnapshot} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-left text-xs font-black text-slate-700 hover:bg-slate-50">Add health summary to Boo-Boo Reports</button>}
          </div>
        </SectionCard>
        <SectionCard title={`${form.type} Operations Check`} description={`${checklistComplete} of ${checklistItems.length} complete`}>
          <div className="space-y-3">{checklistItems.map((item) => <label key={item} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" checked={form.checklist[item]} onChange={(event) => setForm({ ...form, checklist: { ...form.checklist, [item]: event.target.checked } })} className="mt-1 h-4 w-4" /><span className="text-sm font-bold leading-6 text-slate-700">{item}</span></label>)}</div>
        </SectionCard>
        <SectionCard title="Privacy Rule" description="Hard boundary for future parent features"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm leading-6 text-red-900"><p className="font-black">Opening and closing reports are staff-only forever.</p><p className="mt-2">They cannot be attached to a child update, copied into a parent feed, or automatically sent to families. Any family message must be written and sent separately through the future communication area.</p></div></SectionCard>
      </div>
    </div>}

    {tab === "Report History" && <SectionCard title="Internal Report History" description="Directors and licensees can review submitted reports and leave the original staff entry unchanged.">
      <div className="space-y-4">{locationReports.map((report) => <article key={report.id} className="rounded-2xl border border-slate-200 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-black text-slate-950">{report.type} Report • {report.location}</h3><StatusBadge tone={report.status === "Reviewed" ? "green" : report.status === "Submitted" ? "amber" : "slate"}>{report.status}</StatusBadge></div><p className="mt-1 text-sm font-semibold text-slate-500">{report.date} • {report.shiftWindow} • {report.completedBy} ({report.initials})</p></div>{report.status === "Submitted" && <div className="flex gap-2"><input className="w-24 rounded-xl border border-slate-300 px-3 py-2 text-center text-sm font-black uppercase" placeholder="DM" value={reviewInitials[report.id] ?? ""} onChange={(event) => setReviewInitials({ ...reviewInitials, [report.id]: event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) })} /><button onClick={() => void reviewReport(report.id)} disabled={(reviewInitials[report.id] ?? "").length < 2} className="tcs-primary-button rounded-xl px-3 py-2 text-xs font-black disabled:opacity-40">Review</button></div>}</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2"><Summary title="Positive Behaviors" value={report.positiveBehaviors} /><Summary title="Baby Updates" value={report.babyUpdates} /><Summary title="Misbehaviors / Concerns" value={report.misbehaviors} /><Summary title="Boo-Boos" value={report.booBoos} /><Summary title="Parent Communication" value={report.parentCommunication} /><Summary title="Information for Pickup" value={report.pickupInformation} emphasized /><Summary title="Operations Notes" value={report.operationsNotes} /></div>
        {report.status === "Reviewed" && <p className="mt-4 text-xs font-black text-emerald-800">Reviewed by {report.reviewerInitials} • original report preserved</p>}
      </article>)}{!locationReports.length && <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">No reports saved for this location yet.</div>}</div>
    </SectionCard>}

    {tab === "Pickup Handoff" && <SectionCard title="Pickup Handoff Board" description="Unresolved pickup reminders remain visible to the incoming team until someone initials them complete.">
      <div className="space-y-4">{handoffs.filter((item) => activeLocation === "All Locations" || item.location === activeLocation).map((item) => <article key={item.id} className={`rounded-2xl border p-5 ${item.completed ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"}`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm"><MessageSquareText className="h-5 w-5 text-amber-700" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-950">{item.location} • {item.date}</p><StatusBadge tone={item.completed ? "green" : item.priority === "Urgent" ? "red" : "amber"}>{item.completed ? "Completed" : item.priority}</StatusBadge></div><p className="mt-1 text-sm leading-6 text-slate-700">{item.details}</p></div>{item.completed ? <span className="rounded-xl bg-white px-3 py-2 text-xs font-black text-emerald-800">Completed by {item.completedByInitials}</span> : <div className="flex gap-2"><input className="w-24 rounded-xl border border-slate-300 px-3 py-2 text-center text-sm font-black uppercase" placeholder="Initials" value={handoffInitials[item.id] ?? ""} onChange={(event) => setHandoffInitials({ ...handoffInitials, [item.id]: event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) })} /><button onClick={() => completeHandoff(item.id)} disabled={(handoffInitials[item.id] ?? "").length < 2} className="tcs-primary-button rounded-xl px-3 py-2 text-xs font-black disabled:opacity-40">Mark Shared</button></div>}</div>
      </article>)}{!handoffs.length && <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">No pickup handoffs have been created yet.</div>}</div>
    </SectionCard>}
  </div></MainLayout>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className="mb-1.5 block text-sm font-black text-slate-700">{label}</span>{children}</label>;
}

function ReportArea({ title, helper, value, onChange, emphasized = false }: { title: string; helper: string; value: string; onChange: (value: string) => void; emphasized?: boolean }) {
  return <label className={`block rounded-2xl border p-4 ${emphasized ? "border-amber-300 bg-amber-50/50" : "border-slate-200"}`}><span className="block font-black text-slate-950">{title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{helper}</span><textarea className={`${inputClass} mt-3 min-h-28`} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Enter the general location update…" /></label>;
}

function Summary({ title, value, emphasized = false }: { title: string; value: string; emphasized?: boolean }) {
  return <div className={`rounded-xl p-3 ${emphasized ? "border border-amber-200 bg-amber-50" : "bg-slate-50"}`}><p className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</p><p className="mt-1 text-sm leading-6 text-slate-700">{value || "None reported."}</p></div>;
}


function Snapshot({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xl font-black text-slate-950">{value}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p></div>;
}
