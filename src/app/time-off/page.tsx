"use client";

import MainLayout from "@/components/layout/MainLayout";
import { Modal, PageIntro, PrimaryButton, SecondaryButton, SectionCard, StatCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  AlertTriangle,
  Ban,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Plus,
  Settings2,
  ShieldAlert,
  UserCheck,
  Wrench,
  XCircle,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type LocationRow = { id: string; name: string; full_name: string; slug: string };
type StaffRow = { user_id: string; full_name: string; role: string };
type AssignmentRow = { user_id: string; location_id: string };
type BlackoutRow = {
  id: string;
  location_id: string | null;
  title: string;
  reason: string | null;
  start_date: string;
  end_date: string;
  block_requests: boolean;
  notes: string | null;
};
type RequestRow = {
  id: string;
  staff_user_id: string;
  location_id: string | null;
  request_scope: "All Assigned Locations" | "Specific Location";
  request_type: string;
  start_date: string;
  end_date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  status: "Pending" | "Approved" | "Denied" | "Cancelled";
  submitted_at: string;
  review_notes: string | null;
};
type AttendanceSettings = {
  late_tracking_enabled: boolean;
  late_grace_minutes: number | null;
  early_departure_tracking_enabled: boolean;
  early_departure_grace_minutes: number | null;
  no_show_tracking_enabled: boolean;
  no_show_after_minutes: number | null;
  enforce_schedule_clocking: boolean;
  early_clock_in_window_minutes: number;
  late_clock_out_window_minutes: number;
  flag_scheduled_hours_overage: boolean;
};
type ClockApproverRow = {
  user_id: string;
  approval_scope: "General" | "Maintenance";
  is_active: boolean;
};
type ClockExceptionRow = {
  id: string;
  staff_user_id: string;
  location_id: string;
  shift_id: string | null;
  work_date: string;
  approval_scope: "General" | "Maintenance";
  approved_start_time: string | null;
  approved_end_time: string | null;
  reason: string;
  status: "Approved" | "Revoked";
  approved_by: string;
  approved_at: string;
};
type Payload = {
  canManageBlackouts: boolean;
  canCreateCompanyWideBlackout: boolean;
  canReviewRequests: boolean;
  canConfigureAttendance: boolean;
  canApproveGeneralClockExceptions: boolean;
  canApproveMaintenanceClockExceptions: boolean;
  canSetMaintenanceApprover: boolean;
  currentUserId: string;
  locations: LocationRow[];
  assignments: AssignmentRow[];
  staff: StaffRow[];
  requests: RequestRow[];
  blackouts: BlackoutRow[];
  clockApprovers: ClockApproverRow[];
  clockExceptions: ClockExceptionRow[];
  attendanceSettings: AttendanceSettings;
};

function fmtDate(value: string) {
  const date = new Date(value + "T12:00:00");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}
function fmtRange(start: string, end: string) {
  return start === end ? fmtDate(start) : `${fmtDate(start)}–${fmtDate(end)}`;
}
function statusTone(status: RequestRow["status"]) {
  if (status === "Approved") return "green" as const;
  if (status === "Denied") return "red" as const;
  if (status === "Cancelled") return "slate" as const;
  return "amber" as const;
}

export default function TimeOffPage() {
  const { session } = useAuth();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [blackoutOpen, setBlackoutOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const [requestDraft, setRequestDraft] = useState({
    requestScope: "All Assigned Locations" as "All Assigned Locations" | "Specific Location",
    locationId: "",
    requestType: "Time Off",
    startDate: "",
    endDate: "",
    allDay: true,
    startTime: "",
    endTime: "",
    reason: "",
  });

  const [blackoutDraft, setBlackoutDraft] = useState({
    locationId: "",
    title: "",
    reason: "",
    startDate: "",
    endDate: "",
    notes: "",
    blockRequests: true,
  });

  const [settingsDraft, setSettingsDraft] = useState<AttendanceSettings>({
    late_tracking_enabled: false,
    late_grace_minutes: null,
    early_departure_tracking_enabled: false,
    early_departure_grace_minutes: null,
    no_show_tracking_enabled: false,
    no_show_after_minutes: null,
    enforce_schedule_clocking: true,
    early_clock_in_window_minutes: 4,
    late_clock_out_window_minutes: 4,
    flag_scheduled_hours_overage: true,
  });
  const [exceptionDraft, setExceptionDraft] = useState({
    staffUserId: "",
    locationId: "",
    workDate: "",
    approvalScope: "General" as "General" | "Maintenance",
    approvedStartTime: "",
    approvedEndTime: "",
    reason: "",
  });

  const callApi = useCallback(async (options: RequestInit = {}) => {
    if (!session?.access_token) throw new Error("Your staff session expired. Sign in again.");
    const response = await fetch("/api/time-off", {
      ...options,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "The time-off request could not be completed.");
    return body;
  }, [session?.access_token]);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const data = await callApi() as unknown as Payload;
      setPayload(data);
      setSettingsDraft(data.attendanceSettings);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load time off.");
    } finally {
      setLoading(false);
    }
  }, [callApi, session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  const staffMap = useMemo(() => new Map((payload?.staff ?? []).map((row) => [row.user_id, row])), [payload?.staff]);
  const locationMap = useMemo(() => new Map((payload?.locations ?? []).map((row) => [row.id, row])), [payload?.locations]);
  const myRequests = payload?.requests.filter((row) => row.staff_user_id === payload.currentUserId) ?? [];
  const pendingRequests = payload?.requests.filter((row) => row.status === "Pending") ?? [];
  const activeBlackouts = payload?.blackouts ?? [];
  const futureApproved = payload?.requests.filter((row) => row.status === "Approved").length ?? 0;
  const activeClockExceptions = payload?.clockExceptions.filter((row) => row.status === "Approved") ?? [];
  const maintenanceApproverId = payload?.clockApprovers.find((row) => row.approval_scope === "Maintenance" && row.is_active)?.user_id ?? "";

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  }

  async function submitRequest(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      await callApi({
        method: "POST",
        body: JSON.stringify({ action: "request_time_off", ...requestDraft }),
      });
      setRequestOpen(false);
      setRequestDraft({
        requestScope: "All Assigned Locations",
        locationId: "",
        requestType: "Time Off",
        startDate: "",
        endDate: "",
        allDay: true,
        startTime: "",
        endTime: "",
        reason: "",
      });
      flash("Time-off request submitted for review.");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit request.");
    } finally {
      setWorking(false);
    }
  }

  async function submitBlackout(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      await callApi({
        method: "POST",
        body: JSON.stringify({ action: "create_blackout", ...blackoutDraft }),
      });
      setBlackoutOpen(false);
      setBlackoutDraft({ locationId: "", title: "", reason: "", startDate: "", endDate: "", notes: "", blockRequests: true });
      flash("Blocked date added. Staff cannot submit overlapping requests.");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not add blocked date.");
    } finally {
      setWorking(false);
    }
  }

  async function reviewRequest(id: string, status: "Approved" | "Denied") {
    setWorking(true);
    try {
      await callApi({
        method: "PATCH",
        body: JSON.stringify({ action: "review_request", id, status, reviewNotes: reviewNotes[id] || "" }),
      });
      flash(status === "Approved" ? "Time off approved." : "Time off denied.");
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Could not review request.");
    } finally {
      setWorking(false);
    }
  }

  async function cancelRequest(id: string) {
    setWorking(true);
    try {
      await callApi({ method: "PATCH", body: JSON.stringify({ action: "cancel_request", id }) });
      flash("Request cancelled.");
      await load();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Could not cancel request.");
    } finally {
      setWorking(false);
    }
  }

  async function deactivateBlackout(id: string) {
    setWorking(true);
    try {
      await callApi({ method: "PATCH", body: JSON.stringify({ action: "deactivate_blackout", id }) });
      flash("Blocked date removed.");
      await load();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove blocked date.");
    } finally {
      setWorking(false);
    }
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    try {
      await callApi({
        method: "PATCH",
        body: JSON.stringify({
          action: "update_attendance_settings",
          lateTrackingEnabled: settingsDraft.late_tracking_enabled,
          lateGraceMinutes: settingsDraft.late_grace_minutes,
          earlyDepartureTrackingEnabled: settingsDraft.early_departure_tracking_enabled,
          earlyDepartureGraceMinutes: settingsDraft.early_departure_grace_minutes,
          noShowTrackingEnabled: settingsDraft.no_show_tracking_enabled,
          noShowAfterMinutes: settingsDraft.no_show_after_minutes,
          enforceScheduleClocking: settingsDraft.enforce_schedule_clocking,
          earlyClockInWindowMinutes: settingsDraft.early_clock_in_window_minutes,
          lateClockOutWindowMinutes: settingsDraft.late_clock_out_window_minutes,
          flagScheduledHoursOverage: settingsDraft.flag_scheduled_hours_overage,
        }),
      });
      setSettingsOpen(false);
      flash("Attendance accountability rules saved.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save attendance settings.");
    } finally {
      setWorking(false);
    }
  }

  async function submitClockException(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      await callApi({
        method: "POST",
        body: JSON.stringify({ action: "create_clock_exception", ...exceptionDraft }),
      });
      setExceptionOpen(false);
      setExceptionDraft({ staffUserId: "", locationId: "", workDate: "", approvalScope: "General", approvedStartTime: "", approvedEndTime: "", reason: "" });
      flash("Shift exception approved and linked to the time clock.");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not approve shift exception.");
    } finally {
      setWorking(false);
    }
  }

  async function revokeClockException(id: string) {
    setWorking(true);
    try {
      await callApi({ method: "PATCH", body: JSON.stringify({ action: "revoke_clock_exception", id }) });
      flash("Shift exception revoked.");
      await load();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Could not revoke shift exception.");
    } finally {
      setWorking(false);
    }
  }

  async function setMaintenanceApprover(staffUserId: string) {
    setWorking(true);
    try {
      await callApi({ method: "PATCH", body: JSON.stringify({ action: "set_maintenance_approver", staffUserId }) });
      flash(staffUserId ? "Maintenance overtime approver updated." : "Maintenance overtime approver cleared.");
      await load();
    } catch (approverError) {
      setError(approverError instanceof Error ? approverError.message : "Could not update maintenance approver.");
    } finally {
      setWorking(false);
    }
  }

  return <MainLayout><div className="mx-auto max-w-[1650px] space-y-6 pb-12">
    <PageIntro
      eyebrow="Workforce • requests • blocked dates"
      title="Time Off & Availability"
      description="Staff request time off here. Leadership can block dates for trainings, all-hands meetings, major events, or other days when time-off requests cannot be accepted."
      actions={<div className="flex flex-wrap gap-2">{payload?.canConfigureAttendance && <SecondaryButton onClick={() => setSettingsOpen(true)}><Settings2 className="h-4 w-4" /> Attendance Rules</SecondaryButton>}{(payload?.canApproveGeneralClockExceptions || payload?.canApproveMaintenanceClockExceptions) && <SecondaryButton onClick={() => setExceptionOpen(true)}><Clock3 className="h-4 w-4" /> Approve Shift Exception</SecondaryButton>}{payload?.canManageBlackouts && <SecondaryButton onClick={() => setBlackoutOpen(true)}><Ban className="h-4 w-4" /> Block Dates</SecondaryButton>}<PrimaryButton onClick={() => setRequestOpen(true)}><Plus className="h-4 w-4" /> Request Time Off</PrimaryButton></div>}
    />

    <section className="overflow-hidden rounded-[30px] bg-gradient-to-br from-[#0f172a] via-[#4c1d95] to-[#7c2d12] p-6 text-white shadow-xl">
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div><p className="text-xs font-black uppercase tracking-[.17em] text-violet-200">Blackout protection</p><h2 className="mt-2 text-3xl font-black">Training day? Lock it before requests come in.</h2><p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-white/75">Company-wide blocked dates stop everyone from submitting overlapping time-off requests. Location-specific blocks stop requests for staff assigned to that location.</p></div>
        <div className="rounded-2xl bg-white/10 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-white/65">Current blocked periods</p><p className="mt-1 text-3xl font-black">{activeBlackouts.length}</p></div>
      </div>
    </section>

    {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-900">{notice}</div>}
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">{error}</div>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="My Requests" value={myRequests.length} icon={<CalendarDays className="h-5 w-5" />} />
      <StatCard label="Pending Review" value={pendingRequests.length} icon={<Clock3 className="h-5 w-5" />} tone="amber" />
      <StatCard label="Blocked Periods" value={activeBlackouts.length} icon={<Ban className="h-5 w-5" />} tone="red" />
      <StatCard label="Approved Requests" value={futureApproved} icon={<UserCheck className="h-5 w-5" />} tone="emerald" />
    </section>

    {loading ? <div className="flex min-h-72 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-sm font-black text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading time off…</div> : payload && <>
      <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <SectionCard title="Blocked Dates" description="These dates are checked before a request can be submitted.">
          <div className="space-y-3">{activeBlackouts.map((item) => <article key={item.id} className={`rounded-2xl border p-4 ${item.block_requests ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50"}`}>
            <div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-slate-950">{item.title}</strong>{item.block_requests && <StatusBadge tone="red">Requests Blocked</StatusBadge>}</div><p className="mt-1 text-xs font-black text-rose-800">{fmtRange(item.start_date, item.end_date)}</p><p className="mt-1 text-xs font-semibold text-slate-500">{item.location_id ? (locationMap.get(item.location_id)?.name || "Location") : "All TCS Locations"}</p>{item.reason && <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">{item.reason}</p>}</div>{payload.canManageBlackouts && <button disabled={working} onClick={() => void deactivateBlackout(item.id)} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-red-700" aria-label="Remove blackout"><XCircle className="h-4 w-4" /></button>}</div>
          </article>)}{!activeBlackouts.length && <Empty icon={<Ban className="h-6 w-6" />} title="No dates are blocked" detail="Leadership can block training days, mandatory meetings, major events, or other dates when time-off requests cannot be accepted." />}</div>
        </SectionCard>

        <SectionCard title="My Time-Off Requests" description="Approved time off becomes part of the staffing picture; pending requests stay visible until leadership reviews them.">
          <div className="space-y-3">{myRequests.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-slate-950">{item.request_type}</strong><StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge></div><p className="mt-1 text-xs font-black text-slate-500">{fmtRange(item.start_date, item.end_date)} • {item.request_scope === "Specific Location" ? (item.location_id ? locationMap.get(item.location_id)?.name : "Location") : "All assigned locations"}</p>{item.reason && <p className="mt-2 text-sm text-slate-700">{item.reason}</p>}{item.review_notes && <p className="mt-2 rounded-xl bg-slate-50 p-2 text-xs font-semibold text-slate-600">Leadership note: {item.review_notes}</p>}</div>{["Pending","Approved"].includes(item.status) && <button disabled={working} onClick={() => void cancelRequest(item.id)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">Cancel</button>}</div>
          </article>)}{!myRequests.length && <Empty icon={<CalendarDays className="h-6 w-6" />} title="No requests yet" detail="Your submitted time-off requests will appear here." />}</div>
        </SectionCard>
      </div>

      {(payload.canApproveGeneralClockExceptions || payload.canApproveMaintenanceClockExceptions || activeClockExceptions.length > 0) && <SectionCard title="Shift Exception Approvals" description="Scheduled hours are the limit. An approved exception is required for work outside the published shift. Clock-out is never blocked because actual time worked must still be recorded.">
        <div className="grid gap-4 xl:grid-cols-[.7fr_1.3fr]">
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-xs font-black uppercase tracking-[.14em] text-emerald-800">TCS clock window</p>
            <p className="mt-3 text-3xl font-black text-slate-950">{payload.attendanceSettings.early_clock_in_window_minutes} min early / {payload.attendanceSettings.late_clock_out_window_minutes} min after</p>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">Staff may clock in up to {payload.attendanceSettings.early_clock_in_window_minutes} minutes before a published shift. Work beyond scheduled hours requires approval. A late clock-out is still captured, then sent for leadership review when no approval exists.</p>
            <div className="mt-4 rounded-2xl border border-white bg-white/80 p-4">
              <p className="text-xs font-black uppercase tracking-wider text-slate-500">Authorized approvers</p>
              <p className="mt-2 text-sm font-bold text-slate-800">{payload.clockApprovers.filter((row) => row.approval_scope === "General" && row.is_active).map((row) => staffMap.get(row.user_id)?.full_name).filter(Boolean).join(" • ") || "No general approver configured"}</p>
              <p className="mt-2 text-xs font-semibold text-slate-500">Maintenance approver: {maintenanceApproverId ? (staffMap.get(maintenanceApproverId)?.full_name || "Assigned staff") : "Not assigned yet"}</p>
            </div>
            {payload.canSetMaintenanceApprover && <label className="mt-4 block"><span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-600">Designated maintenance approver</span><select className={inputClass} value={maintenanceApproverId} onChange={(event) => void setMaintenanceApprover(event.target.value)}><option value="">Not assigned</option>{payload.staff.filter((row) => row.user_id !== payload.currentUserId).map((row) => <option key={row.user_id} value={row.user_id}>{row.full_name}</option>)}</select><span className="mt-1.5 block text-[11px] font-semibold leading-5 text-slate-500">Tony can be selected here after his Hub staff account exists. Maintenance approval access is limited to maintenance exceptions.</span></label>}
          </div>
          <div className="space-y-3">{activeClockExceptions.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-slate-950">{staffMap.get(item.staff_user_id)?.full_name || "Employee"}</strong><StatusBadge tone={item.approval_scope === "Maintenance" ? "amber" : "green"}>{item.approval_scope}</StatusBadge></div><p className="mt-1 text-xs font-black text-slate-500">{fmtDate(item.work_date)} • {locationMap.get(item.location_id)?.name || "Location"}</p><p className="mt-2 text-sm font-semibold text-slate-700">{item.approved_start_time ? `May start at ${item.approved_start_time.slice(0,5)}` : "Normal start"} • {item.approved_end_time ? `May work until ${item.approved_end_time.slice(0,5)}` : "Normal end"}</p><p className="mt-2 text-xs leading-5 text-slate-500">{item.reason}</p></div>{(payload.canApproveGeneralClockExceptions || (payload.canApproveMaintenanceClockExceptions && item.approval_scope === "Maintenance")) && <button disabled={working} onClick={() => void revokeClockException(item.id)} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-800">Revoke</button>}</div>
          </article>)}{!activeClockExceptions.length && <Empty icon={<Clock3 className="h-6 w-6" />} title="No active shift exceptions" detail="Approved early starts, extended shifts, and maintenance exceptions will appear here." />}</div>
        </div>
      </SectionCard>}

      {payload.canReviewRequests && <SectionCard title="Leadership Review Queue" description="Review requests only after checking staffing, transportation, training, and other operational needs.">
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{pendingRequests.map((item) => <article key={item.id} className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="text-lg font-black text-slate-950">{staffMap.get(item.staff_user_id)?.full_name || "Employee"}</p><p className="mt-1 text-xs font-black uppercase tracking-wider text-amber-800">{item.request_type} • {fmtRange(item.start_date, item.end_date)}</p></div><StatusBadge tone="amber">Pending</StatusBadge></div>
          <p className="mt-3 text-xs font-semibold text-slate-600">{item.request_scope === "Specific Location" ? (item.location_id ? locationMap.get(item.location_id)?.name : "Location") : "All assigned locations"}</p>
          {item.reason && <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">{item.reason}</p>}
          <textarea className={`${inputClass} mt-4 min-h-20`} placeholder="Review note (optional)" value={reviewNotes[item.id] || ""} onChange={(event) => setReviewNotes((current) => ({ ...current, [item.id]: event.target.value }))} />
          <div className="mt-3 flex gap-2"><button disabled={working} onClick={() => void reviewRequest(item.id, "Approved")} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white"><CheckCircle2 className="h-4 w-4" /> Approve</button><button disabled={working} onClick={() => void reviewRequest(item.id, "Denied")} className="inline-flex items-center gap-2 rounded-xl bg-rose-700 px-3 py-2 text-xs font-black text-white"><XCircle className="h-4 w-4" /> Deny</button></div>
        </article>)}{!pendingRequests.length && <div className="lg:col-span-2 2xl:col-span-3"><Empty icon={<CheckCircle2 className="h-6 w-6" />} title="Review queue is clear" detail="No time-off requests are waiting for leadership." /></div>}</div>
      </SectionCard>}
    </>}

    {requestOpen && payload && <Modal title="Request Time Off" description="The Hub checks blocked dates before the request can be submitted." onClose={() => setRequestOpen(false)} footer={<><SecondaryButton onClick={() => setRequestOpen(false)}>Cancel</SecondaryButton><PrimaryButton onClick={() => document.getElementById("time-off-request-save")?.click()}>{working ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />} Submit Request</PrimaryButton></>}>
      <form onSubmit={submitRequest} className="grid gap-4 sm:grid-cols-2">
        <Field label="Request Type"><select className={inputClass} value={requestDraft.requestType} onChange={(event) => setRequestDraft({ ...requestDraft, requestType: event.target.value })}>{["Time Off","Vacation","Unpaid","Appointment","Other"].map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Applies To"><select className={inputClass} value={requestDraft.requestScope} onChange={(event) => setRequestDraft({ ...requestDraft, requestScope: event.target.value as typeof requestDraft.requestScope, locationId: "" })}><option>All Assigned Locations</option><option>Specific Location</option></select></Field>
        {requestDraft.requestScope === "Specific Location" && <Field label="Location" wide><select required className={inputClass} value={requestDraft.locationId} onChange={(event) => setRequestDraft({ ...requestDraft, locationId: event.target.value })}><option value="">Choose location…</option>{payload.locations.filter((location) => payload.assignments.some((item) => item.user_id === payload.currentUserId && item.location_id === location.id)).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>}
        <Field label="Start Date"><input type="date" required className={inputClass} value={requestDraft.startDate} onChange={(event) => setRequestDraft({ ...requestDraft, startDate: event.target.value, endDate: requestDraft.endDate || event.target.value })} /></Field>
        <Field label="End Date"><input type="date" required className={inputClass} value={requestDraft.endDate} min={requestDraft.startDate || undefined} onChange={(event) => setRequestDraft({ ...requestDraft, endDate: event.target.value })} /></Field>
        <label className="sm:col-span-2 flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-bold"><input type="checkbox" checked={requestDraft.allDay} onChange={(event) => setRequestDraft({ ...requestDraft, allDay: event.target.checked })} /> Full day(s)</label>
        {!requestDraft.allDay && <><Field label="Start Time"><input type="time" required className={inputClass} value={requestDraft.startTime} onChange={(event) => setRequestDraft({ ...requestDraft, startTime: event.target.value })} /></Field><Field label="End Time"><input type="time" required className={inputClass} value={requestDraft.endTime} onChange={(event) => setRequestDraft({ ...requestDraft, endTime: event.target.value })} /></Field></>}
        <Field label="Reason / note" wide><textarea className={`${inputClass} min-h-24`} placeholder="Optional note for leadership" value={requestDraft.reason} onChange={(event) => setRequestDraft({ ...requestDraft, reason: event.target.value })} /></Field>
        <div className="sm:col-span-2 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm font-bold leading-6 text-violet-950"><AlertTriangle className="mr-2 inline h-4 w-4" />If any requested date overlaps an active blocked period for your location, the Hub will stop the request and tell you which blackout caused the conflict.</div>
        <button id="time-off-request-save" className="hidden" type="submit">Save</button>
      </form>
    </Modal>}

    {exceptionOpen && payload && <Modal title="Approve Shift Exception" description="Use this only when extra work outside the published schedule has been authorized." onClose={() => setExceptionOpen(false)} footer={<><SecondaryButton onClick={() => setExceptionOpen(false)}>Cancel</SecondaryButton><PrimaryButton onClick={() => document.getElementById("clock-exception-save")?.click()}>{working ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve Exception</PrimaryButton></>}>
      <form onSubmit={submitClockException} className="grid gap-4 sm:grid-cols-2">
        <Field label="Employee"><select required className={inputClass} value={exceptionDraft.staffUserId} onChange={(event) => setExceptionDraft({ ...exceptionDraft, staffUserId: event.target.value, locationId: "" })}><option value="">Choose employee…</option>{payload.staff.filter((row) => row.user_id !== payload.currentUserId).map((row) => <option key={row.user_id} value={row.user_id}>{row.full_name}</option>)}</select></Field>
        <Field label="Approval Type"><select className={inputClass} value={exceptionDraft.approvalScope} onChange={(event) => setExceptionDraft({ ...exceptionDraft, approvalScope: event.target.value as "General" | "Maintenance" })}>{payload.canApproveGeneralClockExceptions && <option value="General">General Schedule Exception</option>}{payload.canApproveMaintenanceClockExceptions && <option value="Maintenance">Maintenance Work</option>}</select></Field>
        <Field label="Location"><select required className={inputClass} value={exceptionDraft.locationId} onChange={(event) => setExceptionDraft({ ...exceptionDraft, locationId: event.target.value })}><option value="">Choose location…</option>{payload.locations.filter((location) => !exceptionDraft.staffUserId || payload.assignments.some((item) => item.user_id === exceptionDraft.staffUserId && item.location_id === location.id)).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
        <Field label="Work Date"><input required type="date" className={inputClass} value={exceptionDraft.workDate} onChange={(event) => setExceptionDraft({ ...exceptionDraft, workDate: event.target.value })} /></Field>
        <Field label="Approved Early Start"><input type="time" className={inputClass} value={exceptionDraft.approvedStartTime} onChange={(event) => setExceptionDraft({ ...exceptionDraft, approvedStartTime: event.target.value })} /><span className="mt-1 block text-[11px] font-semibold text-slate-500">Leave blank if the normal start time still applies.</span></Field>
        <Field label="Approved Extended End"><input type="time" className={inputClass} value={exceptionDraft.approvedEndTime} onChange={(event) => setExceptionDraft({ ...exceptionDraft, approvedEndTime: event.target.value })} /><span className="mt-1 block text-[11px] font-semibold text-slate-500">Leave blank if the normal end time still applies.</span></Field>
        <Field label="Approval Reason" wide><textarea required className={`${inputClass} min-h-24`} placeholder="Why is work outside the scheduled hours approved?" value={exceptionDraft.reason} onChange={(event) => setExceptionDraft({ ...exceptionDraft, reason: event.target.value })} /></Field>
        <div className="sm:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-950"><Wrench className="mr-2 inline h-4 w-4" />Maintenance exceptions may be approved by Danielle or Jennifer, and by the designated maintenance approver once that staff account is assigned. General schedule exceptions require a general approver.</div>
        <button id="clock-exception-save" className="hidden" type="submit">Save</button>
      </form>
    </Modal>}

    {blackoutOpen && payload && <Modal title="Block Time-Off Dates" description="Use this for mandatory trainings, staff meetings, major events, or any period when leadership cannot approve time off." onClose={() => setBlackoutOpen(false)} footer={<><SecondaryButton onClick={() => setBlackoutOpen(false)}>Cancel</SecondaryButton><PrimaryButton onClick={() => document.getElementById("blackout-save")?.click()}>{working ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} Block Dates</PrimaryButton></>}>
      <form onSubmit={submitBlackout} className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" wide><input required className={inputClass} placeholder="Example: Mandatory Staff Training" value={blackoutDraft.title} onChange={(event) => setBlackoutDraft({ ...blackoutDraft, title: event.target.value })} /></Field>
        <Field label="Scope" wide><select className={inputClass} value={blackoutDraft.locationId} onChange={(event) => setBlackoutDraft({ ...blackoutDraft, locationId: event.target.value })}>{payload.canCreateCompanyWideBlackout && <option value="">All TCS Locations</option>}{!payload.canCreateCompanyWideBlackout && <option value="">Choose location…</option>}{payload.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
        <Field label="Start Date"><input type="date" required className={inputClass} value={blackoutDraft.startDate} onChange={(event) => setBlackoutDraft({ ...blackoutDraft, startDate: event.target.value, endDate: blackoutDraft.endDate || event.target.value })} /></Field>
        <Field label="End Date"><input type="date" required className={inputClass} value={blackoutDraft.endDate} min={blackoutDraft.startDate || undefined} onChange={(event) => setBlackoutDraft({ ...blackoutDraft, endDate: event.target.value })} /></Field>
        <Field label="Reason" wide><input className={inputClass} placeholder="Mandatory training, all-hands meeting, licensing visit…" value={blackoutDraft.reason} onChange={(event) => setBlackoutDraft({ ...blackoutDraft, reason: event.target.value })} /></Field>
        <Field label="Leadership Notes" wide><textarea className={`${inputClass} min-h-24`} value={blackoutDraft.notes} onChange={(event) => setBlackoutDraft({ ...blackoutDraft, notes: event.target.value })} /></Field>
        <label className="sm:col-span-2 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-950"><input type="checkbox" checked={blackoutDraft.blockRequests} onChange={(event) => setBlackoutDraft({ ...blackoutDraft, blockRequests: event.target.checked })} /> Prevent staff from submitting overlapping time-off requests</label>
        <button id="blackout-save" className="hidden" type="submit">Save</button>
      </form>
    </Modal>}

    {settingsOpen && payload?.canConfigureAttendance && <Modal title="Attendance Accountability Rules" description="Nothing is assumed. Turn on only the rules TCS has actually decided to use." onClose={() => setSettingsOpen(false)} footer={<><SecondaryButton onClick={() => setSettingsOpen(false)}>Cancel</SecondaryButton><PrimaryButton onClick={() => document.getElementById("attendance-settings-save")?.click()}>{working ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />} Save Rules</PrimaryButton></>}>
      <form onSubmit={saveSettings} className="space-y-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-black text-emerald-950">Scheduled-hours enforcement</p>
          <label className="mt-3 flex items-start gap-3 text-sm font-bold text-slate-800"><input type="checkbox" className="mt-1" checked={settingsDraft.enforce_schedule_clocking} onChange={(event) => setSettingsDraft({ ...settingsDraft, enforce_schedule_clocking: event.target.checked })} /><span>Require a published shift or approved exception before staff can clock in.</span></label>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500">Earliest clock-in • minutes before shift</span><input type="number" min="0" className={inputClass} value={settingsDraft.early_clock_in_window_minutes} onChange={(event) => setSettingsDraft({ ...settingsDraft, early_clock_in_window_minutes: Math.max(0, Math.round(Number(event.target.value) || 0)) })} /></label><label><span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500">Latest normal clock-out • minutes after shift</span><input type="number" min="0" className={inputClass} value={settingsDraft.late_clock_out_window_minutes} onChange={(event) => setSettingsDraft({ ...settingsDraft, late_clock_out_window_minutes: Math.max(0, Math.round(Number(event.target.value) || 0)) })} /></label></div>
          <label className="mt-4 flex items-start gap-3 text-sm font-bold text-slate-800"><input type="checkbox" className="mt-1" checked={settingsDraft.flag_scheduled_hours_overage} onChange={(event) => setSettingsDraft({ ...settingsDraft, flag_scheduled_hours_overage: event.target.checked })} /><span>Flag actual worked time above scheduled hours when no approved exception exists.</span></label>
          <p className="mt-3 text-xs font-semibold leading-5 text-emerald-900">Current TCS rule is {settingsDraft.early_clock_in_window_minutes} minutes before shift and {settingsDraft.late_clock_out_window_minutes} minutes after shift. Clock-out remains available so actual worked time is never lost.</p>
        </div>
        <RuleToggle
          title="Late arrival review"
          detail="Create a pending leadership review when clock-in is later than the scheduled shift start plus this grace period."
          enabled={settingsDraft.late_tracking_enabled}
          minutes={settingsDraft.late_grace_minutes}
          onEnabled={(value) => setSettingsDraft({ ...settingsDraft, late_tracking_enabled: value })}
          onMinutes={(value) => setSettingsDraft({ ...settingsDraft, late_grace_minutes: value })}
          label="Grace minutes"
        />
        <RuleToggle
          title="Early departure review"
          detail="Create a pending review when clock-out is earlier than the scheduled shift end beyond this grace period."
          enabled={settingsDraft.early_departure_tracking_enabled}
          minutes={settingsDraft.early_departure_grace_minutes}
          onEnabled={(value) => setSettingsDraft({ ...settingsDraft, early_departure_tracking_enabled: value })}
          onMinutes={(value) => setSettingsDraft({ ...settingsDraft, early_departure_grace_minutes: value })}
          label="Grace minutes"
        />
        <RuleToggle
          title="Possible no-call/no-show review"
          detail="After a scheduled shift start passes by this many minutes with no clock-in, create a pending review. Leadership must verify whether staff communicated before confirming it."
          enabled={settingsDraft.no_show_tracking_enabled}
          minutes={settingsDraft.no_show_after_minutes}
          onEnabled={(value) => setSettingsDraft({ ...settingsDraft, no_show_tracking_enabled: value })}
          onMinutes={(value) => setSettingsDraft({ ...settingsDraft, no_show_after_minutes: value })}
          label="Minutes after shift start"
        />
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-950"><ShieldAlert className="mr-2 inline h-4 w-4" />Automatic attendance flags go to leadership review first. They are not confirmed accountability records until someone verifies what happened.</div>
        <button id="attendance-settings-save" className="hidden" type="submit">Save</button>
      </form>
    </Modal>}
  </div></MainLayout>;
}

function RuleToggle({ title, detail, enabled, minutes, onEnabled, onMinutes, label }: { title: string; detail: string; enabled: boolean; minutes: number | null; onEnabled: (value: boolean) => void; onMinutes: (value: number | null) => void; label: string }) {
  return <div className="rounded-2xl border border-slate-200 p-4"><label className="flex items-start gap-3"><input type="checkbox" className="mt-1" checked={enabled} onChange={(event) => onEnabled(event.target.checked)} /><span><strong className="block text-slate-950">{title}</strong><span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{detail}</span></span></label>{enabled && <label className="mt-4 block"><span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500">{label}</span><input required type="number" min="0" className={inputClass} value={minutes ?? ""} onChange={(event) => onMinutes(event.target.value === "" ? null : Math.max(0, Math.round(Number(event.target.value))))} /></label>}</div>;
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-sm font-black text-slate-700">{label}</span>{children}</label>;
}

function Empty({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-slate-500"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm">{icon}</div><p className="mt-3 font-black text-slate-800">{title}</p><p className="mt-1 text-xs font-semibold leading-5">{detail}</p></div>;
}
