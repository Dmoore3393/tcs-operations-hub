"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { SectionCard, SecondaryButton, StatusBadge } from "@/components/hub/HubUI";
import {
  starterRoutes,
  starterSchools,
  starterVehicles,
  type TransportationRoute,
} from "@/lib/hub-data";
import { usePersistentState } from "@/hooks/usePersistentState";
import { localIsoDate } from "@/lib/date-utils";
import {
  BadgeCheck,
  BellRing,
  Building2,
  Bus,
  Car,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  MapPin,
  Megaphone,
  Navigation,
  Phone,
  RotateCcw,
  Settings2,
  UserCheck,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

type ModernRunStatus = "Waiting" | "Picked Up" | "Arrived" | "Checked In";
type StoredRunStatus = ModernRunStatus | "Dropped Off";

type RunEvent = {
  date: string;
  status: Exclude<StoredRunStatus, "Waiting">;
  at: string;
  by: string;
  location: string;
};

type LiveRoute = TransportationRoute & {
  routeName?: string;
  stopOrder?: number;
  pickupArea?: string;
  pickupInstructions?: string;
  dropoffLocation?: string;
  dropoffAddress?: string;
  dropoffInstructions?: string;
  coveringDriver?: string;
  coveringDate?: string;
  runDate?: string;
  runStatus?: StoredRunStatus;
  pickedUpAt?: string;
  pickedUpBy?: string;
  arrivedAt?: string;
  arrivedBy?: string;
  checkedInAt?: string;
  checkedInBy?: string;
  droppedOffAt?: string;
  droppedOffBy?: string;
  runHistory?: RunEvent[];
};

function routeKey(route: LiveRoute) {
  return route.routeName?.trim() || `${route.location} • ${route.driver || "Transportation Route"}`;
}

function runStatus(route: LiveRoute, today: string): ModernRunStatus {
  if (route.runDate !== today) return "Waiting";
  if (route.runStatus === "Dropped Off") return "Checked In";
  return route.runStatus ?? "Waiting";
}

function timeLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function latestTime(route: LiveRoute) {
  return route.checkedInAt || route.droppedOffAt || route.arrivedAt || route.pickedUpAt || "";
}

function statusLabel(status: ModernRunStatus) {
  if (status === "Picked Up") return "In Transit";
  if (status === "Arrived") return "Arrived • Check-In Required";
  return status;
}

function statusTone(status: ModernRunStatus) {
  if (status === "Checked In") return "green" as const;
  if (status === "Arrived") return "blue" as const;
  if (status === "Picked Up") return "amber" as const;
  return "slate" as const;
}

function isToday(days: string) {
  const now = new Date();
  const dayIndex = now.getDay();
  const shortDay = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][dayIndex];
  const fullDay = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][dayIndex];
  const normalized = (days || "").toLowerCase().replaceAll("–", "-").replaceAll("—", "-");
  if (!normalized.trim()) return true;
  if ((normalized.includes("mon-fri") || normalized.includes("m-f") || normalized.includes("monday-friday")) && dayIndex >= 1 && dayIndex <= 5) return true;
  return normalized.includes(shortDay) || normalized.includes(fullDay);
}

function directionsHref(value: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`;
}

function initials(name: string) {
  return name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "TS";
}

function driverMatches(route: LiveRoute, person: string) {
  const normalizedPerson = person.trim().toLowerCase();
  if (!normalizedPerson) return false;
  const firstName = normalizedPerson.split(/\s+/)[0] ?? "";
  const driver = (route.coveringDriver || route.driver || "").trim().toLowerCase();
  return driver === normalizedPerson || driver.includes(normalizedPerson) || Boolean(firstName && driver.includes(firstName));
}

function leadershipRecipient(fullName = "", email = "") {
  const source = `${fullName} ${email}`.toLowerCase();
  return source.includes("danielle") || source.includes("jennifer") || /(^|\s)jen(\s|@|$)/.test(source);
}

function StatTile({ icon, label, value, helper, tone }: { icon: ReactNode; label: string; value: string | number; helper: string; tone: "blue" | "yellow" | "green" | "purple" | "slate" }) {
  const tones = {
    blue: "border-blue-100 bg-blue-50 text-blue-800",
    yellow: "border-amber-100 bg-amber-50 text-amber-800",
    green: "border-emerald-100 bg-emerald-50 text-emerald-800",
    purple: "border-violet-100 bg-violet-50 text-violet-800",
    slate: "border-slate-200 bg-white text-slate-800",
  } as const;
  return (
    <article className={`rounded-2xl border p-4 shadow-sm ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[11px] font-black uppercase tracking-[0.14em] opacity-70">{label}</p><p className="mt-1 text-3xl font-black tracking-tight">{value}</p><p className="mt-1 text-xs font-semibold opacity-70">{helper}</p></div>
        <div className="rounded-xl bg-white/70 p-2.5 shadow-sm">{icon}</div>
      </div>
    </article>
  );
}

