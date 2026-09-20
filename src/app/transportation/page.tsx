"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import {
  Modal,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  StatCard,
  StatusBadge,
  inputClass,
} from "@/components/hub/HubUI";
import {
  starterRoutes,
  starterSchools,
  starterVehicles,
  type SchoolRecord,
  type TransportationRoute,
  type VehicleRecord,
} from "@/lib/hub-data";
import { usePersistentState } from "@/hooks/usePersistentState";
import { sendHubNotificationEvent } from "@/lib/notification-client";
import { localIsoDate } from "@/lib/date-utils";
import {
  AlertTriangle,
  Building2,
  Bus,
  Car,
  CheckCircle2,
  Clock3,
  MapPin,
  Navigation,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

const blankRoute: TransportationRoute = {
  id: 0,
  location: "Halcom",
  child: "",
  school: "",
  area: "Lancaster",
  driver: "Akeyla",
  vehicle: "Ford Flex 1",
  pickup: "",
  dropoff: "",
  days: "Mon–Fri",
  status: "Needs Review",
  notes: "",
};

const blankSchool: SchoolRecord = {
  id: 0,
  school: "",
  district: "",
  area: "Lancaster",
  address: "",
  phone: "",
  startTime: "",
  dismissal: "",
  minimumDay: "",
  minimumDayName: "",
  status: "Active",
  notes: "",
};

const blankVehicle: VehicleRecord = {
  id: 0,
  name: "",
  makeModel: "",
  type: "SUV",
  passengerCapacity: 0,
  plate: "",
  assignedLocation: "All Sites",
  primaryDriver: "",
  status: "Ready",
  registrationDue: "",
  insuranceDue: "",
  notes: "",
};

const readinessItems = [
  "Fuel level checked",
  "Emergency binder in vehicle",
  "Child emergency cards current",
  "First aid kit stocked",
  "Harnesses and car seats secured",
  "Driver phone charged",
];

type RunStatus = "Waiting" | "Picked Up" | "Checked In";

type TransportationRunEvent = {
  date: string;
  status: Exclude<RunStatus, "Waiting">;
  at: string;
  by: string;
  location: string;
};

type LiveTransportationRoute = TransportationRoute & {
  routeName?: string;
  stopOrder?: number;
  pickupArea?: string;
  dropoffLocation?: string;
  coveringDriver?: string;
  coveringDate?: string;
  runDate?: string;
  runStatus?: RunStatus;
  pickedUpAt?: string;
  pickedUpBy?: string;
  checkedInAt?: string;
  checkedInBy?: string;
  runHistory?: TransportationRunEvent[];
};

function routeGroupKey(route: LiveTransportationRoute) {
  return route.routeName?.trim() || `${route.driver || "Transportation"} Route`;
}

function routeRunStatus(route: LiveTransportationRoute, today: string): RunStatus {
  return route.runDate === today ? (route.runStatus ?? "Waiting") : "Waiting";
}

function isScheduledToday(days: string) {
  const now = new Date();
  const dayIndex = now.getDay();
  const shortDay = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][dayIndex];
  const fullDay = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][dayIndex];
  const normalized = (days || "").toLowerCase().replaceAll("–", "-").replaceAll("—", "-");
  if (!normalized.trim()) return true;
  if ((normalized.includes("mon-fri") || normalized.includes("m-f") || normalized.includes("monday-friday")) && dayIndex >= 1 && dayIndex <= 5) return true;
  return normalized.includes(shortDay) || normalized.includes(fullDay);
}

function timestampLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

type Tab = "Today" | "Routes" | "Schools" | "Vehicles";
type ReadinessState = Record<string, Record<string, boolean>>;

