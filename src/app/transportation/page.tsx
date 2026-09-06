"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import {
  Modal,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
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
import { localIsoDate } from "@/lib/date-utils";
import {
  AlertTriangle,
  ArrowRight,
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

type RunStatus = "Waiting" | "Picked Up" | "Dropped Off";

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
  pickupInstructions?: string;
  dropoffLocation?: string;
  dropoffAddress?: string;
  dropoffInstructions?: string;
  coveringDriver?: string;
  coveringDate?: string;
  runDate?: string;
  runStatus?: RunStatus;
  pickedUpAt?: string;
  pickedUpBy?: string;
  droppedOffAt?: string;
  droppedOffBy?: string;
  runHistory?: TransportationRunEvent[];
};

type LiveSchoolRecord = SchoolRecord & {
  pickupArea?: string;
  pickupInstructions?: string;
  parkingInstructions?: string;
};

const blankRoute: LiveTransportationRoute = {
  id: 0,
  location: "Halcom",
  child: "",
  school: "",
  area: "Lancaster",
  driver: "",
  vehicle: "",
  pickup: "",
  dropoff: "",
  days: "Mon–Fri",
  status: "Needs Review",
  notes: "",
  routeName: "",
  stopOrder: 1,
  pickupArea: "",
  pickupInstructions: "",
  dropoffLocation: "",
  dropoffAddress: "",
  dropoffInstructions: "",
};

