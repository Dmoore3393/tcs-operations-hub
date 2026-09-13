"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import {
  Coffee,
  History,
  LoaderCircle,
  LogIn,
  LogOut,
  Play,
  ShieldCheck,
  TimerReset,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type ClockEventType = "clock_in" | "clock_out" | "break_start" | "break_end";
type ClockEvent = {
  id: string;
  actorUserId: string;
  staffName: string;
  role: string;
  location: string;
  event: ClockEventType;
  occurredAt: string;
};
type Payload = {
  events: ClockEvent[];
  currentUserId: string;
  today: string;
};

const labels: Record<ClockEventType, string> = {
  clock_in: "Clocked In",
  clock_out: "Clocked Out",
  break_start: "Break Started",
  break_end: "Break Ended",
};

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function durationMinutes(events: ClockEvent[]) {
  const sorted = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  let workingFrom: number | null = null;
  let breakFrom: number | null = null;
  let total = 0;
  let breaks = 0;

  for (const event of sorted) {
    const stamp = new Date(event.occurredAt).getTime();
    if (!Number.isFinite(stamp)) continue;
    if (event.event === "clock_in") workingFrom = stamp;
    if (event.event === "break_start" && workingFrom !== null) breakFrom = stamp;
    if (event.event === "break_end" && breakFrom !== null) {
      breaks += Math.max(0, stamp - breakFrom);
      breakFrom = null;
    }
    if (event.event === "clock_out" && workingFrom !== null) {
      total += Math.max(0, stamp - workingFrom);
      workingFrom = null;
      breakFrom = null;
    }
  }
  if (workingFrom !== null) total += Math.max(0, Date.now() - workingFrom);
  if (breakFrom !== null) breaks += Math.max(0, Date.now() - breakFrom);
  return Math.max(0, Math.round((total - breaks) / 60000));
}