export default function TransportationPage() {
  const { canManageSystem, isLocationLicensee, profile, session } = useAuth();
  const { location: activeLocation, availableLocations } = useHubLocation();
  const [routes, setRoutes] = usePersistentState<LiveTransportationRoute[]>("tcs-routes", starterRoutes as LiveTransportationRoute[]);
  const [schools, setSchools] = usePersistentState<SchoolRecord[]>("tcs-schools-v2", starterSchools);
  const [vehicles, setVehicles] = usePersistentState<VehicleRecord[]>("tcs-vehicles-v2", starterVehicles);
  const [readiness, setReadiness] = usePersistentState<ReadinessState>("tcs-vehicle-readiness-v2", {});
  const [tab, setTab] = useState<Tab>("Today");
  const [routeSearch, setRouteSearch] = useState("");
  const [schoolSearch, setSchoolSearch] = useState("");
  const [editingRoute, setEditingRoute] = useState<LiveTransportationRoute | null>(null);
  const [editingSchool, setEditingSchool] = useState<SchoolRecord | null>(null);
  const [originalSchoolName, setOriginalSchoolName] = useState<string | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<VehicleRecord | null>(null);
  const [originalVehicleName, setOriginalVehicleName] = useState<string | null>(null);
  const [readinessVehicleId, setReadinessVehicleId] = useState<number>(starterVehicles[0]?.id ?? 0);
  const [selectedRouteKey, setSelectedRouteKey] = useState("");
  const [routeMessage, setRouteMessage] = useState("");

  const today = localIsoDate();
  const actor = profile?.full_name?.trim() || profile?.email || "TCS Staff";
  const canManageRoutes = canManageSystem || isLocationLicensee;
  const activeSchools = useMemo(() => schools.filter((school) => school.status === "Active"), [schools]);
  const availableVehicles = useMemo(() => vehicles.filter((vehicle) => vehicle.status !== "Out of Service"), [vehicles]);
  const locationRoutes = useMemo(
    () => routes.filter((route) => route.status !== "Not Riding" && (activeLocation === "All Locations" || route.location === activeLocation)),
    [activeLocation, routes],
  );
  const todayRoutes = useMemo(() => locationRoutes.filter((route) => isScheduledToday(route.days)), [locationRoutes]);
  const routeKeys = useMemo(() => [...new Set(todayRoutes.map(routeGroupKey))], [todayRoutes]);
  const effectiveRouteKey = routeKeys.includes(selectedRouteKey) ? selectedRouteKey : (routeKeys[0] ?? "");
  const selectedTodayRoutes = useMemo(
    () => todayRoutes
      .filter((route) => routeGroupKey(route) === effectiveRouteKey)
      .sort((a, b) => (a.stopOrder ?? 999) - (b.stopOrder ?? 999) || a.pickup.localeCompare(b.pickup) || a.child.localeCompare(b.child)),
    [effectiveRouteKey, todayRoutes],
  );
  const filteredRoutes = useMemo(
    () => locationRoutes.filter((route) => [routeGroupKey(route), route.location, route.child, route.school, route.area, route.driver, route.vehicle, route.pickupArea, route.dropoffLocation].join(" ").toLowerCase().includes(routeSearch.toLowerCase())),
    [locationRoutes, routeSearch],
  );
  const filteredSchools = useMemo(
    () => schools.filter((school) => [school.school, school.district, school.area, school.address].join(" ").toLowerCase().includes(schoolSearch.toLowerCase())),
    [schools, schoolSearch],
  );
  const readinessVehicle = vehicles.find((vehicle) => vehicle.id === readinessVehicleId) ?? vehicles[0];
  const waitingCount = todayRoutes.filter((route) => routeRunStatus(route, today) === "Waiting").length;
  const inTransitCount = todayRoutes.filter((route) => routeRunStatus(route, today) === "Picked Up").length;
  const checkedInCount = todayRoutes.filter((route) => routeRunStatus(route, today) === "Checked In").length;
  const activeDriverCount = new Set(todayRoutes.map((route) => route.coveringDate === today && route.coveringDriver ? route.coveringDriver : route.driver).filter(Boolean)).size;
  const selectedWaiting = selectedTodayRoutes.filter((route) => routeRunStatus(route, today) === "Waiting").length;
  const selectedOnboard = selectedTodayRoutes.filter((route) => routeRunStatus(route, today) === "Picked Up").length;
  const selectedCheckedIn = selectedTodayRoutes.filter((route) => routeRunStatus(route, today) === "Checked In").length;
  const selectedDriver = selectedTodayRoutes.find((route) => route.coveringDate === today && route.coveringDriver)?.coveringDriver || selectedTodayRoutes[0]?.driver || "Not assigned";
  const selectedVehicle = selectedTodayRoutes.find((route) => route.vehicle)?.vehicle || "Not assigned";

  function openRoute(route?: TransportationRoute) {
    setEditingRoute(route ? { ...route } : { ...blankRoute, id: Date.now(), location: activeLocation === "All Locations" ? "Halcom" : activeLocation, vehicle: availableVehicles[0]?.name ?? "", routeName: activeLocation === "All Locations" ? "New Route" : `${activeLocation} Route`, stopOrder: Math.max(0, ...locationRoutes.map((item) => item.stopOrder ?? 0)) + 1, dropoffLocation: activeLocation === "All Locations" ? "Halcom" : activeLocation });
  }

  function saveRoute(event: FormEvent) {
    event.preventDefault();
    if (!editingRoute) return;
    const saved = editingRoute;
    setRoutes((current) => current.some((item) => item.id === saved.id)
      ? current.map((item) => item.id === saved.id ? saved : item)
      : [...current, saved]);
    void sendHubNotificationEvent({
      accessToken: session?.access_token,
      eventType: "transportation_update",
      location: saved.location,
      eventKey: `transport-route:${saved.id}:${Date.now()}`,
    });
    setEditingRoute(null);
  }

  function openSchool(school?: SchoolRecord) {
    setOriginalSchoolName(school?.school ?? null);
    setEditingSchool(school ? { ...school } : { ...blankSchool, id: Date.now() });
  }

  function saveSchool(event: FormEvent) {
    event.preventDefault();
    if (!editingSchool) return;
    const saved = editingSchool;
    setSchools((current) => current.some((item) => item.id === saved.id)
      ? current.map((item) => item.id === saved.id ? saved : item)
      : [...current, saved]);
    if (originalSchoolName && originalSchoolName !== saved.school) {
      setRoutes((current) => current.map((route) => route.school === originalSchoolName ? { ...route, school: saved.school } : route));
      void sendHubNotificationEvent({
        accessToken: session?.access_token,
        eventType: "transportation_update",
        location: "All Locations",
        eventKey: `transport-school:${saved.id}:${Date.now()}`,
      });
    }
    setEditingSchool(null);
    setOriginalSchoolName(null);
  }

  function openVehicle(vehicle?: VehicleRecord) {
    setOriginalVehicleName(vehicle?.name ?? null);
    setEditingVehicle(vehicle ? { ...vehicle } : { ...blankVehicle, id: Date.now() });
  }

  function saveVehicle(event: FormEvent) {
    event.preventDefault();
    if (!editingVehicle) return;
    const saved = editingVehicle;
    setVehicles((current) => current.some((item) => item.id === saved.id)
      ? current.map((item) => item.id === saved.id ? saved : item)
      : [...current, saved]);
    if (originalVehicleName && originalVehicleName !== saved.name) {
      setRoutes((current) => current.map((route) => route.vehicle === originalVehicleName ? { ...route, vehicle: saved.name } : route));
    }
    if (saved.status !== "Ready" || (originalVehicleName && originalVehicleName !== saved.name)) {
      void sendHubNotificationEvent({
        accessToken: session?.access_token,
        eventType: "transportation_update",
        location: saved.assignedLocation === "All Sites" ? "All Locations" : saved.assignedLocation,
        eventKey: `transport-vehicle:${saved.id}:${saved.status}:${Date.now()}`,
      });
    }
    setReadinessVehicleId(saved.id);
    setEditingVehicle(null);
    setOriginalVehicleName(null);
  }

  function toggleReadiness(vehicleId: number, item: string) {
    setReadiness((current) => ({
      ...current,
      [String(vehicleId)]: {
        ...(current[String(vehicleId)] ?? {}),
        [item]: !(current[String(vehicleId)]?.[item] ?? false),
      },
    }));
  }

  function coverRouteToday() {
    if (!effectiveRouteKey) return;
    setRoutes((current) => current.map((route) => routeGroupKey(route) === effectiveRouteKey
      ? { ...route, coveringDriver: actor, coveringDate: today }
      : route));
  }

  function markPickedUp(route: LiveTransportationRoute) {
    const now = new Date().toISOString();
    setRoutes((current) => current.map((item) => item.id === route.id ? {
      ...item,
      runDate: today,
      runStatus: "Picked Up",
      pickedUpAt: now,
      pickedUpBy: actor,
      checkedInAt: undefined,
      checkedInBy: undefined,
      runHistory: [...(item.runHistory ?? []).slice(-59), { date: today, status: "Picked Up", at: now, by: actor, location: route.pickupArea?.trim() || route.school || "Pickup location" }],
    } : item));
    void sendHubNotificationEvent({
      accessToken: session?.access_token,
      eventType: "transportation_pickup",
      location: route.location,
      eventKey: `transport-pickup:${route.id}:${today}`,
      context: { childName: route.child, school: route.school, destination: route.dropoffLocation || route.location, driver: actor, vehicle: route.vehicle, statusTime: now },
    });
  }

  function markCheckedIn(route: LiveTransportationRoute) {
    const destination = route.dropoffLocation?.trim() || route.location;
    if (!destination) return;
    const now = new Date().toISOString();
    setRoutes((current) => current.map((item) => item.id === route.id ? {
      ...item,
      runDate: today,
      runStatus: "Checked In",
      checkedInAt: now,
      checkedInBy: actor,
      runHistory: [...(item.runHistory ?? []).slice(-59), { date: today, status: "Checked In", at: now, by: actor, location: destination }],
    } : item));
    const context = { childName: route.child, school: route.school, destination, driver: actor, vehicle: route.vehicle, statusTime: now };
    void sendHubNotificationEvent({ accessToken: session?.access_token, eventType: "transportation_checkin", location: route.location, eventKey: `transport-checkin-leadership:${route.id}:${today}`, context });
    void sendHubNotificationEvent({ accessToken: session?.access_token, eventType: "transportation_arrival", location: route.location, eventKey: `transport-arrival-program:${route.id}:${today}`, context });
  }

  function reconcileRoute() {
    if (!effectiveRouteKey) return;
    if (selectedOnboard > 0) {
      const names = selectedTodayRoutes.filter((route) => routeRunStatus(route, today) === "Picked Up").map((route) => route.child).join(", ");
      setRouteMessage(`Leadership review sent. ${selectedOnboard} child${selectedOnboard === 1 ? " is" : "ren are"} still in transit: ${names}.`);
      void sendHubNotificationEvent({
        accessToken: session?.access_token,
        eventType: "transportation_handoff_attention",
        location: selectedTodayRoutes[0]?.location || activeLocation,
        eventKey: `transport-handoff:${effectiveRouteKey}:${today}:${Date.now()}`,
        context: { childName: names, destination: selectedTodayRoutes[0]?.dropoffLocation || selectedTodayRoutes[0]?.location || "destination", driver: selectedDriver, vehicle: selectedVehicle, reason: `${selectedOnboard} child${selectedOnboard === 1 ? " remains" : "ren remain"} in transit during route reconciliation.` },
      });
      return;
    }
    if (selectedWaiting > 0) {
      setRouteMessage(`${selectedWaiting} scheduled child${selectedWaiting === 1 ? " has" : "ren have"} not been picked up yet. Review absences or route changes before closing the route.`);
      return;
    }
    setRouteMessage("Route reconciled: every picked-up child is checked into a destination location.");
  }

  function resetToday(route: LiveTransportationRoute) {
    setRoutes((current) => current.map((item) => item.id === route.id ? {
      ...item,
      runDate: undefined,
      runStatus: undefined,
      pickedUpAt: undefined,
      pickedUpBy: undefined,
      checkedInAt: undefined,
      checkedInBy: undefined,
    } : item));
  }



  return (
    <MainLayout>
      <div className="mx-auto max-w-[1550px] space-y-6">
        <section className="relative overflow-hidden rounded-[2rem] border border-blue-100 bg-gradient-to-br from-[#eaf7ff] via-white to-[#d7ecff] shadow-[0_18px_55px_rgba(19,76,145,0.16)]">
          <div className="absolute -left-24 -top-20 h-60 w-60 rounded-full bg-[#ffc72c]/70" />
          <div className="absolute -right-24 -bottom-20 h-72 w-72 rounded-full bg-[#1757a8]/15" />
          <div className="relative grid min-h-[275px] gap-6 px-6 py-8 sm:px-9 lg:grid-cols-[.72fr_1.28fr] lg:items-center lg:px-12">
            <div className="relative flex items-center justify-center"><div className="relative grid h-44 w-72 place-items-center rounded-[2.25rem] bg-[#ffc72c] shadow-2xl ring-8 ring-white/70"><Bus className="h-24 w-24 text-[#123f7d]" strokeWidth={1.8} /><div className="absolute bottom-4 left-7 h-9 w-9 rounded-full border-4 border-white bg-[#153f75]" /><div className="absolute bottom-4 right-7 h-9 w-9 rounded-full border-4 border-white bg-[#153f75]" /></div></div>
            <div className="relative z-10 text-center lg:text-left"><p className="text-xs font-black uppercase tracking-[0.24em] text-[#1769d2]">TCS Operations Hub • School Shuttle</p><h1 className="mt-2 text-4xl font-black tracking-tight text-[#102a56] sm:text-6xl">The School Shuttle</h1><p className="mt-2 text-lg font-black text-[#1769d2]">Safe and Reliable Transportation</p><p className="mx-auto mt-4 max-w-3xl text-sm font-semibold leading-7 text-slate-600 lg:mx-0">Every child follows one custody chain: school pickup → in transit → checked into the destination location. Pickup and exception alerts go to Danielle and Jen; destination staff only receive the arrival notice for their location.</p><div className="mt-5 flex flex-wrap justify-center gap-2 lg:justify-start"><span className="rounded-full bg-white px-4 py-2 text-xs font-black text-[#123f7d] shadow-sm">✅ Required pickup tap</span><span className="rounded-full bg-white px-4 py-2 text-xs font-black text-[#123f7d] shadow-sm">🚌 In-transit custody</span><span className="rounded-full bg-white px-4 py-2 text-xs font-black text-[#123f7d] shadow-sm">📍 Required location check-in</span></div></div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Active Routes" value={routeKeys.length} icon={<Bus className="h-5 w-5" />} />
          <StatCard label="Drivers On Duty" value={activeDriverCount} icon={<UserCheck className="h-5 w-5" />} tone="blue" />
          <StatCard label="Waiting" value={waitingCount} icon={<Clock3 className="h-5 w-5" />} tone="amber" />
          <StatCard label="In Transit" value={inTransitCount} icon={<Users className="h-5 w-5" />} tone="purple" />
          <StatCard label="Checked In" value={checkedInCount} icon={<CheckCircle2 className="h-5 w-5" />} tone="emerald" />
        </section>

        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {(["Today", "Routes", "Schools", "Vehicles"] as const).map((item) => (
            <button key={item} onClick={() => setTab(item)} className={`rounded-xl px-4 py-2.5 text-sm font-black ${tab === item ? "bg-[#1769d2] text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              {item === "Today" ? "My Route Today" : item}
            </button>
          ))}
        </div>

        {tab === "Today" && (
          <div className="space-y-5">
            <section className="rounded-3xl border border-[#d8e8fb] bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#1769d2]">Driver mode</p><h2 className="mt-1 text-2xl font-black text-[#102a56]">My Route Today</h2><p className="mt-1 text-sm font-semibold text-slate-500">Choose the route you are running. Confirm every child individually at pickup and again when the child is checked into the destination.</p></div>{effectiveRouteKey && <button onClick={coverRouteToday} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ffc72c] px-5 py-3 text-sm font-black text-[#102a56] shadow-sm"><UserCheck className="h-4 w-4" /> I’m Covering This Route Today</button>}</div>
              <div className="mt-5 flex flex-wrap gap-2">{routeKeys.map((key) => <button key={key} onClick={() => { setSelectedRouteKey(key); setRouteMessage(""); }} className={`rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${effectiveRouteKey === key ? "border-[#1769d2] bg-[#eef6ff] text-[#102a56]" : "border-slate-200 bg-white text-slate-600 hover:border-blue-200"}`}>{key}</button>)}{!routeKeys.length && <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">No active route records are scheduled for today at the selected Hub location.</p>}</div>
            </section>

            {effectiveRouteKey && <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><MiniSummary label="Route" value={effectiveRouteKey} /><MiniSummary label="Driver Today" value={selectedDriver} /><MiniSummary label="Vehicle" value={selectedVehicle} /><MiniSummary label="In Transit" value={String(selectedOnboard)} /><MiniSummary label="Checked In" value={`${selectedCheckedIn}/${selectedTodayRoutes.length}`} /></section>
              <section className="rounded-3xl border border-blue-100 bg-[#f7fbff] p-5 shadow-sm sm:p-6"><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#1769d2] text-white"><Navigation className="h-5 w-5" /></div><div><h3 className="text-lg font-black text-[#102a56]">Required custody steps</h3><p className="mt-1 text-sm font-semibold leading-6 text-slate-600">1. Tap <strong>PICKED UP</strong> only when the child is physically with you. 2. The child stays <strong>IN TRANSIT</strong> while riding. 3. At the destination, tap <strong>CHECK INTO LOCATION</strong>. 4. Reconcile the route before you finish. Site staff are notified only when the child arrives; missing-arrival review stays with Danielle and Jen.</p></div></div></section>

              <div className="grid gap-4 xl:grid-cols-2">{selectedTodayRoutes.map((route) => {
                const runStatus = routeRunStatus(route, today);
                const destination = route.dropoffLocation?.trim() || route.location;
                return <article key={route.id} className={`rounded-3xl border p-5 shadow-sm ${runStatus === "Checked In" ? "border-emerald-200 bg-emerald-50/60" : runStatus === "Picked Up" ? "border-blue-200 bg-blue-50/60" : "border-slate-200 bg-white"}`}>
                  <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#1769d2]">{routeGroupKey(route)} • Stop {route.stopOrder ?? "—"}</p><div className="mt-1 flex flex-wrap items-center gap-2"><h3 className="text-xl font-black text-slate-950">{route.child}</h3><StatusBadge tone={runStatus === "Checked In" ? "green" : runStatus === "Picked Up" ? "blue" : "amber"}>{runStatus === "Picked Up" ? "In Transit" : runStatus}</StatusBadge></div><p className="mt-1 text-sm font-bold text-slate-600">{route.school || "School not entered"} • Pickup {route.pickup || "time not entered"}</p></div>{canManageRoutes && <button onClick={() => openRoute(route)} className="rounded-xl border border-slate-200 p-2 text-slate-500"><Pencil className="h-4 w-4" /></button>}</div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2"><InfoBox label="PICK UP AT" value={route.pickupArea?.trim() || route.school || "Not entered"} /><InfoBox label="CHECK INTO" value={destination || "Not entered"} /></div>
                  {route.notes && <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-semibold leading-5 text-red-700 ring-1 ring-slate-100"><strong>Transportation note:</strong> {route.notes}</p>}
                  <div className="mt-4 flex flex-wrap gap-2">{runStatus === "Waiting" && <button onClick={() => markPickedUp(route)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1769d2] px-4 py-3 text-sm font-black text-white"><UserCheck className="h-4 w-4" /> PICKED UP</button>}{runStatus === "Picked Up" && <button onClick={() => markCheckedIn(route)} disabled={!destination} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#34a853] px-4 py-3 text-sm font-black text-white disabled:opacity-40"><CheckCircle2 className="h-4 w-4" /> CHECK INTO {destination || "LOCATION NEEDED"}</button>}{runStatus === "Checked In" && <div className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-100 px-4 py-3 text-sm font-black text-emerald-800"><CheckCircle2 className="h-4 w-4" /> CHECKED IN</div>}{canManageRoutes && runStatus !== "Waiting" && <button onClick={() => resetToday(route)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-3 text-xs font-black text-slate-600"><RotateCcw className="h-4 w-4" /> Reset</button>}</div>
                  {runStatus !== "Waiting" && <div className="mt-3 space-y-1 text-xs font-semibold text-slate-500">{route.pickedUpAt && <p>Picked up {timestampLabel(route.pickedUpAt)} by {route.pickedUpBy || "staff"}</p>}{route.checkedInAt && <p>Checked into {destination} {timestampLabel(route.checkedInAt)} by {route.checkedInBy || "staff"}</p>}</div>}
                </article>;
              })}</div>

              <section className={`rounded-3xl border p-5 shadow-sm sm:p-6 ${selectedWaiting === 0 && selectedOnboard === 0 ? "border-emerald-200 bg-emerald-50" : selectedOnboard > 0 ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-start gap-3"><AlertTriangle className={`mt-0.5 h-6 w-6 ${selectedOnboard > 0 ? "text-red-700" : "text-amber-700"}`} /><div><h3 className="font-black text-slate-950">Route Reconciliation</h3><p className="mt-1 text-sm font-semibold leading-6 text-slate-600">A route cannot be considered complete with a child still marked In Transit. Missing-arrival review is leadership-only because the child may be on a field trip or another approved off-site activity.</p></div></div><button onClick={reconcileRoute} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">RECONCILE ROUTE</button></div>{routeMessage && <div className="mt-4 rounded-xl bg-white/70 px-4 py-3 text-sm font-bold text-slate-800">{routeMessage}</div>}</section>
            </>}
          </div>
        )}

        {tab === "Routes" && (
          <>
            <SectionCard action={canManageRoutes ? <PrimaryButton onClick={() => openRoute()}><Plus className="h-4 w-4" /> Add Route</PrimaryButton> : undefined}>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className={`${inputClass} pl-10`} value={routeSearch} onChange={(event) => setRouteSearch(event.target.value)} placeholder="Search child, school, driver, vehicle, or area…" />
              </label>
            </SectionCard>
            <SectionCard title="Transportation List" description="Route vehicle and school options pull from the editable lists on this page.">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400">
                      <th className="pb-3">Child / Location</th><th className="pb-3">School / Area</th><th className="pb-3">Driver / Vehicle</th><th className="pb-3">Times</th><th className="pb-3">Days</th><th className="pb-3">Status</th><th className="pb-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRoutes.map((route) => (
                      <tr key={route.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-4"><p className="font-black text-slate-900">{route.child}</p><p className="mt-1 text-xs font-bold text-slate-500">{route.location}</p><p className="mt-1 text-xs text-slate-500">{route.notes}</p></td>
                        <td className="py-4"><p className="font-bold">{route.school || "Not assigned"}</p><p className="text-xs text-slate-500">{route.area}</p></td>
                        <td className="py-4"><p className="font-bold">{route.driver || "Not assigned"}</p><p className="text-xs text-slate-500">{route.vehicle || "No vehicle"}</p></td>
                        <td className="py-4"><p>Pick up: {route.pickup || "—"}</p><p className="text-xs text-slate-500">Drop off: {route.dropoff || "—"}</p></td>
                        <td className="py-4 font-semibold">{route.days}</td>
                        <td className="py-4"><StatusBadge tone={route.status === "Confirmed" ? "green" : route.status === "Needs Review" ? "amber" : "slate"}>{route.status}</StatusBadge></td>
                        <td className="py-4 text-right">{canManageRoutes ? <SecondaryButton onClick={() => openRoute(route)}><Pencil className="h-4 w-4" /> Edit</SecondaryButton> : <span className="text-xs font-bold text-slate-400">View only</span>}</td>
                      </tr>
                    ))}
                    {filteredRoutes.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-sm text-slate-500">No transportation records match this search.</td></tr>}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </>
        )}

        {tab === "Schools" && (
          <>
            <SectionCard>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className={`${inputClass} pl-10`} value={schoolSearch} onChange={(event) => setSchoolSearch(event.target.value)} placeholder="Search school, district, area, or address…" />
              </label>
            </SectionCard>
            <SectionCard title={canManageSystem ? "Editable School Directory" : "School Directory"} description={canManageSystem ? "Add schools or update names, districts, addresses, phone numbers, and bell schedules." : "School information is available for route planning. Danielle controls additions and changes."} action={canManageSystem ? <PrimaryButton onClick={() => openSchool()}><Plus className="h-4 w-4" /> Add School</PrimaryButton> : undefined}>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredSchools.map((school) => (
                  <article key={school.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-950">{school.school}</p>
                        <p className="mt-1 text-sm font-bold text-emerald-700">{school.district || "District not entered"}</p>
                      </div>
                      <StatusBadge tone={school.status === "Active" ? "green" : "slate"}>{school.status}</StatusBadge>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-500">{school.area}{school.address ? ` • ${school.address}` : ""}</p>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                      <DirectoryDetail label="START" value={school.startTime || "—"} />
                      <DirectoryDetail label="DISMISSAL" value={school.dismissal || "—"} />
                      <DirectoryDetail label="MIN. DAY" value={school.minimumDay || "—"} tone="amber" />
                    </div>
                    {school.minimumDayName && <p className="mt-2 text-xs text-slate-500">Minimum-day note: {school.minimumDayName}</p>}
                    {school.phone && <p className="mt-2 text-xs font-semibold text-slate-600">Phone: {school.phone}</p>}
                    {school.notes && <p className="mt-2 rounded-xl bg-slate-50 p-2.5 text-xs leading-5 text-slate-600">{school.notes}</p>}
                    {canManageSystem && <div className="mt-4 flex justify-end"><SecondaryButton onClick={() => openSchool(school)}><Pencil className="h-4 w-4" /> Edit School</SecondaryButton></div>}
                  </article>
                ))}
              </div>
            </SectionCard>
          </>
        )}

        {tab === "Vehicles" && (
          <>
            <SectionCard title="Complete Vehicle Fleet" description={canManageSystem ? "The complete fleet is owner-managed. Rename or update every field as needed." : "View fleet details for route planning. Danielle controls vehicle additions and changes."} action={canManageSystem ? <PrimaryButton onClick={() => openVehicle()}><Plus className="h-4 w-4" /> Add Vehicle</PrimaryButton> : undefined}>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {vehicles.map((vehicle) => (
                  <article key={vehicle.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <div className="flex h-28 items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 text-white">
                      <div className="text-center"><Car className="mx-auto h-10 w-10" /><p className="mt-2 font-black">{vehicle.name}</p></div>
                    </div>
                    <div className="space-y-3 p-4">
                      <div className="flex items-center justify-between gap-2"><p className="text-sm font-bold text-slate-700">{vehicle.makeModel || "Make/model not entered"}</p><StatusBadge tone={vehicle.status === "Ready" ? "green" : vehicle.status === "Needs Attention" ? "amber" : "red"}>{vehicle.status}</StatusBadge></div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <VehicleDetail label="TYPE" value={vehicle.type || "—"} />
                        <VehicleDetail label="PASSENGERS" value={vehicle.passengerCapacity ? String(vehicle.passengerCapacity) : "—"} />
                        <VehicleDetail label="PLATE" value={vehicle.plate || "Not entered"} />
                        <VehicleDetail label="DRIVER" value={vehicle.primaryDriver || "Not assigned"} />
                      </div>
                      <p className="text-xs font-semibold text-slate-500">Assigned: {vehicle.assignedLocation || "All Sites"}</p>
                      <p className="text-xs text-slate-500">Registration: {vehicle.registrationDue || "Not entered"} • Insurance: {vehicle.insuranceDue || "Not entered"}</p>
                      {vehicle.notes && <p className="rounded-xl bg-slate-50 p-2.5 text-xs leading-5 text-slate-600">{vehicle.notes}</p>}
                      {canManageSystem && <SecondaryButton onClick={() => openVehicle(vehicle)}><Pencil className="h-4 w-4" /> Edit Vehicle</SecondaryButton>}
                    </div>
                  </article>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Vehicle Readiness" description="Choose a vehicle and complete its route-day safety check.">
              {vehicles.length > 0 ? (
                <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
                  <div>
                    <Field label="Vehicle">
                      <select className={inputClass} value={readinessVehicle?.id ?? ""} onChange={(event) => setReadinessVehicleId(Number(event.target.value))}>
                        {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}
                      </select>
                    </Field>
                    {readinessVehicle && <div className="mt-4 rounded-2xl bg-slate-50 p-4"><p className="font-black text-slate-900">{readinessVehicle.name}</p><p className="mt-1 text-sm text-slate-500">{readinessVehicle.makeModel} • {readinessVehicle.passengerCapacity || "—"} passengers</p></div>}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {readinessVehicle && readinessItems.map((item) => {
                      const checked = readiness[String(readinessVehicle.id)]?.[item] ?? false;
                      return (
                        <label key={item} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${checked ? "border-emerald-300 bg-emerald-50" : "border-slate-200"}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleReadiness(readinessVehicle.id, item)} className="h-4 w-4" />
                          <span className="font-bold text-slate-800">{item}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : <p className="text-sm text-slate-500">Add a vehicle to begin readiness checks.</p>}
            </SectionCard>
          </>
        )}

        {editingRoute && (
          <Modal
            title={routes.some((item) => item.id === editingRoute.id) ? "Edit Route" : "Add Route"}
            description="School and vehicle choices come from the editable directory and fleet lists."
            onClose={() => setEditingRoute(null)}
            footer={<><SecondaryButton onClick={() => setEditingRoute(null)}>Cancel</SecondaryButton><PrimaryButton onClick={() => document.getElementById("route-save")?.click()}>Save Route</PrimaryButton></>}
          >
            <form onSubmit={saveRoute} className="grid gap-4 sm:grid-cols-2">
              <Field label="Route / group name"><input required className={inputClass} value={editingRoute.routeName ?? ""} onChange={(event) => setEditingRoute({ ...editingRoute, routeName: event.target.value })} placeholder="Example: Dynasty Route" /></Field>
              <Field label="Stop order"><input min={1} type="number" className={inputClass} value={editingRoute.stopOrder ?? 1} onChange={(event) => setEditingRoute({ ...editingRoute, stopOrder: Number(event.target.value) || 1 })} /></Field>
              <Field label="Childcare location"><select required className={inputClass} value={editingRoute.location} onChange={(event) => setEditingRoute({ ...editingRoute, location: event.target.value })}>{availableLocations.filter((item) => item !== "All Locations").map((item) => <option key={item}>{item}</option>)}</select></Field>
              <Field label="Child"><input required className={inputClass} value={editingRoute.child} onChange={(event) => setEditingRoute({ ...editingRoute, child: event.target.value })} /></Field>
              <Field label="School or destination">
                <input list="transport-school-options" className={inputClass} value={editingRoute.school} onChange={(event) => setEditingRoute({ ...editingRoute, school: event.target.value })} placeholder="Choose or type a destination" />
                <datalist id="transport-school-options"><option value="Home Transportation" /><option value="Dojo" />{activeSchools.map((school) => <option key={school.id} value={school.school} />)}</datalist>
              </Field>
              <Field label="Area"><select className={inputClass} value={editingRoute.area} onChange={(event) => setEditingRoute({ ...editingRoute, area: event.target.value })}><option>Lancaster</option><option>Quartz Hill</option><option>Rosamond</option><option>Tehachapi</option><option>Other</option></select></Field>
              <Field label="Days"><input className={inputClass} value={editingRoute.days} onChange={(event) => setEditingRoute({ ...editingRoute, days: event.target.value })} /></Field>
              <Field label="Driver"><input className={inputClass} value={editingRoute.driver} onChange={(event) => setEditingRoute({ ...editingRoute, driver: event.target.value })} /></Field>
              <Field label="Vehicle">
                <select className={inputClass} value={editingRoute.vehicle} onChange={(event) => setEditingRoute({ ...editingRoute, vehicle: event.target.value })}>
                  <option value="">No vehicle assigned</option>
                  {editingRoute.vehicle && !vehicles.some((vehicle) => vehicle.name === editingRoute.vehicle) && <option value={editingRoute.vehicle}>{editingRoute.vehicle} (saved value)</option>}
                  {availableVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.name}>{vehicle.name}{vehicle.status === "Needs Attention" ? " — Needs Attention" : ""}</option>)}
                </select>
              </Field>
              <Field label="Pick-up time"><input className={inputClass} value={editingRoute.pickup} onChange={(event) => setEditingRoute({ ...editingRoute, pickup: event.target.value })} /></Field>
              <Field label="Pickup area at school"><input className={inputClass} value={editingRoute.pickupArea ?? ""} onChange={(event) => setEditingRoute({ ...editingRoute, pickupArea: event.target.value })} placeholder="Front gate / office / bus lane" /></Field>
              <Field label="Drop-off time"><input className={inputClass} value={editingRoute.dropoff} onChange={(event) => setEditingRoute({ ...editingRoute, dropoff: event.target.value })} /></Field>
              <Field label="Destination / check-in location"><input className={inputClass} value={editingRoute.dropoffLocation ?? ""} onChange={(event) => setEditingRoute({ ...editingRoute, dropoffLocation: event.target.value })} placeholder="Halcom / Division / 42nd Street" /></Field>
              <Field label="Status"><select className={inputClass} value={editingRoute.status} onChange={(event) => setEditingRoute({ ...editingRoute, status: event.target.value as TransportationRoute["status"] })}><option>Confirmed</option><option>Needs Review</option><option>Not Riding</option></select></Field>
              <Field label="Notes"><input className={inputClass} value={editingRoute.notes} onChange={(event) => setEditingRoute({ ...editingRoute, notes: event.target.value })} /></Field>
              <button id="route-save" className="hidden" type="submit">Save</button>
            </form>
          </Modal>
        )}

        {canManageSystem && editingSchool && (
          <Modal
            title={schools.some((item) => item.id === editingSchool.id) ? "Edit School" : "Add School"}
            description="Changes to a school name automatically update matching transportation routes."
            onClose={() => { setEditingSchool(null); setOriginalSchoolName(null); }}
            footer={<><SecondaryButton onClick={() => { setEditingSchool(null); setOriginalSchoolName(null); }}>Cancel</SecondaryButton><PrimaryButton onClick={() => document.getElementById("school-save")?.click()}>Save School</PrimaryButton></>}
          >
            <form onSubmit={saveSchool} className="grid gap-4 sm:grid-cols-2">
              <Field label="School name"><input required className={inputClass} value={editingSchool.school} onChange={(event) => setEditingSchool({ ...editingSchool, school: event.target.value })} /></Field>
              <Field label="District"><input className={inputClass} value={editingSchool.district} onChange={(event) => setEditingSchool({ ...editingSchool, district: event.target.value })} /></Field>
              <Field label="Area"><input className={inputClass} value={editingSchool.area} onChange={(event) => setEditingSchool({ ...editingSchool, area: event.target.value })} /></Field>
              <Field label="Status"><select className={inputClass} value={editingSchool.status} onChange={(event) => setEditingSchool({ ...editingSchool, status: event.target.value as SchoolRecord["status"] })}><option>Active</option><option>Inactive</option></select></Field>
              <Field label="Address"><input className={inputClass} value={editingSchool.address} onChange={(event) => setEditingSchool({ ...editingSchool, address: event.target.value })} /></Field>
              <Field label="Phone"><input className={inputClass} value={editingSchool.phone} onChange={(event) => setEditingSchool({ ...editingSchool, phone: event.target.value })} /></Field>
              <Field label="Start time"><input className={inputClass} value={editingSchool.startTime} onChange={(event) => setEditingSchool({ ...editingSchool, startTime: event.target.value })} /></Field>
              <Field label="Dismissal time"><input className={inputClass} value={editingSchool.dismissal} onChange={(event) => setEditingSchool({ ...editingSchool, dismissal: event.target.value })} /></Field>
              <Field label="Minimum-day dismissal"><input className={inputClass} value={editingSchool.minimumDay} onChange={(event) => setEditingSchool({ ...editingSchool, minimumDay: event.target.value })} /></Field>
              <Field label="Minimum-day note"><input className={inputClass} value={editingSchool.minimumDayName} onChange={(event) => setEditingSchool({ ...editingSchool, minimumDayName: event.target.value })} placeholder="Example: Every Tuesday" /></Field>
              <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-bold text-slate-700">Notes</span><textarea className={`${inputClass} min-h-24`} value={editingSchool.notes} onChange={(event) => setEditingSchool({ ...editingSchool, notes: event.target.value })} /></label>
              <button id="school-save" className="hidden" type="submit">Save</button>
            </form>
          </Modal>
        )}

        {canManageSystem && editingVehicle && (
          <Modal
            title={vehicles.some((item) => item.id === editingVehicle.id) ? "Edit Vehicle" : "Add Vehicle"}
            description="Changes to the vehicle name automatically update matching routes."
            onClose={() => { setEditingVehicle(null); setOriginalVehicleName(null); }}
            footer={<><SecondaryButton onClick={() => { setEditingVehicle(null); setOriginalVehicleName(null); }}>Cancel</SecondaryButton><PrimaryButton onClick={() => document.getElementById("vehicle-save")?.click()}>Save Vehicle</PrimaryButton></>}
          >
            <form onSubmit={saveVehicle} className="grid gap-4 sm:grid-cols-2">
              <Field label="Vehicle name"><input required className={inputClass} value={editingVehicle.name} onChange={(event) => setEditingVehicle({ ...editingVehicle, name: event.target.value })} placeholder="Example: Ford Flex 1" /></Field>
              <Field label="Make and model"><input className={inputClass} value={editingVehicle.makeModel} onChange={(event) => setEditingVehicle({ ...editingVehicle, makeModel: event.target.value })} /></Field>
              <Field label="Vehicle type"><input className={inputClass} value={editingVehicle.type} onChange={(event) => setEditingVehicle({ ...editingVehicle, type: event.target.value })} /></Field>
              <Field label="Passenger capacity"><input min={0} type="number" className={inputClass} value={editingVehicle.passengerCapacity} onChange={(event) => setEditingVehicle({ ...editingVehicle, passengerCapacity: Number(event.target.value) })} /></Field>
              <Field label="License plate"><input className={inputClass} value={editingVehicle.plate} onChange={(event) => setEditingVehicle({ ...editingVehicle, plate: event.target.value })} /></Field>
              <Field label="Primary driver"><input className={inputClass} value={editingVehicle.primaryDriver} onChange={(event) => setEditingVehicle({ ...editingVehicle, primaryDriver: event.target.value })} /></Field>
              <Field label="Assigned location"><input className={inputClass} value={editingVehicle.assignedLocation} onChange={(event) => setEditingVehicle({ ...editingVehicle, assignedLocation: event.target.value })} /></Field>
              <Field label="Status"><select className={inputClass} value={editingVehicle.status} onChange={(event) => setEditingVehicle({ ...editingVehicle, status: event.target.value as VehicleRecord["status"] })}><option>Ready</option><option>Needs Attention</option><option>Out of Service</option></select></Field>
              <Field label="Registration due"><input className={inputClass} value={editingVehicle.registrationDue} onChange={(event) => setEditingVehicle({ ...editingVehicle, registrationDue: event.target.value })} /></Field>
              <Field label="Insurance due"><input className={inputClass} value={editingVehicle.insuranceDue} onChange={(event) => setEditingVehicle({ ...editingVehicle, insuranceDue: event.target.value })} /></Field>
              <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-bold text-slate-700">Notes</span><textarea className={`${inputClass} min-h-24`} value={editingVehicle.notes} onChange={(event) => setEditingVehicle({ ...editingVehicle, notes: event.target.value })} /></label>
              <button id="vehicle-save" className="hidden" type="submit">Save</button>
            </form>
          </Modal>
        )}
      </div>
    </MainLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className="mb-1.5 block text-sm font-bold text-slate-700">{label}</span>{children}</label>;
}

function MiniSummary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p><p className="mt-1 truncate text-sm font-black text-slate-900" title={value}>{value}</p></div>;
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-sm font-black text-slate-900">{value}</p></div>;
}

function DirectoryDetail({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "amber" }) {
  return <div className={`rounded-xl p-2 ${tone === "amber" ? "bg-amber-50" : "bg-slate-50"}`}><p className={`font-bold ${tone === "amber" ? "text-amber-600" : "text-slate-400"}`}>{label}</p><p className={`mt-1 font-black ${tone === "amber" ? "text-amber-900" : "text-slate-800"}`}>{value}</p></div>;
}

function VehicleDetail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-2"><p className="font-bold text-slate-400">{label}</p><p className="mt-1 truncate font-black text-slate-800" title={value}>{value}</p></div>;
}
