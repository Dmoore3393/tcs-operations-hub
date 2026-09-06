"use client";

import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import TransportationConsentForm from "@/components/transportation/TransportationConsentForm";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { localIsoDate } from "@/lib/date-utils";
import { initialChildren, type ChildRecord } from "@/lib/children";
import { starterCareLogs, type CareLogEntry } from "@/lib/employee-care";
import {
  starterRoutes,
  starterSchools,
  starterVehicles,
  type SchoolRecord,
  type TransportationRoute,
  type VehicleRecord,
} from "@/lib/hub-data";
import type { LocationKey } from "@/lib/location-config";
import {
  AlertTriangle,
  BellRing,
  Bus,
  CheckCircle2,
  Clock3,
  FileText,
  MapPin,
  Navigation,
  Pencil,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { useMemo, useState } from "react";

type RunStatus = "Waiting" | "Picked Up" | "Arrived" | "Checked In" | "Dropped Off";
type LiveRoute = TransportationRoute & {
  routeName?: string;
  stopOrder?: number;
  pickupArea?: string;
  pickupInstructions?: string;
  dropoffLocation?: string;
  dropoffAddress?: string;
  coveringDriver?: string;
  coveringDate?: string;
  runDate?: string;
  runStatus?: RunStatus;
  pickedUpAt?: string;
  pickedUpBy?: string;
  arrivedAt?: string;
  arrivedBy?: string;
  checkedInAt?: string;
  checkedInBy?: string;
  droppedOffAt?: string;
  droppedOffBy?: string;
};

function routeKey(route: LiveRoute) {
  return route.routeName?.trim() || `${route.location} • ${route.driver || "Transportation Route"}`;
}

function statusFor(route: LiveRoute, today: string): RunStatus {
  if (route.runDate !== today) return "Waiting";
  if (route.runStatus === "Dropped Off") return "Checked In";
  return route.runStatus ?? "Waiting";
}

function timeLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function scheduledToday(days: string) {
  const index = new Date().getDay();
  const short = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][index];
  const full = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][index];
  const text = (days || "").toLowerCase().replaceAll("–", "-").replaceAll("—", "-");
  if (!text.trim()) return true;
  if ((text.includes("mon-fri") || text.includes("m-f") || text.includes("monday-friday")) && index >= 1 && index <= 5) return true;
  return text.includes(short) || text.includes(full);
}

function destinationLocation(value?: string): Exclude<LocationKey, "All Locations"> | null {
  const text = (value || "").toLowerCase();
  if (text.includes("halcom") || text.includes("moore family")) return "Halcom";
  if (text.includes("21st") || text.includes("cathers")) return "21st Street";
  if (text.includes("division") || text.includes("school age")) return "Division";
  if (text.includes("33rd") || text.includes("cornejo")) return "33rd Street";
  if (text.includes("42nd") || text.includes("lara")) return "42nd Street";
  if (text.includes("tehachapi")) return "Tehachapi";
  return null;
}

function matchesLocation(route: LiveRoute, activeLocation: string) {
  if (activeLocation === "All Locations") return true;
  const destination = destinationLocation(route.dropoffLocation);
  return route.location === activeLocation || destination === activeLocation;
}

function isLeadership(name: string, email: string) {
  const identity = `${name} ${email}`.toLowerCase();
  return identity.includes("danielle") || identity.includes("jennifer") || identity.includes("jen thomason");
}

