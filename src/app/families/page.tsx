"use client";

import MainLayout from "@/components/layout/MainLayout";
import { DemoNotice, Modal, PageIntro, PrimaryButton, SecondaryButton, SectionCard, StatCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { type FamilyRecord, starterFamilies } from "@/lib/hub-data";
import { usePersistentState } from "@/hooks/usePersistentState";
import { CircleDollarSign, Mail, Phone, Plus, Search, Users } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

const blankFamily: FamilyRecord = { id: 0, familyName: "", primaryGuardian: "", secondaryGuardian: "", phone: "", email: "", children: [], location: "Halcom", subsidy: "Private Pay", balance: 0, status: "Enrollment Pending", transportation: "None" };

export default function FamiliesPage() {
  const [families, setFamilies] = usePersistentState<FamilyRecord[]>("tcs-families", starterFamilies);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All Statuses");
  const [selected, setSelected] = useState<FamilyRecord | null>(null);
  const [editing, setEditing] = useState<FamilyRecord | null>(null);
  const [childrenText, setChildrenText] = useState("");

  const filtered = useMemo(() => families.filter((family) => {
    const term = search.toLowerCase();
    const matchesSearch = [family.familyName, family.primaryGuardian, family.secondaryGuardian, family.children.join(" "), family.phone].join(" ").toLowerCase().includes(term);
    return matchesSearch && (status === "All Statuses" || family.status === status);
  }), [families, search, status]);

  function openEdit(family?: FamilyRecord) {
    const value = family ? { ...family } : { ...blankFamily, id: Date.now() };
    setEditing(value);
    setChildrenText(value.children.join(", "));
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const record = { ...editing, children: childrenText.split(",").map((child) => child.trim()).filter(Boolean) };
    setFamilies((current) => current.some((item) => item.id === record.id) ? current.map((item) => item.id === record.id ? record : item) : [...current, record]);
    setEditing(null);
  }

  const active = families.filter((family) => family.status === "Active").length;
  const totalBalance = families.reduce((sum, family) => sum + family.balance, 0);
  const totalChildren = families.reduce((sum, family) => sum + family.children.length, 0);

  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-6">
    <PageIntro eyebrow="Family management" title="Families" description="Keep guardian contacts, siblings, subsidies, transportation, balances, and enrollment follow-ups organized in one place." actions={<PrimaryButton onClick={() => openEdit()}><Plus className="h-4 w-4" /> Add Family</PrimaryButton>} />
    <DemoNotice />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Active Families" value={active} helper={`${families.length - active} pending or inactive`} icon={<Users className="h-5 w-5" />} />
      <StatCard label="Children Linked" value={totalChildren} icon={<Users className="h-5 w-5" />} tone="blue" />
      <StatCard label="Subsidized Families" value={families.filter((family) => family.subsidy !== "Private Pay").length} icon={<CircleDollarSign className="h-5 w-5" />} tone="purple" />
      <StatCard label="Open Balances" value={`$${totalBalance.toFixed(0)}`} helper="Private fees and transportation" icon={<CircleDollarSign className="h-5 w-5" />} tone={totalBalance > 0 ? "amber" : "emerald"} />
    </section>

    <SectionCard>
      <div className="flex flex-col gap-3 lg:flex-row">
        <label className="relative flex-1"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-10`} placeholder="Search family, guardian, child, or phone…" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <select className={`${inputClass} lg:w-56`} value={status} onChange={(e) => setStatus(e.target.value)}><option>All Statuses</option><option>Active</option><option>Enrollment Pending</option><option>Inactive</option></select>
      </div>
    </SectionCard>

    <section className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
      {filtered.map((family) => <article key={family.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-emerald-700">{family.subsidy}</p><h2 className="mt-1 text-xl font-black text-slate-950">{family.familyName}</h2></div><StatusBadge tone={family.status === "Active" ? "green" : family.status === "Enrollment Pending" ? "amber" : "slate"}>{family.status}</StatusBadge></div>
        <div className="mt-4 rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Children</p><div className="mt-2 flex flex-wrap gap-2">{family.children.map((child) => <span key={child} className="rounded-full bg-white px-3 py-1 text-sm font-bold text-slate-700 shadow-sm">{child}</span>)}</div></div>
        <div className="mt-4 space-y-2 text-sm"><p className="font-bold text-slate-900">{family.primaryGuardian}{family.secondaryGuardian ? ` & ${family.secondaryGuardian}` : ""}</p><p className="flex items-center gap-2 text-slate-600"><Phone className="h-4 w-4" />{family.phone}</p><p className="flex items-center gap-2 truncate text-slate-600"><Mail className="h-4 w-4" />{family.email}</p><p className="text-slate-600"><strong>Location:</strong> {family.location}</p><p className="text-slate-600"><strong>Transportation:</strong> {family.transportation}</p></div>
        {family.balance > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">Balance due: ${family.balance.toFixed(2)}</div>}
        <div className="mt-5 flex gap-2"><SecondaryButton onClick={() => setSelected(family)}>Open Account</SecondaryButton><SecondaryButton onClick={() => openEdit(family)}>Edit</SecondaryButton></div>
      </article>)}
    </section>

    {editing && <Modal title={families.some((item) => item.id === editing.id) ? "Edit Family" : "Add Family"} description="Family details can be adjusted again after testing." onClose={() => setEditing(null)} footer={<><SecondaryButton onClick={() => setEditing(null)}>Cancel</SecondaryButton><PrimaryButton onClick={() => document.getElementById("family-save")?.click()}>Save Family</PrimaryButton></>}>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label="Family name" wide><input required className={inputClass} value={editing.familyName} onChange={(e) => setEditing({ ...editing, familyName: e.target.value })} /></Field>
        <Field label="Primary guardian"><input required className={inputClass} value={editing.primaryGuardian} onChange={(e) => setEditing({ ...editing, primaryGuardian: e.target.value })} /></Field>
        <Field label="Secondary guardian"><input className={inputClass} value={editing.secondaryGuardian} onChange={(e) => setEditing({ ...editing, secondaryGuardian: e.target.value })} /></Field>
        <Field label="Phone"><input className={inputClass} value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
        <Field label="Email"><input type="email" className={inputClass} value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
        <Field label="Children (comma separated)" wide><input className={inputClass} value={childrenText} onChange={(e) => setChildrenText(e.target.value)} /></Field>
        <Field label="Location"><input className={inputClass} value={editing.location} onChange={(e) => setEditing({ ...editing, location: e.target.value })} /></Field>
        <Field label="Subsidy"><select className={inputClass} value={editing.subsidy} onChange={(e) => setEditing({ ...editing, subsidy: e.target.value as FamilyRecord["subsidy"] })}><option>CCRC</option><option>DCFS</option><option>Private Pay</option><option>CCCC</option></select></Field>
        <Field label="Transportation" wide><input className={inputClass} value={editing.transportation} onChange={(e) => setEditing({ ...editing, transportation: e.target.value })} /></Field>
        <Field label="Balance"><input type="number" min="0" className={inputClass} value={editing.balance} onChange={(e) => setEditing({ ...editing, balance: Number(e.target.value) })} /></Field>
        <Field label="Status"><select className={inputClass} value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as FamilyRecord["status"] })}><option>Active</option><option>Enrollment Pending</option><option>Inactive</option></select></Field>
        <button id="family-save" className="hidden" type="submit">Save</button>
      </form>
    </Modal>}

    {selected && <Modal title={selected.familyName} description={`${selected.children.length} linked children • ${selected.subsidy}`} onClose={() => setSelected(null)} footer={<SecondaryButton onClick={() => { setSelected(null); openEdit(selected); }}>Edit Account</SecondaryButton>}>
      <div className="grid gap-4 sm:grid-cols-2"><Detail label="Primary guardian" value={selected.primaryGuardian} /><Detail label="Secondary guardian" value={selected.secondaryGuardian || "None listed"} /><Detail label="Phone" value={selected.phone} /><Detail label="Email" value={selected.email} /><Detail label="Location" value={selected.location} /><Detail label="Transportation" value={selected.transportation} /><Detail label="Subsidy" value={selected.subsidy} /><Detail label="Current balance" value={`$${selected.balance.toFixed(2)}`} /><div className="sm:col-span-2"><p className="text-xs font-black uppercase tracking-wider text-slate-400">Children</p><p className="mt-1 font-bold text-slate-900">{selected.children.join(", ")}</p></div></div>
    </Modal>}
  </div></MainLayout>;
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-sm font-bold text-slate-700">{label}</span>{children}</label>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 font-bold text-slate-900">{value}</p></div>; }
