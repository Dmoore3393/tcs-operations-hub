"use client";

import { CelebrationBits, FunDoodles, GatorGuide } from "@/components/brand/HubJoy";
import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  addIsoDays,
  displayDate,
  firstUpcomingWeek,
  lateDurationLabel,
  weekDates,
} from "@/lib/family-care-calendar";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Lock,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Location = {
  id: string;
  slug: string;
  name: string;
  fullName: string;
  capacity: number;
  programType: string;
};

type Closure = {
  id: string;
  locationId: string;
  date: string;
  title: string;
  note: string;
  createdAt: string;
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
  locationId: string;
  childId: string;
  childName: string;
  ageGroup: string;
  weekOf: string;
  requestKind: string;
  status: string;
  schedule: ScheduleDay[];
  submittedByEmail: string;
  submittedAt: string;
  deadlineAt: string;
  lateByMinutes: number;
  reviewedAt: string;
  reviewNote: string;
};

type Override = {
  id: string;
  locationId: string;
  childId: string;
  date: string;
  noCare: boolean;
  startTime: string;
  endTime: string;
  note: string;
  sourceSubmissionId: string;
};

type CalendarPayload = {
  settings: {
    weeksAhead: number;
    lateGraceHours: number;
    deadlineTime: string;
    timeZone: string;
  };
  canManageClosures: boolean;
  locations: Location[];
  closures: Closure[];
  submissions: Submission[];
  overrides: Override[];
};

function locationLabel(location: Location | undefined) {
  return location?.name || "Location";
}

function statusStyle(status: string) {
  if (status === "Approved") return "bg-emerald-100 text-emerald-800";
  if (status === "Needs Changes") return "bg-blue-100 text-blue-900";
  if (status === "Unable to Accommodate") return "bg-red-100 text-red-800";
  if (status === "Superseded") return "bg-slate-100 text-slate-500";
  return "bg-amber-100 text-amber-900";
}

