"use client";

import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import { canAccessRoute, useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import {hubRequest} from "@/lib/hub-request";
import {
  maintenancePriorityRank,
  vehicleServiceTypes,
  type MaintenancePriority,
  type MaintenanceStatus,
  type MaintenanceTicket,
} from "@/lib/maintenance";
import {
  AlertTriangle,
  CheckCircle2,
  Hammer,
  LoaderCircle,
  Plus,
  Search,
  ShieldAlert,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState, useCallback, useEffect } from "react";

const priorities: MaintenancePriority[] = ["Routine", "Soon", "Urgent", "Safety Critical"];
const statuses: MaintenanceStatus[] = ["Open", "Assigned", "In Progress", "Waiting on Parts", "Completed"];

function priorityStyle(priority: MaintenancePriority) {
  if (priority === "Safety Critical") return "bg-red-100 text-red-800";
  if (priority === "Urgent") return "bg-orange-100 text-orange-800";
  if (priority === "Soon") return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-700";
}

export default function MaintenancePage() {
  const { profile,session } = useAuth();
  const token=session?.access_token;
  const { location } = useHubLocation();
  const [tickets,setTickets]=useState<MaintenanceTicket[]>([]);
  const [hydrated,setHydrated]=useState(false),[canManage,setCanManage]=useState(false),[error,setError]=useState(""),[saving,setSaving]=useState(false);
  const [loadError,setLoadError]=useState("");
  const [restSignals,setRestSignals]=useState<{locationId:string;location:string;status:string;label:string;lastEntryTime:string}[]>([]);
  const [restDataAvailable,setRestDataAvailable]=useState(true);
  const [version,setVersion]=useState(0),[editingVersion,setEditingVersion]=useState(0),[locations,setLocations]=useState<{id:string;label:string;name:string}[]>([]);
  const load=useCallback(async()=>{if(!token)return;try{const data=await hubRequest<{tickets:MaintenanceTicket[];version:number;canManage:boolean;locations:{id:string;label:string;name:string}[];restSignals:{locationId:string;location:string;status:string;label:string;lastEntryTime:string}[];restDataAvailable:boolean}>("/api/maintenance",token);setTickets(data.tickets);setVersion(data.version);setCanManage(data.canManage);setLocations(data.locations);setRestSignals(data.restSignals||[]);setRestDataAvailable(data.restDataAvailable);setLoadError("");}catch(reason){setLoadError(reason instanceof Error?reason.message:"Could not load maintenance.");}finally{setHydrated(true);}},[token]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);const polling=window.setInterval(()=>void load(),30000);return()=>{window.clearTimeout(timer);window.clearInterval(polling);};},[load]);
  const [editing, setEditing] = useState<MaintenanceTicket | null>(null);
  const [search, setSearch] = useState("");
  const [kindFilter,setKindFilter]=useState<"All"|"Facility"|"Vehicle">("All");
  const [statusFilter, setStatusFilter] = useState<"All" | MaintenanceStatus>("All");

  const visible = useMemo(() => tickets
    .filter((ticket) => location === "All Locations" || ticket.location === location)
    .filter(ticket=>kindFilter==="All"||(ticket.kind||"Facility")===kindFilter)
    .filter((ticket) => statusFilter === "All" || ticket.status === statusFilter)
    .filter((ticket) => {
      const query = search.trim().toLowerCase();
      return !query || `${ticket.title} ${ticket.area} ${ticket.description} ${ticket.assignedTo} ${ticket.vehicleName||""} ${ticket.serviceType||""}`.toLowerCase().includes(query);
    })
    .sort((a, b) => maintenancePriorityRank(a.priority) - maintenancePriorityRank(b.priority) || b.reportedAt.localeCompare(a.reportedAt)),
  [location, search, statusFilter, kindFilter, tickets]);

  const open = visible.filter((ticket) => ticket.status !== "Completed");
  const critical = open.filter((ticket) => ticket.priority === "Safety Critical");
  const urgent = open.filter((ticket) => ticket.priority === "Urgent");
  const completed = visible.filter((ticket) => ticket.status === "Completed");

  function newTicket(kind:"Facility"|"Vehicle"="Facility") {
    if(!canManage)return;setError("");setEditingVersion(version);
    setEditing({
      kind,vehicleName:"",serviceType:"Repair",nextServiceDate:"",
      id: `maint-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      location: locations.some(site=>site.label===location)?location:locations[0]?.label || "",
      area: "",
      title: "",
      description: "",
      priority: "Routine",
      status: "Open",
      reportedBy: profile?.full_name || "",
      assignedTo: "",
      reportedAt: new Date().toISOString(),
      dueDate: "",
      completedAt: "",
      completionNotes: "",
    });
  }

  async function save() {
    if(!editing||!token||!canManage||saving)return;setSaving(true);setError("");
    try{const result=await hubRequest<{ticket:MaintenanceTicket;version:number}>("/api/maintenance",token,{method:"POST",body:JSON.stringify({ticket:editing,expectedVersion:editingVersion})});setTickets(current=>current.some(ticket=>ticket.id===result.ticket.id)?current.map(ticket=>ticket.id===result.ticket.id?result.ticket:ticket):[...current,result.ticket]);setVersion(result.version);setEditing(null);}catch(reason){setError(reason instanceof Error?reason.message:"Could not save the ticket.");}finally{setSaving(false);}
  }

  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-6 pb-12 [&_input]:text-base [&_select]:text-base [&_textarea]:text-base [&_button]:min-h-11">
    <section className="overflow-hidden rounded-[30px] bg-gradient-to-br from-[#3c3028] via-[#654c38] to-[#2f3b2d] p-6 text-white shadow-xl sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[.18em] text-amber-200">Maintenance work area</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Maintenance Department</h1><p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-amber-50/80">Report broken doors, cameras, plumbing, playground, vehicle, electrical, and other site issues with priority, assignment, due date, and completion history.</p></div>
        {canManage && <div className="flex flex-wrap gap-3"><button onClick={()=>newTicket("Vehicle")} className="min-h-11 rounded-xl bg-emerald-700 px-4 py-3 text-base font-black text-white">New Vehicle Service</button><button onClick={()=>newTicket()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950"><Plus className="h-4 w-4" /> New Facility Ticket</button></div>}
      </div>
    </section>

    <section id="vehicle-maintenance" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-base text-emerald-950"><h2 className="text-xl font-black">Vehicle maintenance &amp; service history</h2><p className="mt-2">Track oil changes, tires, brakes, inspections and repairs by vehicle. Record mileage, the person handling the work, due dates, completion notes and the next service date or mileage. Completed tickets stay in the history.</p><button onClick={()=>{setKindFilter("Vehicle");setStatusFilter("All");}} className="mt-3 min-h-11 rounded-xl bg-emerald-800 px-4 py-3 font-bold text-white">Show vehicle maintenance</button>{canAccessRoute(profile,"/transportation")&&<Link href={canAccessRoute(profile,"/transportation-setup")?"/transportation-setup":"/transportation"} className="ml-3 inline-flex min-h-11 items-center font-bold underline">Open Transportation &amp; Fleet</Link>}<p className="mt-3">Service tickets do not change a vehicle’s fleet readiness. Leadership updates Ready / Needs Attention / Out of Service in Transportation.</p></section>
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4 text-base"><strong>{canManage?"Maintenance: manage tickets":"Maintenance: view only"}</strong><span>Tickets, assignments, due dates and completion updates.</span><button className="min-h-11 rounded-xl border px-4 py-2 font-bold" onClick={()=>void load()}>Refresh updates</button></div>
    {(error||loadError) && <p role="alert" className="rounded-xl bg-red-50 p-4 text-base font-bold text-red-900">{error||loadError}</p>}
    <nav aria-label="Shared staff tools" className="rounded-2xl border border-emerald-200 bg-white p-5">
      <h2 className="text-xl font-black text-emerald-950">Your staff Hub</h2>
      <p className="mt-2 text-base text-slate-700">Maintenance is part of Team TCS. You have the same shared staff spaces, rewards and learning tools as the rest of the team.</p>
      <div className="mt-4 flex flex-wrap gap-3">{[
        {href:"/my-schedule",label:"My Schedule"},
        {href:"/time-clock",label:"Time Clock"},
        {href:"/employee-lounge",label:"Employee Lounge"},
        {href:"/communications",label:"Communications"},
        {href:"/employee-bulletin",label:"Bulletin Board"},
        {href:"/training-center",label:"Training Center"},
        {href:"/team-store",label:"Team Store"},
        {href:"/notifications",label:"Notifications"},
        ...(canAccessRoute(profile,"/transportation")?[{href:"/transportation",label:"Transportation"}]:[]),
      ].map(item=><Link key={item.href} href={item.href} className="inline-flex min-h-11 items-center rounded-xl bg-emerald-800 px-5 py-3 text-base font-bold text-white">{item.label}</Link>)}</div>
    </nav>
    <section aria-label="Location rest awareness" className="rounded-2xl border border-emerald-200 bg-white p-5"><h2 className="text-xl font-black text-emerald-950">Before starting noisy work</h2><p className="mt-2 text-base text-slate-700">These location-only signals come from today’s recorded rest updates. Confirm with on-site staff before starting work. A missing or old entry does not mean children are awake.</p>{!restDataAvailable&&<p role="status" className="mt-3 text-amber-900">Rest updates could not be checked. Contact the location before starting noisy work.</p>}<div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{restSignals.filter(signal=>location==="All Locations"||signal.location===location).map(signal=><article key={signal.locationId} className={`rounded-xl border p-4 text-base ${signal.status==="resting"?"border-amber-300 bg-amber-50 text-amber-950":"border-slate-200 bg-slate-50 text-slate-900"}`}><h3 className="font-black">{signal.location}</h3><p className="mt-2 font-bold">{signal.label}</p>{signal.lastEntryTime&&<p className="mt-2">Latest recorded rest update: {signal.lastEntryTime}</p>}</article>)}</div><p className="mt-3 text-base text-slate-700">Emergency childcare coverage access is handled separately by leadership.</p></section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<Wrench className="h-5 w-5" />} label="Open Tickets" value={open.length} tone="slate" />
      <Metric icon={<ShieldAlert className="h-5 w-5" />} label="Safety Critical" value={critical.length} tone={critical.length ? "red" : "green"} />
      <Metric icon={<AlertTriangle className="h-5 w-5" />} label="Urgent" value={urgent.length} tone={urgent.length ? "amber" : "green"} />
      <Metric icon={<CheckCircle2 className="h-5 w-5" />} label="Completed" value={completed.length} tone="green" />
    </section>

    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-[1fr_180px_180px]">
      <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search issue, area, or assignee…" className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm font-semibold" /></label>
      <select aria-label="Maintenance type" value={kindFilter} onChange={event=>setKindFilter(event.target.value as typeof kindFilter)} className="rounded-xl border border-slate-200 px-3 py-3 text-base font-bold"><option value="All">All maintenance</option><option value="Facility">Facility</option><option value="Vehicle">Vehicle</option></select>
      <select aria-label="Ticket status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "All" | MaintenanceStatus)} className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold"><option>All</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
    </section>

    {!hydrated ? <div className="flex min-h-60 items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white text-sm font-bold text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading maintenance tickets…</div> :
      visible.length === 0 ? <div className="grid min-h-60 place-items-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center"><div><Hammer className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-3 text-xl font-black text-slate-800">No tickets in this view</h2><p className="mt-1 text-sm text-slate-500">{canManage?"Create a ticket when something needs maintenance attention.":"Maintenance updates will appear here when tickets are posted for your locations."}</p></div></div> :
      <section className="grid gap-4 xl:grid-cols-2">{visible.map((ticket) => <article key={ticket.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4"><div><p className="text-base font-black uppercase tracking-wider text-slate-600">{ticket.location} • {ticket.area || "Area not entered"}</p><h2 className="mt-1 text-xl font-black text-slate-950">{ticket.title}</h2></div><span className={`rounded-full px-2.5 py-1 text-base font-black uppercase ${priorityStyle(ticket.priority)}`}>{ticket.priority}</span></div>
        {ticket.kind==="Vehicle"&&<VehicleServiceDetails ticket={ticket}/>}
        <p className="mt-3 text-sm leading-6 text-slate-600">{ticket.description || "No description entered."}</p>
        <div className="mt-4 grid grid-cols-2 gap-2"><Info label="Status" value={ticket.status} /><Info label="Assigned To" value={ticket.assignedTo || "Unassigned"} /><Info label="Reported By" value={ticket.reportedBy || "Not entered"} /><Info label="Due" value={ticket.dueDate || "Not set"} /></div>
        <button onClick={() => {setError("");setEditingVersion(version);setEditing({ ...ticket });}} className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">Open Ticket</button>
      </article>)}</section>}

    {editing && <div className="fixed inset-0 z-[10000] overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm"><section className="mx-auto my-8 w-full max-w-2xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-4 bg-gradient-to-r from-[#49372b] to-[#2f3b2d] px-5 py-4 text-white"><div><p className="text-base font-black uppercase tracking-[.16em] text-amber-100">Maintenance ticket</p><h2 className="mt-1 text-2xl font-black">{editing.title || "New Ticket"}</h2></div><button onClick={() => setEditing(null)} className="rounded-xl bg-white/10 p-2"><X className="h-5 w-5" /></button></header>
      {error && <p role="alert" className="m-5 rounded-xl bg-red-50 p-3 text-red-900">{error}</p>}
      {!canManage ? <div className="grid gap-4 p-5 text-base sm:grid-cols-2">{editing.kind==="Vehicle"&&<div className="sm:col-span-2"><VehicleServiceDetails ticket={editing}/></div>}<Info label="Location" value={editing.location}/><Info label="Area" value={editing.area}/><Info label="Priority" value={editing.priority}/><Info label="Status" value={editing.status}/><Info label="Assigned to" value={editing.assignedTo || "Unassigned"}/><Info label="Due" value={editing.dueDate || "Not set"}/><div className="sm:col-span-2"><Info label="Issue details" value={editing.description || "No description"}/><Info label="Completion notes" value={editing.completionNotes || "No completion notes"}/></div></div> : <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Maintenance type"><select value={editing.kind||"Facility"} onChange={event=>setEditing({...editing,kind:event.target.value as "Facility"|"Vehicle",serviceType:editing.serviceType||"Repair"})} className="min-h-11 w-full rounded-xl border p-3 text-base"><option>Facility</option><option>Vehicle</option></select></Field>
        {editing.kind==="Vehicle"&&<>
          <Field label="Vehicle name or plate"><input required maxLength={200} value={editing.vehicleName||""} onChange={event=>setEditing({...editing,vehicleName:event.target.value})} placeholder="Use the fleet name or plate" className="min-h-11 w-full rounded-xl border p-3 text-base"/></Field>
          <Field label="Service type"><select value={editing.serviceType||"Repair"} onChange={event=>setEditing({...editing,serviceType:event.target.value as MaintenanceTicket["serviceType"]})} className="min-h-11 w-full rounded-xl border p-3 text-base">{vehicleServiceTypes.map(type=><option key={type}>{type}</option>)}</select></Field>
          <Field label="Odometer (miles)"><input type="number" min="0" step="1" value={editing.odometer??""} onChange={event=>setEditing({...editing,odometer:event.target.value===""?undefined:Number(event.target.value)})} className="min-h-11 w-full rounded-xl border p-3 text-base"/></Field>
          <Field label="Next service mileage"><input type="number" min="0" step="1" value={editing.nextServiceMileage??""} onChange={event=>setEditing({...editing,nextServiceMileage:event.target.value===""?undefined:Number(event.target.value)})} className="min-h-11 w-full rounded-xl border p-3 text-base"/></Field>
          <Field label="Next service date"><input type="date" value={editing.nextServiceDate||""} onChange={event=>setEditing({...editing,nextServiceDate:event.target.value})} className="min-h-11 w-full rounded-xl border p-3 text-base"/></Field>
        </>}
        <Field label="Location"><select value={editing.location} onChange={event=>setEditing({...editing,location:event.target.value})} className="min-h-11 w-full rounded-xl border p-3 text-base">{locations.map(site=><option key={site.id} value={site.label}>{site.name}</option>)}</select></Field>
        <Field label="Area / Room"><input value={editing.area} onChange={(event) => setEditing({ ...editing, area: event.target.value })} placeholder="Front door, camera 2, playground…" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /></Field>
        <Field label="Issue" wide><input value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold" /></Field>
        <Field label="Description" wide><textarea value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold leading-6" /></Field>
        <Field label="Priority"><select value={editing.priority} onChange={(event) => setEditing({ ...editing, priority: event.target.value as MaintenancePriority })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold">{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></Field>
        <Field label="Status"><select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value as MaintenanceStatus })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold">{statuses.map((status) => <option key={status}>{status}</option>)}</select></Field>
        <Field label="Assigned To"><input value={editing.assignedTo} onChange={(event) => setEditing({ ...editing, assignedTo: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /></Field>
        <Field label="Due Date"><input type="date" value={editing.dueDate} onChange={(event) => setEditing({ ...editing, dueDate: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold" /></Field>
        <Field label="Completion Notes" wide><textarea value={editing.completionNotes} onChange={(event) => setEditing({ ...editing, completionNotes: event.target.value })} className="min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold leading-6" /></Field>
      </div>}
      <footer className="flex justify-end gap-2 border-t border-slate-200 p-4"><button onClick={() => setEditing(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700">{canManage?"Cancel":"Close"}</button>{canManage && <button disabled={saving || !editing.title.trim() || (editing.kind==="Vehicle"&&!editing.vehicleName?.trim())} onClick={save} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">{saving?"Saving…":"Save Ticket"}</button>}</footer>
    </section></div>}
  </div></MainLayout>;
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "slate" | "red" | "amber" | "green" }) {
  const styles = { slate: "bg-slate-100 text-slate-700", red: "bg-red-100 text-red-800", amber: "bg-amber-100 text-amber-900", green: "bg-emerald-100 text-emerald-800" };
  return <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`grid h-10 w-10 place-items-center rounded-xl ${styles[tone]}`}>{icon}</span><div><strong className="block text-2xl font-black text-slate-950">{value}</strong><span className="text-base font-black uppercase tracking-wider text-slate-500">{label}</span></div></div>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><span className="text-base font-black uppercase tracking-wider text-slate-600">{label}</span><strong className="mt-1 block text-base text-slate-900">{value}</strong></div>;
}
function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1 block text-base font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>;
}

function VehicleServiceDetails({ticket}:{ticket:MaintenanceTicket}){return <div className="my-3 grid gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-base text-emerald-950"><strong>{ticket.vehicleName} • {ticket.serviceType}</strong><span>Odometer: {ticket.odometer===undefined?"Not recorded":ticket.odometer.toLocaleString()+" miles"}</span><span>Next service: {ticket.nextServiceDate||"Date not set"}{ticket.nextServiceMileage!==undefined?` • ${ticket.nextServiceMileage.toLocaleString()} miles`:""}</span>{ticket.completedAt&&<span>Completed: {new Date(ticket.completedAt).toLocaleDateString()}</span>}</div>;}
