"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import type { ChildRecord, SchoolAgeSupportRecord } from "@/lib/children";
import {
  AlertTriangle,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  FileText,
  GraduationCap,
  LoaderCircle,
  Search,
  Save,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

function childName(child: ChildRecord) {
  return `${child.firstName} ${child.lastName}`.trim();
}

function blankSupport(): SchoolAgeSupportRecord {
  return {
    schoolName: "",
    grade: "",
    schoolContactName: "",
    schoolContactEmail: "",
    schoolContactPhone: "",
    homeworkSupport: "",
    academicNotes: "",
    iep504Status: "None Reported",
    accommodations: "",
    nextSchoolMeetingDate: "",
    behaviorPlanActive: false,
    behaviorReviewDate: "",
    behaviorSupports: "",
    familyFollowUp: "",
    updatedAt: new Date().toISOString(),
  };
}

function daysUntil(value: string) {
  if (!value) return null;
  const due = Date.parse(`${value}T12:00:00`);
  if (!Number.isFinite(due)) return null;
  return Math.ceil((due - Date.now()) / 86400000);
}

function matchesLocation(value: string, selected: string) {
  if (selected === "All Locations") return true;
  return value.toLowerCase().includes(selected.toLowerCase()) || selected.toLowerCase().includes(value.toLowerCase());
}

export default function SchoolAgeSupportPage() {
  const { session, profile, isEmployee } = useAuth();
  const { location } = useHubLocation();
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [editing, setEditing] = useState<ChildRecord | null>(null);
  const [record, setRecord] = useState<SchoolAgeSupportRecord>(blankSupport());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const response = await fetch("/api/children", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json() as { children?: ChildRecord[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load School Age support records.");
      setChildren(Array.isArray(payload.children) ? payload.children : []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load School Age support records.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  const schoolAgeChildren = useMemo(() => {
    const query = search.trim().toLowerCase();
    return children
      .filter((child) => child.enrollmentStatus !== "Archived" && child.ageGroup === "School Age")
      .filter((child) => matchesLocation(child.location, location))
      .filter((child) => !query || `${childName(child)} ${child.primaryGuardian} ${child.schoolAgeSupport?.schoolName || ""}`.toLowerCase().includes(query))
      .sort((a, b) => childName(a).localeCompare(childName(b)));
  }, [children, location, search]);

  const attention = schoolAgeChildren.filter((child) => {
    const support = child.schoolAgeSupport;
    if (!support) return true;
    const meetingDays = daysUntil(support.nextSchoolMeetingDate);
    const behaviorDays = daysUntil(support.behaviorReviewDate);
    const planNeedsDetails = support.iep504Status !== "None Reported" && !support.accommodations.trim();
    return planNeedsDetails ||
      (meetingDays !== null && meetingDays <= 30) ||
      (support.behaviorPlanActive && (!support.behaviorSupports.trim() || (behaviorDays !== null && behaviorDays <= 30)));
  });

  function open(child: ChildRecord) {
    setEditing(child);
    setRecord(child.schoolAgeSupport ? { ...child.schoolAgeSupport } : blankSupport());
    setError("");
  }

  async function save() {
    if (!editing || !session?.access_token) return;
    setSaving(true);
    setError("");
    const child: ChildRecord = {
      ...editing,
      schoolAgeSupport: {
        ...record,
        updatedAt: new Date().toISOString(),
      },
    };

    try {
      const response = await fetch("/api/children", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "save", child }),
      });
      const payload = await response.json() as { child?: ChildRecord; error?: string };
      if (!response.ok || !payload.child) throw new Error(payload.error || "Could not save School Age support record.");
      setChildren((current) => current.map((item) => item.id === payload.child!.id ? payload.child! : item));
      setEditing(null);
      setNotice(`${childName(payload.child)} support record saved.`);
      window.setTimeout(() => setNotice(""), 3200);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save School Age support record.");
    } finally {
      setSaving(false);
    }
  }

  if (isEmployee) {
    return <MainLayout><div className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-amber-700" /><h1 className="mt-3 text-2xl font-black text-amber-950">Restricted School Age support records</h1><p className="mt-2 text-sm font-semibold leading-6 text-amber-900">IEP/504, academic-support, and behavior-plan tracking is limited to Owner/Admin and assigned Licensee accounts.</p></div></MainLayout>;
  }

  return <MainLayout><div className="mx-auto max-w-[1450px] space-y-6 pb-12">
    <section className="overflow-hidden rounded-[30px] bg-gradient-to-br from-[#102f52] via-[#174b7c] to-[#2e6c47] p-6 text-white shadow-xl sm:p-8">
      <div><p className="text-xs font-black uppercase tracking-[.18em] text-blue-200">School Age academic + support system</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">School Age Support Center</h1><p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-blue-50/80">Track homework support, school contacts, IEP/504 status, accommodations, behavior plans, review dates, and family follow-up without mixing these confidential records into general staff tools.</p></div>
    </section>

    {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-900">{notice}</div>}
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">{error}</div>}

    <section className="grid gap-3 sm:grid-cols-3">
      <Metric icon={<Users className="h-5 w-5" />} label="School Age Children" value={schoolAgeChildren.length} tone="blue" />
      <Metric icon={<AlertTriangle className="h-5 w-5" />} label="Needs Support Review" value={attention.length} tone={attention.length ? "amber" : "green"} />
      <Metric icon={<CheckCircle2 className="h-5 w-5" />} label="Records Current" value={Math.max(0, schoolAgeChildren.length - attention.length)} tone="green" />
    </section>

    <label className="relative block"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search child, guardian, or school…" className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold shadow-sm" /></label>

    {loading ? <div className="flex min-h-72 items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white text-sm font-bold text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading School Age support records…</div> :
      schoolAgeChildren.length === 0 ? <div className="grid min-h-72 place-items-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center"><div><GraduationCap className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-3 text-xl font-black text-slate-800">No School Age children in this view</h2></div></div> :
      <section className="grid gap-4 xl:grid-cols-2">{schoolAgeChildren.map((child) => {
        const support = child.schoolAgeSupport;
        const meetingDays = daysUntil(support?.nextSchoolMeetingDate || "");
        const behaviorDays = daysUntil(support?.behaviorReviewDate || "");
        const needs = !support ||
          (support.iep504Status !== "None Reported" && !support.accommodations.trim()) ||
          (meetingDays !== null && meetingDays <= 30) ||
          Boolean(support.behaviorPlanActive && (!support.behaviorSupports.trim() || (behaviorDays !== null && behaviorDays <= 30)));
        return <article key={child.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{child.location}</p><h2 className="mt-1 text-xl font-black text-slate-950">{childName(child)}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{support?.schoolName || "School not entered"} • Grade {support?.grade || "—"}</p></div>
            <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${needs ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{needs ? "Review" : "Current"}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Info label="IEP / 504" value={support?.iep504Status || "Not entered"} />
            <Info label="Next School Meeting" value={support?.nextSchoolMeetingDate || "Not set"} />
            <Info label="Behavior Plan" value={support?.behaviorPlanActive ? "Active" : "Not active"} />
            <Info label="Behavior Review" value={support?.behaviorReviewDate || "Not set"} />
          </div>
          <button onClick={() => open(child)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#174b7c] px-4 py-3 text-sm font-black text-white"><BookOpenCheck className="h-4 w-4" /> Open Support Record</button>
        </article>;
      })}</section>}

    {editing && <div className="fixed inset-0 z-[10000] overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm">
      <section className="mx-auto my-6 w-full max-w-5xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 bg-gradient-to-r from-[#102f52] to-[#2e6c47] px-5 py-4 text-white"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-blue-100">Restricted School Age support record</p><h2 className="mt-1 text-2xl font-black">{childName(editing)}</h2></div><button onClick={() => setEditing(null)} className="rounded-xl bg-white/10 p-2"><X className="h-5 w-5" /></button></header>
        <div className="space-y-5 p-5">
          <section className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
            <Field label="School"><input value={record.schoolName} onChange={(event) => setRecord({ ...record, schoolName: event.target.value })} className={inputClass} /></Field>
            <Field label="Grade"><input value={record.grade} onChange={(event) => setRecord({ ...record, grade: event.target.value })} className={inputClass} /></Field>
            <Field label="School Contact"><input value={record.schoolContactName} onChange={(event) => setRecord({ ...record, schoolContactName: event.target.value })} className={inputClass} /></Field>
            <Field label="Contact Email"><input type="email" value={record.schoolContactEmail} onChange={(event) => setRecord({ ...record, schoolContactEmail: event.target.value })} className={inputClass} /></Field>
            <Field label="Contact Phone"><input value={record.schoolContactPhone} onChange={(event) => setRecord({ ...record, schoolContactPhone: event.target.value })} className={inputClass} /></Field>
            <Field label="IEP / 504 Status"><select value={record.iep504Status} onChange={(event) => setRecord({ ...record, iep504Status: event.target.value as SchoolAgeSupportRecord["iep504Status"] })} className={inputClass}><option>None Reported</option><option>IEP</option><option>504</option><option>Pending Review</option></select></Field>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Area icon={<BookOpenCheck className="h-5 w-5 text-blue-700" />} title="Homework & Academic Support">
              <Field label="Homework Support Plan"><textarea value={record.homeworkSupport} onChange={(event) => setRecord({ ...record, homeworkSupport: event.target.value })} placeholder="Homework routine, subjects needing support, tutoring approach, accommodations used during homework…" className={areaClass} /></Field>
              <Field label="Academic Notes"><textarea value={record.academicNotes} onChange={(event) => setRecord({ ...record, academicNotes: event.target.value })} placeholder="Progress, school concerns, missing work, reading/math support, follow-up…" className={areaClass} /></Field>
            </Area>

            <Area icon={<FileText className="h-5 w-5 text-purple-700" />} title="IEP / 504 Support">
              <Field label="Accommodations / Supports"><textarea value={record.accommodations} onChange={(event) => setRecord({ ...record, accommodations: event.target.value })} placeholder="Only enter supports TCS is authorized and expected to follow." className={areaClass} /></Field>
              <Field label="Next School Meeting / Review"><input type="date" value={record.nextSchoolMeetingDate} onChange={(event) => setRecord({ ...record, nextSchoolMeetingDate: event.target.value })} className={inputClass} /></Field>
            </Area>
          </section>

          <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
            <label className="flex items-start gap-3"><input type="checkbox" checked={record.behaviorPlanActive} onChange={(event) => setRecord({ ...record, behaviorPlanActive: event.target.checked })} className="mt-1 h-4 w-4 accent-amber-700" /><span><strong className="block text-amber-950">Behavior support plan active</strong><small className="mt-1 block text-xs leading-5 text-amber-800">Use this only when a TCS behavior/support plan is actually active for the child.</small></span></label>
            {record.behaviorPlanActive && <div className="mt-4 grid gap-4 lg:grid-cols-2"><Field label="Behavior Supports"><textarea value={record.behaviorSupports} onChange={(event) => setRecord({ ...record, behaviorSupports: event.target.value })} placeholder="Triggers, supports, de-escalation steps, reinforcement, participation expectations…" className={areaClass} /></Field><div className="space-y-4"><Field label="Next Behavior Review"><input type="date" value={record.behaviorReviewDate} onChange={(event) => setRecord({ ...record, behaviorReviewDate: event.target.value })} className={inputClass} /></Field><Field label="Family Follow-Up"><textarea value={record.familyFollowUp} onChange={(event) => setRecord({ ...record, familyFollowUp: event.target.value })} className={areaClass} /></Field></div></div>}
          </section>
        </div>
        <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white/95 p-4 backdrop-blur"><button onClick={() => setEditing(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700">Cancel</button><button disabled={saving} onClick={() => void save()} className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-[#174b7c] px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Support Record</button></footer>
      </section>
    </div>}
  </div></MainLayout>;
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-blue-400";
const areaClass = "min-h-28 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold leading-6 outline-none focus:border-blue-400";

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "blue" | "green" | "amber" }) {
  const styles = { blue: "bg-blue-100 text-blue-800", green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-900" };
  return <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`grid h-10 w-10 place-items-center rounded-xl ${styles[tone]}`}>{icon}</span><div><strong className="block text-2xl font-black text-slate-950">{value}</strong><span className="text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</span></div></div>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><span className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</span><strong className="mt-1 block text-xs text-slate-900">{value}</strong></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>;
}
function Area({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-4 flex items-center gap-2">{icon}<h3 className="font-black text-slate-950">{title}</h3></div><div className="space-y-4">{children}</div></section>;
}