export default function FamilyCareCalendarPage() {
  const { session } = useAuth();
  const [data, setData] = useState<CalendarPayload | null>(null);
  const [locationFilter, setLocationFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewingId, setReviewingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [closureDate, setClosureDate] = useState("");
  const [closureLocationId, setClosureLocationId] = useState("");
  const [closureTitle, setClosureTitle] = useState("TCS Closed");
  const [closureNote, setClosureNote] = useState("");

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/care-calendar", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json() as CalendarPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load the Family Care Calendar.");
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the Family Care Calendar.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  const visibleLocations = data?.locations ?? [];
  const calendarDates = useMemo(() => {
    if (!data) return [];
    const firstWeek = firstUpcomingWeek(new Date(), data.settings.timeZone);
    return Array.from({ length: data.settings.weeksAhead }, (_, weekIndex) => ({
      weekOf: addIsoDays(firstWeek, weekIndex * 7),
      dates: weekDates(addIsoDays(firstWeek, weekIndex * 7)),
    }));
  }, [data]);

  const submissions = useMemo(() => {
    if (!data) return [];
    return data.submissions.filter((submission) => !locationFilter || submission.locationId === locationFilter);
  }, [data, locationFilter]);

  const reviewQueue = submissions.filter((submission) => submission.status === "Pending");

  function closuresForDate(date: string) {
    if (!data) return [];
    return data.closures.filter((closure) =>
      closure.date === date && (!locationFilter || !closure.locationId || closure.locationId === locationFilter),
    );
  }

  function pendingForDate(date: string) {
    return reviewQueue.filter((submission) =>
      submission.schedule.some((day) => day.date === date && !day.noCare),
    ).length;
  }

  function approvedForDate(date: string) {
    if (!data) return 0;
    return data.overrides.filter((entry) =>
      entry.date === date && !entry.noCare && (!locationFilter || entry.locationId === locationFilter),
    ).length;
  }

  async function createClosure() {
    if (!session?.access_token || !closureDate) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/care-calendar", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: closureDate,
          locationId: closureLocationId,
          title: closureTitle,
          note: closureNote,
        }),
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error || "Could not block that date.");
      setNotice(payload.message || "Closure saved.");
      setClosureDate("");
      setClosureNote("");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not block that date.");
    } finally {
      setSaving(false);
    }
  }

  async function removeClosure(id: string) {
    if (!session?.access_token) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/care-calendar", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error || "Could not remove that closure.");
      setNotice(payload.message || "Closure removed.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not remove that closure.");
    } finally {
      setSaving(false);
    }
  }

  async function reviewSubmission(submissionId: string, decision: "Approved" | "Needs Changes" | "Unable to Accommodate") {
    if (!session?.access_token) return;
    setReviewingId(submissionId);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/care-calendar", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          submissionId,
          decision,
          note: reviewNotes[submissionId] || "",
        }),
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error || "Could not review this schedule.");
      setNotice(payload.message || "Schedule review saved.");
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Could not review this schedule.");
    } finally {
      setReviewingId("");
    }
  }

  return <MainLayout><div className="mx-auto max-w-[1600px] space-y-6">
    <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-emerald-950 via-emerald-800 to-slate-950 p-6 text-white shadow-xl"><FunDoodles className="opacity-35" />
      <div className="relative z-10 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div><p className="text-xs font-black uppercase tracking-[.18em] text-emerald-200">Family schedule control</p><h1 className="mt-2 text-3xl font-black">Family Care Calendar</h1><p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-emerald-50/85">Parents can submit upcoming schedules early. Friday at 6:00 PM is tracked automatically, late requests are clearly flagged, closures block parent scheduling, and approved dated care times feed the Ratio Plan.</p><div className="mt-5 flex flex-wrap gap-2"><Link href="/child-schedules" className="rounded-xl bg-white/10 px-4 py-2.5 text-xs font-black text-white">Child Schedules</Link><Link href="/ratios" className="rounded-xl bg-white px-4 py-2.5 text-xs font-black text-emerald-950">Open Ratio Plan</Link></div></div>
        <GatorGuide size="lg" message={<>Great planning = calmer days. Review what families need, then protect your ratios. ⭐</>} />
      </div>
    </section>

    {notice && <div className="tcs-soft-pop relative overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-black text-emerald-900"><CelebrationBits /><CheckCircle2 className="mr-2 inline h-4 w-4" />{notice}</div>}
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Pending Review" value={reviewQueue.length} icon={<Clock3 className="h-5 w-5" />} />
      <Stat label="Approved Care Days" value={data?.overrides.filter((entry) => !entry.noCare).length ?? 0} icon={<ShieldCheck className="h-5 w-5" />} />
      <Stat label="Blocked Dates" value={data?.closures.length ?? 0} icon={<Lock className="h-5 w-5" />} />
      <Stat label="Advance Window" value={data ? `${data.settings.weeksAhead} weeks` : "—"} icon={<CalendarDays className="h-5 w-5" />} />
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div><h2 className="text-xl font-black text-slate-950">Calendar view</h2><p className="mt-1 text-xs font-semibold text-slate-500">See closures, approved care, and schedule requests by date.</p></div>
        <label className="w-full lg:w-72"><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">Location</span><select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold"><option value="">All accessible locations</option>{visibleLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
      </div>

      {loading ? <div className="grid min-h-56 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-emerald-700" /></div> : <div className="mt-5 space-y-4">{calendarDates.map((week) => <div key={week.weekOf}><p className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-400">Week of {displayDate(week.weekOf, { month: "long", day: "numeric" })}</p><div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">{week.dates.map((date) => {
        const closures = closuresForDate(date);
        const pending = pendingForDate(date);
        const approved = approvedForDate(date);
        return <div key={date} className={`min-h-32 rounded-2xl border p-3 ${closures.length ? "border-slate-400 bg-slate-100" : "border-slate-200 bg-white"}`}><div className="flex items-start justify-between gap-2"><div><p className="text-[9px] font-black uppercase text-slate-400">{displayDate(date, { weekday: "short" })}</p><p className="text-lg font-black text-slate-950">{displayDate(date, { month: "short", day: "numeric" })}</p></div>{closures.length > 0 && <Lock className="h-4 w-4 text-slate-700" />}</div><div className="mt-3 space-y-1.5">{closures.map((closure) => <div key={closure.id} className="rounded-lg bg-slate-800 px-2 py-1.5 text-[9px] font-black text-white">{closure.title}</div>)}{approved > 0 && <div className="rounded-lg bg-emerald-100 px-2 py-1.5 text-[9px] font-black text-emerald-800">{approved} approved care</div>}{pending > 0 && <div className="rounded-lg bg-amber-100 px-2 py-1.5 text-[9px] font-black text-amber-900">{pending} pending</div>}{!closures.length && !approved && !pending && <p className="text-[9px] font-semibold text-slate-400">Open</p>}</div></div>;
      })}</div></div>)}</div>}
    </section>

    {data?.canManageClosures && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-900 text-white"><Lock className="h-5 w-5" /></span><div><h2 className="text-xl font-black text-slate-950">Block a care date</h2><p className="text-xs font-semibold text-slate-500">Owner/Admin closures immediately stop parents from requesting care on that date.</p></div></div>
      <div className="mt-5 grid gap-3 lg:grid-cols-[180px_220px_1fr_1.2fr_auto]">
        <label><span className="mb-1 block text-[9px] font-black uppercase text-slate-400">Date</span><input type="date" value={closureDate} onChange={(event) => setClosureDate(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold" /></label>
        <label><span className="mb-1 block text-[9px] font-black uppercase text-slate-400">Applies to</span><select value={closureLocationId} onChange={(event) => setClosureLocationId(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold"><option value="">All TCS locations</option>{visibleLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label><span className="mb-1 block text-[9px] font-black uppercase text-slate-400">Closure label</span><input value={closureTitle} onChange={(event) => setClosureTitle(event.target.value)} placeholder="TCS Closed" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold" /></label>
        <label><span className="mb-1 block text-[9px] font-black uppercase text-slate-400">Parent-facing note</span><input value={closureNote} onChange={(event) => setClosureNote(event.target.value)} placeholder="Holiday, training, site closure…" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold" /></label>
        <button disabled={saving || !closureDate} onClick={() => void createClosure()} className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40"><Plus className="h-4 w-4" />Block Date</button>
      </div>

      <div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{data.closures.slice(0, 18).map((closure) => <div key={closure.id} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 p-3"><div><p className="text-xs font-black text-slate-900">{displayDate(closure.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" })} • {closure.title}</p><p className="mt-1 text-[10px] font-semibold text-slate-500">{closure.locationId ? locationLabel(data.locations.find((item) => item.id === closure.locationId)) : "All TCS locations"}{closure.note ? ` • ${closure.note}` : ""}</p></div><button disabled={saving} onClick={() => void removeClosure(closure.id)} className="rounded-lg p-2 text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div>)}</div>
    </section>}

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-black text-slate-950">Schedule review queue</h2><p className="mt-1 text-xs font-semibold text-slate-500">Approve only after checking space, staffing, and ratios. Late requests are clearly marked.</p></div><button disabled={loading} onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</button></div>

      <div className="mt-5 space-y-4">{reviewQueue.length === 0 ? <div className="rounded-2xl bg-emerald-50 p-6 text-center text-sm font-black text-emerald-900"><CheckCircle2 className="mx-auto mb-2 h-7 w-7" />No family schedules are waiting for review.</div> : reviewQueue.map((submission) => {
        const location = data?.locations.find((item) => item.id === submission.locationId);
        const careDays = submission.schedule.filter((day) => !day.noCare);
        return <article key={submission.id} className="tcs-joy-card rounded-3xl border border-slate-200 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-black text-slate-950">{submission.childName}</h3><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black text-slate-600">{locationLabel(location)}</span>{submission.requestKind === "Change" && <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[9px] font-black text-violet-800">Change Request</span>}{submission.lateByMinutes > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-black text-amber-900">{lateDurationLabel(submission.lateByMinutes)}</span>}</div><p className="mt-2 text-xs font-semibold text-slate-500">Week of {displayDate(submission.weekOf, { month: "long", day: "numeric", year: "numeric" })} • Submitted {new Date(submission.submittedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p></div><span className={`w-fit rounded-full px-3 py-1.5 text-[10px] font-black ${statusStyle(submission.status)}`}>{submission.status}</span></div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{careDays.map((day) => <div key={day.date} className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{displayDate(day.date, { weekday: "short", month: "short", day: "numeric" })}</p><p className="mt-1 text-xs font-black text-slate-900">{day.startTime}–{day.endTime}</p>{day.note && <p className="mt-1 text-[9px] font-semibold leading-4 text-slate-500">{day.note}</p>}</div>)}</div>
          {careDays.length === 0 && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-500">Family selected no care for the entire week.</p>}

          <textarea value={reviewNotes[submission.id] || ""} onChange={(event) => setReviewNotes((current) => ({ ...current, [submission.id]: event.target.value.slice(0, 1000) }))} placeholder="Optional note to family — required in practice if changes are needed or care cannot be accommodated." className="mt-4 min-h-20 w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-xs font-semibold" />
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <button disabled={reviewingId === submission.id} onClick={() => void reviewSubmission(submission.id, "Approved")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-xs font-black text-white disabled:opacity-40">{reviewingId === submission.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Approve Schedule</button>
            <button disabled={reviewingId === submission.id} onClick={() => void reviewSubmission(submission.id, "Needs Changes")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-xs font-black text-white disabled:opacity-40"><RefreshCw className="h-4 w-4" />Needs Changes</button>
            <button disabled={reviewingId === submission.id} onClick={() => void reviewSubmission(submission.id, "Unable to Accommodate")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-3 text-xs font-black text-white disabled:opacity-40"><XCircle className="h-4 w-4" />Unable to Accommodate</button>
          </div>
        </article>;
      })}</div>
    </section>
  </div></MainLayout>;
}

function Stat({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">{icon}</span><p className="mt-3 text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p><strong className="mt-1 block text-2xl text-slate-950">{value}</strong></section>;
}
