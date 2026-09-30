"use client";

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { displayDate, lateDurationLabel } from "@/lib/family-care-calendar";
import type { Session } from "@supabase/supabase-js";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  LoaderCircle,
  Lock,
  Send,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type CalendarChild = {
  id: string;
  rowId: string;
  firstName: string;
  lastName: string;
  locationId: string;
  location: string;
  canSubmit: boolean;
};

type CareWeek = {
  weekOf: string;
  dates: string[];
  deadlineAt: string;
  deadlineLabel: string;
  lateByMinutes: number;
  lateLabel: string;
  canSubmit: boolean;
};

type Closure = {
  id: string;
  locationId: string;
  date: string;
  title: string;
  note: string;
};

type ScheduleDay = {
  date: string;
  noCare: boolean;
  startTime: string;
  endTime: string;
  note: string;
};

type Submission = {
  id: string;
  childId: string;
  weekOf: string;
  requestKind: string;
  status: string;
  schedule: ScheduleDay[];
  submittedAt: string;
  deadlineAt: string;
  lateByMinutes: number;
  reviewedAt: string;
  reviewNote: string;
};

type CalendarPayload = {
  settings: {
    weeksAhead: number;
    lateGraceHours: number;
    deadlineTime: string;
    timeZone: string;
  };
  weeks: CareWeek[];
  children: CalendarChild[];
  closures: Closure[];
  submissions: Submission[];
};

function childLabel(child: CalendarChild) {
  return `${child.firstName} ${child.lastName}`.trim();
}

function statusStyle(status: string) {
  if (status === "Approved") return "bg-emerald-100 text-emerald-800";
  if (status === "Needs Changes") return "bg-blue-100 text-blue-900";
  if (status === "Unable to Accommodate") return "bg-red-100 text-red-800";
  if (status === "Superseded") return "bg-slate-100 text-slate-500";
  return "bg-amber-100 text-amber-900";
}

