"use client";

import MainLayout from "@/components/layout/MainLayout";
import { DemoNotice, Modal, PageIntro, PrimaryButton, SecondaryButton, SectionCard, StatCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { type EmployeeRecord, starterEmployees } from "@/lib/hub-data";
import { usePersistentState } from "@/hooks/usePersistentState";
import { Bus, FileWarning, Plus, Search, UserCheck } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

const blankEmployee: EmployeeRecord = { id: 0, name: "", role: "Teacher", location: "Halcom", phone: "", schedule: "", status: "Training", certifications: [], fileStatus: "Needs Attention", transportation: false };

export default function EmployeesPage() {
  const [employees, setEmployees] = usePersistentState<EmployeeRecord[]>("tcs-employees", starterEmployees);
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("All Locations");
  const [editing, setEditing] = useState<EmployeeRecord | null>(null);
  const [certifications, setCertifications] = useState("");

  const filtered = useMemo(() => employees.filter((employee) => {
    const term = search.toLowerCase();
    return [employee.name, employee.role, employee.location].join(" ").toLowerCase().includes(term) && (location === "All Locations" || employee.location.includes(location));
  }), [employees, search, location]);

  function open(employee?: EmployeeRecord) { const record = employee ? { ...employee } : { ...blankEmployee, id: Date.now() }; setEditing(record); setCertifications(record.certifications.join(", ")); }
  function save(event: FormEvent) { event.preventDefault(); if (!editing) return; const record = { ...editing, certifications: certifications.split(",").map((item) => item.trim()).filter(Boolean) }; setEmployees((current) => current.some((item) => item.id === record.id) ? current.map((item) => item.id === record.id ? record : item) : [...current, record]); setEditing(null); }

  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-6">
    <PageIntro eyebrow="Team management" title="Employees" description="Track staff availability, roles, files, qualifications, transportation approval, and current assignments." actions={<PrimaryButton onClick={() => open()}><Plus className="h-4 w-4" /> Add Employee</PrimaryButton>} />
    <DemoNotice />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Team Members" value={employees.length} icon={<UserCheck className="h-5 w-5" />} />
      <StatCard label="Working Today" value={employees.filter((item) => item.status === "Working Today").length} icon={<UserCheck className="h-5 w-5" />} tone="blue" />
      <StatCard label="Driver Approved" value={employees.filter((item) => item.transportation).length} icon={<Bus className="h-5 w-5" />} tone="purple" />
      <StatCard label="Files Need Attention" value={employees.filter((item) => item.fileStatus === "Needs Attention").length} icon={<FileWarning className="h-5 w-5" />} tone="amber" />
    </section>
    <SectionCard><div className="flex flex-col gap-3 lg:flex-row"><label className="relative flex-1"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-10`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee, role, or location…" /></label><select className={`${inputClass} lg:w-56`} value={location} onChange={(e) => setLocation(e.target.value)}><option>All Locations</option><option>Halcom</option><option>Division</option><option>21st Street</option><option>33rd Street</option><option>42nd Street</option><option>Tehachapi</option><option>All Sites</option></select></div></SectionCard>
    <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {filtered.map((employee) => <article key={employee.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-lg font-black text-emerald-800">{employee.name.split(" ").map((item) => item[0]).join("").slice(0, 2)}</div><StatusBadge tone={employee.status === "Working Today" ? "green" : employee.status === "Training" ? "amber" : employee.status === "On Leave" ? "red" : "slate"}>{employee.status}</StatusBadge></div>
        <h2 className="mt-4 text-xl font-black text-slate-950">{employee.name}</h2><p className="text-sm font-bold text-emerald-700">{employee.role}</p><p className="mt-1 text-sm text-slate-500">{employee.location}</p>
        <div className="mt-4 rounded-2xl bg-slate-50 p-3"><p className="text-xs font-black uppercase tracking-wider text-slate-400">Usual Schedule</p><p className="mt-1 text-sm font-semibold leading-6 text-slate-700">{employee.schedule || "Schedule not entered"}</p></div>
        <div className="mt-4 flex flex-wrap gap-2">{employee.certifications.map((cert) => <StatusBadge key={cert} tone="blue">{cert}</StatusBadge>)}</div>
        <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2"><span className="text-sm font-bold text-slate-700">Employee file</span><StatusBadge tone={employee.fileStatus === "Complete" ? "green" : "amber"}>{employee.fileStatus}</StatusBadge></div>
        <div className="mt-4 flex gap-2"><SecondaryButton onClick={() => open(employee)}>Edit Record</SecondaryButton>{employee.transportation && <span className="inline-flex items-center gap-1 rounded-xl bg-purple-50 px-3 py-2 text-xs font-black text-purple-800"><Bus className="h-4 w-4" /> Driver</span>}</div>
      </article>)}
    </section>

    {editing && <Modal title={employees.some((item) => item.id === editing.id) ? "Edit Employee" : "Add Employee"} description="Update the staff record and testing data." onClose={() => setEditing(null)} footer={<><SecondaryButton onClick={() => setEditing(null)}>Cancel</SecondaryButton><PrimaryButton onClick={() => document.getElementById("employee-save")?.click()}>Save Employee</PrimaryButton></>}>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label="Employee name" wide><input required className={inputClass} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
        <Field label="Role"><input required className={inputClass} value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })} /></Field>
        <Field label="Location"><input className={inputClass} value={editing.location} onChange={(e) => setEditing({ ...editing, location: e.target.value })} /></Field>
        <Field label="Phone"><input className={inputClass} value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
        <Field label="Status"><select className={inputClass} value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as EmployeeRecord["status"] })}><option>Working Today</option><option>Off Today</option><option>Training</option><option>On Leave</option></select></Field>
        <Field label="Usual schedule" wide><textarea className={`${inputClass} min-h-24`} value={editing.schedule} onChange={(e) => setEditing({ ...editing, schedule: e.target.value })} /></Field>
        <Field label="Certifications (comma separated)" wide><input className={inputClass} value={certifications} onChange={(e) => setCertifications(e.target.value)} /></Field>
        <Field label="File status"><select className={inputClass} value={editing.fileStatus} onChange={(e) => setEditing({ ...editing, fileStatus: e.target.value as EmployeeRecord["fileStatus"] })}><option>Complete</option><option>Needs Attention</option></select></Field>
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3"><input type="checkbox" checked={editing.transportation} onChange={(e) => setEditing({ ...editing, transportation: e.target.checked })} /><span className="text-sm font-bold">Approved for transportation</span></label>
        <button id="employee-save" className="hidden" type="submit">Save</button>
      </form>
    </Modal>}
  </div></MainLayout>;
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-sm font-bold text-slate-700">{label}</span>{children}</label>; }