const blankSchool: LiveSchoolRecord = {
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
  pickupArea: "",
  pickupInstructions: "",
  parkingInstructions: "",
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

type Tab = "Today" | "Routes" | "Schools" | "Vehicles";
type ReadinessState = Record<string, Record<string, boolean>>;

function routeGroupKey(route: LiveTransportationRoute) {
  return route.routeName?.trim() || `${route.location} • ${route.driver || "Transportation Route"}`;
}

function routeRunStatus(route: LiveTransportationRoute, today: string): RunStatus {
  return route.runDate === today ? (route.runStatus ?? "Waiting") : "Waiting";
}

function timestampLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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

function directionsHref(value: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`;
}

export default function TransportationPage() {
  const { canManageSystem, isLocationLicensee, profile } = useAuth();
  const { location: activeLocation, availableLocations } = useHubLocation();
  const [routes, setRoutes] = usePersistentState<LiveTransportationRoute[]>("tcs-routes", starterRoutes as LiveTransportationRoute[]);
  const [schools, setSchools] = usePersistentState<LiveSchoolRecord[]>("tcs-schools-v2", starterSchools as LiveSchoolRecord[]);
  const [vehicles, setVehicles] = usePersistentState<VehicleRecord[]>("tcs-vehicles-v2", starterVehicles);
  const [readiness, setReadiness] = usePersistentState<ReadinessState>("tcs-vehicle-readiness-v2", {});
  const [tab, setTab] = useState<Tab>("Today");
  const [routeSearch, setRouteSearch] = useState("");
  const [schoolSearch, setSchoolSearch] = useState("");
  const [selectedRouteKey, setSelectedRouteKey] = useState("");
  const [editingRoute, setEditingRoute] = useState<LiveTransportationRoute | null>(null);
  const [routeFormMessage, setRouteFormMessage] = useState("");
  const [editingSchool, setEditingSchool] = useState<LiveSchoolRecord | null>(null);
  const [originalSchoolName, setOriginalSchoolName] = useState<string | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<VehicleRecord | null>(null);
  const [originalVehicleName, setOriginalVehicleName] = useState<string | null>(null);
  const [readinessVehicleId, setReadinessVehicleId] = useState<number>(starterVehicles[0].id);

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
    () => schools.filter((school) => [school.school, school.district, school.area, school.address, school.pickupArea, school.pickupInstructions].join(" ").toLowerCase().includes(schoolSearch.toLowerCase())),
    [schools, schoolSearch],
  );
  const readinessVehicle = vehicles.find((vehicle) => vehicle.id === readinessVehicleId) ?? vehicles[0];

  const selectedWaiting = selectedTodayRoutes.filter((route) => routeRunStatus(route, today) === "Waiting").length;
  const selectedOnboard = selectedTodayRoutes.filter((route) => routeRunStatus(route, today) === "Picked Up").length;
  const selectedComplete = selectedTodayRoutes.filter((route) => routeRunStatus(route, today) === "Dropped Off").length;
  const selectedDriver = selectedTodayRoutes.find((route) => route.coveringDate === today && route.coveringDriver)?.coveringDriver
    || selectedTodayRoutes[0]?.driver
    || "Not assigned";
  const selectedVehicle = selectedTodayRoutes.find((route) => route.vehicle)?.vehicle || "Not assigned";

  const schoolGroups = useMemo(() => {
    const groups = new Map<string, LiveTransportationRoute[]>();
    selectedTodayRoutes.forEach((route) => {
      const key = route.school || "Unassigned stop";
      groups.set(key, [...(groups.get(key) ?? []), route]);
    });
    return [...groups.entries()];
  }, [selectedTodayRoutes]);

  function schoolForRoute(route: LiveTransportationRoute) {
    return schools.find((school) => school.school === route.school);
  }

  function pickupAreaForRoute(route: LiveTransportationRoute) {
    return route.pickupArea?.trim() || schoolForRoute(route)?.pickupArea?.trim() || "";
  }

  function pickupInstructionsForRoute(route: LiveTransportationRoute) {
    const school = schoolForRoute(route);
    return route.pickupInstructions?.trim() || school?.pickupInstructions?.trim() || school?.parkingInstructions?.trim() || school?.notes?.trim() || "";
  }

  function routeSetupProblems(route: LiveTransportationRoute) {
    const school = schoolForRoute(route);
    const problems: string[] = [];
    if (!route.school.trim()) problems.push("school/destination");
    if (!route.driver.trim() || route.driver === "TBD" || route.driver === "—") problems.push("assigned driver");
    if (!route.vehicle.trim()) problems.push("vehicle");
    if (!route.pickup.trim()) problems.push("pickup time");
    const isHomeTransport = route.school.toLowerCase().includes("home transportation");
    if (!isHomeTransport && !(route.pickupArea?.trim() || school?.pickupArea?.trim())) problems.push("pickup area");
    if (!route.dropoffLocation?.trim()) problems.push("drop-off location");
    return problems;
  }

  function openRoute(route?: LiveTransportationRoute) {
    const next = route
      ? { ...route }
      : {
          ...blankRoute,
          id: Date.now(),
          location: activeLocation === "All Locations" ? "Halcom" : activeLocation,
          vehicle: availableVehicles[0]?.name ?? "",
          routeName: activeLocation === "All Locations" ? "New Route" : `${activeLocation} Route`,
          stopOrder: Math.max(0, ...locationRoutes.map((item) => item.stopOrder ?? 0)) + 1,
        };
    setRouteFormMessage("");
    setEditingRoute(next);
  }

  function saveRoute(event: FormEvent) {
    event.preventDefault();
    if (!editingRoute) return;
    const selectedSchool = schools.find((school) => school.school === editingRoute.school);
    const isHomeTransport = editingRoute.school.toLowerCase().includes("home transportation");
    if (editingRoute.status === "Confirmed" && !isHomeTransport && !(editingRoute.pickupArea?.trim() || selectedSchool?.pickupArea?.trim())) {
      setRouteFormMessage("Add the child’s exact pickup area at the school before marking this route Confirmed.");
      return;
    }
    if (editingRoute.status === "Confirmed" && !editingRoute.dropoffLocation?.trim()) {
      setRouteFormMessage("Add the exact drop-off location before marking this route Confirmed.");
      return;
    }
    setRoutes((current) => current.some((item) => item.id === editingRoute.id)
      ? current.map((item) => item.id === editingRoute.id ? editingRoute : item)
      : [...current, editingRoute]);
    setEditingRoute(null);
    setRouteFormMessage("");
  }

  function openSchool(school?: LiveSchoolRecord) {
    setOriginalSchoolName(school?.school ?? null);
    setEditingSchool(school ? { ...school } : { ...blankSchool, id: Date.now() });
  }

  function saveSchool(event: FormEvent) {
    event.preventDefault();
    if (!editingSchool) return;
    setSchools((current) => current.some((item) => item.id === editingSchool.id)
      ? current.map((item) => item.id === editingSchool.id ? editingSchool : item)
      : [...current, editingSchool]);
    if (originalSchoolName && originalSchoolName !== editingSchool.school) {
      setRoutes((current) => current.map((route) => route.school === originalSchoolName ? { ...route, school: editingSchool.school } : route));
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
    setVehicles((current) => current.some((item) => item.id === editingVehicle.id)
      ? current.map((item) => item.id === editingVehicle.id ? editingVehicle : item)
      : [...current, editingVehicle]);
    if (originalVehicleName && originalVehicleName !== editingVehicle.name) {
      setRoutes((current) => current.map((route) => route.vehicle === originalVehicleName ? { ...route, vehicle: editingVehicle.name } : route));
    }
    setReadinessVehicleId(editingVehicle.id);
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
    const pickupLocation = pickupAreaForRoute(route) || route.school || "Pickup location";
    setRoutes((current) => current.map((item) => item.id === route.id ? {
      ...item,
      runDate: today,
      runStatus: "Picked Up",
      pickedUpAt: now,
      pickedUpBy: actor,
      droppedOffAt: undefined,
      droppedOffBy: undefined,
      runHistory: [...(item.runHistory ?? []).slice(-59), { date: today, status: "Picked Up", at: now, by: actor, location: pickupLocation }],
    } : item));
  }

  function markDroppedOff(route: LiveTransportationRoute) {
    if (!route.dropoffLocation?.trim()) return;
    const now = new Date().toISOString();
    setRoutes((current) => current.map((item) => item.id === route.id ? {
      ...item,
      runDate: today,
      runStatus: "Dropped Off",
      droppedOffAt: now,
      droppedOffBy: actor,
      runHistory: [...(item.runHistory ?? []).slice(-59), { date: today, status: "Dropped Off", at: now, by: actor, location: route.dropoffLocation!.trim() }],
    } : item));
  }

  function resetToday(route: LiveTransportationRoute) {
    setRoutes((current) => current.map((item) => item.id === route.id ? {
      ...item,
      runDate: undefined,
      runStatus: undefined,
      pickedUpAt: undefined,
      pickedUpBy: undefined,
      droppedOffAt: undefined,
      droppedOffBy: undefined,
    } : item));
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1580px] space-y-6 pb-12">
        <section className="relative overflow-hidden rounded-[2rem] border border-blue-100 bg-gradient-to-br from-[#eaf7ff] via-white to-[#d7ecff] shadow-[0_18px_55px_rgba(19,76,145,0.16)]">
          <div className="absolute -left-24 -top-20 h-60 w-60 rounded-full bg-[#ffc72c]/70" />
          <div className="absolute -right-24 -bottom-20 h-72 w-72 rounded-full bg-[#1757a8]/15" />
          <div className="relative grid min-h-[285px] gap-6 px-6 py-8 sm:px-9 lg:grid-cols-[.72fr_1.28fr] lg:items-center lg:px-12">
            <div className="relative flex items-center justify-center">
              <div className="relative grid h-44 w-72 place-items-center rounded-[2.25rem] bg-[#ffc72c] shadow-2xl ring-8 ring-white/70">
                <Bus className="h-24 w-24 text-[#123f7d]" strokeWidth={1.8} />
                <div className="absolute bottom-4 left-7 h-9 w-9 rounded-full border-4 border-white bg-[#153f75]" /><div className="absolute bottom-4 right-7 h-9 w-9 rounded-full border-4 border-white bg-[#153f75]" />
              </div>
            </div>
            <div className="relative z-10 text-center lg:text-left">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#1769d2]">TCS Operations Hub • School Shuttle</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight text-[#102a56] sm:text-6xl">The School Shuttle</h1>
              <p className="mt-2 text-lg font-black text-[#1769d2]">Safe and Reliable Transportation</p>
              <p className="mx-auto mt-4 max-w-3xl text-sm font-semibold leading-7 text-slate-600 lg:mx-0">Built so a trained backup driver can open the route, see exactly where each child is picked up, follow the stop order, confirm every pickup, and confirm every drop-off without needing to call for directions.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2 lg:justify-start"><span className="rounded-full bg-white px-4 py-2 text-xs font-black text-[#123f7d] shadow-sm">📍 Exact pickup areas</span><span className="rounded-full bg-white px-4 py-2 text-xs font-black text-[#123f7d] shadow-sm">✅ Pickup confirmation</span><span className="rounded-full bg-white px-4 py-2 text-xs font-black text-[#123f7d] shadow-sm">🏁 Specific drop-off confirmation</span></div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <TransportMetric label="Today’s Route Records" value={todayRoutes.length} icon={<Bus className="h-5 w-5" />} tone="blue" />
          <TransportMetric label="Waiting" value={todayRoutes.filter((route) => routeRunStatus(route, today) === "Waiting").length} icon={<Clock3 className="h-5 w-5" />} tone="amber" />
          <TransportMetric label="On Board" value={todayRoutes.filter((route) => routeRunStatus(route, today) === "Picked Up").length} icon={<Users className="h-5 w-5" />} tone="purple" />
          <TransportMetric label="Dropped Off" value={todayRoutes.filter((route) => routeRunStatus(route, today) === "Dropped Off").length} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" />
          <TransportMetric label="Fleet Ready" value={`${vehicles.filter((vehicle) => vehicle.status === "Ready").length}/${vehicles.length}`} icon={<Car className="h-5 w-5" />} tone="slate" />
        </div>

        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {(["Today", "Routes", "Schools", "Vehicles"] as const).map((item) => (
            <button key={item} onClick={() => setTab(item)} className={`rounded-xl px-4 py-2.5 text-sm font-black transition ${tab === item ? "bg-[#1769d2] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}>{item === "Today" ? "My Route Today" : item}</button>
          ))}
        </div>

        {tab === "Today" && (
          <div className="space-y-5">
            <section className="rounded-3xl border border-[#d8e8fb] bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#1769d2]">Driver mode</p><h2 className="mt-1 text-2xl font-black text-[#102a56]">Choose the route you are running</h2><p className="mt-1 text-sm font-semibold text-slate-500">The route stays in stop order and shows the exact pickup and drop-off instructions stored for each child.</p></div>
                {effectiveRouteKey && <button onClick={coverRouteToday} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ffc72c] px-5 py-3 text-sm font-black text-[#102a56] shadow-sm"><UserCheck className="h-4 w-4" /> I’m Covering This Route Today</button>}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {routeKeys.map((key) => <button key={key} onClick={() => setSelectedRouteKey(key)} className={`rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${effectiveRouteKey === key ? "border-[#1769d2] bg-[#eef6ff] text-[#102a56]" : "border-slate-200 bg-white text-slate-600 hover:border-blue-200"}`}>{key}</button>)}
                {!routeKeys.length && <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">No active route records are scheduled for today at the selected Hub location.</p>}
              </div>
            </section>

            {effectiveRouteKey && (
              <>
                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <RouteSummary label="Route" value={effectiveRouteKey} />
                  <RouteSummary label="Driver Today" value={selectedDriver} />
                  <RouteSummary label="Vehicle" value={selectedVehicle} />
                  <RouteSummary label="On Board" value={`${selectedOnboard}`} />
                  <RouteSummary label="Complete" value={`${selectedComplete}/${selectedTodayRoutes.length}`} />
                </section>

                <section className="rounded-3xl border border-blue-100 bg-[#f7fbff] p-5 shadow-sm sm:p-6">
                  <div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#1769d2] text-white"><Navigation className="h-5 w-5" /></div><div><h3 className="text-lg font-black text-[#102a56]">Never done this route before? Follow this screen.</h3><p className="mt-1 text-sm font-semibold leading-6 text-slate-600">1. Complete the vehicle readiness check. 2. Follow the numbered stops below. 3. Go to the exact pickup area shown. 4. Tap <strong>Picked Up</strong> only when the child is physically with you. 5. At the destination, tap <strong>Dropped Off</strong> at the location shown. Do not mark children in bulk.</p></div></div>
                </section>

                <div className="space-y-5">
                  {schoolGroups.map(([schoolName, stopRoutes], groupIndex) => {
                    const school = schools.find((item) => item.school === schoolName);
                    const pickupCount = stopRoutes.filter((route) => routeRunStatus(route, today) !== "Waiting").length;
                    const deliveredCount = stopRoutes.filter((route) => routeRunStatus(route, today) === "Dropped Off").length;
                    const schoolAddress = school?.address?.trim() || "";
                    const sharedPickup = stopRoutes.map(pickupAreaForRoute).find(Boolean) || school?.pickupArea || "Pickup area not entered";
                    const sharedInstructions = stopRoutes.map(pickupInstructionsForRoute).find(Boolean) || "No arrival instructions entered yet.";
                    return (
                      <section key={schoolName} className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
                        <div className="grid gap-4 bg-gradient-to-r from-[#102a56] to-[#1769d2] p-5 text-white lg:grid-cols-[1fr_auto] lg:items-center sm:p-6">
                          <div className="flex items-start gap-4"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#ffc72c] text-xl font-black text-[#102a56]">{groupIndex + 1}</div><div><p className="text-xs font-black uppercase tracking-[0.18em] text-blue-100">School stop</p><h3 className="mt-1 text-2xl font-black">{schoolName}</h3><p className="mt-1 text-sm font-semibold text-blue-100">Pickup area: <strong className="text-white">{sharedPickup}</strong></p>{schoolAddress && <a href={directionsHref(schoolAddress)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-black text-[#ffc72c] underline underline-offset-4"><MapPin className="h-3.5 w-3.5" /> {schoolAddress} • Open directions</a>}</div></div>
                          <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-black"><p>{pickupCount}/{stopRoutes.length} picked up</p><p className="mt-1">{deliveredCount}/{stopRoutes.length} dropped off</p></div>
                        </div>
                        <div className="border-b border-slate-100 bg-[#fff9e8] px-5 py-4 sm:px-6"><p className="text-xs font-black uppercase tracking-[0.14em] text-amber-700">How to find the pickup</p><p className="mt-1 text-sm font-semibold leading-6 text-slate-700">{sharedInstructions}</p>{school?.parkingInstructions && <p className="mt-1 text-xs font-semibold text-slate-500">Parking/gate: {school.parkingInstructions}</p>}</div>
                        <div className="grid gap-4 p-5 sm:p-6 xl:grid-cols-2">
                          {stopRoutes.map((route) => {
                            const runStatus = routeRunStatus(route, today);
                            const pickupArea = pickupAreaForRoute(route);
                            const pickupInstructions = pickupInstructionsForRoute(route);
                            const problems = routeSetupProblems(route);
                            return (
                              <article key={route.id} className={`rounded-2xl border p-4 ${runStatus === "Dropped Off" ? "border-emerald-200 bg-emerald-50/50" : runStatus === "Picked Up" ? "border-blue-200 bg-blue-50/50" : "border-slate-200 bg-white"}`}>
                                <div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h4 className="text-lg font-black text-slate-950">{route.child}</h4><StatusBadge tone={runStatus === "Dropped Off" ? "green" : runStatus === "Picked Up" ? "blue" : "amber"}>{runStatus}</StatusBadge></div><p className="mt-1 text-xs font-bold text-slate-500">Stop order {route.stopOrder ?? "—"} • Pickup {route.pickup || "time not entered"} • {route.days}</p></div>{canManageRoutes && <button onClick={() => openRoute(route)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-white" aria-label={`Edit ${route.child} route`}><Pencil className="h-4 w-4" /></button>}</div>
                                <div className="mt-4 grid gap-3 sm:grid-cols-2"><InstructionBox label="PICK UP AT" value={pickupArea || "Not entered"} warning={!pickupArea} /><InstructionBox label="DROP OFF AT" value={route.dropoffLocation?.trim() || "Not entered"} warning={!route.dropoffLocation?.trim()} /></div>
                                {pickupInstructions && <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-semibold leading-5 text-slate-600 ring-1 ring-slate-100"><strong>Pickup instructions:</strong> {pickupInstructions}</p>}
                                {route.dropoffInstructions && <p className="mt-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold leading-5 text-slate-600 ring-1 ring-slate-100"><strong>Drop-off instructions:</strong> {route.dropoffInstructions}</p>}
                                {route.notes && <p className="mt-2 text-xs font-semibold leading-5 text-red-700"><strong>Child / safety note:</strong> {route.notes}</p>}
                                {route.dropoffAddress?.trim() && <a href={directionsHref(route.dropoffAddress)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-[#1769d2] underline underline-offset-4"><MapPin className="h-3.5 w-3.5" /> Open drop-off directions</a>}
                                {problems.length > 0 && <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Route setup still needs: {problems.join(", ")}.</div>}
                                <div className="mt-4 flex flex-wrap gap-2">
                                  {runStatus === "Waiting" && <button onClick={() => markPickedUp(route)} disabled={!pickupArea && !route.school} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1769d2] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"><UserCheck className="h-4 w-4" /> PICKED UP</button>}
                                  {runStatus === "Picked Up" && <button onClick={() => markDroppedOff(route)} disabled={!route.dropoffLocation?.trim()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#34a853] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 className="h-4 w-4" /> DROPPED OFF AT {route.dropoffLocation?.trim() || "LOCATION NEEDED"}</button>}
                                  {runStatus === "Dropped Off" && <div className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-100 px-4 py-3 text-sm font-black text-emerald-800"><CheckCircle2 className="h-4 w-4" /> COMPLETE</div>}
                                  {canManageRoutes && runStatus !== "Waiting" && <button onClick={() => resetToday(route)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-3 text-xs font-black text-slate-600"><RotateCcw className="h-4 w-4" /> Reset Today</button>}
                                </div>
                                {runStatus !== "Waiting" && <div className="mt-3 grid gap-1 text-xs font-semibold text-slate-500">{route.runDate === today && route.pickedUpAt && <p>Picked up {timestampLabel(route.pickedUpAt)} by {route.pickedUpBy || "staff"}</p>}{route.runDate === today && route.droppedOffAt && <p>Dropped off {timestampLabel(route.droppedOffAt)} by {route.droppedOffBy || "staff"}</p>}</div>}
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>

                <section className={`rounded-3xl border p-5 shadow-sm sm:p-6 ${selectedWaiting === 0 && selectedOnboard === 0 ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                  <div className="flex items-center gap-3"><CheckCircle2 className={`h-7 w-7 ${selectedWaiting === 0 && selectedOnboard === 0 ? "text-emerald-700" : "text-amber-700"}`} /><div><h3 className="font-black text-slate-950">Route accountability check</h3><p className="mt-1 text-sm font-semibold text-slate-600">{selectedWaiting === 0 && selectedOnboard === 0 ? `All ${selectedComplete} children on this route are marked dropped off.` : `${selectedWaiting} still waiting • ${selectedOnboard} currently on board • ${selectedComplete} dropped off. Do not end the route until every expected child is accounted for.`}</p></div></div>
                </section>
              </>
            )}
          </div>
        )}

        {tab === "Routes" && (
          <>
            <SectionCard title="Route Setup" description="Store enough detail here that a trained substitute driver can run the route without calling for directions." action={canManageRoutes ? <PrimaryButton onClick={() => openRoute()}><Plus className="h-4 w-4" /> Add Route Record</PrimaryButton> : undefined}>
              <label className="relative block"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-10`} value={routeSearch} onChange={(event) => setRouteSearch(event.target.value)} placeholder="Search route, child, school, pickup area, drop-off, driver, or vehicle…" /></label>
              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {filteredRoutes.map((route) => {
                  const problems = routeSetupProblems(route);
                  return <article key={route.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.15em] text-[#1769d2]">{routeGroupKey(route)} • Stop {route.stopOrder ?? "—"}</p><h3 className="mt-1 text-lg font-black text-slate-950">{route.child}</h3><p className="mt-1 text-sm font-bold text-slate-600">{route.school || "No school/destination"} • {route.pickup || "No pickup time"}</p></div><StatusBadge tone={problems.length ? "amber" : "green"}>{problems.length ? `${problems.length} setup item${problems.length === 1 ? "" : "s"}` : "Route Ready"}</StatusBadge></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><InstructionBox label="PICKUP AREA" value={pickupAreaForRoute(route) || "Not entered"} warning={!pickupAreaForRoute(route)} /><InstructionBox label="DROP-OFF" value={route.dropoffLocation?.trim() || "Not entered"} warning={!route.dropoffLocation?.trim()} /></div><p className="mt-3 text-xs font-semibold text-slate-500">Assigned: {route.driver || "No driver"} • {route.vehicle || "No vehicle"} • {route.days}</p>{problems.length > 0 && <p className="mt-2 text-xs font-bold text-amber-800">Needs: {problems.join(", ")}</p>}{canManageRoutes && <div className="mt-4 flex justify-end"><SecondaryButton onClick={() => openRoute(route)}><Pencil className="h-4 w-4" /> Edit Route</SecondaryButton></div>}</article>;
                })}
              </div>
            </SectionCard>
          </>
        )}

        {tab === "Schools" && (
          <>
            <SectionCard title={canManageSystem ? "School Directory + Pickup Instructions" : "School Pickup Guide"} description={canManageSystem ? "Save the school address, default pickup area, parking/gate directions, and bell times once so every route can use them." : "Use these school details when you are covering a route."} action={canManageSystem ? <PrimaryButton onClick={() => openSchool()}><Plus className="h-4 w-4" /> Add School</PrimaryButton> : undefined}>
              <label className="relative block"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-10`} value={schoolSearch} onChange={(event) => setSchoolSearch(event.target.value)} placeholder="Search school, district, area, address, or pickup area…" /></label>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredSchools.map((school) => <article key={school.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-950">{school.school}</p><p className="mt-1 text-sm font-bold text-[#1769d2]">{school.district || "District not entered"}</p></div><StatusBadge tone={school.status === "Active" ? "green" : "slate"}>{school.status}</StatusBadge></div>{school.address ? <a href={directionsHref(school.address)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-[#1769d2] underline underline-offset-4"><MapPin className="h-3.5 w-3.5" />{school.address}</a> : <p className="mt-3 text-xs font-bold text-amber-700">School address not entered</p>}<div className="mt-4 rounded-2xl bg-[#fff9e8] p-3"><p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Default pickup area</p><p className="mt-1 font-black text-slate-900">{school.pickupArea || "Not entered"}</p>{school.pickupInstructions && <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{school.pickupInstructions}</p>}{school.parkingInstructions && <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">Parking/gate: {school.parkingInstructions}</p>}</div><div className="mt-4 grid grid-cols-3 gap-2 text-xs"><DirectoryDetail label="START" value={school.startTime || "—"} /><DirectoryDetail label="DISMISSAL" value={school.dismissal || "—"} /><DirectoryDetail label="MIN. DAY" value={school.minimumDay || "—"} tone="amber" /></div>{school.minimumDayName && <p className="mt-2 text-xs text-slate-500">Minimum-day note: {school.minimumDayName}</p>}{canManageSystem && <div className="mt-4 flex justify-end"><SecondaryButton onClick={() => openSchool(school)}><Pencil className="h-4 w-4" /> Edit School</SecondaryButton></div>}</article>)}
              </div>
            </SectionCard>
          </>
        )}

        {tab === "Vehicles" && (
          <>
            <SectionCard title="Vehicle Readiness" description="The driver should complete this before starting the route.">
              {vehicles.length > 0 ? <div className="grid gap-5 xl:grid-cols-[320px_1fr]"><div><Field label="Vehicle"><select className={inputClass} value={readinessVehicle?.id ?? ""} onChange={(event) => setReadinessVehicleId(Number(event.target.value))}>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}</select></Field>{readinessVehicle && <div className="mt-4 rounded-2xl bg-slate-50 p-4"><p className="font-black text-slate-900">{readinessVehicle.name}</p><p className="mt-1 text-sm text-slate-500">{readinessVehicle.makeModel} • {readinessVehicle.passengerCapacity || "—"} passengers</p></div>}</div><div className="grid gap-3 md:grid-cols-2">{readinessVehicle && readinessItems.map((item) => { const checked = readiness[String(readinessVehicle.id)]?.[item] ?? false; return <label key={item} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${checked ? "border-emerald-300 bg-emerald-50" : "border-slate-200"}`}><input type="checkbox" checked={checked} onChange={() => toggleReadiness(readinessVehicle.id, item)} className="h-4 w-4" /><span className="font-bold text-slate-800">{item}</span></label>; })}</div></div> : <p className="text-sm text-slate-500">Add a vehicle to begin readiness checks.</p>}
            </SectionCard>
            <SectionCard title="Complete Vehicle Fleet" description={canManageSystem ? "Owner/Admin can update fleet details here." : "Vehicle details are view-only for route staff."} action={canManageSystem ? <PrimaryButton onClick={() => openVehicle()}><Plus className="h-4 w-4" /> Add Vehicle</PrimaryButton> : undefined}>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{vehicles.map((vehicle) => <article key={vehicle.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex h-28 items-center justify-center bg-gradient-to-br from-[#102a56] to-[#1769d2] text-white"><div className="text-center"><Car className="mx-auto h-10 w-10" /><p className="mt-2 font-black">{vehicle.name}</p></div></div><div className="space-y-3 p-4"><div className="flex items-center justify-between gap-2"><p className="text-sm font-bold text-slate-700">{vehicle.makeModel || "Make/model not entered"}</p><StatusBadge tone={vehicle.status === "Ready" ? "green" : vehicle.status === "Needs Attention" ? "amber" : "red"}>{vehicle.status}</StatusBadge></div><div className="grid grid-cols-2 gap-2 text-xs"><VehicleDetail label="TYPE" value={vehicle.type || "—"} /><VehicleDetail label="PASSENGERS" value={vehicle.passengerCapacity ? String(vehicle.passengerCapacity) : "—"} /><VehicleDetail label="PLATE" value={vehicle.plate || "Not entered"} /><VehicleDetail label="DRIVER" value={vehicle.primaryDriver || "Not assigned"} /></div>{vehicle.notes && <p className="rounded-xl bg-slate-50 p-2.5 text-xs leading-5 text-slate-600">{vehicle.notes}</p>}{canManageSystem && <SecondaryButton onClick={() => openVehicle(vehicle)}><Pencil className="h-4 w-4" /> Edit Vehicle</SecondaryButton>}</div></article>)}</div>
            </SectionCard>
          </>
        )}

        {editingRoute && (
          <Modal title={routes.some((item) => item.id === editingRoute.id) ? "Edit Route Record" : "Add Route Record"} description="Enter enough detail that a trained backup driver can complete this child’s transportation without calling for directions." onClose={() => { setEditingRoute(null); setRouteFormMessage(""); }} footer={<><SecondaryButton onClick={() => { setEditingRoute(null); setRouteFormMessage(""); }}>Cancel</SecondaryButton><PrimaryButton onClick={() => document.getElementById("route-save")?.click()}>Save Route</PrimaryButton></>}>
            <form onSubmit={saveRoute} className="grid gap-4 sm:grid-cols-2">
              <Field label="Route / group name"><input required className={inputClass} value={editingRoute.routeName ?? ""} onChange={(event) => setEditingRoute({ ...editingRoute, routeName: event.target.value })} placeholder="Example: Dynasty Route" /></Field>
              <Field label="Stop order"><input min={1} type="number" className={inputClass} value={editingRoute.stopOrder ?? 1} onChange={(event) => setEditingRoute({ ...editingRoute, stopOrder: Number(event.target.value) || 1 })} /></Field>
              <Field label="Childcare location"><select required className={inputClass} value={editingRoute.location} onChange={(event) => setEditingRoute({ ...editingRoute, location: event.target.value })}>{availableLocations.filter((item) => item !== "All Locations").map((item) => <option key={item}>{item}</option>)}</select></Field>
              <Field label="Child"><input required className={inputClass} value={editingRoute.child} onChange={(event) => setEditingRoute({ ...editingRoute, child: event.target.value })} /></Field>
              <Field label="School or pickup destination"><input list="transport-school-options" className={inputClass} value={editingRoute.school} onChange={(event) => setEditingRoute({ ...editingRoute, school: event.target.value })} placeholder="Choose or type a destination" /><datalist id="transport-school-options"><option value="Home Transportation" /><option value="Dojo" />{activeSchools.map((school) => <option key={school.id} value={school.school} />)}</datalist></Field>
              <Field label="Area"><select className={inputClass} value={editingRoute.area} onChange={(event) => setEditingRoute({ ...editingRoute, area: event.target.value })}><option>Lancaster</option><option>Quartz Hill</option><option>Rosamond</option><option>Tehachapi</option><option>Other</option></select></Field>
              <Field label="Days"><input className={inputClass} value={editingRoute.days} onChange={(event) => setEditingRoute({ ...editingRoute, days: event.target.value })} placeholder="Example: Mon–Fri or Tue, Thu, Fri" /></Field>
              <Field label="Assigned driver"><input className={inputClass} value={editingRoute.driver} onChange={(event) => setEditingRoute({ ...editingRoute, driver: event.target.value })} /></Field>
              <Field label="Vehicle"><select className={inputClass} value={editingRoute.vehicle} onChange={(event) => setEditingRoute({ ...editingRoute, vehicle: event.target.value })}><option value="">No vehicle assigned</option>{editingRoute.vehicle && !vehicles.some((vehicle) => vehicle.name === editingRoute.vehicle) && <option value={editingRoute.vehicle}>{editingRoute.vehicle} (saved value)</option>}{availableVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.name}>{vehicle.name}{vehicle.status === "Needs Attention" ? " — Needs Attention" : ""}</option>)}</select></Field>
              <Field label="Pick-up time"><input className={inputClass} value={editingRoute.pickup} onChange={(event) => setEditingRoute({ ...editingRoute, pickup: event.target.value })} placeholder="Example: 2:33 PM" /></Field>
              <Field label="Child’s pickup area at school"><input className={inputClass} value={editingRoute.pickupArea ?? ""} onChange={(event) => setEditingRoute({ ...editingRoute, pickupArea: event.target.value })} placeholder="Example: Front gate by blue benches" /></Field>
              <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-bold text-slate-700">Pickup instructions / landmark</span><textarea className={`${inputClass} min-h-20`} value={editingRoute.pickupInstructions ?? ""} onChange={(event) => setEditingRoute({ ...editingRoute, pickupInstructions: event.target.value })} placeholder="Where to park, which gate to use, where the child waits, who releases them, etc." /></label>
              <Field label="Drop-off time"><input className={inputClass} value={editingRoute.dropoff} onChange={(event) => setEditingRoute({ ...editingRoute, dropoff: event.target.value })} /></Field>
              <Field label="Exact drop-off location"><input className={inputClass} value={editingRoute.dropoffLocation ?? ""} onChange={(event) => setEditingRoute({ ...editingRoute, dropoffLocation: event.target.value })} placeholder="Example: Halcom / Division / Child’s Home" /></Field>
              <Field label="Drop-off address"><input className={inputClass} value={editingRoute.dropoffAddress ?? ""} onChange={(event) => setEditingRoute({ ...editingRoute, dropoffAddress: event.target.value })} placeholder="Optional exact address for directions" /></Field>
              <Field label="Status"><select className={inputClass} value={editingRoute.status} onChange={(event) => setEditingRoute({ ...editingRoute, status: event.target.value as TransportationRoute["status"] })}><option>Confirmed</option><option>Needs Review</option><option>Not Riding</option></select></Field>
              <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-bold text-slate-700">Drop-off instructions</span><textarea className={`${inputClass} min-h-20`} value={editingRoute.dropoffInstructions ?? ""} onChange={(event) => setEditingRoute({ ...editingRoute, dropoffInstructions: event.target.value })} placeholder="Which entrance, who receives the child, where to park, etc." /></label>
              <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-bold text-slate-700">Child / safety notes</span><textarea className={`${inputClass} min-h-20`} value={editingRoute.notes} onChange={(event) => setEditingRoute({ ...editingRoute, notes: event.target.value })} placeholder="Only transportation-relevant notes the driver is authorized to see." /></label>
              {routeFormMessage && <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{routeFormMessage}</div>}
              <button id="route-save" className="hidden" type="submit">Save</button>
            </form>
          </Modal>
        )}

        {canManageSystem && editingSchool && (
          <Modal title={schools.some((item) => item.id === editingSchool.id) ? "Edit School" : "Add School"} description="These directions become the default school pickup guide for route staff." onClose={() => { setEditingSchool(null); setOriginalSchoolName(null); }} footer={<><SecondaryButton onClick={() => { setEditingSchool(null); setOriginalSchoolName(null); }}>Cancel</SecondaryButton><PrimaryButton onClick={() => document.getElementById("school-save")?.click()}>Save School</PrimaryButton></>}>
            <form onSubmit={saveSchool} className="grid gap-4 sm:grid-cols-2">
              <Field label="School name"><input required className={inputClass} value={editingSchool.school} onChange={(event) => setEditingSchool({ ...editingSchool, school: event.target.value })} /></Field>
              <Field label="District"><input className={inputClass} value={editingSchool.district} onChange={(event) => setEditingSchool({ ...editingSchool, district: event.target.value })} /></Field>
              <Field label="Area"><input className={inputClass} value={editingSchool.area} onChange={(event) => setEditingSchool({ ...editingSchool, area: event.target.value })} /></Field>
              <Field label="Status"><select className={inputClass} value={editingSchool.status} onChange={(event) => setEditingSchool({ ...editingSchool, status: event.target.value as SchoolRecord["status"] })}><option>Active</option><option>Inactive</option></select></Field>
              <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-bold text-slate-700">School address</span><input className={inputClass} value={editingSchool.address} onChange={(event) => setEditingSchool({ ...editingSchool, address: event.target.value })} /></label>
              <Field label="Phone"><input className={inputClass} value={editingSchool.phone} onChange={(event) => setEditingSchool({ ...editingSchool, phone: event.target.value })} /></Field>
              <Field label="Default pickup area"><input className={inputClass} value={editingSchool.pickupArea ?? ""} onChange={(event) => setEditingSchool({ ...editingSchool, pickupArea: event.target.value })} placeholder="Example: Parent pickup gate near office" /></Field>
              <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-bold text-slate-700">Pickup / arrival instructions</span><textarea className={`${inputClass} min-h-20`} value={editingSchool.pickupInstructions ?? ""} onChange={(event) => setEditingSchool({ ...editingSchool, pickupInstructions: event.target.value })} placeholder="Which gate, line, release procedure, where children wait, etc." /></label>
              <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-bold text-slate-700">Parking / gate instructions</span><textarea className={`${inputClass} min-h-20`} value={editingSchool.parkingInstructions ?? ""} onChange={(event) => setEditingSchool({ ...editingSchool, parkingInstructions: event.target.value })} /></label>
              <Field label="Start time"><input className={inputClass} value={editingSchool.startTime} onChange={(event) => setEditingSchool({ ...editingSchool, startTime: event.target.value })} /></Field>
              <Field label="Dismissal time"><input className={inputClass} value={editingSchool.dismissal} onChange={(event) => setEditingSchool({ ...editingSchool, dismissal: event.target.value })} /></Field>
              <Field label="Minimum-day dismissal"><input className={inputClass} value={editingSchool.minimumDay} onChange={(event) => setEditingSchool({ ...editingSchool, minimumDay: event.target.value })} /></Field>
              <Field label="Minimum-day note"><input className={inputClass} value={editingSchool.minimumDayName} onChange={(event) => setEditingSchool({ ...editingSchool, minimumDayName: event.target.value })} placeholder="Example: Every Tuesday" /></Field>
              <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-bold text-slate-700">Other school notes</span><textarea className={`${inputClass} min-h-20`} value={editingSchool.notes} onChange={(event) => setEditingSchool({ ...editingSchool, notes: event.target.value })} /></label>
              <button id="school-save" className="hidden" type="submit">Save</button>
            </form>
          </Modal>
        )}

        {canManageSystem && editingVehicle && (
          <Modal title={vehicles.some((item) => item.id === editingVehicle.id) ? "Edit Vehicle" : "Add Vehicle"} description="Changes to the vehicle name automatically update matching routes." onClose={() => { setEditingVehicle(null); setOriginalVehicleName(null); }} footer={<><SecondaryButton onClick={() => { setEditingVehicle(null); setOriginalVehicleName(null); }}>Cancel</SecondaryButton><PrimaryButton onClick={() => document.getElementById("vehicle-save")?.click()}>Save Vehicle</PrimaryButton></>}>
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

function TransportMetric({ label, value, icon, tone }: { label: string; value: string | number; icon: React.ReactNode; tone: "blue" | "amber" | "purple" | "green" | "slate" }) {
  const toneClass = tone === "blue" ? "bg-blue-50 text-blue-700" : tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "purple" ? "bg-violet-50 text-violet-700" : tone === "green" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700";
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><span className={`grid h-11 w-11 place-items-center rounded-2xl ${toneClass}`}>{icon}</span><div><p className="text-xs font-black text-slate-500">{label}</p><p className="text-2xl font-black text-[#102a56]">{value}</p></div></div></article>;
}

function RouteSummary({ label, value }: { label: string; value: string }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</p><p className="mt-1 truncate text-lg font-black text-[#102a56]" title={value}>{value}</p></article>;
}

function InstructionBox({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className={`rounded-xl p-3 ${warning ? "bg-amber-50" : "bg-slate-50"}`}><p className={`text-[10px] font-black uppercase tracking-[0.14em] ${warning ? "text-amber-700" : "text-slate-400"}`}>{label}</p><p className={`mt-1 text-sm font-black ${warning ? "text-amber-900" : "text-slate-900"}`}>{value}</p></div>;
}

function DirectoryDetail({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "amber" }) {
  return <div className={`rounded-xl p-2 ${tone === "amber" ? "bg-amber-50" : "bg-slate-50"}`}><p className={`font-bold ${tone === "amber" ? "text-amber-600" : "text-slate-400"}`}>{label}</p><p className={`mt-1 font-black ${tone === "amber" ? "text-amber-900" : "text-slate-800"}`}>{value}</p></div>;
}

function VehicleDetail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-2"><p className="font-bold text-slate-400">{label}</p><p className="mt-1 truncate font-black text-slate-800" title={value}>{value}</p></div>;
}
