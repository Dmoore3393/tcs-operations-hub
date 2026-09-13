"use client";

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileSignature,
  Home,
  LoaderCircle,
  LogOut,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type ParentChild = {
  id: string;
  firstName: string;
  lastName: string;
  ageGroup: string;
  location: string;
  classroom: string;
  weeklySchedule: string;
  transportation: string;
  enrollmentStatus: string;
  attendanceToday: string;
  attendanceDate: string;
  checkedInAt: string;
  checkedOutAt: string;
  pickupPerson: string;
  missingDocuments: string[];
  medicalConsentStatus: string;
  nextAuditDue: string;
  fileAuditComplete: boolean;
  immunizationStatus: string;
};

type CareEntry = {
  id: string;
  childId: string;
  date: string;
  time: string;
  category: string;
  action: string;
  result: string;
  notes: string;
};

type ParentForm = {
  id: string;
  subjectName: string;
  formName: string;
  signerName: string;
  status: string;
  signatureMethod: string;
  requestedAt: string;
  dueDate: string;
  signedAt: string;
};

type Overview = {
  email: string;
  children: ParentChild[];
  careEntries: CareEntry[];
  forms: ParentForm[];
};

function childName(child: ParentChild) {
  return `${child.firstName} ${child.lastName}`.trim();
}

