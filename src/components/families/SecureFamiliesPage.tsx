"use client";
import ChoiceSelect from "@/components/forms/ChoiceSelect";
import FamilyChildContacts from "@/components/families/FamilyChildContacts";
import { familyContactsDiffer, assertFamilyContactEditScope } from "@/lib/child-family";
import { Modal } from "@/components/hub/HubUI";
import { applyFamilyEdits, familyChildIdentity } from "@/lib/family-edit";
import { withRequestTimeout } from "@/lib/request-timeout";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { deriveFamiliesFromChildren, familyChildren } from "@/lib/family-derived";
import { fundingSources, normalizeFundingSource, type ChildRecord } from "@/lib/children";
import type { FamilyRecord } from "@/lib/hub-data";
import { Database, LoaderCircle, Mail, Phone, RefreshCw, Search, ShieldCheck, Users, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

const inputClass = "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100";
const isPrivateFunding = (value: string) => /^cash pay$/i.test(normalizeFundingSource(value));

export default function SecureFamiliesPage() {
  const { session, canManageSystem, isLocationLicensee } = useAuth();
  const canManage = canManageSystem || isLocationLicensee;
  const accessToken = session?.access_token;
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All Statuses");
  const [selected, setSelected] = useState<FamilyRecord | null>(null);
  const [editing, setEditing] = useState<FamilyRecord | null>(null);
  const [editSnapshot, setEditSnapshot] = useState<{ family: FamilyRecord; members: ChildRecord[] } | null>(null);
  const saveInFlight = useRef(false);
  const editingOpen = editing !== null;

  const request = useCallback(async (method: "GET" | "POST", body?: Record<string, unknown>) => {
    if (!accessToken) throw new Error("Your staff session is not ready yet.");
    const response = await withRequestTimeout(signal => fetch("/api/children", {
      signal,
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    }));
    const raw = await response.text();
    let payload: Record<string, unknown> = {};
    if (raw) {
      try { payload = JSON.parse(raw) as Record<string, unknown>; }
      catch { throw new Error("The Hub could not read the family response. Your edits have not been confirmed as saved."); }
    }
    if (!response.ok) throw new Error(String(payload.error || raw || "The family database request failed."));
    return payload;
  }, [accessToken]);

  const load = useCallback(async (quiet = false) => {
    if (!session?.access_token) return;
    if (!quiet) { setLoading(true); setError(""); }
    try {
      const payload = await request("GET");
      if (!Array.isArray(payload.children)) throw new Error("The family list could not be verified. Refresh before editing.");
      setChildren(payload.children as ChildRecord[]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load families.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [request, session?.access_token]);

  useEffect(() => {
    if (editingOpen) return;
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(true), 15000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [load, editingOpen]);

  const families = useMemo(() => deriveFamiliesFromChildren(children), [children]);
  const filtered = useMemo(() => families.filter((family) => {
    const query = search.trim().toLowerCase();
    const matches = !query || `${family.familyName} ${family.primaryGuardian} ${family.secondaryGuardian} ${family.phone} ${family.email} ${family.children.join(" ")}`.toLowerCase().includes(query);
    return matches && (status === "All Statuses" || family.status === status);
  }), [families, search, status]);

  function openEditor(family: FamilyRecord) {
    setError("");
    setNotice("");
    setEditSnapshot({ family: { ...family }, members: familyChildren(children, family) });
    setEditing({ ...family });
  }

  function closeEditor() {
    if (saveInFlight.current) return;
    setEditing(null);
    setEditSnapshot(null);
    setError("");
  }

  async function saveFamily(event: FormEvent) {
    event.preventDefault();
    if (!editing || !editSnapshot || !canManage || saveInFlight.current) return;
    if (!editSnapshot.members.length) return setError("No secured child records are linked to this family. Close and refresh the directory.");
    if (/^ccrc$/i.test(editing.subsidy.trim())) return setError("Choose CCRC Stage 1 or Stage 2 in Funding before saving.");
    saveInFlight.current = true;
    setSaving(true);
    setError("");
    let confirmed = 0;
    const members = [...editSnapshot.members];
    try {
      assertFamilyContactEditScope(members, editSnapshot.family, editing);
      for (let index = 0; index < members.length; index += 1) {
        const child = members[index];
        const updated = applyFamilyEdits(child, editSnapshot.family, editing);
        const payload = await request("POST", { action: "update", child: updated });
        const saved = payload.child as ChildRecord | undefined;
        if (!saved || familyChildIdentity(saved) !== familyChildIdentity(child)) {
          throw new Error("The saved child record could not be verified. Close and refresh the directory before trying again.");
        }
        members[index] = saved;
        confirmed += 1;
        setChildren(current => current.map(item => familyChildIdentity(item) === familyChildIdentity(saved) ? saved : item));
        // Keep server versions for successful rows so a partial retry cannot overwrite newer data.
        setEditSnapshot({ family: editSnapshot.family, members: [...members] });
      }
      setEditing(null);
      setEditSnapshot(null);
      setNotice(`${editing.familyName} updated across ${confirmed} child record${confirmed === 1 ? "" : "s"}.`);
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : "The family changes could not be saved.";
      setError(`${confirmed ? `${confirmed} of ${members.length} child records saved. The remaining changes are not confirmed. ` : ""}${detail} Your entries are still in this form.`);
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-6">
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div><div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black uppercase tracking-[.16em] text-emerald-800"><ShieldCheck className="h-3.5 w-3.5"/> Secured family directory</div><h1 className="mt-4 text-3xl font-black text-slate-950">Families</h1><p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">Family contact information is derived from the child records your account is authorized to see. There is no separate public or company-wide family list containing parent information.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-black"><RefreshCw className="h-4 w-4"/> Refresh</button>{canManage && <Link href="/family-access" className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-black text-violet-800"><ShieldCheck className="h-4 w-4"/> Family Access & Privacy</Link>}{canManage && <Link href="/children" className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white">Add Child / Family</Link>}</div></div></section>

    {!editing && (error || notice) && <div className={`flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-sm font-bold ${error ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}><span>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }}><X className="h-4 w-4"/></button></div>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Families Visible" value={families.length}/><Stat label="Active Families" value={families.filter((family) => family.status === "Active").length}/><Stat label="Children Linked" value={children.filter((child) => child.enrollmentStatus !== "Archived").length}/><Stat label="Subsidized Families" value={families.filter((family) => !isPrivateFunding(family.subsidy)).length}/></section>

    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><div className="grid gap-3 lg:grid-cols-[1fr_240px]"><label className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"/><input className={`${inputClass} pl-10`} placeholder="Search family, guardian, child, phone, or email" value={search} onChange={(e) => setSearch(e.target.value)}/></label><select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}><option>All Statuses</option><option>Active</option><option>Enrollment Pending</option><option>Inactive</option></select></div></section>

    {loading ? <div className="flex min-h-60 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-slate-600"><LoaderCircle className="h-6 w-6 animate-spin"/> Loading secured family records…</div> : filtered.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center"><Users className="mx-auto h-10 w-10 text-emerald-700"/><h2 className="mt-3 text-xl font-black">No families match this view</h2><p className="mt-2 text-sm text-slate-500">Families appear automatically as live child records are added.</p></div> : <section className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">{filtered.map((family) => <article key={family.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-emerald-700">{family.subsidy}</p><h2 className="mt-1 text-xl font-black">{family.familyName}</h2></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-base font-black uppercase tracking-wider">{family.status}</span></div><div className="mt-4 rounded-2xl bg-slate-50 p-4"><p className="text-base font-black uppercase tracking-wider text-slate-600">Children</p><p className="mt-1 text-sm font-bold text-slate-800">{family.children.join(", ")}</p></div><div className="mt-4 space-y-2 text-sm">{familyContactsDiffer(familyChildren(children, family)) ? <p className="font-black text-amber-900">Different parent contacts — review each child below</p> : <><p className="font-black">{family.primaryGuardian}{family.secondaryGuardian ? ` & ${family.secondaryGuardian}` : ""}</p><p className="flex items-center gap-2 text-slate-600"><Phone className="h-4 w-4"/><span translate="no" className="contents">{family.phone || "No phone entered"}</span></p><p className="flex items-center gap-2 truncate text-slate-600"><Mail className="h-4 w-4"/><span translate="no" className="contents">{family.email || "No email entered"}</span></p></>}<p className="text-slate-600"><strong>Location:</strong> {family.location}</p></div><FamilyChildContacts members={familyChildren(children, family)} canEdit={canManage} /><div className="mt-5 flex gap-2"><button onClick={() => setSelected(family)} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">Open</button>{canManage && <button onClick={() => openEditor(family)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-black">Edit Family</button>}</div></article>)}</section>}

    {selected && <FamilyModal family={selected} members={familyChildren(children, selected)} canEdit={canManage} onClose={() => setSelected(null)} />}
    {editing && <EditModal members={editSnapshot?.members ?? []} family={editing} setFamily={setEditing} saving={saving} error={error} onClose={closeEditor} onSubmit={saveFamily}/>}
  </div></MainLayout>;
}

function Stat({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800"><Database className="h-5 w-5"/></div><div><p className="text-xs font-black uppercase tracking-wider text-slate-600">{label}</p><p className="text-2xl font-black">{value}</p></div></div></div>; }

function FamilyModal({ family, members, canEdit, onClose }: { family: FamilyRecord; members: ChildRecord[]; canEdit: boolean; onClose: () => void }) {
  return <Modal title={family.familyName} description="Family account" onClose={onClose}>
    <FamilyChildContacts members={members} canEdit={canEdit} />
    <p className="mt-4 text-sm text-slate-700">Family grouping does not grant Parent Portal or pickup access. Review those permissions separately.</p>
  </Modal>;
}

function EditModal({ members, family, setFamily, saving, error, onClose, onSubmit }: { members: ChildRecord[]; family: FamilyRecord; setFamily: (family: FamilyRecord | null) => void; saving: boolean; error: string; onClose: () => void; onSubmit: (event: FormEvent) => void }) {
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error && !saving) errorRef.current?.focus(); }, [error, saving]);
  return <Modal title={`Edit ${family.familyName}`} description="Contact edits apply to the linked children. Funding, transportation and enrollment change only when you edit those fields." onClose={onClose} footer={<>
    <button type="button" disabled={saving} onClick={onClose} className="min-h-11 rounded-xl border border-slate-300 px-4 py-2.5 text-base font-bold">Cancel</button>
    <button type="submit" form="family-edit-form" disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-base font-black text-white disabled:opacity-50">{saving && <LoaderCircle className="h-4 w-4 animate-spin"/>}{saving ? "Saving…" : "Save Family"}</button>
  </>}>
    <FamilyChildContacts members={members} canEdit={!saving} /><p className="my-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">Changes in the shared form below apply to every linked child. Use the child-specific links above when parents differ.</p><form id="family-edit-form" onSubmit={onSubmit} aria-busy={saving}>
      {error && <p ref={errorRef} tabIndex={-1} role="alert" className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-base font-bold text-red-950">{error}</p>}
      <fieldset disabled={saving} className="grid min-w-0 gap-4 sm:grid-cols-2 [&_input]:min-h-11 [&_input]:text-base [&_select]:min-h-11 [&_select]:text-base">
        <Field label="Family name"><input required className={inputClass} value={family.familyName} onChange={e => setFamily({ ...family, familyName: e.target.value })}/></Field>
        <Field label="Primary guardian"><input required className={inputClass} value={family.primaryGuardian} onChange={e => setFamily({ ...family, primaryGuardian: e.target.value })}/></Field>
        <Field label="Secondary guardian"><input className={inputClass} value={family.secondaryGuardian} onChange={e => setFamily({ ...family, secondaryGuardian: e.target.value })}/></Field>
        <Field label="Phone"><input type="tel" className={inputClass} value={family.phone} onChange={e => setFamily({ ...family, phone: e.target.value })}/></Field>
        <Field label="Email"><input type="email" className={inputClass} value={family.email} onChange={e => setFamily({ ...family, email: e.target.value })}/></Field>
        <Field label="Funding"><select required className={inputClass} value={family.subsidy} onChange={e => setFamily({ ...family, subsidy: e.target.value })}>{family.subsidy === "CCRC" && <option value="CCRC" disabled>CCRC — choose Stage 1 or Stage 2</option>}{family.subsidy && family.subsidy !== "CCRC" && !fundingSources.includes(normalizeFundingSource(family.subsidy) as (typeof fundingSources)[number]) && <option>{family.subsidy}</option>}{fundingSources.map(source => <option key={source}>{source}</option>)}</select></Field>
        <Field label="Transportation"><ChoiceSelect label="Transportation" allowCustom options={["Not needed","School transportation","Home transportation","School and home transportation"]} value={family.transportation} onChange={transportation => setFamily({ ...family, transportation })}/></Field>
        <Field label="Status"><select className={inputClass} value={family.status} onChange={e => setFamily({ ...family, status: e.target.value as FamilyRecord["status"] })}><option>Active</option><option>Enrollment Pending</option><option>Inactive</option></select></Field>
      </fieldset>
    </form>
  </Modal>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>; }
