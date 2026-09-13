"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  maintenancePriorityRank,
  starterMaintenanceTickets,
  type MaintenancePriority,
  type MaintenanceStatus,
  type MaintenanceTicket,
} from "@/lib/maintenance";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Hammer,
  LoaderCircle,
  Plus,
  Search,
  ShieldAlert,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

const priorities: MaintenancePriority[] = ["Routine", "Soon", "Urgent", "Safety Critical"];
const statuses: MaintenanceStatus[] = ["Open", "Assigned", "In Progress", "Waiting on Parts", "Completed"];

function priorityStyle(priority: MaintenancePriority) {
  if (priority === "Safety Critical") return "bg-red-100 text-red-800";
  if (priority === "Urgent") return "bg-orange-100 text-orange-800";
  if (priority === "Soon") return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-700";
}

export default function MaintenancePage() {
  const { profile } = useAuth();
  const { location } = useHubLocation();
  const [tickets, setTickets, hydrated] = usePersistentState<MaintenanceTicket[]>("tcs-maintenance-tickets-v1", starterMaintenanceTickets);
  const [editing, setEditing] = useState<MaintenanceTicket | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | MaintenanceStatus>("All");

  const visible = useMemo(() => tickets
    .filter((ticket) => location === "All Locations" || ticket.location === location)
    .filter((ticket) => statusFilter === "All" || ticket.status === statusFilter)
    .filter((ticket) => {
      const query = search.trim().toLowerCase();
      return !query || `${ticket.title} ${ticket.area} ${ticket.description} ${ticket.assignedTo}`.toLowerCase().includes(query);
    })
    .sort((a, b) => maintenancePriorityRank(a.priority) - maintenancePriorityRank(b.priority) || b.reportedAt.localeCompare(a.reportedAt)),
  [location, search, statusFilter, tickets]);

  const open = visible.filter((ticket) => ticket.status !== "Completed");
  const critical = open.filter((ticket) => ticket.priority === "Safety Critical");
  const urgent = open.filter((ticket) => ticket.priority === "Urgent");
  const completed = visible.filter((ticket) => ticket.status === "Completed");

  function newTicket() {
    setEditing({
      id: `maint-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      location: location === "All Locations" ? "Halcom" : location,
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

  function save() {
    if (!editing || !editing.title.trim() || !editing.location) return;
    const next = {
      ...editing,
      completedAt: editing.status === "Completed" ? editing.completedAt || new Date().toISOString() : "",
    };
    setTickets((current) => current.some((ticket) => ticket.id === next.id)
      ? current.map((ticket) => ticket.id === next.id ? next : ticket)
      : [...current, next]);
    setEditing(null);
  }

  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-6 pb-12">
    <section className="overflow-hidden rounded-[30px] bg-gradient-to-br from-[#3c3028] via-[#654c38] to-[#2f3b2d] p-6 text-white shadow-xl sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[.18em] text-amber-200">Facilities + safety work orders</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Maintenance & Safety Tickets</h1><p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-amber-50/80">Report broken doors, cameras, plumbing, playground, vehicle, electrical, and other site issues with priority, assignment, due date, and completion history.</p></div>
        <button onClick={newTicket} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950"><Plus className="h-4 w-4" /> New Ticket</button>
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<Wrench className="h-5 w-5" />} label="Open Tickets" value={open.length} tone="slate" />
      <Metric icon={<ShieldAlert className="h-5 w-5" />} label="Safety Critical" value={critical.length} tone={critical.length ? "red" : "green"} />
      <Metric icon={<AlertTriangle className="h-5 w-5" />} label="Urgent" value={urgent.length} tone={urgent.length ? "amber" : "green"} />
      <Metric icon={<CheckCircle2 className="h-5 w-5" />} label="Completed" value={completed.length} tone="green" />
    </section>

    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-[1fr_220px]">
      <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search issue, area, or assignee…" className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm font-semibold" /></label>
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "All" | MaintenanceStatus)} className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold"><option>All</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
    </section>

    {!hydrated ? <div className="flex min-h-60 items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white text-sm font-bold text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading maintenance tickets…</div> :
      visible.length === 0 ? <div className="grid min-h-60 place-items-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center"><div><Hammer className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-3 text-xl font-black text-slate-800">No tickets in this view</h2><p className="mt-1 text-sm text-slate-500">Create a ticket when something needs maintenance attention.</p></div></div> :
      <section className="grid gap-4 xl:grid-cols-2">{visible.map((ticket) => <article key={ticket.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{ticket.location} • {ticket.area || "Area not entered"}</p><h2 className="mt-1 text-xl font-black text-slate-950">{ticket.title}</h2></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${priorityStyle(ticket.priority)}`}>{ticket.priority}</span></div>
        <p className="mt-3 text-sm leading-6 text-slate-600">{ticket.description || "No description entered."}</p>
        <div className="mt-4 grid grid-cols-2 gap-2"><Info label="Status" value={ticket.status} /><Info label="Assigned To" value={ticket.assignedTo || "Unassigned"} /><Info label="Reported By" value={ticket.reportedBy || "Not entered"} /><Info label="Due" value={ticket.dueDate || "Not set"} /></div>
        <button onClick={() => setEditing({ ...ticket })} className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">Open Ticket</button>
      </article>)}</section>}

    {editing && <div className="fixed inset-0 z-[10000] overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm"><section className="mx-auto my-8 w-full max-w-2xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-4 bg-gradient-to-r from-[#49372b] to-[#2f3b2d] px-5 py-4 text-white"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-amber-100">Maintenance ticket</p><h2 className="mt-1 text-2xl font-black">{editing.title || "New Ticket"}</h2></div><button onClick={() => setEditing(null)} className="rounded-xl bg-white/10 p-2"><X className="h-5 w-5" /></button></header>
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Location"><input value={editing.location} onChange={(event) => setEditing({ ...editing, location: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold" /></Field>
        <Field label="Area / Room"><input value={editing.area} onChange={(event) => setEditing({ ...editing, area: event.target.value })} placeholder="Front door, camera 2, playground…" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /></Field>
        <Field label="Issue" wide><input value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold" /></Field>
        <Field label="Description" wide><textarea value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold leading-6" /></Field>
        <Field label="Priority"><select value={editing.priority} onChange={(event) => setEditing({ ...editing, priority: event.target.value as MaintenancePriority })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold">{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></Field>
        <Field label="Status"><select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value as MaintenanceStatus })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold">{statuses.map((status) => <option key={status}>{status}</option>)}</select></Field>
        <Field label="Assigned To"><input value={editing.assignedTo} onChange={(event) => setEditing({ ...editing, assignedTo: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /></Field>
        <Field label="Due Date"><input type="date" value={editing.dueDate} onChange={(event) => setEditing({ ...editing, dueDate: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold" /></Field>
        <Field label="Completion Notes" wide><textarea value={editing.completionNotes} onChange={(event) => setEditing({ ...editing, completionNotes: event.target.value })} className="min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold leading-6" /></Field>
      </div>
      <footer className="flex justify-end gap-2 border-t border-slate-200 p-4"><button onClick={() => setEditing(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700">Cancel</button><button disabled={!editing.title.trim()} onClick={save} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">Save Ticket</button></footer>
    </section></div>}
  </div></MainLayout>;
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "slate" | "red" | "amber" | "green" }) {
  const styles = { slate: "bg-slate-100 text-slate-700", red: "bg-red-100 text-red-800", amber: "bg-amber-100 text-amber-900", green: "bg-emerald-100 text-emerald-800" };
  return <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`grid h-10 w-10 place-items-center rounded-xl ${styles[tone]}`}>{icon}</span><div><strong className="block text-2xl font-black text-slate-950">{value}</strong><span className="text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</span></div></div>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><span className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</span><strong className="mt-1 block text-xs text-slate-900">{value}</strong></div>;
}
function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>;
}