export default function TransportationOverlay() {
  const searchParams = useSearchParams();
  const { canManageSystem, isLocationLicensee, isEmployee, profile } = useAuth();
  const { location: activeLocation } = useHubLocation();
  const [routes, setRoutes] = usePersistentState<LiveRoute[]>("tcs-routes", starterRoutes as LiveRoute[]);
  const [selectedRouteKey, setSelectedRouteKey] = useState("");

  const today = localIsoDate();
  const actor = profile?.full_name?.trim() || profile?.email || "TCS Staff";
  const isLeadershipRecipient = leadershipRecipient(profile?.full_name ?? "", profile?.email ?? "");
  const canManageRoutes = canManageSystem || isLocationLicensee;

  const locationRoutes = useMemo(
    () => routes.filter((route) => route.status !== "Not Riding" && (activeLocation === "All Locations" || route.location === activeLocation)),
    [activeLocation, routes],
  );
  const todayRoutes = useMemo(() => locationRoutes.filter((route) => isToday(route.days)), [locationRoutes]);
  const routeKeys = useMemo(() => [...new Set(todayRoutes.map(routeKey))], [todayRoutes]);
  const myRouteKeys = useMemo(() => [...new Set(todayRoutes.filter((route) => driverMatches(route, actor)).map(routeKey))], [actor, todayRoutes]);
  const effectiveRouteKey = routeKeys.includes(selectedRouteKey) ? selectedRouteKey : (myRouteKeys[0] ?? routeKeys[0] ?? "");
  const selectedRoutes = useMemo(
    () => todayRoutes.filter((route) => routeKey(route) === effectiveRouteKey).sort((a, b) => (a.stopOrder ?? 999) - (b.stopOrder ?? 999) || a.pickup.localeCompare(b.pickup)),
    [effectiveRouteKey, todayRoutes],
  );

  const drivers = [...new Set(todayRoutes.map((route) => route.coveringDate === today && route.coveringDriver ? route.coveringDriver : route.driver).filter(Boolean))];
  const transported = todayRoutes.filter((route) => runStatus(route, today) !== "Waiting").length;
  const checkedIn = todayRoutes.filter((route) => runStatus(route, today) === "Checked In").length;
  const routeCount = [...new Set(todayRoutes.map(routeKey))].length;
  const readyVehicles = starterVehicles.filter((vehicle) => vehicle.status === "Ready").length;
  const started = todayRoutes.filter((route) => route.pickedUpAt && route.runDate === today);
  const onTime = started.length ? `${Math.round((started.filter((route) => {
    const scheduled = route.pickup.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
    if (!scheduled || !route.pickedUpAt) return true;
    let hour = Number(scheduled[1]);
    const minute = Number(scheduled[2]);
    const suffix = scheduled[3]?.toLowerCase();
    if (suffix === "pm" && hour !== 12) hour += 12;
    if (suffix === "am" && hour === 12) hour = 0;
    const actual = new Date(route.pickedUpAt);
    return actual.getHours() * 60 + actual.getMinutes() <= hour * 60 + minute + 10;
  }).length / started.length) * 100)}%` : "—";

  const leadershipExceptions = isLeadershipRecipient ? todayRoutes.filter((route) => ["Picked Up", "Arrived"].includes(runStatus(route, today))) : [];
  const siteArrivalAlerts = !isLeadershipRecipient ? todayRoutes.filter((route) => runStatus(route, today) === "Arrived") : [];
  const recent = [...todayRoutes].filter((route) => latestTime(route)).sort((a, b) => latestTime(b).localeCompare(latestTime(a))).slice(0, 7);
  const schoolNames = [...new Set(todayRoutes.map((route) => route.school).filter(Boolean))];

  function updateStatus(route: LiveRoute, status: Exclude<ModernRunStatus, "Waiting">) {
    const now = new Date().toISOString();
    const location = status === "Picked Up" ? route.pickupArea || route.school || "Pickup location" : route.dropoffLocation || route.location || "TCS location";
    setRoutes((current) => current.map((item) => {
      if (item.id !== route.id) return item;
      const next: LiveRoute = {
        ...item,
        runDate: today,
        runStatus: status,
        runHistory: [...(item.runHistory ?? []), { date: today, status, at: now, by: actor, location }],
      };
      if (status === "Picked Up") {
        next.pickedUpAt = now;
        next.pickedUpBy = actor;
        next.arrivedAt = undefined;
        next.arrivedBy = undefined;
        next.checkedInAt = undefined;
        next.checkedInBy = undefined;
      }
      if (status === "Arrived") {
        next.arrivedAt = now;
        next.arrivedBy = actor;
      }
      if (status === "Checked In") {
        next.checkedInAt = now;
        next.checkedInBy = actor;
        next.droppedOffAt = now;
        next.droppedOffBy = actor;
      }
      return next;
    }));
  }

  function resetToday(route: LiveRoute) {
    setRoutes((current) => current.map((item) => item.id === route.id ? {
      ...item,
      runDate: today,
      runStatus: "Waiting",
      pickedUpAt: undefined,
      pickedUpBy: undefined,
      arrivedAt: undefined,
      arrivedBy: undefined,
      checkedInAt: undefined,
      checkedInBy: undefined,
      droppedOffAt: undefined,
      droppedOffBy: undefined,
    } : item));
  }

  function coverRouteToday() {
    if (!effectiveRouteKey) return;
    setRoutes((current) => current.map((route) => routeKey(route) === effectiveRouteKey ? { ...route, coveringDriver: actor, coveringDate: today } : route));
  }

  if (searchParams.get("legacy") === "1") return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 top-20 z-20 overflow-y-auto overscroll-contain bg-slate-100 lg:left-72">
      <div className="mx-auto max-w-[1600px] space-y-6 p-4 pb-10 sm:p-6 lg:p-8">
        <section className="overflow-hidden rounded-[30px] border border-blue-100 bg-gradient-to-br from-sky-50 via-white to-blue-50 shadow-sm">
          <div className="grid min-h-[210px] gap-6 p-6 sm:p-8 lg:grid-cols-[1.35fr_.65fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-yellow-300 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-blue-950"><Bus className="h-4 w-4" /> TCS School Shuttle</div>
              <h1 className="mt-4 text-4xl font-black tracking-tight text-blue-950 sm:text-5xl">Safe & Reliable Transportation</h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600 sm:text-base">One live custody chain from school pickup to arrival and location check-in. Drivers confirm every pickup, receiving staff confirm every handoff, and leadership can see the gaps that need attention.</p>
              <div className="mt-5 flex flex-wrap gap-2"><span className="rounded-full bg-blue-950 px-3 py-1.5 text-xs font-black text-white">School → Vehicle → TCS Location</span><span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-black text-emerald-800">Pickup + Arrival + Check-In</span><span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm">{activeLocation}</span></div>
            </div>
            <div className="relative hidden h-full min-h-[170px] lg:block"><div className="absolute inset-3 rounded-[28px] bg-blue-950 shadow-xl" /><div className="absolute left-8 top-8 flex h-24 w-24 items-center justify-center rounded-[26px] bg-yellow-300 text-blue-950 shadow-lg"><Bus className="h-14 w-14" /></div><div className="absolute bottom-8 right-8 rounded-2xl bg-white px-4 py-3 shadow-lg"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Today</p><p className="mt-1 text-lg font-black text-blue-950">{transported} children moving safely</p></div></div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatTile icon={<Navigation className="h-5 w-5" />} label="Active Routes" value={routeCount} helper={`${todayRoutes.length} child stops today`} tone="blue" />
          <StatTile icon={<UserCheck className="h-5 w-5" />} label="Drivers On Duty" value={drivers.length} helper={drivers.slice(0, 2).join(" • ") || "No driver started"} tone="yellow" />
          <StatTile icon={<Users className="h-5 w-5" />} label="Students Transported" value={transported} helper={`${checkedIn} checked in`} tone="green" />
          <StatTile icon={<Car className="h-5 w-5" />} label="Shuttle Buses" value={readyVehicles} helper={`${starterVehicles.length} fleet vehicles`} tone="purple" />
          <StatTile icon={<BadgeCheck className="h-5 w-5" />} label="On-Time Today" value={onTime} helper={started.length ? `${started.length} pickups measured` : "Starts after pickup"} tone="slate" />
        </section>

        {isLeadershipRecipient && leadershipExceptions.length > 0 && (
          <section className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-5 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-2xl"><div className="flex items-center gap-2 text-amber-900"><BellRing className="h-5 w-5" /><p className="text-xs font-black uppercase tracking-[0.16em]">Danielle + Jennifer • leadership custody monitor</p></div><h2 className="mt-2 text-xl font-black text-slate-950">{leadershipExceptions.length} child handoff{leadershipExceptions.length === 1 ? "" : "s"} still in progress</h2><p className="mt-1 text-sm leading-6 text-slate-600">Only Danielle and Jennifer see pickup and unfinished-handoff alerts. Before escalating a missing drop-off, check whether that location is on a field trip or otherwise off site.</p></div>
              <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-2 xl:max-w-3xl">{leadershipExceptions.slice(0, 4).map((route) => { const status = runStatus(route, today); return <div key={route.id} className="rounded-2xl border border-amber-200 bg-white p-3.5"><div className="flex items-center justify-between gap-2"><p className="font-black text-slate-950">{route.child}</p><StatusBadge tone={status === "Arrived" ? "blue" : "amber"}>{statusLabel(status)}</StatusBadge></div><p className="mt-1 text-xs font-semibold text-slate-500">{route.school} → {route.dropoffLocation || route.location}</p><p className="mt-2 text-xs text-slate-600">{status === "Picked Up" ? `Picked up ${timeLabel(route.pickedUpAt)} by ${route.pickedUpBy || route.driver || "staff"}` : `Arrived ${timeLabel(route.arrivedAt)} • waiting for location check-in`}</p></div>; })}</div>
            </div>
          </section>
        )}

        {!isLeadershipRecipient && siteArrivalAlerts.length > 0 && (
          <section className="rounded-3xl border-2 border-emerald-300 bg-emerald-50 p-5 shadow-sm"><div className="flex items-start gap-3"><div className="rounded-2xl bg-emerald-600 p-3 text-white"><Bus className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-800">Child arrival notification</p><h2 className="mt-1 text-xl font-black text-slate-950">{siteArrivalAlerts.length} child{siteArrivalAlerts.length === 1 ? " has" : "ren have"} arrived • check-in required</h2><p className="mt-1 text-sm text-slate-600">Program directors and authorized staff see arrival notices only. Missing-drop-off and in-transit exceptions stay with Danielle and Jennifer.</p></div></div></section>
        )}

        <section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr_.8fr]">
          <SectionCard title="Route Overview" description="Ordered stops, current custody status, and destination handoffs.">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {routeKeys.map((key) => <button key={key} onClick={() => setSelectedRouteKey(key)} className={`rounded-xl px-3 py-2 text-xs font-black ${effectiveRouteKey === key ? "bg-blue-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{key}{isEmployee && myRouteKeys.includes(key) ? " • MY ROUTE" : ""}</button>)}
              {routeKeys.length === 0 && <p className="text-sm text-slate-500">No route is scheduled for today.</p>}
              {canManageRoutes && <a href="/transportation?legacy=1" className="ml-auto inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"><Settings2 className="h-4 w-4" /> Manage Routes & Fleet</a>}
            </div>

            {selectedRoutes.length > 0 && <div className="mb-4 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-600">{isEmployee && myRouteKeys.includes(effectiveRouteKey) ? "MY ROUTE TODAY" : "SELECTED ROUTE"}</p><h3 className="mt-1 text-xl font-black text-slate-950">{effectiveRouteKey}</h3><p className="mt-1 text-sm font-semibold text-slate-500">Driver: {selectedRoutes.find((route) => route.coveringDate === today && route.coveringDriver)?.coveringDriver || selectedRoutes[0]?.driver || "Not assigned"} • Vehicle: {selectedRoutes[0]?.vehicle || "Not assigned"}</p></div>{canManageRoutes && <SecondaryButton onClick={coverRouteToday}><UserCheck className="h-4 w-4" /> I’m Covering This Route</SecondaryButton>}</div></div>}

            <div className="space-y-3">
              {selectedRoutes.map((route, index) => {
                const status = runStatus(route, today);
                const school = starterSchools.find((item) => item.school === route.school);
                return (
                  <article key={route.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-950 text-xs font-black text-white">{index + 1}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-lg font-black text-slate-950">{route.child}</p><StatusBadge tone={statusTone(status)}>{statusLabel(status)}</StatusBadge></div><p className="mt-1 text-sm font-bold text-slate-600"><Clock3 className="mr-1 inline h-4 w-4" /> {route.school} • Pickup {route.pickup || "TBD"}</p><p className="mt-1 text-sm font-bold text-slate-600"><MapPin className="mr-1 inline h-4 w-4" /> {route.dropoffLocation || route.location}{route.dropoffAddress ? ` • ${route.dropoffAddress}` : ""}</p>{route.pickupInstructions && <p className="mt-2 rounded-xl bg-blue-50 p-2.5 text-xs font-semibold leading-5 text-blue-900">Pickup: {route.pickupInstructions}</p>}{route.dropoffInstructions && <p className="mt-2 rounded-xl bg-emerald-50 p-2.5 text-xs font-semibold leading-5 text-emerald-900">Handoff: {route.dropoffInstructions}</p>}<div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">{route.pickedUpAt && <span className="rounded-full bg-amber-50 px-2.5 py-1">Picked up {timeLabel(route.pickedUpAt)}</span>}{route.arrivedAt && <span className="rounded-full bg-blue-50 px-2.5 py-1">Arrived {timeLabel(route.arrivedAt)}</span>}{(route.checkedInAt || route.droppedOffAt) && <span className="rounded-full bg-emerald-50 px-2.5 py-1">Checked in {timeLabel(route.checkedInAt || route.droppedOffAt)}</span>}</div>{school?.address && <a href={directionsHref(school.address)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-black text-blue-700"><Navigation className="h-3.5 w-3.5" /> School directions</a>}</div></div>
                      <div className="flex min-w-[210px] flex-col gap-2">{status === "Waiting" && <button onClick={() => updateStatus(route, "Picked Up")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-yellow-300 px-4 py-3 text-sm font-black text-blue-950 shadow-sm"><UserCheck className="h-4 w-4" /> PICKED UP</button>}{status === "Picked Up" && <button onClick={() => updateStatus(route, "Arrived")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white shadow-sm"><MapPin className="h-4 w-4" /> ARRIVED AT LOCATION</button>}{status === "Arrived" && <button onClick={() => updateStatus(route, "Checked In")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-sm"><CheckCircle2 className="h-4 w-4" /> CHECK CHILD IN</button>}{status === "Checked In" && <div className="rounded-xl bg-emerald-50 px-3 py-3 text-center text-sm font-black text-emerald-800"><CheckCircle2 className="mr-1 inline h-4 w-4" /> Checked in {timeLabel(route.checkedInAt || route.droppedOffAt)}</div>}{status !== "Waiting" && <button onClick={() => resetToday(route)} className="inline-flex items-center justify-center gap-1 text-xs font-black text-slate-400 hover:text-slate-700"><RotateCcw className="h-3.5 w-3.5" /> Reset today</button>}</div>
                    </div>
                  </article>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title="Driver Assignments" description="Driver, vehicle, and handoff progress.">
            <div className="space-y-3">{routeKeys.map((key) => { const group = todayRoutes.filter((route) => routeKey(route) === key); const driver = group.find((route) => route.coveringDate === today && route.coveringDriver)?.coveringDriver || group[0]?.driver || "Not assigned"; const done = group.filter((route) => runStatus(route, today) === "Checked In").length; return <button key={key} onClick={() => setSelectedRouteKey(key)} className="w-full rounded-2xl border border-slate-200 p-3.5 text-left transition hover:border-blue-300 hover:bg-blue-50/50"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-950 text-xs font-black text-white">{initials(driver)}</div><div className="min-w-0 flex-1"><p className="truncate font-black text-slate-950">{driver}</p><p className="truncate text-xs font-semibold text-slate-500">{key} • {group[0]?.vehicle || "No vehicle"}</p></div><ChevronRight className="h-4 w-4 text-slate-400" /></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${group.length ? Math.round((done / group.length) * 100) : 0}%` }} /></div><p className="mt-1.5 text-[11px] font-bold text-slate-400">{done}/{group.length} checked into destination</p></button>; })}</div>
          </SectionCard>

          <SectionCard title="Today’s Schedule" description="Time-ordered pickup plan.">
            <div className="space-y-2">{[...todayRoutes].sort((a, b) => a.pickup.localeCompare(b.pickup)).slice(0, 8).map((route) => { const status = runStatus(route, today); return <div key={route.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3"><div className="w-16 shrink-0 text-center"><p className="text-sm font-black text-blue-950">{route.pickup || "TBD"}</p></div><div className="h-8 w-px bg-slate-200" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-900">{route.school || "Stop not entered"}</p><p className="truncate text-xs font-semibold text-slate-500">{route.child} → {route.dropoffLocation || route.location}</p></div><CircleDot className={`h-4 w-4 ${status === "Checked In" ? "text-emerald-500" : status === "Arrived" ? "text-blue-500" : status === "Picked Up" ? "text-amber-500" : "text-slate-300"}`} /></div>; })}</div>
          </SectionCard>
        </section>

        <section className="grid gap-5 xl:grid-cols-3">
          <SectionCard title="Recent Pickups & Handoffs" description={isLeadershipRecipient ? "Danielle + Jennifer see the full custody chain." : "Site staff see arrival and check-in activity only."}>
            <div className="space-y-2">{recent.map((route) => { const status = runStatus(route, today); if (!isLeadershipRecipient && status === "Picked Up") return null; return <div key={route.id} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3"><div className={`mt-0.5 rounded-xl p-2 ${status === "Checked In" ? "bg-emerald-100 text-emerald-700" : status === "Arrived" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}><Bus className="h-4 w-4" /></div><div><p className="font-black text-slate-900">{route.child}</p><p className="mt-0.5 text-xs font-semibold text-slate-500">{statusLabel(status)} • {timeLabel(latestTime(route))}</p><p className="mt-0.5 text-xs text-slate-500">{route.school} → {route.dropoffLocation || route.location}</p></div></div>; })}{recent.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Activity appears here after the first pickup.</p>}</div>
          </SectionCard>

          <SectionCard title="Schools" description="Today’s school stops.">
            <div className="space-y-2">{schoolNames.slice(0, 6).map((name) => { const school = starterSchools.find((item) => item.school === name); const count = todayRoutes.filter((route) => route.school === name).length; return <div key={name} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3"><div className="rounded-xl bg-blue-50 p-2 text-blue-800"><Building2 className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate font-black text-slate-900">{name}</p><p className="truncate text-xs font-semibold text-slate-500">{school?.dismissal || "Dismissal TBD"} • {count} child{count === 1 ? "" : "ren"}</p></div></div>; })}</div>
          </SectionCard>

          <SectionCard title="Transportation Reminders" description="Clear role-based alerts without unnecessary alarms.">
            <div className="space-y-3"><div className="rounded-2xl border border-blue-100 bg-blue-50 p-3"><p className="text-sm font-black text-blue-950">Pickup and location check-in are separate</p><p className="mt-1 text-xs leading-5 text-blue-800">A child stays In Transit after pickup. The handoff is not complete until someone marks Arrived and then checks the child into the destination.</p></div><div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3"><p className="text-sm font-black text-emerald-950">Site staff receive arrival notices</p><p className="mt-1 text-xs leading-5 text-emerald-800">Program directors and staff are prompted only after the child reaches their location.</p></div>{isLeadershipRecipient && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-black text-amber-950">Missing handoff review = Danielle + Jennifer only</p><p className="mt-1 text-xs leading-5 text-amber-800">Check route progress and field-trip/off-site context before escalating a child who has not been checked into the building.</p></div>}</div>
          </SectionCard>
        </section>

        <section className="flex flex-col gap-3 rounded-3xl bg-blue-950 p-5 text-white sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-yellow-300">Transportation support</p><p className="mt-1 text-lg font-black">Need help with a route, handoff, or vehicle?</p></div><div className="flex flex-wrap gap-2"><a href="/health-safety" className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-black hover:bg-white/15"><Megaphone className="h-4 w-4" /> Report an Issue</a><a href="/transportation?legacy=1" className="inline-flex items-center gap-2 rounded-xl bg-yellow-300 px-4 py-2.5 text-sm font-black text-blue-950"><Phone className="h-4 w-4" /> Transportation Tools</a></div></section>
      </div>
    </div>
  );
}
