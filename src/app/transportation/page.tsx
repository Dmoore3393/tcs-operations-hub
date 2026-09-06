"use client";

import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { Modal, PrimaryButton, SecondaryButton, SectionCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import {
  starterRoutes,
  starterSchools,
  starterVehicles,
  type SchoolRecord,
  type TransportationRoute,
  type VehicleRecord,
} from "@/lib/hub-data";
import { usePersistentState } from "@/hooks/usePersistentState";
import { localIsoDate } from "@/lib/date-utils";
import {
  Bus,
  Car,
  CheckCircle2,
  Clock3,
  FileSignature,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type RunStatus = "Waiting" | "Picked Up" | "Dropped Off";
type Tab = "Today" | "Routes" | "Schools" | "Vehicles";
type ReadinessState = Record<string, Record<string, boolean>>;

type LiveRoute = TransportationRoute & {
  routeName: string;
  stopOrder: number;
  pickupArea: string;
  pickupInstructions: string;
  dropoffLocation: string;
  dropoffAddress: string;
  dropoffInstructions: string;
  coveringDriver?: string;
  coveringDate?: string;
  runDate?: string;
  runStatus?: RunStatus;
  pickedUpAt?: string;
  pickedUpBy?: string;
  droppedOffAt?: string;
  droppedOffBy?: string;
};

type LiveSchool = SchoolRecord & {
  pickupArea: string;
  pickupInstructions: string;
  parkingInstructions: string;
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function routeStatus(value: unknown): TransportationRoute["status"] {
  return value === "Confirmed" || value === "Not Riding" ? value : "Needs Review";
}

function schoolStatus(value: unknown): SchoolRecord["status"] {
  return value === "Inactive" ? "Inactive" : "Active";
}

function vehicleStatus(value: unknown): VehicleRecord["status"] {
  return value === "Out of Service" || value === "Needs Attention" ? value : "Ready";
}

function normalizeRoute(value: TransportationRoute, index = 0): LiveRoute {
  const record = value as Partial<LiveRoute>;
  return {
    id: numberValue(record.id, Date.now() + index),
    location: text(record.location, "Division"),
    child: text(record.child),
    school: text(record.school),
    area: text(record.area, "Lancaster"),
    driver: text(record.driver),
    vehicle: text(record.vehicle),
    pickup: text(record.pickup),
    dropoff: text(record.dropoff),
    days: text(record.days, "Mon–Fri"),
    status: routeStatus(record.status),
    notes: text(record.notes),
    routeName: text(record.routeName),
    stopOrder: numberValue(record.stopOrder, index + 1),
    pickupArea: text(record.pickupArea),
    pickupInstructions: text(record.pickupInstructions),
    dropoffLocation: text(record.dropoffLocation || record.dropoff),
    dropoffAddress: text(record.dropoffAddress),
    dropoffInstructions: text(record.dropoffInstructions),
    coveringDriver: text(record.coveringDriver) || undefined,
    coveringDate: text(record.coveringDate) || undefined,
    runDate: text(record.runDate) || undefined,
    runStatus: record.runStatus === "Picked Up" || record.runStatus === "Dropped Off" ? record.runStatus : undefined,
    pickedUpAt: text(record.pickedUpAt) || undefined,
    pickedUpBy: text(record.pickedUpBy) || undefined,
    droppedOffAt: text(record.droppedOffAt) || undefined,
    droppedOffBy: text(record.droppedOffBy) || undefined,
  };
}

function normalizeSchool(value: SchoolRecord, index = 0): LiveSchool {
  const record = value as Partial<LiveSchool>;
  return {
    id: numberValue(record.id, Date.now() + index),
    school: text(record.school),
    district: text(record.district),
    area: text(record.area, "Lancaster"),
    address: text(record.address),
    phone: text(record.phone),
    startTime: text(record.startTime),
    dismissal: text(record.dismissal),
    minimumDay: text(record.minimumDay),
    minimumDayName: text(record.minimumDayName),
    status: schoolStatus(record.status),
    notes: text(record.notes),
    pickupArea: text(record.pickupArea),
    pickupInstructions: text(record.pickupInstructions),
    parkingInstructions: text(record.parkingInstructions),
  };
}

function normalizeVehicle(value: VehicleRecord, index = 0): VehicleRecord {
  const record = value as Partial<VehicleRecord>;
  return {
    id: numberValue(record.id, Date.now() + index),
    name: text(record.name),
    makeModel: text(record.makeModel),
    type: text(record.type, "SUV"),
    passengerCapacity: numberValue(record.passengerCapacity, 0),
    plate: text(record.plate),
    assignedLocation: text(record.assignedLocation, "All Sites"),
    primaryDriver: text(record.primaryDriver),
    status: vehicleStatus(record.status),
    registrationDue: text(record.registrationDue),
    insuranceDue: text(record.insuranceDue),
    notes: text(record.notes),
  };
}

const blankRoute = normalizeRoute({
  id: 0, location: "Division", child: "", school: "", area: "Lancaster", driver: "", vehicle: "", pickup: "", dropoff: "", days: "Mon–Fri", status: "Needs Review", notes: "",
} as TransportationRoute);

const blankSchool = normalizeSchool({
  id: 0, school: "", district: "", area: "Lancaster", address: "", phone: "", startTime: "", dismissal: "", minimumDay: "", minimumDayName: "", status: "Active", notes: "",
} as SchoolRecord);

const blankVehicle = normalizeVehicle({
  id: 0, name: "", makeModel: "", type: "SUV", passengerCapacity: 0, plate: "", assignedLocation: "All Sites", primaryDriver: "", status: "Ready", registrationDue: "", insuranceDue: "", notes: "",
} as VehicleRecord);

const readinessItems = [
  "Fuel level checked",
  "Emergency binder in vehicle",
  "Child emergency cards current",
  "First aid kit stocked",
  "Harnesses and car seats secured",
  "Driver phone charged",
];

function routeKey(route: LiveRoute) {
  return route.routeName.trim() || `${route.location} • ${route.driver.trim() || "Transportation Route"}`;
}

function scheduledToday(days: string) {
  const index = new Date().getDay();
  const short = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][index];
  const full = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][index];
  const normalized = days.toLowerCase().replaceAll("–", "-").replaceAll("—", "-");
  if (!normalized.trim()) return true;
  if ((normalized.includes("mon-fri") || normalized.includes("m-f") || normalized.includes("monday-friday")) && index >= 1 && index <= 5) return true;
  return normalized.includes(short) || normalized.includes(full);
}

function runStatus(route: LiveRoute, today: string): RunStatus {
  return route.runDate === today ? route.runStatus ?? "Waiting" : "Waiting";
}

function timeLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function TransportationPage() {
  const { session, canManageSystem, isLocationLicensee, profile } = useAuth();
  const { location: activeLocation, availableLocations } = useHubLocation();
  const [rawRoutes, setRawRoutes] = usePersistentState<TransportationRoute[]>("tcs-routes", starterRoutes);
  const [rawSchools, setRawSchools] = usePersistentState<SchoolRecord[]>("tcs-schools-v2", starterSchools);
  const [rawVehicles, setRawVehicles] = usePersistentState<VehicleRecord[]>("tcs-vehicles-v2", starterVehicles);
  const [readiness, setReadiness] = usePersistentState<ReadinessState>("tcs-vehicle-readiness-v2", {});
  const [tab, setTab] = useState<Tab>("Today");
  const [selectedRouteKey, setSelectedRouteKey] = useState("");
  const [routeSearch, setRouteSearch] = useState("");
  const [schoolSearch, setSchoolSearch] = useState("");
  const [editingRoute, setEditingRoute] = useState<LiveRoute | null>(null);
  const [editingSchool, setEditingSchool] = useState<LiveSchool | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<VehicleRecord | null>(null);
  const [originalSchoolName, setOriginalSchoolName] = useState("");
  const [originalVehicleName, setOriginalVehicleName] = useState("");
  const [message, setMessage] = useState("");

  const routes = useMemo(() => (Array.isArray(rawRoutes) ? rawRoutes : []).map(normalizeRoute), [rawRoutes]);
  const schools = useMemo(() => (Array.isArray(rawSchools) ? rawSchools : []).map(normalizeSchool), [rawSchools]);
  const vehicles = useMemo(() => (Array.isArray(rawVehicles) ? rawVehicles : []).map(normalizeVehicle), [rawVehicles]);
  const today = localIsoDate();
  const actor = profile?.full_name?.trim() || profile?.email || "TCS Staff";
  const identity = `${profile?.full_name ?? ""} ${profile?.email ?? ""}`.toLowerCase();
  const leadershipOverride = identity.includes("danielle moore") || identity.includes("jennifer thomason") || identity.includes("heather graham");
  const canManageSetup = canManageSystem || isLocationLicensee || leadershipOverride;

  const locationRoutes = useMemo(() => routes.filter((route) => route.status !== "Not Riding" && (activeLocation === "All Locations" || route.location === activeLocation)), [activeLocation, routes]);
  const todayRoutes = useMemo(() => locationRoutes.filter((route) => scheduledToday(route.days)), [locationRoutes]);
  const routeKeys = useMemo(() => [...new Set(todayRoutes.map(routeKey))], [todayRoutes]);
  const effectiveRouteKey = routeKeys.includes(selectedRouteKey) ? selectedRouteKey : routeKeys[0] ?? "";
  const selectedRoutes = useMemo(() => todayRoutes.filter((route) => routeKey(route) === effectiveRouteKey).sort((a, b) => a.stopOrder - b.stopOrder || a.pickup.localeCompare(b.pickup)), [effectiveRouteKey, todayRoutes]);
  const filteredRoutes = useMemo(() => locationRoutes.filter((route) => [routeKey(route), route.child, route.school, route.driver, route.vehicle, route.pickupArea, route.dropoffLocation].join(" ").toLowerCase().includes(routeSearch.toLowerCase())), [locationRoutes, routeSearch]);
  const filteredSchools = useMemo(() => schools.filter((school) => [school.school, school.district, school.area, school.address].join(" ").toLowerCase().includes(schoolSearch.toLowerCase())), [schoolSearch, schools]);

  async function persistLeadershipConfig(stateKey: "tcs-schools-v2" | "tcs-vehicles-v2", value: unknown[]) {
    if (!leadershipOverride || canManageSystem || isLocationLicensee || !session?.access_token) return;
    try {
      const response = await fetch("/api/transportation-config", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ stateKey, value }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save transportation setup.");
      setMessage("Transportation setup saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save transportation setup.");
    }
  }

  function updateRoute(route: LiveRoute, patch: Partial<LiveRoute>) {
    setRawRoutes((current) => (Array.isArray(current) ? current : []).map((item, index) => {
      const safe = normalizeRoute(item, index);
      return safe.id === route.id ? normalizeRoute({ ...safe, ...patch } as LiveRoute, index) : safe;
    }));
  }

  function markPickedUp(route: LiveRoute) {
    updateRoute(route, { runDate: today, runStatus: "Picked Up", pickedUpAt: new Date().toISOString(), pickedUpBy: actor, droppedOffAt: undefined, droppedOffBy: undefined });
  }

  function markDroppedOff(route: LiveRoute) {
    if (!route.dropoffLocation.trim()) return;
    updateRoute(route, { runDate: today, runStatus: "Dropped Off", droppedOffAt: new Date().toISOString(), droppedOffBy: actor });
  }

  function resetRoute(route: LiveRoute) {
    updateRoute(route, { runDate: undefined, runStatus: undefined, pickedUpAt: undefined, pickedUpBy: undefined, droppedOffAt: undefined, droppedOffBy: undefined });
  }

  function coverRoute() {
    if (!effectiveRouteKey) return;
    setRawRoutes((current) => (Array.isArray(current) ? current : []).map((item, index) => {
      const safe = normalizeRoute(item, index);
      return routeKey(safe) === effectiveRouteKey ? { ...safe, coveringDriver: actor, coveringDate: today } : safe;
    }));
  }

  function openRoute(route?: LiveRoute) {
    setEditingRoute(route ? { ...route } : { ...blankRoute, id: Date.now(), location: activeLocation === "All Locations" ? "Division" : activeLocation, vehicle: vehicles.find((vehicle) => vehicle.status === "Ready")?.name ?? "", routeName: activeLocation === "All Locations" ? "New Route" : `${activeLocation} Route`, stopOrder: Math.max(0, ...locationRoutes.map((item) => item.stopOrder)) + 1 });
  }

  function saveRoute(event: FormEvent) {
    event.preventDefault();
    if (!editingRoute) return;
    const safe = normalizeRoute(editingRoute);
    if (!safe.child.trim()) { setMessage("Add the child name before saving the route."); return; }
    setRawRoutes((current) => {
      const list = (Array.isArray(current) ? current : []).map(normalizeRoute);
      return list.some((item) => item.id === safe.id) ? list.map((item) => item.id === safe.id ? safe : item) : [...list, safe];
    });
    setEditingRoute(null);
    setMessage("Route saved.");
  }

  function openSchool(school?: LiveSchool) {
    setOriginalSchoolName(school?.school ?? "");
    setEditingSchool(school ? { ...school } : { ...blankSchool, id: Date.now() });
  }

  function saveSchool(event: FormEvent) {
    event.preventDefault();
    if (!editingSchool) return;
    const safe = normalizeSchool(editingSchool);
    if (!safe.school.trim()) { setMessage("Add the school name before saving."); return; }
    const next = schools.some((item) => item.id === safe.id) ? schools.map((item) => item.id === safe.id ? safe : item) : [...schools, safe];
    setRawSchools(next);
    if (originalSchoolName && originalSchoolName !== safe.school) {
      setRawRoutes((current) => (Array.isArray(current) ? current : []).map((item, index) => {
        const route = normalizeRoute(item, index);
        return route.school === originalSchoolName ? { ...route, school: safe.school } : route;
      }));
    }
    void persistLeadershipConfig("tcs-schools-v2", next);
    setEditingSchool(null);
    setOriginalSchoolName("");
    setMessage("School saved.");
  }

  function openVehicle(vehicle?: VehicleRecord) {
    setOriginalVehicleName(vehicle?.name ?? "");
    setEditingVehicle(vehicle ? { ...vehicle } : { ...blankVehicle, id: Date.now() });
  }

  function saveVehicle(event: FormEvent) {
    event.preventDefault();
    if (!editingVehicle) return;
    const safe = normalizeVehicle(editingVehicle);
    if (!safe.name.trim()) { setMessage("Add the vehicle name before saving."); return; }
    const next = vehicles.some((item) => item.id === safe.id) ? vehicles.map((item) => item.id === safe.id ? safe : item) : [...vehicles, safe];
    setRawVehicles(next);
    if (originalVehicleName && originalVehicleName !== safe.name) {
      setRawRoutes((current) => (Array.isArray(current) ? current : []).map((item, index) => {
        const route = normalizeRoute(item, index);
        return route.vehicle === originalVehicleName ? { ...route, vehicle: safe.name } : route;
      }));
    }
    void persistLeadershipConfig("tcs-vehicles-v2", next);
    setEditingVehicle(null);
    setOriginalVehicleName("");
    setMessage("Vehicle saved.");
  }

  function toggleReadiness(vehicleId: number, item: string) {
    setReadiness((current) => ({ ...current, [String(vehicleId)]: { ...(current[String(vehicleId)] ?? {}), [item]: !(current[String(vehicleId)]?.[item] ?? false) } }));
  }

  const waiting = todayRoutes.filter((route) => runStatus(route, today) === "Waiting").length;
  const onboard = todayRoutes.filter((route) => runStatus(route, today) === "Picked Up").length;
  const complete = todayRoutes.filter((route) => runStatus(route, today) === "Dropped Off").length;

  return <MainLayout><div className="mx-auto max-w-[1580px] space-y-6 pb-14">
    <section className="overflow-hidden rounded-[2rem] border border-blue-100 bg-gradient-to-br from-[#eaf7ff] via-white to-[#fff4bf] p-6 shadow-[0_18px_55px_rgba(19,76,145,.14)] sm:p-9">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[.22em] text-[#1769d2]">TCS Operations Hub • The School Shuttle</p><h1 className="mt-2 text-4xl font-black tracking-tight text-[#102a56] sm:text-6xl">Transportation</h1><p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-slate-600">Run today’s routes, edit route records, manage schools and vehicles, and keep transportation consent forms in one place.</p></div>
        <div className="flex flex-wrap gap-3"><Link href="/transportation-consents" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#ffc72c] px-5 py-3 text-sm font-black text-[#102a56] shadow-sm"><FileSignature className="h-4 w-4" /> CONSENT FORMS</Link>{canManageSetup && <button type="button" onClick={() => setTab("Schools")} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#102a56] px-5 py-3 text-sm font-black text-white"><Pencil className="h-4 w-4" /> MANAGE SETUP</button>}</div>
      </div>
    </section>

    {message && <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-950">{message}</div>}

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Today’s Records" value={todayRoutes.length} icon={<Bus className="h-5 w-5" />} />
      <Metric label="Waiting" value={waiting} icon={<Clock3 className="h-5 w-5" />} tone="amber" />
      <Metric label="On Board" value={onboard} icon={<Users className="h-5 w-5" />} tone="purple" />
      <Metric label="Dropped Off" value={complete} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" />
      <Metric label="Fleet Ready" value={`${vehicles.filter((vehicle) => vehicle.status === "Ready").length}/${vehicles.length}`} icon={<Car className="h-5 w-5" />} tone="slate" />
    </div>

    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      {(["Today", "Routes", "Schools", "Vehicles"] as const).map((item) => <button type="button" key={item} onClick={() => setTab(item)} className={`rounded-xl px-4 py-3 text-sm font-black transition ${tab === item ? "bg-[#1769d2] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}>{item === "Today" ? "My Route Today" : item}</button>)}
      <Link href="/transportation-consents" className="rounded-xl px-4 py-3 text-sm font-black text-[#102a56] hover:bg-amber-50">Consent Forms</Link>
    </div>

    {tab === "Today" && <div className="space-y-5">
      <SectionCard title="My Route Today" description="Choose the route you are running. Each child is confirmed individually.">
        <div className="flex flex-wrap gap-2">{routeKeys.map((key) => <button type="button" key={key} onClick={() => setSelectedRouteKey(key)} className={`rounded-xl border px-4 py-3 text-sm font-black ${effectiveRouteKey === key ? "border-blue-500 bg-blue-50 text-[#102a56]" : "border-slate-200 text-slate-600"}`}>{key}</button>)}{!routeKeys.length && <p className="text-sm font-semibold text-slate-500">No active routes are scheduled today for this location.</p>}</div>
        {effectiveRouteKey && <div className="mt-4"><button type="button" onClick={coverRoute} className="rounded-xl bg-[#ffc72c] px-4 py-3 text-sm font-black text-[#102a56]"><UserCheck className="mr-2 inline h-4 w-4" />I’m Covering This Route Today</button></div>}
      </SectionCard>

      {selectedRoutes.map((route) => {
        const status = runStatus(route, today);
        return <article key={route.id} className={`rounded-3xl border p-5 shadow-sm ${status === "Dropped Off" ? "border-emerald-200 bg-emerald-50" : status === "Picked Up" ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#1769d2]">Stop {route.stopOrder} • {route.pickup || "Pickup time needed"}</p><h3 className="mt-1 text-xl font-black text-slate-950">{route.child || "Child name needed"}</h3><p className="mt-1 text-sm font-bold text-slate-600">{route.school || "School/destination needed"}</p></div><StatusBadge tone={status === "Dropped Off" ? "green" : status === "Picked Up" ? "blue" : "amber"}>{status}</StatusBadge></div>
          <div className="mt-4 grid gap-3 md:grid-cols-2"><Info label="PICK UP AT" value={route.pickupArea || route.school || "Not entered"} /><Info label="DROP OFF AT" value={route.dropoffLocation || "Not entered"} /></div>
          {route.pickupInstructions && <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-100">Pickup instructions: {route.pickupInstructions}</p>}
          {route.notes && <p className="mt-2 text-xs font-semibold text-red-700">Safety / route note: {route.notes}</p>}
          <div className="mt-4 flex flex-wrap gap-2">{status === "Waiting" && <button type="button" onClick={() => markPickedUp(route)} className="min-h-11 flex-1 rounded-xl bg-[#1769d2] px-4 py-3 text-sm font-black text-white"><UserCheck className="mr-2 inline h-4 w-4" />PICKED UP</button>}{status === "Picked Up" && <button type="button" onClick={() => markDroppedOff(route)} disabled={!route.dropoffLocation.trim()} className="min-h-11 flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40"><CheckCircle2 className="mr-2 inline h-4 w-4" />DROPPED OFF</button>}{status === "Dropped Off" && <div className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-emerald-100 px-4 py-3 text-sm font-black text-emerald-800">HANDOFF COMPLETE</div>}{canManageSetup && status !== "Waiting" && <button type="button" onClick={() => resetRoute(route)} className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-xs font-black text-slate-600"><RotateCcw className="mr-1 inline h-4 w-4" />Reset</button>}{canManageSetup && <button type="button" onClick={() => openRoute(route)} className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-xs font-black text-slate-600"><Pencil className="mr-1 inline h-4 w-4" />Edit</button>}</div>
          {(route.pickedUpAt || route.droppedOffAt) && <div className="mt-3 text-xs font-semibold text-slate-500">{route.pickedUpAt && <p>Picked up {timeLabel(route.pickedUpAt)} by {route.pickedUpBy || "staff"}</p>}{route.droppedOffAt && <p>Dropped off {timeLabel(route.droppedOffAt)} by {route.droppedOffBy || "staff"}</p>}</div>}
        </article>;
      })}
    </div>}

    {tab === "Routes" && <SectionCard title="Route Setup" description="Add or edit the child, school, driver, vehicle, pickup, and destination details." action={canManageSetup ? <PrimaryButton onClick={() => openRoute()}><Plus className="h-4 w-4" /> Add Route</PrimaryButton> : undefined}>
      <label className="relative block"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-10`} value={routeSearch} onChange={(event) => setRouteSearch(event.target.value)} placeholder="Search routes…" /></label>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">{filteredRoutes.map((route) => <div key={route.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-[#1769d2]">{routeKey(route)} • Stop {route.stopOrder}</p><h3 className="mt-1 font-black text-slate-950">{route.child || "Child needed"}</h3><p className="mt-1 text-sm font-semibold text-slate-600">{route.school || "School needed"} • {route.pickup || "Pickup time needed"}</p></div>{canManageSetup && <button type="button" onClick={() => openRoute(route)} className="rounded-xl border border-slate-200 p-2 text-slate-600"><Pencil className="h-4 w-4" /></button>}</div><div className="mt-3 grid gap-2 sm:grid-cols-2"><Info label="PICKUP" value={route.pickupArea || "Not entered"} /><Info label="DROP-OFF" value={route.dropoffLocation || "Not entered"} /></div></div>)}</div>
    </SectionCard>}

    {tab === "Schools" && <SectionCard title="Schools" description="You can add new schools, change dismissal times, pickup areas, addresses, and deactivate schools without deleting them." action={canManageSetup ? <PrimaryButton onClick={() => openSchool()}><Plus className="h-4 w-4" /> Add School</PrimaryButton> : undefined}>
      <label className="relative block"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-10`} value={schoolSearch} onChange={(event) => setSchoolSearch(event.target.value)} placeholder="Search schools…" /></label>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">{filteredSchools.map((school) => <div key={school.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-slate-950">{school.school || "School name needed"}</h3><p className="mt-1 text-sm font-semibold text-slate-600">{school.district || "District not entered"} • {school.area || "Area not entered"}</p></div><div className="flex items-center gap-2"><StatusBadge tone={school.status === "Active" ? "green" : "slate"}>{school.status}</StatusBadge>{canManageSetup && <button type="button" onClick={() => openSchool(school)} className="rounded-xl border border-slate-200 p-2 text-slate-600"><Pencil className="h-4 w-4" /></button>}</div></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><Info label="DISMISSAL" value={school.dismissal || "Not entered"} /><Info label="MINIMUM DAY" value={school.minimumDay || "Not entered"} /></div>{school.pickupArea && <p className="mt-3 text-xs font-semibold text-slate-500"><MapPin className="mr-1 inline h-3.5 w-3.5" />Pickup: {school.pickupArea}</p>}</div>)}</div>
    </SectionCard>}

    {tab === "Vehicles" && <div className="space-y-5"><SectionCard title="Vehicles" description="Manage the fleet and current vehicle status." action={canManageSetup ? <PrimaryButton onClick={() => openVehicle()}><Plus className="h-4 w-4" /> Add Vehicle</PrimaryButton> : undefined}>
      <div className="grid gap-3 lg:grid-cols-2">{vehicles.map((vehicle) => <div key={vehicle.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-slate-950">{vehicle.name || "Vehicle name needed"}</h3><p className="mt-1 text-sm font-semibold text-slate-600">{vehicle.makeModel || vehicle.type} • Capacity {vehicle.passengerCapacity || "—"}</p></div><div className="flex items-center gap-2"><StatusBadge tone={vehicle.status === "Ready" ? "green" : vehicle.status === "Out of Service" ? "red" : "amber"}>{vehicle.status}</StatusBadge>{canManageSetup && <button type="button" onClick={() => openVehicle(vehicle)} className="rounded-xl border border-slate-200 p-2 text-slate-600"><Pencil className="h-4 w-4" /></button>}</div></div></div>)}</div>
    </SectionCard>
    <SectionCard title="Vehicle Readiness" description="Tap each item after it has been physically checked."><div className="space-y-4">{vehicles.map((vehicle) => <div key={vehicle.id} className="rounded-2xl border border-slate-200 p-4"><p className="font-black text-slate-950">{vehicle.name}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{readinessItems.map((item) => { const checked = readiness[String(vehicle.id)]?.[item] ?? false; return <button type="button" key={item} onClick={() => toggleReadiness(vehicle.id, item)} className={`rounded-xl border px-3 py-3 text-left text-sm font-bold ${checked ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"}`}><CheckCircle2 className="mr-2 inline h-4 w-4" />{item}</button>; })}</div></div>)}</div></SectionCard></div>}

    {editingRoute && <Modal title="Route Record" description="Changes save to the shared Transportation route data." onClose={() => setEditingRoute(null)}><form onSubmit={saveRoute} className="grid gap-4 sm:grid-cols-2"><Field label="Route name"><input className={inputClass} value={editingRoute.routeName} onChange={(e) => setEditingRoute({ ...editingRoute, routeName: e.target.value })} /></Field><Field label="Stop order"><input type="number" min="1" className={inputClass} value={editingRoute.stopOrder} onChange={(e) => setEditingRoute({ ...editingRoute, stopOrder: Number(e.target.value) || 1 })} /></Field><Field label="Location"><select className={inputClass} value={editingRoute.location} onChange={(e) => setEditingRoute({ ...editingRoute, location: e.target.value })}>{availableLocations.filter((item) => item !== "All Locations").map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Child"><input required className={inputClass} value={editingRoute.child} onChange={(e) => setEditingRoute({ ...editingRoute, child: e.target.value })} /></Field><Field label="School / pickup destination"><select className={inputClass} value={editingRoute.school} onChange={(e) => setEditingRoute({ ...editingRoute, school: e.target.value })}><option value="">Choose school</option><option>Home Transportation</option>{schools.filter((school) => school.status === "Active").map((school) => <option key={school.id}>{school.school}</option>)}</select></Field><Field label="Driver"><input className={inputClass} value={editingRoute.driver} onChange={(e) => setEditingRoute({ ...editingRoute, driver: e.target.value })} /></Field><Field label="Vehicle"><select className={inputClass} value={editingRoute.vehicle} onChange={(e) => setEditingRoute({ ...editingRoute, vehicle: e.target.value })}><option value="">Choose vehicle</option>{vehicles.map((vehicle) => <option key={vehicle.id}>{vehicle.name}</option>)}</select></Field><Field label="Pickup time"><input className={inputClass} value={editingRoute.pickup} onChange={(e) => setEditingRoute({ ...editingRoute, pickup: e.target.value })} /></Field><Field label="Days"><input className={inputClass} value={editingRoute.days} onChange={(e) => setEditingRoute({ ...editingRoute, days: e.target.value })} /></Field><Field label="Status"><select className={inputClass} value={editingRoute.status} onChange={(e) => setEditingRoute({ ...editingRoute, status: e.target.value as TransportationRoute["status"] })}><option>Confirmed</option><option>Needs Review</option><option>Not Riding</option></select></Field><Field label="Exact pickup area" wide><input className={inputClass} value={editingRoute.pickupArea} onChange={(e) => setEditingRoute({ ...editingRoute, pickupArea: e.target.value })} /></Field><Field label="Pickup instructions" wide><textarea className={`${inputClass} min-h-20`} value={editingRoute.pickupInstructions} onChange={(e) => setEditingRoute({ ...editingRoute, pickupInstructions: e.target.value })} /></Field><Field label="Drop-off location" wide><input className={inputClass} value={editingRoute.dropoffLocation} onChange={(e) => setEditingRoute({ ...editingRoute, dropoffLocation: e.target.value })} /></Field><Field label="Notes" wide><textarea className={`${inputClass} min-h-20`} value={editingRoute.notes} onChange={(e) => setEditingRoute({ ...editingRoute, notes: e.target.value })} /></Field><div className="flex gap-3 sm:col-span-2"><PrimaryButton type="submit">Save Route</PrimaryButton><SecondaryButton onClick={() => setEditingRoute(null)}>Cancel</SecondaryButton></div></form></Modal>}

    {editingSchool && <Modal title="School" description="Edit the school information used across Transportation." onClose={() => setEditingSchool(null)}><form onSubmit={saveSchool} className="grid gap-4 sm:grid-cols-2"><Field label="School name" wide><input required className={inputClass} value={editingSchool.school} onChange={(e) => setEditingSchool({ ...editingSchool, school: e.target.value })} /></Field><Field label="District"><input className={inputClass} value={editingSchool.district} onChange={(e) => setEditingSchool({ ...editingSchool, district: e.target.value })} /></Field><Field label="Area / city"><input className={inputClass} value={editingSchool.area} onChange={(e) => setEditingSchool({ ...editingSchool, area: e.target.value })} /></Field><Field label="Address" wide><input className={inputClass} value={editingSchool.address} onChange={(e) => setEditingSchool({ ...editingSchool, address: e.target.value })} /></Field><Field label="Start time"><input className={inputClass} value={editingSchool.startTime} onChange={(e) => setEditingSchool({ ...editingSchool, startTime: e.target.value })} /></Field><Field label="Dismissal"><input className={inputClass} value={editingSchool.dismissal} onChange={(e) => setEditingSchool({ ...editingSchool, dismissal: e.target.value })} /></Field><Field label="Minimum-day time"><input className={inputClass} value={editingSchool.minimumDay} onChange={(e) => setEditingSchool({ ...editingSchool, minimumDay: e.target.value })} /></Field><Field label="Minimum-day name"><input className={inputClass} value={editingSchool.minimumDayName} onChange={(e) => setEditingSchool({ ...editingSchool, minimumDayName: e.target.value })} /></Field><Field label="Pickup area" wide><input className={inputClass} value={editingSchool.pickupArea} onChange={(e) => setEditingSchool({ ...editingSchool, pickupArea: e.target.value })} /></Field><Field label="Pickup instructions" wide><textarea className={`${inputClass} min-h-20`} value={editingSchool.pickupInstructions} onChange={(e) => setEditingSchool({ ...editingSchool, pickupInstructions: e.target.value })} /></Field><Field label="Status"><select className={inputClass} value={editingSchool.status} onChange={(e) => setEditingSchool({ ...editingSchool, status: e.target.value as SchoolRecord["status"] })}><option>Active</option><option>Inactive</option></select></Field><Field label="Notes"><input className={inputClass} value={editingSchool.notes} onChange={(e) => setEditingSchool({ ...editingSchool, notes: e.target.value })} /></Field><div className="flex gap-3 sm:col-span-2"><PrimaryButton type="submit">Save School</PrimaryButton><SecondaryButton onClick={() => setEditingSchool(null)}>Cancel</SecondaryButton></div></form></Modal>}

    {editingVehicle && <Modal title="Vehicle" description="Edit fleet details and service status." onClose={() => setEditingVehicle(null)}><form onSubmit={saveVehicle} className="grid gap-4 sm:grid-cols-2"><Field label="Vehicle name"><input required className={inputClass} value={editingVehicle.name} onChange={(e) => setEditingVehicle({ ...editingVehicle, name: e.target.value })} /></Field><Field label="Make / model"><input className={inputClass} value={editingVehicle.makeModel} onChange={(e) => setEditingVehicle({ ...editingVehicle, makeModel: e.target.value })} /></Field><Field label="Capacity"><input type="number" min="0" className={inputClass} value={editingVehicle.passengerCapacity} onChange={(e) => setEditingVehicle({ ...editingVehicle, passengerCapacity: Number(e.target.value) || 0 })} /></Field><Field label="Plate"><input className={inputClass} value={editingVehicle.plate} onChange={(e) => setEditingVehicle({ ...editingVehicle, plate: e.target.value })} /></Field><Field label="Assigned location"><input className={inputClass} value={editingVehicle.assignedLocation} onChange={(e) => setEditingVehicle({ ...editingVehicle, assignedLocation: e.target.value })} /></Field><Field label="Primary driver"><input className={inputClass} value={editingVehicle.primaryDriver} onChange={(e) => setEditingVehicle({ ...editingVehicle, primaryDriver: e.target.value })} /></Field><Field label="Status"><select className={inputClass} value={editingVehicle.status} onChange={(e) => setEditingVehicle({ ...editingVehicle, status: e.target.value as VehicleRecord["status"] })}><option>Ready</option><option>Needs Attention</option><option>Out of Service</option></select></Field><Field label="Registration due"><input type="date" className={inputClass} value={editingVehicle.registrationDue} onChange={(e) => setEditingVehicle({ ...editingVehicle, registrationDue: e.target.value })} /></Field><Field label="Insurance due"><input type="date" className={inputClass} value={editingVehicle.insuranceDue} onChange={(e) => setEditingVehicle({ ...editingVehicle, insuranceDue: e.target.value })} /></Field><Field label="Notes" wide><textarea className={`${inputClass} min-h-20`} value={editingVehicle.notes} onChange={(e) => setEditingVehicle({ ...editingVehicle, notes: e.target.value })} /></Field><div className="flex gap-3 sm:col-span-2"><PrimaryButton type="submit">Save Vehicle</PrimaryButton><SecondaryButton onClick={() => setEditingVehicle(null)}>Cancel</SecondaryButton></div></form></Modal>}
  </div></MainLayout>;
}

function Metric({ label, value, icon, tone = "blue" }: { label: string; value: React.ReactNode; icon: React.ReactNode; tone?: "blue" | "amber" | "purple" | "green" | "slate" }) {
  const styles = { blue: "bg-blue-50 text-blue-700", amber: "bg-amber-50 text-amber-700", purple: "bg-purple-50 text-purple-700", green: "bg-emerald-50 text-emerald-700", slate: "bg-slate-100 text-slate-700" };
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`inline-flex rounded-xl p-2 ${styles[tone]}`}>{icon}</div><p className="mt-3 text-2xl font-black text-slate-950">{value}</p><p className="mt-1 text-xs font-black uppercase tracking-wider text-slate-500">{label}</p></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-sm font-black text-slate-900">{value}</p></div>;
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-sm font-bold text-slate-700">{label}</span>{children}</label>;
}
