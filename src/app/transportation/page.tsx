"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import {
  DemoNotice,
  Modal,
  PageIntro,
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
import {
  Building2,
  Bus,
  Car,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
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

type Tab = "Routes" | "Schools" | "Vehicles";
type ReadinessState = Record<string, Record<string, boolean>>;

export default function TransportationPage() {
  const { canManageSystem } = useAuth();
  const { location: activeLocation, availableLocations } = useHubLocation();
  const [routes, setRoutes] = usePersistentState<TransportationRoute[]>("tcs-routes", starterRoutes);
  const [schools, setSchools] = usePersistentState<SchoolRecord[]>("tcs-schools-v2", starterSchools);
  const [vehicles, setVehicles] = usePersistentState<VehicleRecord[]>("tcs-vehicles-v2", starterVehicles);
  const [readiness, setReadiness] = usePersistentState<ReadinessState>("tcs-vehicle-readiness-v2", {});
  const [tab, setTab] = useState<Tab>("Routes");
  const [routeSearch, setRouteSearch] = useState("");
  const [schoolSearch, setSchoolSearch] = useState("");
  const [editingRoute, setEditingRoute] = useState<TransportationRoute | null>(null);
  const [editingSchool, setEditingSchool] = useState<SchoolRecord | null>(null);
  const [originalSchoolName, setOriginalSchoolName] = useState<string | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<VehicleRecord | null>(null);
  const [originalVehicleName, setOriginalVehicleName] = useState<string | null>(null);
  const [readinessVehicleId, setReadinessVehicleId] = useState<number>(starterVehicles[0].id);

  const activeSchools = useMemo(() => schools.filter((school) => school.status === "Active"), [schools]);
  const availableVehicles = useMemo(() => vehicles.filter((vehicle) => vehicle.status !== "Out of Service"), [vehicles]);
  const filteredRoutes = useMemo(
    () => routes.filter((route) => (activeLocation === "All Locations" || route.location === activeLocation) && [route.location, route.child, route.school, route.area, route.driver, route.vehicle].join(" ").toLowerCase().includes(routeSearch.toLowerCase())),
    [activeLocation, routes, routeSearch],
  );
  const filteredSchools = useMemo(
    () => schools.filter((school) => [school.school, school.district, school.area, school.address].join(" ").toLowerCase().includes(schoolSearch.toLowerCase())),
    [schools, schoolSearch],
  );
  const readinessVehicle = vehicles.find((vehicle) => vehicle.id === readinessVehicleId) ?? vehicles[0];

  function openRoute(route?: TransportationRoute) {
    setEditingRoute(route ? { ...route } : { ...blankRoute, id: Date.now(), location: activeLocation === "All Locations" ? "Halcom" : activeLocation, vehicle: availableVehicles[0]?.name ?? "" });
  }

  function saveRoute(event: FormEvent) {
    event.preventDefault();
    if (!editingRoute) return;
    setRoutes((current) => current.some((item) => item.id === editingRoute.id)
      ? current.map((item) => item.id === editingRoute.id ? editingRoute : item)
      : [...current, editingRoute]);
    setEditingRoute(null);
  }

  function openSchool(school?: SchoolRecord) {
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

  const action = tab === "Routes"
    ? <PrimaryButton onClick={() => openRoute()}><Plus className="h-4 w-4" /> Add Route</PrimaryButton>
    : canManageSystem
      ? tab === "Schools"
        ? <PrimaryButton onClick={() => openSchool()}><Plus className="h-4 w-4" /> Add School</PrimaryButton>
        : <PrimaryButton onClick={() => openVehicle()}><Plus className="h-4 w-4" /> Add Vehicle</PrimaryButton>
      : undefined;

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1550px] space-y-6">
        <PageIntro
          eyebrow="Routes and safety"
          title="Transportation"
          description={canManageSystem ? "Plan routes, maintain the school directory, manage the complete vehicle fleet, and verify readiness before children ride." : "Manage transportation routes and complete vehicle-readiness checks. School and vehicle setup is controlled by Danielle."}
          actions={action}
        />
        <DemoNotice />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Active Route Records" value={routes.filter((route) => route.status !== "Not Riding").length} icon={<Bus className="h-5 w-5" />} />
          <StatCard label="Confirmed Routes" value={routes.filter((route) => route.status === "Confirmed").length} icon={<ShieldCheck className="h-5 w-5" />} tone="blue" />
          <StatCard label="Active Schools" value={activeSchools.length} helper={`${schools.length} total directory records`} icon={<Building2 className="h-5 w-5" />} tone="amber" />
          <StatCard label="Fleet Ready" value={`${vehicles.filter((vehicle) => vehicle.status === "Ready").length}/${vehicles.length}`} helper={canManageSystem ? "Owner-managed fleet" : "View-only fleet details"} icon={<Car className="h-5 w-5" />} tone="purple" />
        </section>

        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {(["Routes", "Schools", "Vehicles"] as const).map((item) => (
            <button key={item} onClick={() => setTab(item)} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${tab === item ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              {item}
            </button>
          ))}
        </div>

        {tab === "Routes" && (
          <>
            <SectionCard>
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
                        <td className="py-4 text-right"><SecondaryButton onClick={() => openRoute(route)}><Pencil className="h-4 w-4" /> Edit</SecondaryButton></td>
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
            <SectionCard title={canManageSystem ? "Editable School Directory" : "School Directory"} description={canManageSystem ? "Add schools or update names, districts, addresses, phone numbers, and bell schedules." : "School information is available for route planning. Danielle controls additions and changes."}>
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
              <Field label="Drop-off time"><input className={inputClass} value={editingRoute.dropoff} onChange={(event) => setEditingRoute({ ...editingRoute, dropoff: event.target.value })} /></Field>
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

function DirectoryDetail({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "amber" }) {
  return <div className={`rounded-xl p-2 ${tone === "amber" ? "bg-amber-50" : "bg-slate-50"}`}><p className={`font-bold ${tone === "amber" ? "text-amber-600" : "text-slate-400"}`}>{label}</p><p className={`mt-1 font-black ${tone === "amber" ? "text-amber-900" : "text-slate-800"}`}>{value}</p></div>;
}

function VehicleDetail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-2"><p className="font-bold text-slate-400">{label}</p><p className="mt-1 truncate font-black text-slate-800" title={value}>{value}</p></div>;
}