export default function ParentScheduleCalendarPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<CalendarPayload | null>(null);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [selectedWeekOf, setSelectedWeekOf] = useState("");
  const [draft, setDraft] = useState<ScheduleDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [warning, setWarning] = useState("");

  const load = useCallback(async (activeSession: Session) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/parent/schedules", {
        headers: { Authorization: `Bearer ${activeSession.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json() as CalendarPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not open the Family Care Calendar.");
      setData(payload);
      setSelectedChildId((current) => current || payload.children[0]?.id || "");
      setSelectedWeekOf((current) => current || payload.weeks[0]?.weekOf || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not open the Family Care Calendar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setError("The secure Parent Portal connection is not configured.");
      setLoading(false);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(({ data: authData }) => {
      if (!active) return;
      if (!authData.session) {
        router.replace("/parent-login");
        return;
      }
      setSession(authData.session);
      void load(authData.session);
    });
    return () => { active = false; };
  }, [load, router]);

  const selectedChild = data?.children.find((child) => child.id === selectedChildId) ?? data?.children[0] ?? null;
  const selectedWeek = data?.weeks.find((week) => week.weekOf === selectedWeekOf) ?? data?.weeks[0] ?? null;

  const latestSubmission = useMemo(() => {
    if (!data || !selectedChild || !selectedWeek) return null;
    return data.submissions.find((submission) =>
      submission.childId === selectedChild.id && submission.weekOf === selectedWeek.weekOf && submission.status !== "Superseded",
    ) ?? null;
  }, [data, selectedChild, selectedWeek]);

  const closureForDate = useCallback((date: string) => {
    if (!data || !selectedChild) return null;
    return data.closures.find((closure) =>
      closure.date === date && (!closure.locationId || closure.locationId === selectedChild.locationId),
    ) ?? null;
  }, [data, selectedChild]);

  useEffect(() => {
    if (!selectedWeek) {
      setDraft([]);
      return;
    }

    const prior = latestSubmission?.schedule ?? [];
    setDraft(selectedWeek.dates.map((date) => {
      const existing = prior.find((day) => day.date === date);
      const closed = closureForDate(date);
      return {
        date,
        noCare: closed ? true : existing?.noCare ?? true,
        startTime: existing?.startTime || "08:00",
        endTime: existing?.endTime || "17:00",
        note: existing?.note || "",
      };
    }));
    setNotice("");
    setWarning("");
  }, [closureForDate, latestSubmission, selectedWeek]);

  function updateDay(date: string, update: Partial<ScheduleDay>) {
    setDraft((current) => current.map((day) => day.date === date ? { ...day, ...update } : day));
  }

  async function submitSchedule() {
    if (!session || !selectedChild || !selectedWeek) return;
    setSaving(true);
    setError("");
    setNotice("");
    setWarning("");
    try {
      const response = await fetch("/api/parent/schedules", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          childId: selectedChild.id,
          weekOf: selectedWeek.weekOf,
          days: draft,
        }),
      });
      const payload = await response.json() as { error?: string; message?: string; warning?: string };
      if (!response.ok) throw new Error(payload.error || "Could not submit this care schedule.");
      setNotice(payload.message || "Your schedule was sent to TCS.");
      setWarning(payload.warning || "");
      await load(session);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not submit this care schedule.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f4f0e7] text-slate-700"><div className="text-center"><LoaderCircle className="mx-auto h-8 w-8 animate-spin text-emerald-700" /><p className="mt-3 text-sm font-black">Opening your care calendar…</p></div></main>;
  }

  if (error && !data) {
    return <main className="min-h-screen bg-[#f4f0e7] p-4 sm:p-8"><section className="mx-auto mt-16 max-w-xl rounded-[28px] border border-red-200 bg-white p-7 text-center shadow-xl"><AlertTriangle className="mx-auto h-10 w-10 text-red-700" /><h1 className="mt-3 text-2xl font-black text-slate-950">Family Care Calendar</h1><p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{error}</p><button onClick={() => router.push("/parent")} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Back to Parent Portal</button></section></main>;
  }

  return <main className="min-h-screen bg-[#f5f1e8] pb-16 text-slate-950">
    <header className="sticky top-0 z-30 border-b border-emerald-900/10 bg-[#173d29]/95 text-white shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <button onClick={() => router.push("/parent")} className="grid h-10 w-10 place-items-center rounded-xl bg-white/10"><ChevronLeft className="h-5 w-5" /></button>
        <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-200">TCS Family Access</p><h1 className="text-lg font-black">Family Care Calendar</h1></div>
      </div>
    </header>

    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <section className="overflow-hidden rounded-[30px] bg-gradient-to-br from-[#173d29] via-[#2e6c47] to-[#143522] p-6 text-white shadow-xl">
        <CalendarDays className="h-9 w-9 text-emerald-200" />
        <h2 className="mt-3 text-3xl font-black">Plan care when you know your schedule.</h2>
        <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-emerald-50/85">Submit upcoming weeks early, or send a late request when the app still allows it. Weekly schedules are due Friday by 6:00 PM. A submitted schedule is not guaranteed until TCS reviews space, staffing, and ratios.</p>
      </section>

      {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-black text-emerald-900"><CheckCircle2 className="mr-2 inline h-4 w-4" />{notice}</div>}
      {warning && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-black leading-6 text-amber-950"><AlertTriangle className="mr-2 inline h-4 w-4" />{warning}</div>}
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900">{error}</div>}

      {data && selectedChild && <>
        {data.children.length > 1 && <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Choose child</p>
          <div className="mt-3 flex flex-wrap gap-2">{data.children.map((child) => <button key={child.id} onClick={() => setSelectedChildId(child.id)} className={`rounded-xl px-4 py-2.5 text-xs font-black ${selectedChild.id === child.id ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-700"}`}>{childLabel(child)}</button>)}</div>
        </section>}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">{childLabel(selectedChild)} • {selectedChild.location}</p><h2 className="mt-1 text-xl font-black">Choose a care week</h2></div>
            <span className="w-fit rounded-full bg-blue-50 px-3 py-1.5 text-[10px] font-black text-blue-800">Up to {data.settings.weeksAhead} weeks early</span>
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">{data.weeks.map((week) => <button key={week.weekOf} onClick={() => setSelectedWeekOf(week.weekOf)} className={`min-w-[142px] rounded-2xl border p-3 text-left ${selectedWeek?.weekOf === week.weekOf ? "border-emerald-600 bg-emerald-50" : "border-slate-200 bg-white"}`}><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Week of</p><p className="mt-1 text-sm font-black text-slate-900">{displayDate(week.weekOf, { month: "short", day: "numeric" })}</p><p className={`mt-2 text-[9px] font-black ${week.lateByMinutes > 0 ? "text-amber-700" : "text-emerald-700"}`}>{week.lateByMinutes > 0 ? week.lateLabel : "Open early"}</p></button>)}</div>
        </section>

        {selectedWeek && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Week of {displayDate(selectedWeek.weekOf, { month: "long", day: "numeric", year: "numeric" })}</p><h2 className="mt-1 text-2xl font-black">Weekly care request</h2><p className="mt-2 text-xs font-semibold leading-5 text-slate-500">Tap “Need care” for each day your child will attend. Closed TCS dates cannot be selected.</p></div>
            <div className={`rounded-2xl border px-4 py-3 ${selectedWeek.lateByMinutes > 0 ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}><div className="flex items-center gap-2"><Clock3 className="h-4 w-4" /><span className="text-xs font-black">{selectedWeek.deadlineLabel}</span></div><p className="mt-1 text-[10px] font-semibold">{selectedWeek.lateByMinutes > 0 ? `${lateDurationLabel(selectedWeek.lateByMinutes)} — late requests are not guaranteed.` : "Submitting now is on time."}</p></div>
          </div>

          {latestSubmission && <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{latestSubmission.requestKind === "Change" ? "Schedule change request" : "Latest submission"}</p><p className="mt-1 text-xs font-bold text-slate-700">Submitted {new Date(latestSubmission.submittedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-black ${statusStyle(latestSubmission.status)}`}>{latestSubmission.status}</span></div>{latestSubmission.reviewNote && <p className="mt-3 rounded-xl bg-white p-3 text-xs font-semibold leading-5 text-slate-700"><strong>TCS note:</strong> {latestSubmission.reviewNote}</p>}</div>}

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{draft.map((day) => {
            const closure = closureForDate(day.date);
            return <article key={day.date} className={`rounded-2xl border p-4 ${closure ? "border-slate-300 bg-slate-100" : day.noCare ? "border-slate-200 bg-white" : "border-emerald-300 bg-emerald-50"}`}>
              <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{displayDate(day.date, { weekday: "long" })}</p><h3 className="mt-1 text-base font-black">{displayDate(day.date, { month: "short", day: "numeric" })}</h3></div>{closure ? <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-[9px] font-black text-white"><Lock className="h-3 w-3" />Closed</span> : <button type="button" onClick={() => updateDay(day.date, { noCare: !day.noCare })} className={`rounded-full px-3 py-1.5 text-[10px] font-black ${day.noCare ? "bg-slate-100 text-slate-600" : "bg-emerald-700 text-white"}`}>{day.noCare ? "No care" : "Need care"}</button>}</div>
              {closure ? <div className="mt-4 rounded-xl border border-slate-300 bg-white p-3"><p className="text-xs font-black text-slate-900">{closure.title}</p>{closure.note && <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-500">{closure.note}</p>}<p className="mt-2 text-[10px] font-black text-red-700">Care cannot be scheduled on this date.</p></div> : !day.noCare ? <div className="mt-4 space-y-3"><div className="grid grid-cols-2 gap-2"><label><span className="mb-1 block text-[9px] font-black uppercase text-slate-400">Drop-off</span><input type="time" value={day.startTime} onChange={(event) => updateDay(day.date, { startTime: event.target.value })} className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm font-black" /></label><label><span className="mb-1 block text-[9px] font-black uppercase text-slate-400">Pick-up</span><input type="time" value={day.endTime} onChange={(event) => updateDay(day.date, { endTime: event.target.value })} className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm font-black" /></label></div><textarea value={day.note} onChange={(event) => updateDay(day.date, { note: event.target.value.slice(0, 500) })} placeholder="Optional note for TCS" className="min-h-16 w-full resize-y rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-xs font-semibold" /></div> : <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-500">No care requested for this day.</p>}
            </article>;
          })}</div>

          <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs font-semibold leading-5 text-blue-950">Submitting this calendar sends a request to TCS. Care is confirmed only after the location schedule reviewer approves it. Approved schedules can still be changed by submitting a new change request.</div>

          <button disabled={saving || !selectedChild.canSubmit || !selectedWeek.canSubmit} onClick={() => void submitSchedule()} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-40">{saving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}{saving ? "Sending…" : latestSubmission?.status === "Approved" ? "Submit Schedule Change Request" : latestSubmission ? "Update Schedule Request" : "Submit Weekly Schedule"}</button>
          {!selectedWeek.canSubmit && <p className="mt-3 text-center text-xs font-black text-red-700">This week's late-request window is closed. Contact your TCS location directly.</p>}
          {!selectedChild.canSubmit && <p className="mt-3 text-center text-xs font-black text-red-700">Your account has view-only schedule access. Contact TCS if you need schedule-submission permission.</p>}
        </section>}
      </>}
    </div>
  </main>;
}