function hoursLabel(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export default function TimeClockPage() {
  const { session, user, profile, isSystemOwner, isLocationLicensee } = useAuth();
  const { location, availableLocations } = useHubLocation();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [workLocation, setWorkLocation] = useState(location === "All Locations" ? (availableLocations.find((item) => item !== "All Locations") || "Halcom") : location);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const response = await fetch("/api/time-clock?days=14", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const result = await response.json() as Payload & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load time clock.");
      setPayload(result);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load time clock.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  const mine = useMemo(
    () => payload?.events.filter((event) => event.actorUserId === user?.id) ?? [],
    [payload, user?.id],
  );
  const todayMine = useMemo(
    () => mine.filter((event) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(event.occurredAt)) === payload?.today),
    [mine, payload?.today],
  );
  const lastEvent = todayMine.at(-1)?.event ?? "";
  const state = !lastEvent || lastEvent === "clock_out" ? "Off Clock" : lastEvent === "break_start" ? "On Break" : "Working";
  const todayMinutes = durationMinutes(todayMine);

  async function act(event: ClockEventType) {
    if (!session?.access_token) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/time-clock", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event,
          location: workLocation,
          clientTimestamp: new Date().toISOString(),
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Time clock update failed.");
      await load();
      setNotice(labels[event]);
      window.setTimeout(() => setNotice(""), 2200);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Time clock update failed.");
    } finally {
      setSaving(false);
    }
  }

  const teamToday = useMemo(() => {
    if (!payload) return [];
    const map = new Map<string, ClockEvent[]>();
    payload.events.filter((event) => {
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(event.occurredAt));
      return date === payload.today;
    }).forEach((event) => map.set(event.actorUserId, [...(map.get(event.actorUserId) ?? []), event]));
    return [...map.values()].map((events) => ({
      userId: events[0].actorUserId,
      name: events[0].staffName,
      role: events[0].role,
      location: events.at(-1)?.location || "",
      last: events.at(-1)?.event || "clock_out",
      minutes: durationMinutes(events),
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [payload]);

  return <MainLayout><div className="mx-auto max-w-[1350px] space-y-6 pb-12">
    <section className="overflow-hidden rounded-[30px] bg-gradient-to-br from-[#111827] via-[#173d29] to-[#245a39] p-6 text-white shadow-xl sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[.18em] text-emerald-200">Staff time & attendance</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">The Hub Time Clock</h1><p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-emerald-50/80">Clock events are written to the immutable Hub audit history so staff time has a durable source record instead of editable browser-only timestamps.</p></div>
        <div className="rounded-2xl bg-white/10 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-emerald-100">Current Status</p><p className="mt-1 text-2xl font-black">{state}</p><p className="mt-1 text-xs text-emerald-100">{hoursLabel(todayMinutes)} worked today</p></div>
      </div>
    </section>

    {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-900">{notice}</div>}
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">{error}</div>}

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <label><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Working At</span><select disabled={state !== "Off Clock"} value={workLocation} onChange={(event) => setWorkLocation(event.target.value as typeof workLocation)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold disabled:bg-slate-100">{availableLocations.filter((item) => item !== "All Locations").map((item) => <option key={item}>{item}</option>)}</select></label>
        <div className="grid gap-2 sm:grid-cols-4">
          <Action disabled={saving || state !== "Off Clock"} onClick={() => void act("clock_in")} icon={<LogIn className="h-5 w-5" />} label="Clock In" tone="green" />
          <Action disabled={saving || state !== "Working"} onClick={() => void act("break_start")} icon={<Coffee className="h-5 w-5" />} label="Start Break" tone="amber" />
          <Action disabled={saving || state !== "On Break"} onClick={() => void act("break_end")} icon={<Play className="h-5 w-5" />} label="End Break" tone="blue" />
          <Action disabled={saving || state !== "Working"} onClick={() => void act("clock_out")} icon={<LogOut className="h-5 w-5" />} label="Clock Out" tone="slate" />
        </div>
      </div>
    </section>

    <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3"><History className="h-5 w-5 text-emerald-700" /><div><h2 className="font-black text-slate-950">My recent clock history</h2><p className="text-xs text-slate-500">Last 14 days</p></div></div>
        {loading ? <div className="flex min-h-40 items-center justify-center"><LoaderCircle className="h-5 w-5 animate-spin text-slate-400" /></div> :
          <div className="mt-4 space-y-2">{mine.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No clock events recorded yet.</p> : [...mine].reverse().slice(0, 20).map((event) => <div key={event.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><div><strong className="text-xs text-slate-900">{labels[event.event]}</strong><p className="mt-1 text-[10px] text-slate-500">{event.location} • {dateLabel(event.occurredAt)}</p></div><span className="text-xs font-black text-slate-700">{timeLabel(event.occurredAt)}</span></div>)}</div>}
      </section>

      {(isSystemOwner || isLocationLicensee) && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-black text-slate-950">Today’s team clock status</h2><p className="text-xs text-slate-500">Visible staff within your authorized scope.</p></div><ShieldCheck className="h-5 w-5 text-blue-700" /></div>
        <div className="mt-4 space-y-2">{teamToday.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No team clock activity today.</p> : teamToday.map((item) => {
          const status = !item.last || item.last === "clock_out" ? "Off Clock" : item.last === "break_start" ? "On Break" : "Working";
          return <div key={item.userId} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-slate-200 p-3"><div><strong className="text-sm text-slate-900">{item.name}</strong><p className="mt-1 text-[10px] text-slate-500">{item.location} • {item.role}</p></div><div className="text-right"><span className={`rounded-full px-2 py-1 text-[9px] font-black ${status === "Working" ? "bg-emerald-100 text-emerald-800" : status === "On Break" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"}`}>{status}</span><p className="mt-1 text-[10px] font-bold text-slate-500">{hoursLabel(item.minutes)}</p></div></div>;
        })}</div>
      </section>}
    </div>

    {isSystemOwner && <div className="text-right"><a href="/payroll-ops" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white"><TimerReset className="h-4 w-4" /> Open Payroll Hours Dashboard</a></div>}
  </div></MainLayout>;
}

function Action({ disabled, onClick, icon, label, tone }: { disabled: boolean; onClick: () => void; icon: React.ReactNode; label: string; tone: "green" | "amber" | "blue" | "slate" }) {
  const styles = { green: "bg-emerald-700", amber: "bg-amber-600", blue: "bg-blue-700", slate: "bg-slate-800" };
  return <button disabled={disabled} onClick={onClick} className={`inline-flex min-h-14 items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300 ${!disabled ? styles[tone] : ""}`}>{icon}{label}</button>;
}
