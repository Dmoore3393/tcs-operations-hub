"use client";

import MainLayout from "@/components/layout/MainLayout";
import { Modal, PageIntro, PrimaryButton, SecondaryButton, SectionCard, StatCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  type CoachingRecord,
  type PerformanceEvent,
  type PerformanceEventType,
  type PerformanceLocation,
  type PerformancePeriod,
  type PerformanceStaff,
  type StaffLocationAssignment,
  type StaffPerformancePayload,
  performanceDateLabel,
  performanceInitials,
  rangeForPerformancePeriod,
  summarizeStaffPerformance,
} from "@/lib/staff-performance";
import { localIsoDate } from "@/lib/date-utils";
import {
  AlertTriangle,
  Award,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  LoaderCircle,
  Medal,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Star,
  Target,
  Trophy,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type EventDraft = {
  staffUserId: string;
  locationId: string;
  eventTypeId: string;
  eventDate: string;
  summary: string;
  notes: string;
  recognitionPoints: string;
};

type CoachingDraft = {
  staffUserId: string;
  locationId: string;
  incidentDate: string;
  recordKind: CoachingRecord["record_type"];
  summary: string;
  expectations: string;
  followUpDate: string;
};

const emptyPayload: StaffPerformancePayload = {
  from: "",
  to: "",
  canConfigurePoints: false,
  locations: [],
  assignments: [],
  staff: [],
  eventTypes: [],
  events: [],
  coachingRecords: [],
};

function locationNamesForStaff(staffId: string, assignments: StaffLocationAssignment[], locations: PerformanceLocation[]) {
  const ids = new Set(assignments.filter((item) => item.user_id === staffId).map((item) => item.location_id));
  return locations.filter((location) => ids.has(location.id)).map((location) => location.name);
}

function eventTypeFor(event: PerformanceEvent, eventTypes: PerformanceEventType[]) {
  return eventTypes.find((type) => type.id === event.event_type_id);
}

function employeeLabel(staff: PerformanceStaff | undefined) {
  return staff?.full_name || "Unknown employee";
}

function leadershipStatus(summary: ReturnType<typeof summarizeStaffPerformance>) {
  if (summary.pendingCount > 0) return { label: "Review Pending", tone: "amber" as const };
  if (summary.openCoachingCount > 0) return { label: "Follow-Up Open", tone: "red" as const };
  if (summary.recognitionCount > 0) return { label: "Recognition Active", tone: "green" as const };
  return { label: "No Events Logged", tone: "slate" as const };
}

export default function StaffPerformancePage() {
  const { session } = useAuth();
  const today = localIsoDate();
  const [period, setPeriod] = useState<PerformancePeriod>("Month");
  const [locationId, setLocationId] = useState("");
  const [payload, setPayload] = useState<StaffPerformancePayload>(emptyPayload);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [eventDraft, setEventDraft] = useState<EventDraft | null>(null);
  const [coachingDraft, setCoachingDraft] = useState<CoachingDraft | null>(null);
  const [showPointRules, setShowPointRules] = useState(false);

  const range = useMemo(() => rangeForPerformancePeriod(period, today), [period, today]);

  const apiRequest = useCallback(async (url: string, options: RequestInit = {}) => {
    if (!session?.access_token) throw new Error("Your staff session expired. Sign in again.");
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "The performance dashboard could not be updated.");
    return body;
  }, [session?.access_token]);

  const load = useCallback(async (quiet = false) => {
    if (!session?.access_token) return;
    if (!quiet) setLoading(true);
    try {
      const query = new URLSearchParams({ from: range.from, to: range.to });
      if (locationId) query.set("locationId", locationId);
      const data = await apiRequest(`/api/staff-performance?${query.toString()}`) as unknown as StaffPerformancePayload;
      setPayload(data);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load staff performance.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [apiRequest, locationId, range.from, range.to, session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  const typeMap = useMemo(() => new Map(payload.eventTypes.map((type) => [type.id, type])), [payload.eventTypes]);
  const staffMap = useMemo(() => new Map(payload.staff.map((staff) => [staff.user_id, staff])), [payload.staff]);
  const locationMap = useMemo(() => new Map(payload.locations.map((location) => [location.id, location])), [payload.locations]);

  const summaries = useMemo(() => payload.staff.map((staff) => ({
    staff,
    summary: summarizeStaffPerformance(staff.user_id, payload.events, payload.coachingRecords, payload.eventTypes),
    locations: locationNamesForStaff(staff.user_id, payload.assignments, payload.locations),
  })), [payload.assignments, payload.coachingRecords, payload.eventTypes, payload.events, payload.locations, payload.staff]);

  const totalRecognitionPoints = summaries.reduce((sum, item) => sum + item.summary.recognitionPoints, 0);
  const totalRecognitionEvents = summaries.reduce((sum, item) => sum + item.summary.recognitionCount, 0);
  const totalAccountabilityEvents = summaries.reduce((sum, item) => sum + item.summary.accountabilityCount, 0);
  const pendingReviews = summaries.reduce((sum, item) => sum + item.summary.pendingCount, 0);

  const recognitionLeaders = useMemo(() => [...summaries]
    .filter((item) => item.summary.recognitionPoints > 0 || item.summary.recognitionCount > 0)
    .sort((a, b) => b.summary.recognitionPoints - a.summary.recognitionPoints || b.summary.recognitionCount - a.summary.recognitionCount)
    .slice(0, 5), [summaries]);

  const visibleStaff = useMemo(() => summaries.filter((item) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [item.staff.full_name, item.staff.role, ...item.locations].join(" ").toLowerCase().includes(term);
  }), [search, summaries]);

  const pendingEvents = payload.events.filter((event) => event.status === "Pending Review");
  const openCoaching = payload.coachingRecords.filter((record) => record.status === "Open");
  const selectedStaff = selectedStaffId ? staffMap.get(selectedStaffId) : undefined;
  const selectedSummary = selectedStaff ? summarizeStaffPerformance(selectedStaff.user_id, payload.events, payload.coachingRecords, payload.eventTypes) : null;
  const selectedEvents = selectedStaff ? payload.events.filter((event) => event.staff_user_id === selectedStaff.user_id) : [];
  const selectedCoaching = selectedStaff ? payload.coachingRecords.filter((record) => record.staff_user_id === selectedStaff.user_id) : [];

  function flash(value: string) {
    setNotice(value);
    window.setTimeout(() => setNotice(""), 3500);
  }

  function preferredLocationForStaff(staffUserId: string) {
    return payload.assignments.find((item) => item.user_id === staffUserId)?.location_id || payload.locations[0]?.id || "";
  }

  function openEvent(staffUserId = "") {
    const staffLocation = staffUserId ? preferredLocationForStaff(staffUserId) : (locationId || payload.locations[0]?.id || "");
    const firstType = payload.eventTypes[0];
    setEventDraft({
      staffUserId,
      locationId: staffLocation,
      eventTypeId: firstType?.id || "",
      eventDate: today,
      summary: "",
      notes: "",
      recognitionPoints: firstType?.category === "Recognition" ? String(firstType.suggested_points || "") : "0",
    });
  }

  function selectEventType(id: string) {
    if (!eventDraft) return;
    const type = payload.eventTypes.find((item) => item.id === id);
    setEventDraft({
      ...eventDraft,
      eventTypeId: id,
      recognitionPoints: type?.category === "Recognition" ? String(type.suggested_points || "") : "0",
    });
  }

  async function saveEvent(event: FormEvent) {
    event.preventDefault();
    if (!eventDraft) return;
    setWorking(true);
    try {
      const result = await apiRequest("/api/staff-performance", {
        method: "POST",
        body: JSON.stringify({ recordType: "event", ...eventDraft }),
      });
      setEventDraft(null);
      flash((result.status as string) === "Pending Review" ? "Event saved to the leadership review queue." : "Recognition saved. ✨");
      await load(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save performance event.");
    } finally {
      setWorking(false);
    }
  }

  function openCoachingRecord(staffUserId = "") {
    setCoachingDraft({
      staffUserId,
      locationId: staffUserId ? preferredLocationForStaff(staffUserId) : (locationId || payload.locations[0]?.id || ""),
      incidentDate: today,
      recordKind: "Coaching Note",
      summary: "",
      expectations: "",
      followUpDate: "",
    });
  }

  async function saveCoaching(event: FormEvent) {
    event.preventDefault();
    if (!coachingDraft) return;
    setWorking(true);
    try {
      await apiRequest("/api/staff-performance", {
        method: "POST",
        body: JSON.stringify({ recordType: "coaching", ...coachingDraft }),
      });
      setCoachingDraft(null);
      flash("Coaching record saved separately from recognition points.");
      await load(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save coaching record.");
    } finally {
      setWorking(false);
    }
  }

  async function reviewEvent(id: string, status: "Confirmed" | "Dismissed") {
    setWorking(true);
    try {
      await apiRequest("/api/staff-performance", {
        method: "PATCH",
        body: JSON.stringify({ action: "review_event", id, status }),
      });
      flash(status === "Confirmed" ? "Accountability event confirmed." : "Event dismissed.");
      await load(true);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Could not update review.");
    } finally {
      setWorking(false);
    }
  }

  async function resolveCoaching(id: string) {
    setWorking(true);
    try {
      await apiRequest("/api/staff-performance", {
        method: "PATCH",
        body: JSON.stringify({ action: "resolve_coaching", id, status: "Resolved" }),
      });
      flash("Coaching follow-up marked resolved.");
      await load(true);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Could not resolve coaching record.");
    } finally {
      setWorking(false);
    }
  }

  async function updatePointRule(type: PerformanceEventType, suggestedPoints: number) {
    setWorking(true);
    try {
      await apiRequest("/api/staff-performance", {
        method: "PATCH",
        body: JSON.stringify({ action: "update_event_type", id: type.id, suggestedPoints }),
      });
      flash(`${type.label} now defaults to ${suggestedPoints} recognition point${suggestedPoints === 1 ? "" : "s"}.`);
      await load(true);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update recognition rule.");
    } finally {
      setWorking(false);
    }
  }

  return <MainLayout><div className="mx-auto max-w-[1700px] space-y-6 pb-12">
    <PageIntro
      eyebrow="People • recognition • accountability"
      title="Staff Performance Command Center"
      description="Recognize strong work, document accountability consistently, spot patterns over time, and keep coaching records separate from rewards."
      actions={<div className="flex flex-wrap gap-2"><SecondaryButton onClick={() => openCoachingRecord()}><ClipboardCheck className="h-4 w-4" /> Add Coaching Note</SecondaryButton><PrimaryButton onClick={() => openEvent()}><Plus className="h-4 w-4" /> Add Performance Event</PrimaryButton></div>}
    />

    <section className="overflow-hidden rounded-[30px] border border-emerald-900/10 bg-gradient-to-br from-[#092d22] via-[#145b3c] to-[#0b3153] p-6 text-white shadow-xl">
      <div className="grid gap-6 xl:grid-cols-[1fr_auto] xl:items-end">
        <div>
          <div className="flex flex-wrap gap-2"><span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[.16em]">Recognition does not erase accountability</span><span className="rounded-full bg-amber-300/15 px-3 py-1 text-[10px] font-black uppercase tracking-[.16em] text-amber-100">Formal discipline stays separate</span></div>
          <h2 className="mt-4 text-3xl font-black sm:text-4xl">One team picture. Actual documentation underneath.</h2>
          <p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-white/75">Recognition points only reward positive events. Late arrivals, call-offs, no-call/no-shows, policy concerns, and similar issues are tracked as confirmed accountability events—not negative “game points.”</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["Month","90 Days","Year"] as PerformancePeriod[]).map((item) => <button key={item} onClick={() => setPeriod(item)} className={`rounded-xl px-4 py-2.5 text-sm font-black ${period === item ? "bg-white text-slate-950" : "bg-white/10 text-white hover:bg-white/15"}`}>{item}</button>)}
        </div>
      </div>
    </section>

    {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-900">{notice}</div>}
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">{error}</div>}

    <SectionCard>
      <div className="grid gap-3 lg:grid-cols-[1fr_260px_auto] lg:items-center">
        <label className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-10`} placeholder="Search employee, role, or location…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <select className={inputClass} value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">All accessible locations</option>{payload.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
        {payload.canConfigurePoints && <SecondaryButton onClick={() => setShowPointRules(true)}><Target className="h-4 w-4" /> Recognition Rules</SecondaryButton>}
      </div>
    </SectionCard>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Recognition Points" value={totalRecognitionPoints} helper={`${period} • positive events only`} icon={<Star className="h-5 w-5" />} />
      <StatCard label="Positive Moments" value={totalRecognitionEvents} helper="Confirmed recognition events" icon={<Sparkles className="h-5 w-5" />} tone="blue" />
      <StatCard label="Accountability Events" value={totalAccountabilityEvents} helper="Confirmed documented events" icon={<ShieldAlert className="h-5 w-5" />} tone="amber" />
      <StatCard label="Pending Review" value={pendingReviews} helper="Requires leadership confirmation" icon={<Clock3 className="h-5 w-5" />} tone={pendingReviews ? "red" : "emerald"} />
    </section>

    {loading ? <div className="flex min-h-80 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-sm font-black text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading staff performance…</div> : <>
      <div className="grid gap-6 2xl:grid-cols-[.7fr_1.3fr]">
        <SectionCard title="Recognition Leaders" description="This is a recognition view—not an overall employee score. Accountability and coaching remain separate records.">
          {recognitionLeaders.length ? <div className="space-y-3">{recognitionLeaders.map((item, index) => <button key={item.staff.user_id} onClick={() => setSelectedStaffId(item.staff.user_id)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-emerald-300 hover:shadow-sm">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl font-black ${index === 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>{index === 0 ? <Trophy className="h-5 w-5" /> : index + 1}</span>
            <span className="min-w-0 flex-1"><strong className="block truncate text-slate-950">{item.staff.full_name}</strong><span className="text-xs font-semibold text-slate-500">{item.summary.recognitionCount} positive event{item.summary.recognitionCount === 1 ? "" : "s"}</span></span>
            <span className="text-right"><strong className="block text-xl font-black text-emerald-800">{item.summary.recognitionPoints}</strong><span className="text-[9px] font-black uppercase tracking-wider text-slate-400">points</span></span>
          </button>)}</div> : <EmptyState icon={<Award className="h-7 w-7" />} title="Recognition starts here" detail="Add a positive performance event to begin the recognition view." />}
        </SectionCard>

        <SectionCard title="Leadership Attention Queue" description="Pending events must be reviewed before they count as confirmed accountability history.">
          <div className="grid gap-4 xl:grid-cols-2">
            <div>
              <p className="mb-3 text-xs font-black uppercase tracking-[.14em] text-amber-700">Pending performance review • {pendingEvents.length}</p>
              <div className="space-y-3">{pendingEvents.slice(0, 6).map((event) => {
                const type = typeMap.get(event.event_type_id);
                return <article key={event.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-slate-950">{employeeLabel(staffMap.get(event.staff_user_id))}</p><p className="mt-1 text-xs font-black text-amber-800">{type?.label || "Performance Event"} • {performanceDateLabel(event.event_date)}</p></div><StatusBadge tone="amber">Review</StatusBadge></div><p className="mt-3 text-sm font-semibold leading-6 text-slate-700">{event.summary}</p><div className="mt-3 flex gap-2"><button disabled={working} onClick={() => void reviewEvent(event.id, "Confirmed")} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">Confirm</button><button disabled={working} onClick={() => void reviewEvent(event.id, "Dismissed")} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">Dismiss</button></div></article>;
              })}{!pendingEvents.length && <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="Review queue is clear" detail="Nothing is waiting for leadership confirmation." />}</div>
            </div>
            <div>
              <p className="mb-3 text-xs font-black uppercase tracking-[.14em] text-rose-700">Open coaching follow-up • {openCoaching.length}</p>
              <div className="space-y-3">{openCoaching.slice(0, 6).map((record) => <article key={record.id} className="rounded-2xl border border-rose-200 bg-rose-50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-slate-950">{employeeLabel(staffMap.get(record.staff_user_id))}</p><p className="mt-1 text-xs font-black text-rose-800">{record.record_type} • {performanceDateLabel(record.incident_date)}</p></div><StatusBadge tone="red">Open</StatusBadge></div><p className="mt-3 text-sm font-semibold leading-6 text-slate-700">{record.summary}</p>{record.follow_up_date && <p className="mt-2 text-xs font-black text-slate-500">Follow-up: {performanceDateLabel(record.follow_up_date)}</p>}<button disabled={working} onClick={() => void resolveCoaching(record.id)} className="mt-3 rounded-xl bg-rose-800 px-3 py-2 text-xs font-black text-white">Mark Resolved</button></article>)}{!openCoaching.length && <EmptyState icon={<UserRoundCheck className="h-6 w-6" />} title="No open coaching follow-ups" detail="Resolved records remain in employee history." />}</div>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Team Performance Snapshot" description={`${performanceDateLabel(range.from)}–${performanceDateLabel(range.to)} • Tap an employee for the documented history behind the numbers.`}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visibleStaff.map(({ staff, summary, locations }) => {
            const status = leadershipStatus(summary);
            return <button key={staff.user_id} onClick={() => setSelectedStaffId(staff.user_id)} className="rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
              <div className="flex items-start justify-between gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-sm font-black text-emerald-900">{performanceInitials(staff.full_name)}</span><StatusBadge tone={status.tone}>{status.label}</StatusBadge></div>
              <h3 className="mt-4 text-lg font-black text-slate-950">{staff.full_name}</h3><p className="text-xs font-bold text-emerald-700">{staff.role}</p><p className="mt-1 truncate text-xs font-semibold text-slate-500">{locations.join(" • ") || "No location assignment"}</p>
              <div className="mt-4 grid grid-cols-4 gap-2"><Mini label="Points" value={summary.recognitionPoints} /><Mini label="Positive" value={summary.recognitionCount} /><Mini label="Account." value={summary.accountabilityCount} /><Mini label="Pending" value={summary.pendingCount} /></div>
              <div className="mt-4 flex items-center justify-between text-xs font-black text-slate-500"><span>{summary.openCoachingCount ? `${summary.openCoachingCount} open coaching` : "No open coaching"}</span><ChevronRight className="h-4 w-4" /></div>
            </button>;
          })}
        </div>
      </SectionCard>
    </>}

    {eventDraft && <Modal title="Add Performance Event" description="Positive recognition may earn points. Accountability events are tracked as counts and must be reviewed before confirmation." onClose={() => setEventDraft(null)} footer={<><SecondaryButton onClick={() => setEventDraft(null)}>Cancel</SecondaryButton><PrimaryButton onClick={() => document.getElementById("performance-event-save")?.click()}>{working ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save Event</PrimaryButton></>}>
      <form onSubmit={saveEvent} className="grid gap-4 sm:grid-cols-2">
        <Field label="Employee"><select required className={inputClass} value={eventDraft.staffUserId} onChange={(event) => setEventDraft({ ...eventDraft, staffUserId: event.target.value, locationId: preferredLocationForStaff(event.target.value) })}><option value="">Choose employee…</option>{payload.staff.map((staff) => <option key={staff.user_id} value={staff.user_id}>{staff.full_name}</option>)}</select></Field>
        <Field label="Location"><select required className={inputClass} value={eventDraft.locationId} onChange={(event) => setEventDraft({ ...eventDraft, locationId: event.target.value })}><option value="">Choose location…</option>{payload.locations.filter((location) => !eventDraft.staffUserId || payload.assignments.some((item) => item.user_id === eventDraft.staffUserId && item.location_id === location.id)).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
        <Field label="Event Type"><select required className={inputClass} value={eventDraft.eventTypeId} onChange={(event) => selectEventType(event.target.value)}>{payload.eventTypes.map((type) => <option key={type.id} value={type.id}>{type.category === "Recognition" ? "⭐" : "⚠️"} {type.label}</option>)}</select></Field>
        <Field label="Date"><input type="date" required className={inputClass} value={eventDraft.eventDate} onChange={(event) => setEventDraft({ ...eventDraft, eventDate: event.target.value })} /></Field>
        {typeMap.get(eventDraft.eventTypeId)?.category === "Recognition" && <Field label="Recognition Points"><input type="number" min="0" className={inputClass} value={eventDraft.recognitionPoints} onChange={(event) => setEventDraft({ ...eventDraft, recognitionPoints: event.target.value })} /></Field>}
        <Field label="Summary" wide><input required className={inputClass} placeholder="What happened?" value={eventDraft.summary} onChange={(event) => setEventDraft({ ...eventDraft, summary: event.target.value })} /></Field>
        <Field label="Notes / context" wide><textarea className={`${inputClass} min-h-24`} placeholder="Add objective details, context, or follow-up information." value={eventDraft.notes} onChange={(event) => setEventDraft({ ...eventDraft, notes: event.target.value })} /></Field>
        {typeMap.get(eventDraft.eventTypeId)?.category === "Accountability" && <div className="sm:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-950"><AlertTriangle className="mr-2 inline h-4 w-4" />This saves to the review queue first. It does not subtract recognition points.</div>}
        <button id="performance-event-save" className="hidden" type="submit">Save</button>
      </form>
    </Modal>}

    {coachingDraft && <Modal title="Add Coaching / Discipline Record" description="Formal coaching stays separate from recognition points so serious issues are not reduced to a game score." onClose={() => setCoachingDraft(null)} footer={<><SecondaryButton onClick={() => setCoachingDraft(null)}>Cancel</SecondaryButton><PrimaryButton onClick={() => document.getElementById("coaching-record-save")?.click()}>{working ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />} Save Record</PrimaryButton></>}>
      <form onSubmit={saveCoaching} className="grid gap-4 sm:grid-cols-2">
        <Field label="Employee"><select required className={inputClass} value={coachingDraft.staffUserId} onChange={(event) => setCoachingDraft({ ...coachingDraft, staffUserId: event.target.value, locationId: preferredLocationForStaff(event.target.value) })}><option value="">Choose employee…</option>{payload.staff.map((staff) => <option key={staff.user_id} value={staff.user_id}>{staff.full_name}</option>)}</select></Field>
        <Field label="Location"><select required className={inputClass} value={coachingDraft.locationId} onChange={(event) => setCoachingDraft({ ...coachingDraft, locationId: event.target.value })}><option value="">Choose location…</option>{payload.locations.filter((location) => !coachingDraft.staffUserId || payload.assignments.some((item) => item.user_id === coachingDraft.staffUserId && item.location_id === location.id)).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
        <Field label="Record Type"><select className={inputClass} value={coachingDraft.recordKind} onChange={(event) => setCoachingDraft({ ...coachingDraft, recordKind: event.target.value as CoachingRecord["record_type"] })}>{["Coaching Note","Verbal Warning","Written Warning","Final Warning","Other"].map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Incident Date"><input type="date" required className={inputClass} value={coachingDraft.incidentDate} onChange={(event) => setCoachingDraft({ ...coachingDraft, incidentDate: event.target.value })} /></Field>
        <Field label="Summary" wide><textarea required className={`${inputClass} min-h-24`} value={coachingDraft.summary} onChange={(event) => setCoachingDraft({ ...coachingDraft, summary: event.target.value })} /></Field>
        <Field label="Expectations / next steps" wide><textarea className={`${inputClass} min-h-24`} value={coachingDraft.expectations} onChange={(event) => setCoachingDraft({ ...coachingDraft, expectations: event.target.value })} /></Field>
        <Field label="Follow-Up Date"><input type="date" className={inputClass} value={coachingDraft.followUpDate} onChange={(event) => setCoachingDraft({ ...coachingDraft, followUpDate: event.target.value })} /></Field>
        <button id="coaching-record-save" className="hidden" type="submit">Save</button>
      </form>
    </Modal>}

    {selectedStaff && selectedSummary && <Modal title={selectedStaff.full_name} description="Documented recognition, accountability, and coaching history for the selected period." onClose={() => setSelectedStaffId("")} footer={<><SecondaryButton onClick={() => openCoachingRecord(selectedStaff.user_id)}>Add Coaching</SecondaryButton><PrimaryButton onClick={() => openEvent(selectedStaff.user_id)}><Plus className="h-4 w-4" /> Add Event</PrimaryButton></>}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><Mini label="Points" value={selectedSummary.recognitionPoints} /><Mini label="Positive" value={selectedSummary.recognitionCount} /><Mini label="Account." value={selectedSummary.accountabilityCount} /><Mini label="Pending" value={selectedSummary.pendingCount} /><Mini label="Open Coaching" value={selectedSummary.openCoachingCount} /></div>
        <div>
          <h4 className="text-sm font-black uppercase tracking-wider text-slate-500">Performance Events</h4>
          <div className="mt-3 space-y-2">{selectedEvents.map((event) => { const type = eventTypeFor(event, payload.eventTypes); return <article key={event.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-wrap items-center gap-2"><StatusBadge tone={type?.category === "Recognition" ? "green" : event.status === "Confirmed" ? "red" : "amber"}>{type?.label || "Event"}</StatusBadge><span className="text-xs font-black text-slate-400">{performanceDateLabel(event.event_date)}</span><span className="ml-auto text-xs font-black text-slate-500">{event.source_system}</span></div><p className="mt-2 text-sm font-bold text-slate-800">{event.summary}</p>{event.notes && <p className="mt-1 text-xs leading-5 text-slate-500">{event.notes}</p>}{type?.category === "Recognition" && event.status === "Confirmed" && <p className="mt-2 text-xs font-black text-emerald-700">+{event.recognition_points} recognition points</p>}</article>; })}{!selectedEvents.length && <p className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No performance events in this period.</p>}</div>
        </div>
        <div>
          <h4 className="text-sm font-black uppercase tracking-wider text-slate-500">Coaching Records</h4>
          <div className="mt-3 space-y-2">{selectedCoaching.map((record) => <article key={record.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><StatusBadge tone={record.status === "Resolved" ? "green" : "red"}>{record.record_type} • {record.status}</StatusBadge><span className="text-xs font-black text-slate-400">{performanceDateLabel(record.incident_date)}</span></div><p className="mt-2 text-sm font-bold text-slate-800">{record.summary}</p>{record.expectations && <p className="mt-2 text-xs leading-5 text-slate-500"><strong>Expectation:</strong> {record.expectations}</p>}</article>)}{!selectedCoaching.length && <p className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No coaching records.</p>}</div>
        </div>
      </div>
    </Modal>}

    {showPointRules && <Modal title="Recognition Point Rules" description="Set default points for positive recognition. Accountability events never subtract from this balance." onClose={() => setShowPointRules(false)} footer={<SecondaryButton onClick={() => setShowPointRules(false)}>Close</SecondaryButton>}>
      <div className="space-y-3">{payload.eventTypes.filter((type) => type.category === "Recognition").map((type) => <PointRuleRow key={type.id} type={type} disabled={working} onSave={updatePointRule} />)}</div>
    </Modal>}
  </div></MainLayout>;
}

function PointRuleRow({ type, disabled, onSave }: { type: PerformanceEventType; disabled: boolean; onSave: (type: PerformanceEventType, points: number) => Promise<void> }) {
  const [points, setPoints] = useState(String(type.suggested_points));
  useEffect(() => setPoints(String(type.suggested_points)), [type.suggested_points]);
  return <div className="grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-[1fr_110px_auto] sm:items-center"><div><p className="font-black text-slate-950">{type.label}</p><p className="mt-1 text-xs font-semibold text-slate-500">{type.description || "Positive recognition event"}</p></div><input type="number" min="0" className={inputClass} value={points} onChange={(event) => setPoints(event.target.value)} /><button disabled={disabled} onClick={() => void onSave(type, Math.max(0, Math.round(Number(points) || 0)))} className="rounded-xl bg-emerald-800 px-3 py-2.5 text-xs font-black text-white disabled:opacity-50">Save</button></div>;
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-xl bg-slate-50 p-2 text-center"><strong className="block text-lg font-black text-slate-950">{value}</strong><span className="text-[8px] font-black uppercase tracking-wider text-slate-400">{label}</span></div>;
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-sm font-black text-slate-700">{label}</span>{children}</label>;
}

function EmptyState({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-slate-500"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm">{icon}</div><p className="mt-3 font-black text-slate-800">{title}</p><p className="mt-1 text-xs font-semibold leading-5">{detail}</p></div>;
}
