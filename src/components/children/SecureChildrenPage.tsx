"use client";

import MainLayout from "@/components/layout/MainLayout";
import { canAccessRoute, useAuth } from "@/components/providers/AuthProvider";
import ChildEditorModal from "@/components/children/ChildEditorModal";
import { deriveFamiliesFromChildren } from "@/lib/family-derived";
import { emptyForm, locations, type ChildFormState, type ChildRecord, type EnrollmentStatus } from "@/lib/children";
import { Archive, Baby, CalendarClock, Database, FileWarning, HeartPulse, LoaderCircle, Pencil, Plus, RefreshCw, Search, ShieldCheck, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

const inputClass = "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100";

function fullName(child: ChildRecord) {
  return `${child.firstName} ${child.lastName}`.trim();
}

function childToForm(child: ChildRecord): ChildFormState {
  return {
    firstName: child.firstName,
    lastName: child.lastName,
    age: child.age,
    dateOfBirth: child.dateOfBirth,
    ageGroup: child.ageGroup,
    location: child.location,
    classroom: child.classroom,
    primaryGuardian: child.primaryGuardian,
    secondaryGuardian: child.secondaryGuardian ?? "",
    phone: child.phone,
    familyName: child.familyName ?? "",
    guardianEmail: child.guardianEmail ?? "",
    subsidy: child.subsidy,
    weeklySchedule: child.weeklySchedule,
    transportation: child.transportation,
    allergies: child.allergies,
    medicalNotes: child.medicalNotes,
    licensingStatus: child.licensingStatus,
    missingDocuments: child.missingDocuments.join(", "),
    enrollmentStatus: child.enrollmentStatus,
    attendanceToday: child.attendanceToday,
  };
}

export default function SecureChildrenPage() {
  const { session, profile, isEmployee } = useAuth();
  const canManage = !isEmployee;
  const canUseKidKare = canAccessRoute(profile, "/kidkare");
  const canUseSchedules = canAccessRoute(profile, "/child-schedules");
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("All Locations");
  const [statusFilter, setStatusFilter] = useState("Active & Pending");
  const [selected, setSelected] = useState<ChildRecord | null>(null);
  const [editing, setEditing] = useState<ChildRecord | null>(null);
  const [form, setForm] = useState<ChildFormState>({ ...emptyForm });
  const [familyMode, setFamilyMode] = useState<"existing" | "new">("new");
  const [selectedFamilyId, setSelectedFamilyId] = useState<number | "">("");

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
    if (!response.ok) throw new Error(String(payload.error || raw || "The child database request failed."));
    return payload;
  }, [session?.access_token]);

  const load = useCallback(async (quiet = false) => {
    if (!session?.access_token) return;
    if (!quiet) setLoading(true);
    try {
      const payload = await request("GET");
      const next = Array.isArray(payload.children) ? payload.children as ChildRecord[] : [];
      setChildren(next);
      setError("");
      setSelected((current) => current ? next.find((child) => child.id === current.id) ?? null : null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the child database.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [request, session?.access_token]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const families = useMemo(() => deriveFamiliesFromChildren(children.filter((child) => child.enrollmentStatus !== "Archived")), [children]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return children.filter((child) => {
      const searchMatch = !query || `${fullName(child)} ${child.primaryGuardian} ${child.phone} ${child.location}`.toLowerCase().includes(query);
      const locationMatch = locationFilter === "All Locations" || child.location === locationFilter;
      const statusMatch = statusFilter === "All Statuses" || (statusFilter === "Active & Pending" ? child.enrollmentStatus !== "Archived" : child.enrollmentStatus === statusFilter);
      return searchMatch && locationMatch && statusMatch;
    }).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  }, [children, locationFilter, search, statusFilter]);

  const active = children.filter((child) => child.enrollmentStatus === "Active").length;
  const pending = children.filter((child) => child.enrollmentStatus === "Pending").length;
  const fileAlerts = children.filter((child) => child.enrollmentStatus !== "Archived" && child.licensingStatus === "Missing Documents").length;
  const healthAlerts = children.filter((child) => child.enrollmentStatus !== "Archived" && !/^none reported$/i.test(child.allergies || "None reported")).length;

  function showNotice(value: string) {
    setNotice(value);
    window.setTimeout(() => setNotice(""), 2600);
  }

  function openAdd() {
    setEditing({} as ChildRecord);
    setForm({ ...emptyForm });
    setFamilyMode(families.length ? "existing" : "new");
    setSelectedFamilyId("");
    setError("");
  }

  function openEdit(child: ChildRecord) {
    setEditing(child);
    setForm(childToForm(child));
    const linked = families.find((family) => child.familyId ? family.id === child.familyId : family.primaryGuardian.toLowerCase() === child.primaryGuardian.toLowerCase());
    setFamilyMode(linked ? "existing" : "new");
    setSelectedFamilyId(linked?.id ?? "");
    setSelected(null);
    setError("");
  }

  function chooseFamily(value: string) {
    if (!value) return setSelectedFamilyId("");
    const family = families.find((item) => item.id === Number(value));
    if (!family) return;
    setSelectedFamilyId(family.id);
    setForm((current) => ({
      ...current,
      familyName: family.familyName,
      primaryGuardian: family.primaryGuardian,
      secondaryGuardian: family.secondaryGuardian,
      phone: family.phone,
      guardianEmail: family.email,
      subsidy: family.subsidy,
    }));
  }

  async function saveChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    if (!form.firstName.trim() || !form.lastName.trim()) return setError("Enter the child’s first and last name.");
    if (!form.primaryGuardian.trim()) return setError("Enter at least one parent or guardian.");
    if (familyMode === "existing" && selectedFamilyId === "") return setError("Choose an existing family or select Create New Family.");
    const missingDocuments = form.licensingStatus === "Missing Documents" ? form.missingDocuments.split(",").map((item) => item.trim()).filter(Boolean) : [];
    if (form.licensingStatus === "Missing Documents" && !missingDocuments.length) return setError("List the missing document(s), or choose Licensing Complete.");

    const existingFamily = selectedFamilyId === "" ? undefined : families.find((family) => family.id === selectedFamilyId);
    const familyId = existingFamily?.id ?? (editing?.id ? editing.familyId : undefined) ?? Date.now() + 1;
    const familyName = existingFamily?.familyName ?? (form.familyName.trim() || `${form.lastName.trim()} Family`);
    const child: ChildRecord = {
      id: editing?.id || Date.now(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      age: form.age.trim() || "Age not entered",
      dateOfBirth: form.dateOfBirth,
      ageGroup: form.ageGroup,
      location: form.location,
      classroom: form.classroom.trim() || `${form.ageGroup} Room`,
      primaryGuardian: existingFamily?.primaryGuardian ?? form.primaryGuardian.trim(),
      secondaryGuardian: (existingFamily?.secondaryGuardian ?? form.secondaryGuardian.trim()) || undefined,
      phone: existingFamily?.phone ?? form.phone.trim(),
      familyId,
      familyName,
      guardianEmail: (existingFamily?.email ?? form.guardianEmail.trim()) || undefined,
      subsidy: existingFamily?.subsidy ?? form.subsidy,
      weeklySchedule: form.weeklySchedule.trim() || "Schedule not entered",
      transportation: form.transportation.trim() || "No transportation",
      allergies: form.allergies.trim() || "None reported",
      medicalNotes: form.medicalNotes.trim() || "No current medical notes",
      licensingStatus: form.licensingStatus,
      missingDocuments,
      enrollmentStatus: form.enrollmentStatus,
      attendanceToday: form.attendanceToday,
    };

    setSaving(true);
    setError("");
    try {
      const payload = await request("POST", { action: "save", child });
      const savedChild = payload.child as ChildRecord;
      setChildren((current) => current.some((item) => item.id === savedChild.id)
        ? current.map((item) => item.id === savedChild.id ? savedChild : item)
        : [...current, savedChild]);
      setEditing(null);
      showNotice(`${fullName(savedChild)} saved securely.`);
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The child record could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive(child: ChildRecord) {
    setSaving(true);
    setError("");
    try {
      const payload = await request("POST", { action: "archive", child });
      const savedChild = payload.child as ChildRecord;
      setChildren((current) => current.map((item) => item.id === savedChild.id ? savedChild : item));
      setSelected(null);
      showNotice(savedChild.enrollmentStatus === "Archived" ? `${fullName(savedChild)} archived.` : `${fullName(savedChild)} reactivated.`);
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The enrollment status could not be changed.");
    } finally {
      setSaving(false);
    }
  }

  return <MainLayout><div className="mx-auto w-full max-w-[1500px] space-y-6">
    <section className="overflow-hidden rounded-[2rem] border border-emerald-200 bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900 text-white shadow-xl"><div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center"><div><div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[.16em] text-emerald-100"><ShieldCheck className="h-3.5 w-3.5"/> Protected child records</div><h1 className="mt-4 text-3xl font-black sm:text-4xl">Children</h1><p className="mt-2 max-w-3xl text-sm leading-7 text-white/75">Each save writes only that child’s secured database row. Live child information is not stored in the website source code.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-black"><RefreshCw className="h-4 w-4"/> Refresh</button>{canManage && <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-black text-emerald-950"><Plus className="h-4 w-4"/> Add Child</button>}</div></div></section>

    {(error || notice) && <div className={`flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-sm font-bold ${error ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}><span>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }}><X className="h-4 w-4"/></button></div>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat icon={<UsersRound/>} label="Active Children" value={active} helper={`${pending} pending`}/><Stat icon={<FileWarning/>} label="File Alerts" value={fileAlerts} helper="active/pending"/><Stat icon={<HeartPulse/>} label="Health Alerts" value={healthAlerts} helper="review before care"/><Stat icon={<Database/>} label="Visible Records" value={children.length} helper="based on your access"/></section>

    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><div className="grid gap-3 lg:grid-cols-[1fr_260px_220px_auto]"><label className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input className={`${inputClass} pl-10`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search child, guardian, phone, or location"/></label><select className={inputClass} value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}><option>All Locations</option>{locations.map((location) => <option key={location}>{location}</option>)}</select><select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option>Active & Pending</option><option>All Statuses</option><option>Active</option><option>Pending</option><option>Archived</option></select><div className="flex gap-2">{canUseSchedules && <Link href="/child-schedules" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black"><CalendarClock className="h-4 w-4"/> Schedules</Link>}{canUseKidKare && <Link href="/kidkare" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black"><ShieldCheck className="h-4 w-4"/> KidKare</Link>}</div></div></section>

    {loading ? <div className="flex min-h-64 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-slate-600"><LoaderCircle className="h-6 w-6 animate-spin"/> Loading secured child records…</div> : filtered.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center"><Baby className="mx-auto h-10 w-10 text-emerald-600"/><h2 className="mt-3 text-xl font-black">No children match this view</h2><p className="mt-2 text-sm text-slate-500">Add your first live child record or clear the filters.</p></div> : <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{filtered.map((child) => <article key={child.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-black text-slate-950">{fullName(child)}</h2><p className="text-xs font-bold text-slate-500">{child.ageGroup} • {child.location}</p></div><Status status={child.enrollmentStatus}/></div><div className="mt-4 grid grid-cols-2 gap-2"><Mini label="Guardian" value={child.primaryGuardian}/><Mini label="Funding" value={child.subsidy}/><Mini label="Schedule" value={child.weeklySchedule}/><Mini label="Transportation" value={child.transportation}/></div><div className="mt-5 flex gap-2"><button onClick={() => setSelected(child)} className="flex-1 rounded-xl bg-slate-950 px-3 py-2.5 text-sm font-black text-white">Open</button>{canManage && <button onClick={() => openEdit(child)} className="rounded-xl border border-slate-200 px-3 py-2.5"><Pencil className="h-4 w-4"/></button>}</div></article>)}</section>}

    {selected && <DetailModal child={selected} canManage={canManage} saving={saving} onClose={() => setSelected(null)} onEdit={() => openEdit(selected)} onArchive={() => void toggleArchive(selected)}/>} 
    {editing && <ChildEditorModal title={editing.id ? `Edit ${fullName(editing)}` : "Add Child"} form={form} setForm={setForm} families={families} familyMode={familyMode} setFamilyMode={(mode) => { setFamilyMode(mode); if (mode === "new") setSelectedFamilyId(""); }} selectedFamilyId={selectedFamilyId} chooseFamily={chooseFamily} saving={saving} onClose={() => !saving && setEditing(null)} onSubmit={saveChild}/>} 
  </div></MainLayout>;
}

function Stat({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: number; helper: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">{icon}</div><div><p className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</p><p className="text-2xl font-black">{value}</p></div></div><p className="mt-2 text-xs text-slate-500">{helper}</p></div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-xl bg-slate-50 p-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 truncate text-xs font-bold text-slate-700">{value || "Not entered"}</p></div>; }
function Status({ status }: { status: EnrollmentStatus }) { const style = status === "Active" ? "bg-emerald-100 text-emerald-800" : status === "Pending" ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-700"; return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${style}`}>{status}</span>; }

function DetailModal({ child, canManage, saving, onClose, onEdit, onArchive }: { child: ChildRecord; canManage: boolean; saving: boolean; onClose: () => void; onEdit: () => void; onArchive: () => void }) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 sm:p-5"><button aria-label="Close" className="absolute inset-0" onClick={onClose}/><section className="relative z-10 max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl"><header className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4"><div><p className="text-xs font-black uppercase tracking-wider text-emerald-700">Child record</p><h2 className="text-xl font-black">{fullName(child)}</h2></div><button onClick={onClose} className="rounded-xl border border-slate-200 p-2"><X className="h-4 w-4"/></button></header><div className="p-5"><div className="grid gap-3 sm:grid-cols-2"><Detail label="Date of birth" value={child.dateOfBirth || "Not entered"}/><Detail label="Primary guardian" value={child.primaryGuardian}/><Detail label="Phone" value={child.phone || "Not entered"}/><Detail label="Guardian email" value={child.guardianEmail || "Not entered"}/><Detail label="Funding" value={child.subsidy}/><Detail label="Weekly schedule" value={child.weeklySchedule}/><Detail label="Transportation" value={child.transportation}/><Detail label="Allergies / alert" value={child.allergies}/><Detail label="Medical / support notes" value={child.medicalNotes}/><Detail label="Licensing" value={child.licensingStatus}/><Detail label="Missing documents" value={child.missingDocuments.join(", ") || "None"}/></div>{canManage && <div className="mt-5 flex gap-2"><button onClick={onEdit} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white">Edit Child</button><button disabled={saving} onClick={onArchive} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-black"><Archive className="mr-2 inline h-4 w-4"/>{child.enrollmentStatus === "Archived" ? "Reactivate" : "Archive"}</button></div>}</div></section></div>;
}
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm font-bold text-slate-800">{value}</p></div>; }
