"use client";

import MainLayout from "@/components/layout/MainLayout";
import { PrimaryButton, SecondaryButton, SectionCard, StatCard } from "@/components/hub/HubUI";
import { useAuth } from "@/components/providers/AuthProvider";
import { localIsoDate } from "@/lib/date-utils";
import { locationKeyForDbLocation, type StaffingLocation } from "@/lib/staffing-command";
import { supabase } from "@/lib/supabase/client";
import { CalendarCheck2, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, LoaderCircle, MapPin, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type SchedulePublication = {
  id: string;
  location_id: string;
  week_of: string;
  status: "Draft" | "Published" | "Superseded";
  revision: number;
  published_at: string | null;
  published_by: string | null;
  notes: string | null;
  needs_republish: boolean;
};

type PublishedShiftSnapshot = {
  id: string;
  publication_id: string;
  location_id: string;
  source_shift_id: string | null;
  user_id: string | null;
  staff_name: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  position_label: string | null;
  notes: string | null;
  revision: number;
};

type ScheduleAcknowledgement = {
  id: string;
  publication_id: string;
  location_id: string;
  user_id: string;
  revision: number;
  acknowledged_at: string;
  notes: string | null;
};

function datePlus(date: string, days: number) {
  const parsed = new Date(`${date}T12:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return localIsoDate(parsed);
}

function mondayFor(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  const day = parsed.getDay();
  parsed.setDate(parsed.getDate() - (day === 0 ? 6 : day - 1));
  return localIsoDate(parsed);
}

function displayDate(date: string, includeYear = false) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(new Date(`${date}T12:00:00`));
}

function timeLabel(value: string) {
  const [hourText, minuteText] = value.slice(0, 5).split(":");
  const hour = Number(hourText);
  return `${hour % 12 || 12}:${minuteText} ${hour >= 12 ? "PM" : "AM"}`;
}

function publishedLabel(value: string | null) {
  if (!value) return "Not published";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function MySchedulePage() {
  const { profile } = useAuth();
  const [anchorDate, setAnchorDate] = useState(() => localIsoDate());
  const [locations, setLocations] = useState<StaffingLocation[]>([]);
  const [snapshots, setSnapshots] = useState<PublishedShiftSnapshot[]>([]);
  const [publications, setPublications] = useState<SchedulePublication[]>([]);
  const [acknowledgements, setAcknowledgements] = useState<ScheduleAcknowledgement[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const weekStart = useMemo(() => mondayFor(anchorDate), [anchorDate]);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => datePlus(weekStart, index)), [weekStart]);
  const weekEnd = weekDates[6];

  const load = useCallback(async () => {
    if (!supabase || !profile?.user_id) return;
    setLoading(true);
    const [locationResult, publicationResult] = await Promise.all([
      supabase.from("locations").select("id,slug,name,full_name,capacity,program_type").eq("is_active", true).order("name"),
      supabase
        .from("schedule_publications")
        .select("id,location_id,week_of,status,revision,published_at,published_by,notes,needs_republish")
        .eq("week_of", weekStart)
        .eq("status", "Published"),
    ]);

    const failure = locationResult.error || publicationResult.error;
    if (failure) {
      setError(failure.message);
      setLoading(false);
      return;
    }

    const nextPublications = (publicationResult.data ?? []) as SchedulePublication[];
    const publicationIds = nextPublications.map((item) => item.id);
    let acknowledgementRows: ScheduleAcknowledgement[] = [];
    let snapshotRows: PublishedShiftSnapshot[] = [];
    if (publicationIds.length) {
      const [acknowledgementResult, snapshotResult] = await Promise.all([
        supabase
          .from("staff_schedule_acknowledgements")
          .select("id,publication_id,location_id,user_id,revision,acknowledged_at,notes")
          .eq("user_id", profile.user_id)
          .in("publication_id", publicationIds),
        supabase
          .from("staff_schedule_publication_shifts")
          .select("id,publication_id,location_id,source_shift_id,user_id,staff_name,shift_date,start_time,end_time,position_label,notes,revision")
          .eq("user_id", profile.user_id)
          .in("publication_id", publicationIds)
          .gte("shift_date", weekStart)
          .lte("shift_date", weekEnd)
          .order("shift_date")
          .order("start_time"),
      ]);
      if (acknowledgementResult.error || snapshotResult.error) {
        setError(acknowledgementResult.error?.message || snapshotResult.error?.message || "Could not load your published schedule.");
        setLoading(false);
        return;
      }
      acknowledgementRows = (acknowledgementResult.data ?? []) as ScheduleAcknowledgement[];
      snapshotRows = (snapshotResult.data ?? []) as PublishedShiftSnapshot[];
    }

    const publicationMap = new Map(nextPublications.map((item) => [item.id, item]));
    const currentSnapshots = snapshotRows.filter((item) => publicationMap.get(item.publication_id)?.revision === item.revision);

    setLocations((locationResult.data ?? []) as StaffingLocation[]);
    setSnapshots(currentSnapshots);
    setPublications(nextPublications);
    setAcknowledgements(acknowledgementRows);
    setError("");
    setLoading(false);
  }, [profile?.user_id, weekEnd, weekStart]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!supabase || !profile?.user_id) return;
    const channel = supabase
      .channel(`my-schedule-${profile.user_id}-${weekStart}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_publications" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_schedule_publication_shifts" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_schedule_acknowledgements" }, () => void load())
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [load, profile?.user_id, weekStart]);

  const locationMap = useMemo(() => new Map(locations.map((item) => [item.id, item])), [locations]);
  const publicationByLocation = useMemo(() => new Map(publications.map((item) => [item.location_id, item])), [publications]);
  const scheduledLocationIds = useMemo(() => [...new Set(snapshots.map((item) => item.location_id))], [snapshots]);
  const publicationCards = scheduledLocationIds.map((locationId) => {
    const publication = publicationByLocation.get(locationId);
    const location = locationMap.get(locationId);
    const acknowledged = publication
      ? acknowledgements.find((item) => item.publication_id === publication.id && item.revision === publication.revision)
      : null;
    return { locationId, publication, location, acknowledged };
  });

  const totalMinutes = snapshots.reduce((total, shift) => {
    const [sh, sm] = shift.start_time.slice(0, 5).split(":").map(Number);
    const [eh, em] = shift.end_time.slice(0, 5).split(":").map(Number);
    return total + Math.max(0, eh * 60 + em - (sh * 60 + sm));
  }, 0);

  async function acknowledge(publication: SchedulePublication) {
    if (!supabase || !profile?.user_id) return;
    setSavingId(publication.id);
    setError("");
    const result = await supabase.from("staff_schedule_acknowledgements").insert({
      publication_id: publication.id,
      location_id: publication.location_id,
      user_id: profile.user_id,
      revision: publication.revision,
    });
    if (result.error) setError(result.error.message);
    else {
      setMessage("Schedule acknowledged. ✅");
      window.setTimeout(() => setMessage(""), 2500);
      await load();
    }
    setSavingId("");
  }

  function moveWeek(days: number) {
    setAnchorDate(datePlus(weekStart, days));
  }

  const today = localIsoDate();

  return <MainLayout><div className="mx-auto max-w-[1450px] space-y-6 pb-12">
    <section className="overflow-hidden rounded-[32px] bg-gradient-to-br from-[#102a56] via-[#1769d2] to-[#155b3b] p-6 text-white shadow-xl sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em]"><CalendarCheck2 className="h-3.5 w-3.5" /> Employee Schedule</div>
          <h1 className="mt-4 text-3xl font-black sm:text-5xl">My Schedule</h1>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/80">Only published shifts assigned to your staff account appear here. When a schedule is republished, you will be asked to acknowledge the new revision.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => moveWeek(-7)} className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 hover:bg-white/20" aria-label="Previous week"><ChevronLeft className="h-5 w-5" /></button>
          <div className="min-w-52 rounded-xl bg-white/10 px-4 py-2.5 text-center text-sm font-black">{displayDate(weekStart)} – {displayDate(weekEnd, true)}</div>
          <button onClick={() => moveWeek(7)} className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 hover:bg-white/20" aria-label="Next week"><ChevronRight className="h-5 w-5" /></button>
        </div>
      </div>
    </section>

    {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-900">{message}</div>}
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">{error}</div>}

    <section className="grid gap-4 sm:grid-cols-3">
      <StatCard label="Published Shifts" value={snapshots.length} helper="This week" icon={<CalendarDays className="h-5 w-5" />} tone="blue" />
      <StatCard label="Scheduled Hours" value={(totalMinutes / 60).toFixed(totalMinutes % 60 ? 1 : 0)} helper="Published hours" icon={<Clock3 className="h-5 w-5" />} tone="emerald" />
      <StatCard label="Acknowledgements" value={publicationCards.filter((item) => item.acknowledged).length + "/" + publicationCards.length} helper="Current schedule revisions" icon={<ShieldCheck className="h-5 w-5" />} tone={publicationCards.every((item) => item.acknowledged) ? "emerald" : "amber"} />
    </section>

    {loading ? <div className="flex min-h-72 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-sm font-black text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading your published schedule…</div> : <>
      {publicationCards.length > 0 && <SectionCard title="Schedule Acknowledgement" description="Acknowledgement confirms that you saw the current published revision. It does not change your time clock or payroll record.">
        <div className="grid gap-3 lg:grid-cols-2">{publicationCards.map(({ locationId, publication, location, acknowledged }) => <div key={locationId} className={`rounded-2xl border p-4 ${acknowledged ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-black text-slate-950">{location?.name || "Assigned Location"}</p>{publication ? <><p className="mt-1 text-xs font-bold text-slate-600">Published revision {publication.revision} • {publishedLabel(publication.published_at)}</p><p className="mt-1 text-[10px] font-black uppercase text-slate-400">{acknowledged ? `Acknowledged ${publishedLabel(acknowledged.acknowledged_at)}` : "Acknowledgement needed"}</p>{publication.needs_republish && <p className="mt-2 text-xs font-black text-orange-700">Leadership is preparing an updated revision. This page will keep showing the last published schedule until the new version is published.</p>}</> : <p className="mt-1 text-xs font-bold text-amber-800">Your shifts are published, but publication metadata is not available. Ask your location lead to republish the week.</p>}</div>
            {publication && (acknowledged ? <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Seen</span> : <PrimaryButton disabled={savingId === publication.id} onClick={() => void acknowledge(publication)}>{savingId === publication.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Acknowledge</PrimaryButton>)}
          </div>
        </div>)}</div>
      </SectionCard>}

      <SectionCard title="Published Week" description="Draft shifts stay private to scheduling leadership until the week is published.">
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{weekDates.map((date) => {
          const dayShifts = snapshots.filter((shift) => shift.shift_date === date);
          const isToday = date === today;
          return <article key={date} className={`rounded-3xl border bg-white p-5 shadow-sm ${isToday ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-200"}`}>
            <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.15em] text-slate-400">{isToday ? "Today" : "Published Schedule"}</p><h3 className="mt-1 text-lg font-black text-slate-950">{displayDate(date, true)}</h3></div><CalendarDays className={`h-5 w-5 ${isToday ? "text-blue-600" : "text-slate-300"}`} /></div>
            <div className="mt-4 space-y-3">{dayShifts.length ? dayShifts.map((shift) => {
              const location = locationMap.get(shift.location_id);
              const key = location ? locationKeyForDbLocation(location) : null;
              return <div key={shift.id} className="rounded-2xl bg-slate-50 p-4"><div className="flex items-start gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-100 text-blue-700"><MapPin className="h-4 w-4" /></div><div className="min-w-0"><p className="font-black text-slate-950">{location?.name || key || "Location"}</p><p className="mt-1 text-sm font-bold text-blue-800">{timeLabel(shift.start_time)}–{timeLabel(shift.end_time)}</p><p className="mt-1 text-xs font-semibold text-slate-500">{shift.position_label || "Floor Coverage"}</p>{shift.notes && <p className="mt-2 text-xs leading-5 text-slate-500">{shift.notes}</p>}</div></div></div>;
            }) : <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center text-xs font-semibold text-slate-400">No published shift</div>}</div>
          </article>;
        })}</div>
      </SectionCard>

      {!snapshots.length && <SectionCard title="Nothing published for this week" description="Your manager may still be building the schedule. Draft shifts do not appear here.">
        <div className="rounded-2xl bg-slate-50 p-6 text-center"><CalendarDays className="mx-auto h-7 w-7 text-slate-400" /><p className="mt-3 font-black text-slate-800">No published shifts are assigned to your account.</p><p className="mt-1 text-sm font-semibold text-slate-500">If you expected a shift, contact your location lead so they can confirm your assignment is linked to your staff account and publish the week.</p><div className="mt-4"><SecondaryButton onClick={() => setAnchorDate(today)}>Back to Current Week</SecondaryButton></div></div>
      </SectionCard>}
    </>}
  </div></MainLayout>;
}