export default function TransportationV2Page() {
  const { profile, canManageSystem, isLocationLicensee } = useAuth();
  const { location: activeLocation } = useHubLocation();
  const [routes, setRoutes] = usePersistentState<LiveRoute[]>("tcs-routes", starterRoutes as LiveRoute[]);
  const [schools] = usePersistentState<SchoolRecord[]>("tcs-schools-v2", starterSchools);
  const [vehicles] = usePersistentState<VehicleRecord[]>("tcs-vehicles-v2", starterVehicles);
  const [children, setChildren] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const [careLogs, setCareLogs] = usePersistentState<CareLogEntry[]>("tcs-daily-care-v1", starterCareLogs);
  const [selectedRoute, setSelectedRoute] = useState("");
  const [showConsentForm, setShowConsentForm] = useState(false);
  const today = localIsoDate();
  const actor = profile?.full_name?.trim() || profile?.email || "TCS Staff";
  const leader = isLeadership(profile?.full_name || "", profile?.email || "");
  const canManageTransportation = canManageSystem || isLocationLicensee;

  const todayRoutes = useMemo(
    () => routes.filter((route) => route.status !== "Not Riding" && scheduledToday(route.days) && matchesLocation(route, activeLocation)),
    [routes, activeLocation],
  );
  const routeNames = useMemo(() => [...new Set(todayRoutes.map(routeKey))], [todayRoutes]);
  const effectiveRoute = routeNames.includes(selectedRoute) ? selectedRoute : routeNames[0] || "";
  const myRoute = useMemo(
    () => todayRoutes.filter((route) => routeKey(route) === effectiveRoute).sort((a, b) => (a.stopOrder ?? 999) - (b.stopOrder ?? 999) || a.pickup.localeCompare(b.pickup)),
    [todayRoutes, effectiveRoute],
  );

  const waiting = todayRoutes.filter((route) => statusFor(route, today) === "Waiting").length;
  const onboard = todayRoutes.filter((route) => statusFor(route, today) === "Picked Up").length;
  const arrived = todayRoutes.filter((route) => statusFor(route, today) === "Arrived").length;
  const checkedIn = todayRoutes.filter((route) => statusFor(route, today) === "Checked In").length;
  const fleetReady = vehicles.filter((vehicle) => vehicle.status === "Ready").length;

  const locationArrivals = todayRoutes.filter((route) => {
    const status = statusFor(route, today);
    return status === "Arrived" && destinationLocation(route.dropoffLocation) !== null;
  });
  const leadershipExceptions = routes.filter((route) => {
    if (route.runDate !== today) return false;
    const status = statusFor(route, today);
    return status === "Picked Up" || status === "Arrived";
  });

  function updateRoute(route: LiveRoute, patch: Partial<LiveRoute>) {
    setRoutes((current) => current.map((item) => item.id === route.id ? { ...item, ...patch } : item));
  }

  function markPickedUp(route: LiveRoute) {
    const now = new Date().toISOString();
    updateRoute(route, { runDate: today, runStatus: "Picked Up", pickedUpAt: now, pickedUpBy: actor, arrivedAt: undefined, checkedInAt: undefined });
  }

  function markArrived(route: LiveRoute) {
    const now = new Date().toISOString();
    updateRoute(route, { runDate: today, runStatus: "Arrived", arrivedAt: now, arrivedBy: actor });
  }

  function checkIntoLocation(route: LiveRoute) {
    const location = destinationLocation(route.dropoffLocation);
    if (!location) return;
    const now = new Date();
    const iso = now.toISOString();
    const child = children.find((item) => `${item.firstName} ${item.lastName}`.toLowerCase() === route.child.toLowerCase());

    updateRoute(route, { runDate: today, runStatus: "Checked In", checkedInAt: iso, checkedInBy: actor, droppedOffAt: iso, droppedOffBy: actor });

    if (child) {
      setChildren((current) => current.map((item) => item.id === child.id ? { ...item, attendanceToday: "Present" } : item));
      const alreadyLogged = careLogs.some((entry) => entry.childId === child.id && entry.location === location && entry.date === today && entry.action === "Transportation Check-In");
      if (!alreadyLogged) {
        const initials = actor.split(/\s+/).map((part) => part[0]).join("").replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() || "TCS";
        setCareLogs((current) => [...current, {
          id: `transport-checkin-${route.id}-${Date.now()}`,
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`,
          location,
          date: today,
          time: now.toTimeString().slice(0, 5),
          category: "Daily Note",
          action: "Transportation Check-In",
          result: "Arrived at location",
          notes: `Arrived from ${route.school || "transportation route"} via ${routeKey(route)}.`,
          initials,
          createdAt: iso,
        }]);
      }
    }
  }

  function confirmExternalDropoff(route: LiveRoute) {
    const now = new Date().toISOString();
    updateRoute(route, { runDate: today, runStatus: "Checked In", checkedInAt: now, checkedInBy: actor, droppedOffAt: now, droppedOffBy: actor });
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1580px] space-y-6 pb-12">
        <section className="relative overflow-hidden rounded-[2rem] border border-blue-100 bg-gradient-to-br from-[#eaf7ff] via-white to-[#d7ecff] shadow-[0_18px_55px_rgba(19,76,145,0.16)]">
          <div className="absolute -left-24 -top-20 h-60 w-60 rounded-full bg-[#ffc72c]/70" />
          <div className="absolute -right-24 -bottom-20 h-72 w-72 rounded-full bg-[#1757a8]/15" />
          <div className="relative grid min-h-[270px] gap-6 px-6 py-8 sm:px-9 lg:grid-cols-[.7fr_1.3fr] lg:items-center lg:px-12">
            <div className="flex items-center justify-center"><div className="relative grid h-44 w-72 place-items-center rounded-[2.25rem] bg-[#ffc72c] shadow-2xl ring-8 ring-white/70"><Bus className="h-24 w-24 text-[#123f7d]" strokeWidth={1.8} /><div className="absolute bottom-4 left-7 h-9 w-9 rounded-full border-4 border-white bg-[#153f75]" /><div className="absolute bottom-4 right-7 h-9 w-9 rounded-full border-4 border-white bg-[#153f75]" /></div></div>
            <div className="relative z-10 text-center lg:text-left"><p className="text-xs font-black uppercase tracking-[0.24em] text-[#1769d2]">TCS Operations Hub • School Shuttle</p><h1 className="mt-2 text-4xl font-black tracking-tight text-[#102a56] sm:text-6xl">The School Shuttle</h1><p className="mt-2 text-lg font-black text-[#1769d2]">Safe and Reliable Transportation</p><p className="mx-auto mt-4 max-w-3xl text-sm font-semibold leading-7 text-slate-600 lg:mx-0">Every child follows a clear custody chain: school pickup → in transit → arrival → location check-in. Staff confirm each step one child at a time.</p><div className="mt-5 flex flex-wrap justify-center gap-2 lg:justify-start"><Pill>📍 Exact pickup areas</Pill><Pill>✅ Required pickup confirmation</Pill><Pill>🏫 Required location check-in</Pill></div></div>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <Metric label="Active Routes" value={routeNames.length} icon={<Bus className="h-5 w-5" />} />
          <Metric label="Waiting" value={waiting} icon={<Clock3 className="h-5 w-5" />} tone="amber" />
          <Metric label="In Transit" value={onboard} icon={<Navigation className="h-5 w-5" />} tone="blue" />
          <Metric label="Arrived" value={arrived} icon={<MapPin className="h-5 w-5" />} tone="purple" />
          <Metric label="Checked In" value={checkedIn} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" />
          <Metric label="Fleet Ready" value={`${fleetReady}/${vehicles.length}`} icon={<ShieldCheck className="h-5 w-5" />} tone="slate" />
        </div>

        <section className="overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-r from-[#fff9e6] via-white to-[#eef6ff] shadow-sm">
          <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#ffc72c] text-[#102a56] shadow-sm"><FileText className="h-7 w-7" /></div>
              <div><p className="text-xs font-black uppercase tracking-[.18em] text-[#1769d2]">2026-2027 Forms</p><h2 className="mt-1 text-2xl font-black text-[#102a56]">Transportation Consent Forms</h2><p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">Open the full four-page School Transportation Consent packet, fill it out on screen, then print it or save it as a PDF for the child’s file.</p></div>
            </div>
            <button onClick={() => setShowConsentForm(true)} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1769d2] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#102a56]"><FileText className="h-4 w-4" /> OPEN CONSENT FORM</button>
          </div>
        </section>

        {leader && leadershipExceptions.length > 0 && <section className="rounded-3xl border border-amber-300 bg-amber-50 p-5 shadow-sm"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-6 w-6 text-amber-700" /><div><p className="text-xs font-black uppercase tracking-[.16em] text-amber-700">Danielle + Jen only</p><h2 className="mt-1 text-xl font-black text-amber-950">Transportation handoffs to review</h2><p className="mt-1 text-sm font-semibold text-amber-900">These children were picked up but have not completed the destination handoff yet. This is intentionally leadership-only so field trips and off-site care can be checked without alarming site staff.</p></div></div><div className="mt-4 grid gap-3 md:grid-cols-2">{leadershipExceptions.map((route) => <div key={route.id} className="rounded-2xl bg-white p-4 ring-1 ring-amber-200"><p className="font-black text-slate-950">{route.child}</p><p className="mt-1 text-sm font-bold text-amber-800">{statusFor(route, today)} • {routeKey(route)}</p><p className="mt-1 text-xs font-semibold text-slate-500">Expected: {route.dropoffLocation || "destination not entered"}</p></div>)}</div></section>}

        {locationArrivals.length > 0 && <section className="rounded-3xl border border-blue-200 bg-blue-50 p-5 shadow-sm"><div className="flex items-start gap-3"><BellRing className="mt-0.5 h-6 w-6 text-[#1769d2]" /><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#1769d2]">Location arrival notice</p><h2 className="mt-1 text-xl font-black text-[#102a56]">A transported child has arrived</h2><p className="mt-1 text-sm font-semibold text-slate-600">Program directors and authorized staff only need the arrival notice. Missing-drop-off alerts stay with Danielle and Jen.</p></div></div></section>}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-[#1769d2]">My Route Today</p><h2 className="mt-1 text-2xl font-black text-[#102a56]">Choose the route you are running</h2><p className="mt-1 text-sm font-semibold text-slate-500">Pickup and destination confirmation happen one child at a time.</p></div>{canManageTransportation && <Link href="/transportation" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#102a56] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#1769d2]"><Pencil className="h-4 w-4" /> MANAGE TRANSPORTATION SETUP</Link>}</div>
          <div className="mt-5 flex flex-wrap gap-2">{routeNames.map((name) => <button key={name} onClick={() => setSelectedRoute(name)} className={`rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${effectiveRoute === name ? "border-[#1769d2] bg-[#eef6ff] text-[#102a56]" : "border-slate-200 bg-white text-slate-600"}`}>{name}</button>)}{!routeNames.length && <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">No active routes are scheduled for today at this location.</p>}</div>
        </section>

        {effectiveRoute && <section className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3"><Summary label="Route" value={effectiveRoute} /><Summary label="Driver" value={myRoute.find((route) => route.coveringDate === today && route.coveringDriver)?.coveringDriver || myRoute[0]?.driver || "Not assigned"} /><Summary label="Vehicle" value={myRoute[0]?.vehicle || "Not assigned"} /></div>
          <div className="rounded-3xl border border-blue-100 bg-[#f7fbff] p-5"><div className="flex items-start gap-3"><Navigation className="mt-0.5 h-5 w-5 text-[#1769d2]" /><p className="text-sm font-semibold leading-6 text-slate-700"><strong>Required chain:</strong> Tap Picked Up only when the child is physically with you. At the destination, tap Arrived. For a TCS location, the child must then be checked into that location before the handoff is complete.</p></div></div>
          <div className="grid gap-4 xl:grid-cols-2">{myRoute.map((route) => {
            const status = statusFor(route, today);
            const destination = destinationLocation(route.dropoffLocation);
            return <article key={route.id} className={`rounded-3xl border p-5 shadow-sm ${status === "Checked In" ? "border-emerald-200 bg-emerald-50/60" : status === "Arrived" ? "border-purple-200 bg-purple-50/50" : status === "Picked Up" ? "border-blue-200 bg-blue-50/50" : "border-slate-200 bg-white"}`}>
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.15em] text-[#1769d2]">Stop {route.stopOrder ?? "—"} • {route.pickup || "Time not entered"}</p><h3 className="mt-1 text-xl font-black text-slate-950">{route.child}</h3><p className="mt-1 text-sm font-bold text-slate-600">{route.school || "Pickup destination not entered"}</p></div><Status status={status} /></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2"><Info label="PICK UP AT" value={route.pickupArea || route.school || "Not entered"} /><Info label="DESTINATION" value={route.dropoffLocation || "Not entered"} /></div>
              <div className="mt-4 flex flex-wrap gap-2">
                {status === "Waiting" && <Action onClick={() => markPickedUp(route)}><UserCheck className="h-4 w-4" /> PICKED UP</Action>}
                {status === "Picked Up" && <Action onClick={() => markArrived(route)} tone="purple"><MapPin className="h-4 w-4" /> ARRIVED AT DESTINATION</Action>}
                {status === "Arrived" && destination && <Action onClick={() => checkIntoLocation(route)} tone="green"><CheckCircle2 className="h-4 w-4" /> CHECK CHILD INTO {destination.toUpperCase()}</Action>}
                {status === "Arrived" && !destination && <Action onClick={() => confirmExternalDropoff(route)} tone="green"><CheckCircle2 className="h-4 w-4" /> CONFIRM DROP-OFF COMPLETE</Action>}
                {status === "Checked In" && <div className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-100 px-4 py-3 text-sm font-black text-emerald-800"><CheckCircle2 className="h-4 w-4" /> HANDOFF COMPLETE</div>}
              </div>
              <div className="mt-3 space-y-1 text-xs font-semibold text-slate-500">{route.pickedUpAt && <p>Picked up {timeLabel(route.pickedUpAt)} by {route.pickedUpBy || "staff"}</p>}{route.arrivedAt && <p>Arrived {timeLabel(route.arrivedAt)} by {route.arrivedBy || "staff"}</p>}{route.checkedInAt && <p>{destination ? "Checked into care" : "Drop-off completed"} {timeLabel(route.checkedInAt)} by {route.checkedInBy || "staff"}</p>}</div>
            </article>;
          })}</div>
        </section>}

        <section className="grid gap-5 xl:grid-cols-3"><Panel title="Recent Pickups" icon={<UserCheck className="h-5 w-5" />}>{todayRoutes.filter((route) => route.pickedUpAt).sort((a, b) => String(b.pickedUpAt).localeCompare(String(a.pickedUpAt))).slice(0, 5).map((route) => <Row key={route.id} top={route.child} bottom={`${timeLabel(route.pickedUpAt)} • ${route.school}`} />)}</Panel><Panel title="Schools" icon={<MapPin className="h-5 w-5" />}>{schools.filter((school) => school.status === "Active").slice(0, 5).map((school) => <Row key={school.id} top={school.school} bottom={`${school.area} • ${school.dismissal || "dismissal not entered"}`} />)}</Panel><Panel title="Transportation Reminders" icon={<ShieldCheck className="h-5 w-5" />}><Row top="One child at a time" bottom="Never bulk-confirm pickups or handoffs." /><Row top="Arrival is not check-in" bottom="TCS destination handoff requires a separate location check-in." /><Row top="Field trip exception review" bottom="Missing destination handoffs alert Danielle and Jen only." /></Panel></section>
      </div>
      {showConsentForm && <TransportationConsentForm onClose={() => setShowConsentForm(false)} />}
    </MainLayout>
  );
}

function Pill({ children }: { children: React.ReactNode }) { return <span className="rounded-full bg-white px-4 py-2 text-xs font-black text-[#123f7d] shadow-sm">{children}</span>; }
function Metric({ label, value, icon, tone = "blue" }: { label: string; value: React.ReactNode; icon: React.ReactNode; tone?: "blue" | "amber" | "purple" | "green" | "slate" }) { const styles = { blue: "bg-blue-50 text-blue-700", amber: "bg-amber-50 text-amber-700", purple: "bg-purple-50 text-purple-700", green: "bg-emerald-50 text-emerald-700", slate: "bg-slate-100 text-slate-700" }; return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`inline-flex rounded-xl p-2 ${styles[tone]}`}>{icon}</div><p className="mt-3 text-2xl font-black text-slate-950">{value}</p><p className="mt-1 text-xs font-black uppercase tracking-wider text-slate-500">{label}</p></div>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 font-black text-slate-900">{value}</p></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-sm font-black text-slate-900">{value}</p></div>; }
function Status({ status }: { status: RunStatus }) { const styles: Record<RunStatus, string> = { Waiting: "bg-amber-100 text-amber-800", "Picked Up": "bg-blue-100 text-blue-800", Arrived: "bg-purple-100 text-purple-800", "Checked In": "bg-emerald-100 text-emerald-800", "Dropped Off": "bg-emerald-100 text-emerald-800" }; return <span className={`rounded-full px-3 py-1.5 text-xs font-black ${styles[status]}`}>{status === "Picked Up" ? "IN TRANSIT" : status.toUpperCase()}</span>; }
function Action({ children, onClick, tone = "blue" }: { children: React.ReactNode; onClick: () => void; tone?: "blue" | "purple" | "green" }) { const styles = { blue: "bg-[#1769d2]", purple: "bg-purple-600", green: "bg-[#34a853]" }; return <button onClick={onClick} className={`inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black text-white shadow-sm ${styles[tone]}`}>{children}</button>; }
function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) { return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-[#102a56]">{icon}<h3 className="font-black">{title}</h3></div><div className="mt-4 space-y-3">{children}</div></section>; }
function Row({ top, bottom }: { top: string; bottom: string }) { return <div className="rounded-2xl bg-slate-50 p-3"><p className="text-sm font-black text-slate-900">{top}</p><p className="mt-1 text-xs font-semibold text-slate-500">{bottom}</p></div>; }
