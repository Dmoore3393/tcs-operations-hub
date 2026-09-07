"use client";

import MainLayout from "@/components/layout/MainLayout";
import { canAccessRoute, useAuth } from "@/components/providers/AuthProvider";
import { deriveFamiliesFromChildren } from "@/lib/family-derived";
import {
  emptyForm,
  locations,
  type AgeGroup,
  type AttendanceStatus,
  type ChildFormState,
  type ChildRecord,
  type EnrollmentStatus,
  type LicensingStatus,
} from "@/lib/children";
import {
  AlertTriangle,
  Archive,
  Baby,
  CalendarClock,
  CheckCircle2,
  Database,
  FileWarning,
  HeartPulse,
  LoaderCircle,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

const inputClass = "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-100";

function fullName(child: ChildRecord) {
  return `${child.firstName} ${child.lastName}`.trim();
}

function parseMissingDocuments(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
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
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("All Locations");
  const [statusFilter, setStatusFilter] = useState("Active & Pending");
  const [selected, setSelected] = useState<ChildRecord | null>(null);
  const [editing, setEditing] = useState<ChildRecord | null>(null);
  const [form, setForm] = useState<ChildFormState>(emptyForm);
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
    let payload: any = {};
    if (raw) {
      try { payload = JSON.parse(raw); } catch { payload = { error: raw }; }
    }
    if (!response.ok) throw new Error(payload.error || raw || "The child database request failed.");
    return payload;
  }, [session?.access_token]);

  const load = useCallback(async (quiet = false) => {
    if (!session?.access_token) return;
    if (!quiet) setLoading(true);
    try {
      const payload = await request("GET");
      setChildren(Array.isArray(payload.children) ? payload.children : []);
      setError("");
      setSelected((current) => current ? (payload.children ?? []).find((child: ChildRecord) => child.id === current.id) ?? null : null);
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
    const q = search.trim().toLowerCase();
    return children.filter((child) => {
      const searchMatch = !q || `${fullName(child)} ${child.primaryGuardian} ${child.phone} ${child.location}`.toLowerCase().includes(q);
      const locationMatch = locationFilter === "All Locations" || child.location === locationFilter;
      const statusMatch = statusFilter === "All Statuses" || (statusFilter === "Active & Pending" ? child.enrollmentStatus !== "Archived" : child.enrollmentStatus === statusFilter);
      return searchMatch && locationMatch && statusMatch;
    }).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  }, [children, locationFilter, search, statusFilter]);

  const active = children.filter((child) => child.enrollmentStatus === "Active").length;
  const pending = children.filter((child) => child.enrollmentStatus === "Pending").length;
  const medicalAlerts = children.filter((child) => child.enrollmentStatus !== "Archived" && !/^none reported$/i.test(child.allergies || "None reported")).length;
  const missingFiles = children.filter((child) => child.enrollmentStatus !== "Archived" && child.licensingStatus === "Missing Documents").length;

  function flash(value: string) {
    setMessage(value);
    window.setTimeout(() => setMessage(""), 2600);
  }

  function resetForm() {
    setEditing(null);
    setForm({ ...emptyForm });
    setFamilyMode(families.length ? "existing" : "new");
    setSelectedFamilyId("");
    setError("");
  }

  function openAdd() {
    resetForm();
    setEditing({} as ChildRecord);
  }

  function openEdit(child: ChildRecord) {
    setEditing(child);
    setForm(childToForm(child));
    const family = families.find((item) => child.familyId ? item.id === child.familyId : item.primaryGuardian.toLowerCase() === child.primaryGuardian.toLowerCase());
    if (family) {
      setFamilyMode("existing");
      setSelectedFamilyId(family.id);
    } else {
      setFamilyMode("new");
      setSelectedFamilyId("");
    }
    setSelected(null);
    setError("");
  }

  function chooseFamily(value: string) {
    if (!value) {
      setSelectedFamilyId("");
      return;
    }
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

  async function saveChild(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    if (!form.firstName.trim() || !form.lastName.trim()) return setError("Enter the child’s first and last name.");
    if (!form.primaryGuardian.trim()) return setError("Enter at least one parent or guardian.");
    if (familyMode === "existing" && selectedFamilyId === "") return setError("Choose an existing family or select Create New Family.");
    const missingDocuments = form.licensingStatus === "Missing Documents" ? parseMissingDocuments(form.missingDocuments) : [];
    if (form.licensingStatus === "Missing Documents" && !missingDocuments.length) return setError("List the missing document(s), or choose Licensing Complete.");

    const existingFamily = selectedFamilyId === "" ? undefined : families.find((family) => family.id === selectedFamilyId);
    const familyId = existingFamily?.id ?? (editing?.id ? editing.familyId : undefined) ?? Date.now() + 1;
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
      familyName: existingFamily?.familyName ?? form.familyName.trim() || `${form.lastName.trim()} Family`,
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
      setChildren((current) => {
        const exists = current.some((item) => item.id === savedChild.id);
        return exists ? current.map((item) => item.id === savedChild.id ? savedChild : item) : [...current, savedChild];
      });
      setEditing(null);
      flash(`${fullName(savedChild)} saved securely.`);
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The child record could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive(child: ChildRecord) {
    if (!canManage) return;
    setSaving(true);
    setError("");
    try {
      const payload = await request("POST", { action: "archive", child });
      const savedChild = payload.child as ChildRecord;
      setChildren((current) => current.map((item) => item.id === savedChild.id ? savedChild : item));
      setSelected(null);
      flash(savedChild.enrollmentStatus === "Archived" ? `${fullName(savedChild)} archived.` : `${fullName(savedChild)} reactivated.`);
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The enrollment status could not be changed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-[1500px] space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-emerald-200 bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900 text-white shadow-xl">
          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[.16em] text-emerald-100"><ShieldCheck className="h-3.5 w-3.5"/> Protected child records</div>
              <h1 className="mt-4 text-3xl font-black sm:text-4xl">Children</h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-white/75">Real child and guardian information is loaded from the secured Supabase database. Saving one child updates only that child’s database row—another administrator working at the same time cannot replace the whole roster.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-black hover:bg-white/15"><RefreshCw className="h-4 w-4"/> Refresh</button>
              {canManage && <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-black text-emerald-950 shadow-lg"><Plus className="h-4 w-4"/> Add Child</button>}
            </div>
          </div>
        </section>

        {(error || message) && <div className={`flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-sm font-bold ${error ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}><span>{error || message}</span><button onClick={() => { setError(""); setMessage(""); }}><X className="h-4 w-4"/></button></div>}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={<UsersRound/>} label="Active Children" value={active} helper={`${pending} pending`} />
          <Stat icon={<FileWarning/>} label="Files Needing Attention" value={missingFiles} helper="active/pending children" />
          <Stat icon={<HeartPulse/>} label="Allergy Alerts" value={medicalAlerts} helper="review before care" />
          <Stat icon={<Database/>} label="Visible Records" value={children.length} helper="based on your access" />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1fr_260px_220px_auto]">
            <label className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search child, guardian, phone, or location"/></label>
            <select className={inputClass} value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}><option>All Locations</option>{locations.map((location) => <option key={location}>{location}</option>)}</select>
            <select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Active & Pending</option><option>All Statuses</option><option>Active</option><option>Pending</option><option>Archived</option></select>
            <div className="flex gap-2">{canUseSchedules && <Link href="/child-schedules" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700"><CalendarClock className="h-4 w-4"/> Schedules</Link>}{canUseKidKare && <Link href="/kidkare" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700"><ShieldCheck className="h-4 w-4"/> KidKare</Link>}</div>
          </div>
        </section>

        {loading ? <div className="flex min-h-64 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-slate-600"><LoaderCircle className="h-6 w-6 animate-spin"/> Loading secured child records…</div> : filtered.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center"><Baby className="mx-auto h-10 w-10 text-emerald-600"/><h2 className="mt-3 text-xl font-black text-slate-950">No children match this view</h2><p className="mt-2 text-sm text-slate-500">Add your first live child record or clear the filters.</p></div> : <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {filtered.map((child) => <article key={child.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
            <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 font-black text-emerald-800">{child.firstName.charAt(0)}{child.lastName.charAt(0)}</div><div className="min-w-0"><h2 className="truncate text-lg font-black text-slate-950">{fullName(child)}</h2><p className="text-xs font-bold text-slate-500">{child.ageGroup} • {child.location}</p></div></div><Status status={child.enrollmentStatus}/></div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><Mini label="Guardian" value={child.primaryGuardian}/><Mini label="Funding" value={child.subsidy}/><Mini label="Schedule" value={child.weeklySchedule}/><Mini label="Transportation" value={child.transportation}/></div>
            {(child.licensingStatus === "Missing Documents" || !/^none reported$/i.test(child.allergies || "None reported")) && <div className="mt-3 flex flex-wrap gap-2">{child.licensingStatus === "Missing Documents" && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-900">{child.missingDocuments.length} file item(s)</span>}{!/^none reported$/i.test(child.allergies || "None reported") && <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-black text-red-900">Medical/allergy alert</span>}</div>}
            <div className="mt-5 flex gap-2"><button onClick={() => setSelected(child)} className="flex-1 rounded-xl bg-slate-950 px-3 py-2.5 text-sm font-black text-white">Open</button>{canManage && <button onClick={() => openEdit(child)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-slate-700"><Pencil className="h-4 w-4"/></button>}</div>
          </article>)}
        </section>}

        {selected && <Modal title={fullName(selected)} onClose={() => setSelected(null)}>
          <div className="grid gap-3 sm:grid-cols-2"><Detail label="Date of birth" value={selected.dateOfBirth || "Not entered"}/><Detail label="Age group" value={selected.ageGroup}/><Detail label="Primary guardian" value={selected.primaryGuardian}/><Detail label="Phone" value={selected.phone || "Not entered"}/><Detail label="Guardian email" value={selected.guardianEmail || "Not entered"}/><Detail label="Funding" value={selected.subsidy}/><Detail label="Weekly schedule" value={selected.weeklySchedule}/><Detail label="Transportation" value={selected.transportation}/><Detail label="Allergies / medical alert" value={selected.allergies}/><Detail label="Medical / support notes" value={selected.medicalNotes}/><Detail label="Licensing" value={selected.licensingStatus}/><Detail label="Missing documents" value={selected.missingDocuments.join(", ") || "None"}/></div>
          {canManage && <div className="mt-5 flex flex-wrap gap-2"><button onClick={() => openEdit(selected)} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white"><Pencil className="mr-2 inline h-4 w-4"/>Edit Child</button><button disabled={saving} onClick={() => void toggleArchive(selected)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-black text-slate-700"><Archive className="mr-2 inline h-4 w-4"/>{selected.enrollmentStatus === "Archived" ? "Reactivate" : "Archive"}</button></div>}
        </Modal>}

        {editing && <Modal title={editing.id ? `Edit ${fullName(editing)}` : "Add Child"} onClose={() => !saving && setEditing(null)} wide>
          <form onSubmit={saveChild} className="space-y-6">
            <section><h3 className="text-sm font-black uppercase tracking-wider text-slate-500">Child</h3><div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="First name"><input required className={inputClass} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })}/></Field><Field label="Last name"><input required className={inputClass} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })}/></Field><Field label="Date of birth"><input type="date" className={inputClass} value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}/></Field><Field label="Display age"><input className={inputClass} placeholder="Example: 4 years" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })}/></Field><Field label="Age group"><select className={inputClass} value={form.ageGroup} onChange={(e) => setForm({ ...form, ageGroup: e.target.value as AgeGroup })}><option>Infant</option><option>Toddler</option><option>Preschool</option><option>School Age</option></select></Field><Field label="Location"><select className={inputClass} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}>{locations.map((location) => <option key={location}>{location}</option>)}</select></Field><Field label="Classroom"><input className={inputClass} value={form.classroom} onChange={(e) => setForm({ ...form, classroom: e.target.value })}/></Field><Field label="Enrollment status"><select className={inputClass} value={form.enrollmentStatus} onChange={(e) => setForm({ ...form, enrollmentStatus: e.target.value as EnrollmentStatus })}><option>Active</option><option>Pending</option><option>Archived</option></select></Field><Field label="Attendance today"><select className={inputClass} value={form.attendanceToday} onChange={(e) => setForm({ ...form, attendanceToday: e.target.value as AttendanceStatus })}><option>Not Scheduled</option><option>Present</option><option>Absent</option></select></Field></div></section>

            <section className="rounded-2xl bg-slate-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-black uppercase tracking-wider text-slate-500">Parent / Family</h3>{families.length > 0 && <div className="flex rounded-xl bg-white p-1 text-xs font-black shadow-sm"><button type="button" onClick={() => setFamilyMode("existing")} className={`rounded-lg px-3 py-1.5 ${familyMode === "existing" ? "bg-slate-950 text-white" : "text-slate-500"}`}>Existing Family</button><button type="button" onClick={() => { setFamilyMode("new"); setSelectedFamilyId(""); }} className={`rounded-lg px-3 py-1.5 ${familyMode === "new" ? "bg-slate-950 text-white" : "text-slate-500"}`}>Create New Family</button></div>}</div>
              {familyMode === "existing" && families.length > 0 && <Field label="Choose family"><select className={`${inputClass} mt-3`} value={selectedFamilyId} onChange={(e) => chooseFamily(e.target.value)}><option value="">Select parent/family…</option>{families.map((family) => <option key={family.id} value={family.id}>{family.familyName} • {family.primaryGuardian}</option>)}</select></Field>}
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="Family name"><input className={inputClass} disabled={familyMode === "existing" && selectedFamilyId !== ""} value={form.familyName} onChange={(e) => setForm({ ...form, familyName: e.target.value })}/></Field><Field label="Primary guardian"><input required className={inputClass} disabled={familyMode === "existing" && selectedFamilyId !== ""} value={form.primaryGuardian} onChange={(e) => setForm({ ...form, primaryGuardian: e.target.value })}/></Field><Field label="Secondary guardian"><input className={inputClass} disabled={familyMode === "existing" && selectedFamilyId !== ""} value={form.secondaryGuardian} onChange={(e) => setForm({ ...form, secondaryGuardian: e.target.value })}/></Field><Field label="Phone"><input className={inputClass} disabled={familyMode === "existing" && selectedFamilyId !== ""} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}/></Field><Field label="Email"><input type="email" className={inputClass} disabled={familyMode === "existing" && selectedFamilyId !== ""} value={form.guardianEmail} onChange={(e) => setForm({ ...form, guardianEmail: e.target.value })}/></Field><Field label="Funding"><select className={inputClass} disabled={familyMode === "existing" && selectedFamilyId !== ""} value={form.subsidy} onChange={(e) => setForm({ ...form, subsidy: e.target.value })}><option>Private Pay</option><option>CCRC</option><option>CCRC Stage 1</option><option>CCRC Stage 2</option><option>CCCC</option><option>DCFS</option><option>Respite</option></select></Field></div>
            </section>

            <section><h3 className="text-sm font-black uppercase tracking-wider text-slate-500">Care & Safety</h3><div className="mt-3 grid gap-4 sm:grid-cols-2"><Field label="Weekly schedule"><textarea className={`${inputClass} min-h-24`} value={form.weeklySchedule} onChange={(e) => setForm({ ...form, weeklySchedule: e.target.value })}/></Field><Field label="Transportation"><textarea className={`${inputClass} min-h-24`} value={form.transportation} onChange={(e) => setForm({ ...form, transportation: e.target.value })}/></Field><Field label="Allergies / medical alerts"><textarea className={`${inputClass} min-h-24`} value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })}/></Field><Field label="Medical / support notes"><textarea className={`${inputClass} min-h-24`} value={form.medicalNotes} onChange={(e) => setForm({ ...form, medicalNotes: e.target.value })}/></Field><Field label="Licensing status"><select className={inputClass} value={form.licensingStatus} onChange={(e) => setForm({ ...form, licensingStatus: e.target.value as LicensingStatus })}><option>Complete</option><option>Missing Documents</option></select></Field>{form.licensingStatus === "Missing Documents" && <Field label="Missing documents (comma separated)"><input className={inputClass} value={form.missingDocuments} onChange={(e) => setForm({ ...form, missingDocuments: e.target.value })}/></Field>}</div></section>

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-5"><button type="button" disabled={saving} onClick={() => setEditing(null)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-black text-slate-700">Cancel</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving && <LoaderCircle className="h-4 w-4 animate-spin"/>} Save Child Securely</button></div>
          </form>
        </Modal>}
      </div>
    </MainLayout>
  );
}

function Stat({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: number; helper: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">{icon}</div><div><p className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</p><p className="text-2xl font-black text-slate-950">{value}</p></div></div><p className="mt-2 text-xs text-slate-500">{helper}</p></div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-xl bg-slate-50 p-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 truncate font-bold text-slate-700">{value || "Not entered"}</p></div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm font-bold text-slate-800">{value}</p></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>; }
function Status({ status }: { status: EnrollmentStatus }) { const cls = status === "Active" ? "bg-emerald-100 text-emerald-800" : status === "Pending" ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-700"; return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${cls}`}>{status}</span>; }
function Modal({ title, onClose, wide = false, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) { return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 sm:p-5"><button aria-label="Close" className="absolute inset-0" onClick={onClose}/><section className={`relative z-10 max-h-[94vh] w-full overflow-y-auto rounded-3xl bg-white shadow-2xl ${wide ? "max-w-6xl" : "max-w-3xl"}`}><header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur"><h2 className="text-xl font-black text-slate-950">{title}</h2><button onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-500"><X className="h-4 w-4"/></button></header><div className="p-5 sm:p-6">{children}</div></section></div>; }
