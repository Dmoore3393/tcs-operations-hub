"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { deriveFamiliesFromChildren, familyChildren } from "@/lib/family-derived";
import type { ChildRecord } from "@/lib/children";
import type { FamilyRecord } from "@/lib/hub-data";
import { Database, LoaderCircle, Mail, Phone, RefreshCw, Search, ShieldCheck, Users, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

const inputClass = "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100";
const fundingOptions = ["Private Pay", "Cash Pay", "CCRC", "CCRC Stage 1", "CCRC Stage 2", "CCCC", "DCFS", "Respite", "Crystal Stairs"] as const;
const isPrivateFunding = (value: string) => /^(private pay|cash pay)$/i.test(value.trim());

export default function SecureFamiliesPage() {
  const { session, isEmployee } = useAuth();
  const canManage = !isEmployee;
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All Statuses");
  const [selected, setSelected] = useState<FamilyRecord | null>(null);
  const [editing, setEditing] = useState<FamilyRecord | null>(null);

  const request = useCallback(async (method: "GET" | "POST", body?: Record<string, unknown>) => {
    if (!session?.access_token) throw new Error("Your staff session is not ready yet.");
    const response = await fetch("/api/children", {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const raw = await response.text();
    let payload: Record<string, unknown> = {};
    if (raw) {
      try { payload = JSON.parse(raw) as Record<string, unknown>; }
      catch { payload = { error: raw }; }
    }
    if (!response.ok) throw new Error(String(payload.error || raw || "The family database request failed."));
    return payload;
  }, [session?.access_token]);

  const load = useCallback(async (quiet = false) => {
    if (!session?.access_token) return;
    if (!quiet) setLoading(true);
    try {
      const payload = await request("GET");
      setChildren(Array.isArray(payload.children) ? payload.children as ChildRecord[] : []);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load families.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [request, session?.access_token]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const families = useMemo(() => deriveFamiliesFromChildren(children), [children]);
  const filtered = useMemo(() => families.filter((family) => {
    const query = search.trim().toLowerCase();
    const matches = !query || `${family.familyName} ${family.primaryGuardian} ${family.secondaryGuardian} ${family.phone} ${family.email} ${family.children.join(" ")}`.toLowerCase().includes(query);
    return matches && (status === "All Statuses" || family.status === status);
  }), [families, search, status]);

  async function saveFamily(event: FormEvent) {
    event.preventDefault();
    if (!editing || !canManage) return;
    const linked = familyChildren(children, editing);
    if (!linked.length) return setError("No secured child records are linked to this family.");
    setSaving(true);
    setError("");
    try {
      const updatedChildren: ChildRecord[] = [];
      for (const child of linked) {
        const updated: ChildRecord = {
          ...child,
          familyId: editing.id,
          familyName: editing.familyName,
          primaryGuardian: editing.primaryGuardian,
          secondaryGuardian: editing.secondaryGuardian || undefined,
          phone: editing.phone,
          guardianEmail: editing.email || undefined,
          subsidy: editing.subsidy,
          transportation: editing.transportation === "None" ? child.transportation : editing.transportation,
          enrollmentStatus: editing.status === "Inactive" ? "Archived" : editing.status === "Enrollment Pending" ? "Pending" : "Active",
        };
        const payload = await request("POST", { action: "save", child: updated });
        updatedChildren.push(payload.child as ChildRecord);
      }
      setChildren((current) => current.map((child) => updatedChildren.find((updated) => updated.id === child.id) ?? child));
      setEditing(null);
      setNotice(`${editing.familyName} updated across ${updatedChildren.length} child record${updatedChildren.length === 1 ? "" : "s"}.`);
      window.setTimeout(() => setNotice(""), 2600);
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The family changes could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-6">
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div><div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black uppercase tracking-[.16em] text-emerald-800"><ShieldCheck className="h-3.5 w-3.5"/> Secured family directory</div><h1 className="mt-4 text-3xl font-black text-slate-950">Families</h1><p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">Family contact information is derived from the child records your account is authorized to see. There is no separate public or company-wide family list containing parent information.</p></div><div className="flex gap-2"><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-black"><RefreshCw className="h-4 w-4"/> Refresh</button>{canManage && <Link href="/children" className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white">Add Child / Family</Link>}</div></div></section>

    {(error || notice) && <div className={`flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-sm font-bold ${error ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}><span>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }}><X className="h-4 w-4"/></button></div>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Families Visible" value={families.length}/><Stat label="Active Families" value={families.filter((family) => family.status === "Active").length}/><Stat label="Children Linked" value={children.filter((child) => child.enrollmentStatus !== "Archived").length}/><Stat label="Subsidized Families" value={families.filter((family) => !isPrivateFunding(family.subsidy)).length}/></section>

    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><div className="grid gap-3 lg:grid-cols-[1fr_240px]"><label className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input className={`${inputClass} pl-10`} placeholder="Search family, guardian, child, phone, or email" value={search} onChange={(e) => setSearch(e.target.value)}/></label><select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}><option>All Statuses</option><option>Active</option><option>Enrollment Pending</option><option>Inactive</option></select></div></section>

    {loading ? <div className="flex min-h-60 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-slate-600"><LoaderCircle className="h-6 w-6 animate-spin"/> Loading secured family records…</div> : filtered.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center"><Users className="mx-auto h-10 w-10 text-emerald-700"/><h2 className="mt-3 text-xl font-black">No families match this view</h2><p className="mt-2 text-sm text-slate-500">Families appear automatically as live child records are added.</p></div> : <section className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">{filtered.map((family) => <article key={family.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-emerald-700">{family.subsidy}</p><h2 className="mt-1 text-xl font-black">{family.familyName}</h2></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider">{family.status}</span></div><div className="mt-4 rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Children</p><p className="mt-1 text-sm font-bold text-slate-800">{family.children.join(", ")}</p></div><div className="mt-4 space-y-2 text-sm"><p className="font-black">{family.primaryGuardian}{family.secondaryGuardian ? ` & ${family.secondaryGuardian}` : ""}</p><p className="flex items-center gap-2 text-slate-600"><Phone className="h-4 w-4"/>{family.phone || "No phone entered"}</p><p className="flex items-center gap-2 truncate text-slate-600"><Mail className="h-4 w-4"/>{family.email || "No email entered"}</p><p className="text-slate-600"><strong>Location:</strong> {family.location}</p></div><div className="mt-5 flex gap-2"><button onClick={() => setSelected(family)} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">Open</button>{canManage && <button onClick={() => setEditing({ ...family })} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-black">Edit Family</button>}</div></article>)}</section>}

    {selected && <FamilyModal family={selected} onClose={() => setSelected(null)} />}
    {editing && <EditModal family={editing} setFamily={setEditing} saving={saving} onClose={() => !saving && setEditing(null)} onSubmit={saveFamily}/>} 
  </div></MainLayout>;
}

function Stat({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800"><Database className="h-5 w-5"/></div><div><p className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</p><p className="text-2xl font-black">{value}</p></div></div></div>; }

function FamilyModal({ family, onClose }: { family: FamilyRecord; onClose: () => void }) { return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-4"><button aria-label="Close" className="absolute inset-0" onClick={onClose}/><section className="relative z-10 w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-emerald-700">Family account</p><h2 className="mt-1 text-2xl font-black">{family.familyName}</h2></div><button onClick={onClose} className="rounded-xl border border-slate-200 p-2"><X className="h-4 w-4"/></button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><Detail label="Primary guardian" value={family.primaryGuardian}/><Detail label="Secondary guardian" value={family.secondaryGuardian || "None listed"}/><Detail label="Phone" value={family.phone || "Not entered"}/><Detail label="Email" value={family.email || "Not entered"}/><Detail label="Funding" value={family.subsidy}/><Detail label="Transportation" value={family.transportation}/><div className="sm:col-span-2"><Detail label="Children" value={family.children.join(", ")}/></div></div></section></div>; }

function EditModal({ family, setFamily, saving, onClose, onSubmit }: { family: FamilyRecord; setFamily: (family: FamilyRecord | null) => void; saving: boolean; onClose: () => void; onSubmit: (event: FormEvent) => void }) { return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-4"><button aria-label="Close" className="absolute inset-0" onClick={onClose}/><section className="relative z-10 w-full max-w-3xl rounded-3xl bg-white shadow-2xl"><header className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><h2 className="text-xl font-black">Edit {family.familyName}</h2><button onClick={onClose} disabled={saving} className="rounded-xl border border-slate-200 p-2"><X className="h-4 w-4"/></button></header><form onSubmit={onSubmit} className="grid gap-4 p-5 sm:grid-cols-2"><Field label="Family name"><input required className={inputClass} value={family.familyName} onChange={(e) => setFamily({ ...family, familyName: e.target.value })}/></Field><Field label="Primary guardian"><input required className={inputClass} value={family.primaryGuardian} onChange={(e) => setFamily({ ...family, primaryGuardian: e.target.value })}/></Field><Field label="Secondary guardian"><input className={inputClass} value={family.secondaryGuardian} onChange={(e) => setFamily({ ...family, secondaryGuardian: e.target.value })}/></Field><Field label="Phone"><input className={inputClass} value={family.phone} onChange={(e) => setFamily({ ...family, phone: e.target.value })}/></Field><Field label="Email"><input type="email" className={inputClass} value={family.email} onChange={(e) => setFamily({ ...family, email: e.target.value })}/></Field><Field label="Funding"><select className={inputClass} value={family.subsidy} onChange={(e) => setFamily({ ...family, subsidy: e.target.value })}>{!fundingOptions.includes(family.subsidy as (typeof fundingOptions)[number]) && family.subsidy && <option>{family.subsidy}</option>}{fundingOptions.map((source) => <option key={source}>{source}</option>)}</select></Field><Field label="Transportation"><input className={inputClass} value={family.transportation} onChange={(e) => setFamily({ ...family, transportation: e.target.value })}/></Field><Field label="Status"><select className={inputClass} value={family.status} onChange={(e) => setFamily({ ...family, status: e.target.value as FamilyRecord["status"] })}><option>Active</option><option>Enrollment Pending</option><option>Inactive</option></select></Field><div className="sm:col-span-2 flex justify-end gap-2 border-t border-slate-200 pt-4"><button type="button" disabled={saving} onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-black">Cancel</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving && <LoaderCircle className="h-4 w-4 animate-spin"/>} Save Family</button></div></form></section></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm font-bold text-slate-800">{value}</p></div>; }