function formatDate(value: string) {
  if (!value) return "Not set";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function todayPacific() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function ParentPortalPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formToSign, setFormToSign] = useState<ParentForm | null>(null);
  const [typedName, setTypedName] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [notice, setNotice] = useState("");

  const loadOverview = useCallback(async (activeSession: Session) => {
    const response = await fetch("/api/parent/overview", {
      headers: { Authorization: `Bearer ${activeSession.access_token}` },
      cache: "no-store",
    });
    const payload = await response.json() as Overview & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Could not open your Parent Portal.");
    setOverview(payload);
    setSelectedChildId((current) => current || payload.children[0]?.id || "");
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setError("The secure Parent Portal connection is not configured.");
      setLoading(false);
      return;
    }

    let active = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      const next = data.session;
      if (!next) {
        router.replace("/parent-login");
        return;
      }
      setSession(next);
      try {
        await loadOverview(next);
        setError("");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not open your Parent Portal.");
      } finally {
        if (active) setLoading(false);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!next) {
        setSession(null);
        setOverview(null);
        router.replace("/parent-login");
        return;
      }
      setSession(next);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadOverview, router]);

  const selectedChild = useMemo(
    () => overview?.children.find((child) => child.id === selectedChildId) ?? overview?.children[0] ?? null,
    [overview, selectedChildId],
  );

  const care = useMemo(
    () => overview?.careEntries.filter((entry) => !selectedChild || entry.childId === selectedChild.id).slice(0, 20) ?? [],
    [overview, selectedChild],
  );

  const openForms = overview?.forms.filter((form) => !["Signed", "Archived"].includes(form.status)) ?? [];
  const signedForms = overview?.forms.filter((form) => form.status === "Signed") ?? [];

  async function signOut() {
    await supabase?.auth.signOut();
    router.replace("/parent-login");
  }

  function openForm(form: ParentForm) {
    setFormToSign(form);
    setTypedName(form.signerName || "");
    setAcknowledged(false);
    setError("");
  }

  async function acknowledgeForm() {
    if (!formToSign || !session) return;
    setSavingForm(true);
    setError("");
    try {
      const response = await fetch("/api/parent/forms", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          formId: formToSign.id,
          typedName,
          acknowledged,
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save the acknowledgment.");
      await loadOverview(session);
      setFormToSign(null);
      setNotice("Your acknowledgment was saved securely.");
      window.setTimeout(() => setNotice(""), 3200);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the acknowledgment.");
    } finally {
      setSavingForm(false);
    }
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f4f0e7] text-slate-700"><div className="text-center"><LoaderCircle className="mx-auto h-8 w-8 animate-spin text-emerald-700" /><p className="mt-3 text-sm font-black">Opening your secure family portal…</p></div></main>;
  }

  if (error && !overview) {
    return <main className="min-h-screen bg-[#f4f0e7] p-4 sm:p-8"><section className="mx-auto mt-16 max-w-xl rounded-[28px] border border-red-200 bg-white p-7 text-center shadow-xl"><AlertTriangle className="mx-auto h-10 w-10 text-red-700" /><h1 className="mt-3 text-2xl font-black text-slate-950">Parent Portal access needs attention</h1><p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{error}</p><button onClick={() => void signOut()} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Sign Out</button></section></main>;
  }

  return <main className="min-h-screen bg-[#f5f1e8] pb-24 text-slate-950">
    <header className="sticky top-0 z-30 border-b border-emerald-900/10 bg-[#173d29]/95 text-white shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-200">TCS Family Access</p><h1 className="text-lg font-black">The Hub Parent Portal</h1></div>
        <button onClick={() => void signOut()} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-black"><LogOut className="h-4 w-4" /> Sign Out</button>
      </div>
    </header>

    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-900">{notice}</div>}
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">{error}</div>}

      <section className="overflow-hidden rounded-[30px] bg-gradient-to-br from-[#173d29] via-[#2e6c47] to-[#143522] p-6 text-white shadow-xl">
        <p className="text-xs font-black uppercase tracking-[.18em] text-emerald-200">Welcome back</p>
        <h2 className="mt-2 text-3xl font-black">Your family at TCS</h2>
        <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-emerald-50/80">Attendance, schedules, daily updates, forms, and important record follow-up stay together here. Private staff-only and other-family records are never shown in this portal.</p>
        {overview && overview.children.length > 1 && <div className="mt-5 flex flex-wrap gap-2">{overview.children.map((child) => <button key={child.id} onClick={() => setSelectedChildId(child.id)} className={`rounded-xl px-3 py-2 text-xs font-black ${selectedChild?.id === child.id ? "bg-white text-emerald-950" : "bg-white/10 text-white"}`}>{childName(child)}</button>)}</div>}
      </section>

      {selectedChild && <>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card icon={<UserRound className="h-5 w-5" />} label="Attendance" value={selectedChild.attendanceDate === todayPacific() ? selectedChild.attendanceToday || "Not marked" : "Not marked today"} />
          <Card icon={<CalendarDays className="h-5 w-5" />} label="Schedule" value={selectedChild.weeklySchedule || "Schedule not entered"} />
          <Card icon={<Home className="h-5 w-5" />} label="Program" value={selectedChild.location || "Location not entered"} />
          <Card icon={<ShieldCheck className="h-5 w-5" />} label="Shot Record" value={selectedChild.immunizationStatus || "Needs review"} />
        </section>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3"><Sparkles className="h-5 w-5 text-emerald-700" /><div><h2 className="font-black text-slate-950">Today & recent care</h2><p className="text-xs text-slate-500">Updates staff have recorded for {selectedChild.firstName}.</p></div></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Info label="Checked In" value={selectedChild.attendanceDate === todayPacific() ? formatTime(selectedChild.checkedInAt) : "—"} />
              <Info label="Checked Out" value={selectedChild.attendanceDate === todayPacific() ? formatTime(selectedChild.checkedOutAt) : "—"} />
              <Info label="Pickup Person" value={selectedChild.attendanceDate === todayPacific() ? selectedChild.pickupPerson || "—" : "—"} />
              <Info label="Transportation" value={selectedChild.transportation || "No transportation"} />
            </div>

            <div className="mt-5 space-y-3">{care.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No recent daily-care updates are available yet.</p> : care.map((entry) => <div key={entry.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">{entry.category}</p><h3 className="mt-1 font-black text-slate-900">{entry.action || entry.result || "Care update"}</h3></div><span className="text-[10px] font-bold text-slate-400">{formatDate(entry.date)} • {entry.time}</span></div>{entry.result && entry.action && <p className="mt-2 text-sm font-semibold text-slate-700">{entry.result}</p>}{entry.notes && <p className="mt-2 text-xs leading-5 text-slate-500">{entry.notes}</p>}</div>)}</div>
          </section>

          <div className="space-y-5">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3"><ClipboardCheck className="h-5 w-5 text-blue-700" /><div><h2 className="font-black text-slate-950">File follow-up</h2><p className="text-xs text-slate-500">High-level status only; private internal notes stay with TCS.</p></div></div>
              <div className="mt-4 space-y-2">
                <StatusRow label="Child File Audit" ok={selectedChild.fileAuditComplete} value={selectedChild.fileAuditComplete ? "Current / complete" : "Needs follow-up"} />
                <StatusRow label="Next Audit" ok={Boolean(selectedChild.nextAuditDue)} value={selectedChild.nextAuditDue ? formatDate(selectedChild.nextAuditDue) : "Not set"} />
                <StatusRow label="Medical Consent" ok={selectedChild.medicalConsentStatus === "On File"} value={selectedChild.medicalConsentStatus || "Needs review"} />
                <StatusRow label="Immunization Record" ok={["Requirements Met", "Conditional", "Medical Exemption"].includes(selectedChild.immunizationStatus)} value={selectedChild.immunizationStatus} />
              </div>
              {selectedChild.missingDocuments.length > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900"><AlertTriangle className="mr-1 inline h-4 w-4" />TCS currently has {selectedChild.missingDocuments.length} file item{selectedChild.missingDocuments.length === 1 ? "" : "s"} marked for follow-up. Contact your location if you need the exact list.</div>}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><FileSignature className="h-5 w-5 text-purple-700" /><h2 className="font-black text-slate-950">Forms & acknowledgments</h2></div><p className="mt-1 text-xs text-slate-500">{openForms.length} item{openForms.length === 1 ? "" : "s"} waiting</p></div><Bell className="h-5 w-5 text-slate-400" /></div>
              <div className="mt-4 space-y-3">{openForms.length === 0 ? <p className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900"><CheckCircle2 className="mr-1 inline h-4 w-4" />No Parent Portal acknowledgments are currently waiting.</p> : openForms.map((form) => <div key={form.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-slate-900">{form.formName}</strong><p className="mt-1 text-[10px] text-slate-500">{form.subjectName || "Family form"} • Due {form.dueDate ? formatDate(form.dueDate) : "not set"}</p></div><span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-black text-amber-900">{form.status}</span></div>{form.signatureMethod === "Parent Portal Acknowledgment" ? <button onClick={() => openForm(form)} className="mt-3 w-full rounded-xl bg-purple-700 px-3 py-2.5 text-xs font-black text-white">Review & Acknowledge</button> : <p className="mt-3 text-[10px] font-semibold leading-4 text-slate-500">This form requires completion outside the Parent Portal. Contact your TCS location for instructions.</p>}</div>)}</div>
              {signedForms.length > 0 && <p className="mt-4 text-[10px] font-bold text-slate-400">{signedForms.length} portal/form item{signedForms.length === 1 ? "" : "s"} already completed.</p>}
            </section>
          </div>
        </div>
      </>}

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold leading-5 text-emerald-950"><ShieldCheck className="mr-1 inline h-4 w-4" />Parent Portal acknowledgment records the authenticated guardian email, typed name, time, and audit history. It is used only for forms TCS has specifically enabled for portal acknowledgment; it does not automatically replace a licensing form that requires a different signature process.</div>
    </div>

    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[max(.4rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-8px_28px_rgba(15,23,42,.10)] backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-3 px-4"><Bottom icon={<Home className="h-5 w-5" />} label="Home" /><Bottom icon={<CalendarDays className="h-5 w-5" />} label="Care" /><Bottom icon={<FileSignature className="h-5 w-5" />} label="Forms" /></div>
    </nav>

    {formToSign && <div className="fixed inset-0 z-[10000] overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm">
      <section className="mx-auto my-10 w-full max-w-xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 bg-gradient-to-r from-purple-800 to-purple-600 px-5 py-4 text-white"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-purple-100">Parent Portal acknowledgment</p><h2 className="mt-1 text-2xl font-black">{formToSign.formName}</h2></div><button onClick={() => setFormToSign(null)} className="rounded-xl bg-white/10 p-2"><X className="h-5 w-5" /></button></header>
        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 text-sm font-semibold leading-6 text-purple-950">By submitting this acknowledgment, you confirm that you reviewed the named TCS form/request and that the typed name below is yours. This portal does not display or manufacture a signature image.</div>
          <label><span className="mb-1 block text-xs font-black uppercase tracking-wider text-slate-500">Type your full name</span><input value={typedName} onChange={(event) => setTypedName(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold" /></label>
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1 h-4 w-4 accent-purple-700" /><span className="text-xs font-semibold leading-5 text-slate-700">I acknowledge that I reviewed this form/request and agree to submit this acknowledgment under my authenticated Parent Portal account.</span></label>
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 p-4"><button onClick={() => setFormToSign(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700">Cancel</button><button disabled={!typedName.trim() || !acknowledged || savingForm} onClick={() => void acknowledgeForm()} className="inline-flex min-w-36 items-center justify-center rounded-xl bg-purple-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">{savingForm ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Submit Acknowledgment"}</button></footer>
      </section>
    </div>}
  </main>;
}

function Card({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">{icon}</span><p className="mt-3 text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p><strong className="mt-1 block text-sm leading-5 text-slate-900">{value}</strong></section>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><span className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</span><strong className="mt-1 block text-xs text-slate-900">{value}</strong></div>;
}
function StatusRow({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><span className="text-xs font-black text-slate-700">{label}</span><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black ${ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}{value}</span></div>;
}
function Bottom({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <div className="flex min-h-[62px] flex-col items-center justify-center gap-1 text-[10px] font-black text-emerald-800"><span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-50">{icon}</span>{label}</div>;
}
