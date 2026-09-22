"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { timeToMinutes } from "@/lib/child-schedules";
import { type StaffActivityRow, type StaffShiftRow } from "@/lib/staffing-command";
import { supabase } from "@/lib/supabase/client";
import {
  AlertTriangle,
  Clock3,
  Download,
  LoaderCircle,
  ShieldCheck,
  TimerReset,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type ClockEvent = {
  id: string;
  actorUserId: string;
  staffName: string;
  role: string;
  location: string;
  event: "clock_in" | "clock_out" | "break_start" | "break_end";
  occurredAt: string;
};
type Payload = { events: ClockEvent[]; currentUserId: string; today: string };

function pacificDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function weekStart(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function eventMinutes(events: ClockEvent[]) {
  const sorted = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  let workingFrom: number | null = null;
  let breakFrom: number | null = null;
  let worked = 0;
  let breaks = 0;
  for (const event of sorted) {
    const stamp = new Date(event.occurredAt).getTime();
    if (!Number.isFinite(stamp)) continue;
    if (event.event === "clock_in") workingFrom = stamp;
    else if (event.event === "break_start" && workingFrom !== null) breakFrom = stamp;
    else if (event.event === "break_end" && breakFrom !== null) {
      breaks += Math.max(0, stamp - breakFrom);
      breakFrom = null;
    } else if (event.event === "clock_out" && workingFrom !== null) {
      worked += Math.max(0, stamp - workingFrom);
      workingFrom = null;
      breakFrom = null;
    }
  }
  return Math.max(0, Math.round((worked - breaks) / 60000));
}

function hours(minutes: number) {
  return (minutes / 60).toFixed(2);
}

function isoDateMinus(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function intervalMinutes(start: string, end: string, date: string) {
  const startMinutes = timeToMinutes(start.slice(0, 5));
  let endMinutes = timeToMinutes(end.slice(0, 5));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (date === today && end.startsWith("23:59")) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
    endMinutes = hour * 60 + minute;
  }
  return Math.max(0, endMinutes - startMinutes);
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export default function PayrollOpsPage() {
  const { session } = useAuth();
  const [shifts, setShifts] = useState<StaffShiftRow[]>([]);
  const [activities, setActivities] = useState<StaffActivityRow[]>([]);
  const [events, setEvents] = useState<ClockEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!session?.access_token || !supabase) return;
    setLoading(true);
    try {
      const fromDate = isoDateMinus(60);
      const [response, shiftResult, activityResult] = await Promise.all([
        fetch("/api/time-clock?days=60", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        }),
        supabase
          .from("staff_shifts")
          .select("id,location_id,user_id,staff_name,shift_date,start_time,end_time,status,position_label,notes")
          .eq("status", "Published")
          .gte("shift_date", fromDate)
          .order("shift_date")
          .order("start_time"),
        supabase
          .from("staff_activity_intervals")
          .select("id,location_id,shift_id,user_id,staff_name,activity_date,start_time,end_time,activity_type,counts_toward_floor,reason,source_key")
          .gte("activity_date", fromDate)
          .order("activity_date")
          .order("start_time"),
      ]);
      const payload = await response.json() as Payload & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load payroll hours.");
      if (shiftResult.error) throw new Error(shiftResult.error.message);
      if (activityResult.error) throw new Error(activityResult.error.message);
      setEvents(payload.events ?? []);
      setShifts((shiftResult.data ?? []) as StaffShiftRow[]);
      setActivities((activityResult.data ?? []) as StaffActivityRow[]);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load payroll hours.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    const groups = new Map<string, ClockEvent[]>();
    events.forEach((event) => {
      const week = weekStart(pacificDate(event.occurredAt));
      const key = `${event.actorUserId}|${week}`;
      groups.set(key, [...(groups.get(key) ?? []), event]);
    });

    return [...groups.entries()].map(([key, group]) => {
      const [userId, week] = key.split("|");
      const staffName = group[0]?.staffName || "TCS Staff";
      const actualMinutes = eventMinutes(group);
      const weekEnd = (() => {
        const date = new Date(`${week}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() + 6);
        return date.toISOString().slice(0, 10);
      })();
      const staffShifts = shifts.filter((shift) =>
        shift.shift_date >= week &&
        shift.shift_date <= weekEnd &&
        ((shift.user_id && shift.user_id === userId) || (!shift.user_id && shift.staff_name.trim().toLowerCase() === staffName.trim().toLowerCase())),
      );
      const scheduledMinutes = staffShifts.reduce((sum, shift) =>
        Math.max(0, timeToMinutes(shift.end_time.slice(0, 5)) - timeToMinutes(shift.start_time.slice(0, 5))) + sum, 0);

      const staffActivities = activities.filter((activity) =>
        activity.activity_date >= week &&
        activity.activity_date <= weekEnd &&
        ((activity.user_id && activity.user_id === userId) || (!activity.user_id && activity.staff_name.trim().toLowerCase() === staffName.trim().toLowerCase())),
      );
      const offFloorMinutes = staffActivities
        .filter((activity) => !activity.counts_toward_floor)
        .reduce((sum, activity) => sum + intervalMinutes(activity.start_time, activity.end_time, activity.activity_date), 0);
      const transportationMinutes = staffActivities
        .filter((activity) => activity.activity_type === "Transportation")
        .reduce((sum, activity) => sum + intervalMinutes(activity.start_time, activity.end_time, activity.activity_date), 0);

      return {
        key,
        userId,
        week,
        staffName,
        role: group[0]?.role || "",
        actualMinutes,
        scheduledMinutes,
        offFloorMinutes,
        transportationMinutes,
        overtimeMinutes: Math.max(0, actualMinutes - 40 * 60),
        varianceMinutes: actualMinutes - scheduledMinutes,
        locations: [...new Set(group.map((event) => event.location).filter(Boolean))].join(", "),
      };
    }).sort((a, b) => b.week.localeCompare(a.week) || a.staffName.localeCompare(b.staffName));
  }, [activities, events, shifts]);

  const currentWeek = rows[0]?.week || weekStart(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  const currentRows = rows.filter((row) => row.week === currentWeek);
  const actualCurrent = currentRows.reduce((sum, row) => sum + row.actualMinutes, 0);
  const overtimeCurrent = currentRows.reduce((sum, row) => sum + row.overtimeMinutes, 0);
  const overtimePeople = currentRows.filter((row) => row.overtimeMinutes > 0).length;
  const offFloorCurrent = currentRows.reduce((sum, row) => sum + row.offFloorMinutes, 0);
  const verificationFlags = currentRows.filter((row) => Math.abs(row.varianceMinutes) > 30).length;

  function exportCsv() {
    const headers = ["Week Of", "Staff", "Role", "Locations", "Scheduled Hours", "Actual Hours", "Off-Floor Duty Hours", "Transportation Hours", "Variance Hours", "Overtime Hours"];
    const data = rows.map((row) => [
      row.week,
      row.staffName,
      row.role,
      row.locations,
      hours(row.scheduledMinutes),
      hours(row.actualMinutes),
      hours(row.offFloorMinutes),
      hours(row.transportationMinutes),
      hours(row.varianceMinutes),
      hours(row.overtimeMinutes),
    ]);
    const csv = [headers, ...data].map((row) => row.map(csvEscape).join(",")).join("\n");
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    anchor.download = "tcs-payroll-hours.csv";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  return <MainLayout><div className="mx-auto max-w-[1450px] space-y-6 pb-12">
    <section className="overflow-hidden rounded-[30px] bg-gradient-to-br from-[#111827] via-[#30394a] to-[#173d29] p-6 text-white shadow-xl sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[.18em] text-slate-300">Owner payroll preparation</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Payroll Hours Dashboard</h1><p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-slate-200">Compare scheduled hours with immutable clock events, flag weekly overtime, and export clean hour totals for payroll preparation.</p></div>
        <button onClick={exportCsv} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950"><Download className="h-4 w-4" /> Export Payroll Hours</button>
      </div>
    </section>

    {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">{error}</div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Metric icon={<Users className="h-5 w-5" />} label="Staff This Week" value={currentRows.length} tone="blue" />
      <Metric icon={<Clock3 className="h-5 w-5" />} label="Actual Hours" value={hours(actualCurrent)} tone="green" />
      <Metric icon={<TimerReset className="h-5 w-5" />} label="Off-Floor Duty" value={hours(offFloorCurrent)} tone="blue" />
      <Metric icon={<AlertTriangle className="h-5 w-5" />} label="Verification Flags" value={verificationFlags} tone={verificationFlags ? "amber" : "green"} />
      <Metric icon={<AlertTriangle className="h-5 w-5" />} label="Overtime Staff" value={overtimePeople} tone={overtimePeople ? "red" : "green"} />
      <Metric icon={<TimerReset className="h-5 w-5" />} label="OT Hours" value={hours(overtimeCurrent)} tone={overtimeCurrent ? "amber" : "green"} />
    </section>

    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs font-semibold leading-5 text-blue-950"><ShieldCheck className="mr-1 inline h-4 w-4" />Scheduled hours now come from the live Staffing Command Center, while actual hours come from immutable clock events. Transportation, breaks, admin, training, and other recorded off-floor duties are shown as verification context—not deducted from paid time. The Hub still does not store or invent wage rates.</div>

    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      {loading ? <div className="flex min-h-64 items-center justify-center gap-2 text-sm font-bold text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Calculating payroll hours…</div> :
        rows.length === 0 ? <div className="p-10 text-center text-sm font-semibold text-slate-500">No time-clock events are available yet.</div> :
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><th className="px-4 py-3">Week</th><th className="px-4 py-3">Staff</th><th className="px-4 py-3">Locations</th><th className="px-4 py-3">Scheduled</th><th className="px-4 py-3">Actual</th><th className="px-4 py-3">Off-Floor</th><th className="px-4 py-3">Transportation</th><th className="px-4 py-3">Variance</th><th className="px-4 py-3">Overtime</th></tr></thead><tbody>{rows.map((row) => <tr key={row.key} className="border-b border-slate-100 last:border-0"><td className="px-4 py-4 font-bold text-slate-700">{row.week}</td><td className="px-4 py-4"><p className="font-black text-slate-950">{row.staffName}</p><p className="mt-1 text-[10px] text-slate-500">{row.role}</p></td><td className="px-4 py-4 text-xs text-slate-600">{row.locations || "—"}</td><td className="px-4 py-4 font-bold text-slate-700">{hours(row.scheduledMinutes)}</td><td className="px-4 py-4 font-black text-slate-950">{hours(row.actualMinutes)}</td><td className="px-4 py-4 font-bold text-slate-700">{hours(row.offFloorMinutes)}</td><td className="px-4 py-4 font-bold text-blue-700">{hours(row.transportationMinutes)}</td><td className={`px-4 py-4 font-black ${row.varianceMinutes > 30 ? "text-amber-700" : row.varianceMinutes < -30 ? "text-blue-700" : "text-slate-600"}`}>{row.varianceMinutes >= 0 ? "+" : ""}{hours(row.varianceMinutes)}</td><td className={`px-4 py-4 font-black ${row.overtimeMinutes ? "text-red-700" : "text-emerald-700"}`}>{hours(row.overtimeMinutes)}</td></tr>)}</tbody></table></div>}
    </section>
  </div></MainLayout>;
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number | string; tone: "blue" | "green" | "red" | "amber" }) {
  const styles = { blue: "bg-blue-100 text-blue-800", green: "bg-emerald-100 text-emerald-800", red: "bg-red-100 text-red-800", amber: "bg-amber-100 text-amber-900" };
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`grid h-10 w-10 place-items-center rounded-xl ${styles[tone]}`}>{icon}</span><strong className="mt-2 block text-2xl font-black text-slate-950">{value}</strong><span className="text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</span></div>;
}
