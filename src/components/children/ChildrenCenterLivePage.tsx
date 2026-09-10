"use client";

import ChildEditorModal from "@/components/children/ChildEditorModal";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { deriveFamiliesFromChildren } from "@/lib/family-derived";
import { emptyForm, type ChildFormState, type ChildRecord } from "@/lib/children";
import {
  Archive,
  Baby,
  CalendarClock,
  Download,
  FileWarning,
  HeartPulse,
  Home,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

const HERO_KIDS = "/children-center-kids.jpg";

type LiveLocation = {
  id: string;
  slug: string;
  name: string;
  fullName: string;
  capacity: number;
  programType: string;
  colorPrimary: string;
  colorSecondary: string;
};

type SiteKey = "Halcom" | "Cornejo" | "Lara" | "Division" | "21st" | "Tehachapi";

const siteOrder: SiteKey[] = ["Halcom", "Cornejo", "Lara", "Division", "21st", "Tehachapi"];
const siteTone: Record<SiteKey, { tone: string; icon: string }> = {
  Halcom: { tone: "from-[#f5e7da] to-[#fff7ef]", icon: "text-[#b95d3b]" },
  Cornejo: { tone: "from-[#e9eee2] to-[#f7faf3]", icon: "text-[#6a795d]" },
  Lara: { tone: "from-[#f8e2ad] to-[#fff7df]", icon: "text-[#d28a07]" },
  Division: { tone: "from-[#f1cfc0] to-[#fff1e9]", icon: "text-[#b95d3b]" },
  "21st": { tone: "from-[#e6ece2] to-[#f7faf4]", icon: "text-[#6a795d]" },
  Tehachapi: { tone: "from-[#f6e4d8] to-[#fff7f1]", icon: "text-[#b95d3b]" },
};

function keyFor(value: string): SiteKey {
  if (/halcom|moore family/i.test(value)) return "Halcom";
  if (/33rd|cornejo/i.test(value)) return "Cornejo";
  if (/42nd|lara/i.test(value)) return "Lara";
  if (/division|school age/i.test(value)) return "Division";
  if (/21st|cathers/i.test(value)) return "21st";
  return "Tehachapi";
}

function locationKey(location: LiveLocation): SiteKey {
  return keyFor(`${location.slug} ${location.name} ${location.fullName}`);
}

const nameOf = (child: ChildRecord) => `${child.firstName} ${child.lastName}`.trim();
const initials = (child: ChildRecord) => `${child.firstName?.[0] ?? ""}${child.lastName?.[0] ?? ""}`.toUpperCase();

const toForm = (child: ChildRecord): ChildFormState => ({
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
});

export default function ChildrenCenterLivePage() {
  const { session, isEmployee } = useAuth();
  const canManage = !isEmployee;
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [locations, setLocations] = useState<LiveLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("All Locations");
  const [ageFilter, setAgeFilter] = useState("All Children");
  const [payFilter, setPayFilter] = useState("All Pay Sources");
  const [editing, setEditing] = useState<ChildRecord | null>(null);
  const [selected, setSelected] = useState<ChildRecord | null>(null);
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
    try {
      payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    } catch {
      payload = { error: raw };
    }
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "The child database request failed.");
    return payload;
  }, [session?.access_token]);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const payload = await request("GET");
      setChildren(Array.isArray(payload.children) ? payload.children as ChildRecord[] : []);
      setLocations(Array.isArray(payload.locations) ? payload.locations as LiveLocation[] : []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load child records.");
    } finally {
      setLoading(false);
    }
  }, [request, session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  const live = children.filter((child) => child.enrollmentStatus !== "Archived");
  const active = live.filter((child) => child.enrollmentStatus === "Active");
  const pending = live.filter((child) => child.enrollmentStatus === "Pending");
  const families = useMemo(() => deriveFamiliesFromChildren(live), [live]);
  const fileAlerts = live.filter((child) => child.licensingStatus === "Missing Documents").length;
  const healthAlerts = live.filter((child) => !/^none reported$/i.test(child.allergies || "None reported")).length;
  const paySources = useMemo(() => [...new Set(live.map((child) => child.subsidy).filter(Boolean))].sort(), [live]);

  const siteRows = useMemo(() => locations.map((location) => {
    const key = locationKey(location);
    const enrolled = active.filter((child) => keyFor(child.location) === key).length;
    const capacity = Math.max(0, Number(location.capacity) || 0);
    const open = Math.max(0, capacity - enrolled);
    return {
      ...location,
      key,
      enrolled,
      open,
      pct: capacity > 0 ? Math.min(100, Math.round((enrolled / capacity) * 100)) : 0,
      ...siteTone[key],
    };
  }).sort((a, b) => siteOrder.indexOf(a.key) - siteOrder.indexOf(b.key)), [locations, active]);

  const totalCapacity = siteRows.reduce((sum, site) => sum + site.capacity, 0);
  const enrolledInVisibleSites = siteRows.reduce((sum, site) => sum + site.enrolled, 0);
  const openSpots = siteRows.reduce((sum, site) => sum + site.open, 0);
  const capacityPct = totalCapacity > 0 ? Math.min(100, Math.round((enrolledInVisibleSites / totalCapacity) * 100)) : 0;

  const filtered = live.filter((child) =>
    (!search || `${nameOf(child)} ${child.primaryGuardian} ${child.location} ${child.subsidy}`.toLowerCase().includes(search.toLowerCase())) &&
    (siteFilter === "All Locations" || keyFor(child.location) === siteFilter) &&
    (ageFilter === "All Children" || child.ageGroup === ageFilter) &&
    (payFilter === "All Pay Sources" || child.subsidy === payFilter)
  ).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };

  function openAdd() {
    setEditing({} as ChildRecord);
    setForm({ ...emptyForm });
    setFamilyMode(families.length ? "existing" : "new");
    setSelectedFamilyId("");
    setError("");
  }

  function openEdit(child: ChildRecord) {
    setEditing(child);
    setForm(toForm(child));
    const family = families.find((item) => child.familyId ? item.id === child.familyId : item.primaryGuardian.toLowerCase() === child.primaryGuardian.toLowerCase());
    setFamilyMode(family ? "existing" : "new");
    setSelectedFamilyId(family?.id ?? "");
    setSelected(null);
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
    if (familyMode === "existing" && selectedFamilyId === "") return setError("Choose an existing family or Create New Family.");
    const family = selectedFamilyId === "" ? undefined : families.find((item) => item.id === selectedFamilyId);
    const missingDocuments = form.licensingStatus === "Missing Documents" ? form.missingDocuments.split(",").map((item) => item.trim()).filter(Boolean) : [];
    const child: ChildRecord = {
      id: editing?.id || Date.now(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      age: form.age.trim() || "Age not entered",
      dateOfBirth: form.dateOfBirth,
      ageGroup: form.ageGroup,
      location: form.location,
      classroom: form.classroom.trim() || `${form.ageGroup} Room`,
      primaryGuardian: family?.primaryGuardian ?? form.primaryGuardian.trim(),
      secondaryGuardian: (family?.secondaryGuardian ?? form.secondaryGuardian.trim()) || undefined,
      phone: family?.phone ?? form.phone.trim(),
      familyId: family?.id ?? editing?.familyId ?? Date.now() + 1,
      familyName: family?.familyName ?? (form.familyName.trim() || `${form.lastName.trim()} Family`),
      guardianEmail: (family?.email ?? form.guardianEmail.trim()) || undefined,
      subsidy: family?.subsidy ?? form.subsidy,
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
    try {
      const payload = await request("POST", { action: "save", child });
      const saved = payload.child as ChildRecord;
      setChildren((current) => current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
      setEditing(null);
      flash(`${nameOf(saved)} saved securely.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save child.");
    } finally {
      setSaving(false);
    }
  }

  async function archive(child: ChildRecord) {
    setSaving(true);
    try {
      const payload = await request("POST", { action: "archive", child });
      const saved = payload.child as ChildRecord;
      setChildren((current) => current.map((item) => item.id === saved.id ? saved : item));
      setSelected(null);
      flash(`${nameOf(child)} archived.`);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Could not archive child.");
    } finally {
      setSaving(false);
    }
  }

  function exportRoster() {
    const rows = [
      ["Child", "Age", "Location", "Age Group", "Schedule", "Pay Source", "Status"],
      ...filtered.map((child) => [nameOf(child), child.age, keyFor(child.location), child.ageGroup, child.weeklySchedule, child.subsidy, child.enrollmentStatus]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    anchor.download = "tcs-child-roster.csv";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  return <MainLayout><div className="woodland-center mx-auto w-full max-w-[1500px] text-[#293423]"><div className="woodland-inner space-y-3 pb-3">
    <section className="woodland-hero">
      <div className="wood-sign">
        <p className="woodland-eyebrow">The Hub</p>
        <h1 className="woodland-title">Children Center</h1>
        <p className="woodland-subtitle">Enrollment, capacity, and child records in one place.</p>
      </div>
      <p className="woodland-tagline">🌿 Growing children, stronger communities.</p>
      <img src={HERO_KIDS} alt="Four smiling children" className="woodland-kids" />
      <div className="woodland-note">Kind<br/>Connected<br/>Confident<br/><strong>Brighter Tomorrows</strong></div>
    </section>

    {(error || notice) && <div className={`flex justify-between rounded-xl border px-4 py-2 text-sm font-bold ${error ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}><span>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }}><X className="h-4 w-4" /></button></div>}

    <section className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
      {loading && siteRows.length === 0 ? Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-[116px] animate-pulse rounded-xl bg-[#f2eee7]" />) : siteRows.map((site) => <button key={site.id || site.slug} onClick={() => setSiteFilter(site.key)} className={`woodland-grid-card bg-gradient-to-br ${site.tone} text-left transition`}>
        <div className="woodland-location-head justify-between"><span className="flex items-center gap-2"><Home className={`h-5 w-5 ${site.icon}`} /><strong>{site.key}</strong></span><span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{site.programType}</span></div>
        <div className="grid grid-cols-3 divide-x divide-[#e5dacb] p-3 text-center"><Cell n={site.capacity} l="Capacity" /><Cell n={site.enrolled} l="Enrolled" /><Cell n={site.open} l="Open Spots" hot /></div>
      </button>)}
    </section>

    <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><MiniStat icon={<UsersRound />} n={active.length} l="Total Enrolled" /><MiniStat icon={<Baby />} n={openSpots} l="Open Spots" /><MiniStat icon={<CalendarClock />} n={pending.length} l="Pending Enrollment" /><MiniStat icon={<UsersRound />} n={families.length} l="Active Families" /><MiniStat icon={<FileWarning />} n={fileAlerts} l="Documents Missing" /></section>

    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_330px]">
      <div className="space-y-3">
        <section className="woodland-filter rounded-2xl p-3">
          <div className="flex flex-wrap gap-2"><Pill active={ageFilter === "All Children"} onClick={() => setAgeFilter("All Children")}>All Children ({live.length})</Pill>{["Infant", "Toddler", "Preschool", "School Age"].map((age) => <Pill key={age} active={ageFilter === age} onClick={() => setAgeFilter(age)}>{age} ({live.filter((child) => child.ageGroup === age).length})</Pill>)}</div>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_180px_180px]"><label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search child, family, or pay source…" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#a9b49e]" /></label><select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"><option>All Locations</option>{siteRows.map((site) => <option key={site.key}>{site.key}</option>)}</select><select value={payFilter} onChange={(event) => setPayFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"><option>All Pay Sources</option>{paySources.map((source) => <option key={source}>{source}</option>)}</select></div>
        </section>

        <section className="woodland-table-panel">
          {loading ? <div className="flex min-h-56 items-center justify-center gap-2 text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading secured child records…</div> : filtered.length === 0 ? <div className="p-12 text-center"><Baby className="mx-auto h-9 w-9 text-[#718164]" /><h2 className="mt-2 font-black">No children match this view</h2></div> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-[#faf7f1] text-xs text-slate-500"><tr>{["Child", "Age", "Location", "Program / Age Group", "Schedule", "Pay Source", "Status", "Actions"].map((heading) => <th key={heading} className="px-4 py-3 font-black">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((child) => <tr key={child.id} className="hover:bg-[#fffaf1]"><td className="px-4 py-3"><button onClick={() => setSelected(child)} className="flex items-center gap-3 font-black"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#e7eee1] text-xs text-[#506447]">{initials(child)}</span>{nameOf(child)}</button></td><td className="px-4 py-3">{child.age}</td><td className="px-4 py-3">{keyFor(child.location)}</td><td className="px-4 py-3">{child.ageGroup}</td><td className="max-w-40 truncate px-4 py-3">{child.weeklySchedule}</td><td className="px-4 py-3">{child.subsidy}</td><td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-xs font-black ${child.enrollmentStatus === "Active" ? "bg-[#dceedd] text-[#315b36]" : "bg-amber-100 text-amber-800"}`}>{child.enrollmentStatus}</span></td><td className="px-4 py-3"><div className="flex gap-2"><button onClick={() => setSelected(child)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black">View File</button><button onClick={() => setSelected(child)} className="rounded-lg border border-slate-200 p-1.5"><MoreHorizontal className="h-4 w-4" /></button></div></td></tr>)}</tbody></table></div>}
        </section>

        <section className="flex flex-wrap gap-3">{canManage && <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-xl bg-[#445b37] px-5 py-3 text-sm font-black text-white"><Plus className="h-4 w-4" /> Add Child</button>}<Link href="/enrollment-pipeline" className="inline-flex items-center gap-2 rounded-xl bg-[#b95d3b] px-5 py-3 text-sm font-black text-white"><FileWarning className="h-4 w-4" /> Start Enrollment</Link><Link href="/child-schedules" className="inline-flex items-center gap-2 rounded-xl border border-[#e6dfd4] bg-[#fffaf2] px-5 py-3 text-sm font-black"><CalendarClock className="h-4 w-4" /> Child Schedules</Link><button onClick={exportRoster} className="inline-flex items-center gap-2 rounded-xl border border-[#e6dfd4] bg-[#fffaf2] px-5 py-3 text-sm font-black"><Download className="h-4 w-4" /> Export Roster</button></section>
      </div>

      <aside className="space-y-3">
        <section className="rounded-xl border border-[#e7dfd3] bg-[#fffdf8] p-4 shadow-sm"><h2 className="font-black">Enrollment Snapshot</h2><div className="mt-4 flex items-center gap-4"><div className="grid h-32 w-32 place-items-center rounded-full" style={{ background: `conic-gradient(#5d7557 ${capacityPct}%, #f1d2a5 0)` }}><div className="grid h-[86px] w-[86px] place-items-center rounded-full bg-[#fffdf8] text-center"><div><p className="text-2xl font-black">{enrolledInVisibleSites}</p><p className="text-[10px] font-semibold">Enrolled<br />({capacityPct}% capacity)</p></div></div></div><div className="space-y-2 text-sm"><p><i className="mr-2 inline-block h-3 w-3 rounded-full bg-[#5d7557]" />Enrolled <strong>{enrolledInVisibleSites}</strong></p><p><i className="mr-2 inline-block h-3 w-3 rounded-full bg-[#f1d2a5]" />Open Spots <strong>{openSpots}</strong></p><p className="pt-2 text-xs text-slate-500">Licensed Capacity</p><p className="text-lg font-black">{totalCapacity}</p></div></div></section>
        <section className="rounded-xl border border-[#e7dfd3] bg-[#fffdf8] p-4 shadow-sm"><h2 className="font-black">Capacity by Location</h2><div className="mt-3 space-y-3">{siteRows.map((site) => <div key={site.key} className="grid grid-cols-[74px_1fr_48px] items-center gap-2 text-xs"><span className="font-semibold">{site.key}</span><div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full" style={{ width: `${site.pct}%`, backgroundColor: site.colorPrimary || "#718164" }} /></div><span className="text-right font-black">{site.enrolled}/{site.capacity}</span></div>)}</div><p className="mt-6 text-center font-serif italic text-[#80523b]">More children.<br />Brighter communities.</p></section>
        <section className="rounded-xl border border-[#e7dfd3] bg-[#fff8ed] p-4 shadow-sm"><h2 className="font-black">Needs Attention</h2><div className="mt-3 space-y-3"><Action icon={<FileWarning />} n={fileAlerts} label="Missing Child Files" /><Action icon={<CalendarClock />} n={pending.length} label="Pending Enrollments" /><Action icon={<HeartPulse />} n={healthAlerts} label="Health / Allergy Alerts" /></div></section>
        <section className="woodland-quote p-5"><p className="font-serif text-lg italic">“Every child belongs.<br />Every family matters.”</p><p className="mt-2 text-xs font-black uppercase tracking-wider">— The Hub</p></section>
      </aside>
    </div>

    <section className="woodland-footer">
      <span className="woodland-animal left" aria-hidden="true">🐿️</span>
      <p className="woodland-footer-copy">Same people. Brighter futures. 🌿</p>
      <div className="woodland-footer-sign">Stronger Children<br/>Brighter Tomorrows</div>
      <span className="woodland-animal right" aria-hidden="true">🦌</span>
    </section>

    {editing && <ChildEditorModal title={editing.id ? `Edit ${nameOf(editing)}` : "Add Child"} form={form} setForm={setForm} families={families} familyMode={familyMode} setFamilyMode={setFamilyMode} selectedFamilyId={selectedFamilyId} chooseFamily={chooseFamily} saving={saving} onClose={() => setEditing(null)} onSubmit={saveChild} />}
    {selected && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4"><button className="absolute inset-0" onClick={() => setSelected(null)} aria-label="Close" /><section className="relative z-10 w-full max-w-2xl rounded-3xl bg-[#fffdf9] p-6 shadow-2xl"><div className="flex justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-[#718164]">Child File</p><h2 className="text-2xl font-black">{nameOf(selected)}</h2><p className="text-sm text-slate-500">{selected.age} • {keyFor(selected.location)} • {selected.ageGroup}</p></div><button onClick={() => setSelected(null)}><X /></button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><Detail l="Parent / Guardian" v={selected.primaryGuardian} /><Detail l="Phone" v={selected.phone} /><Detail l="Schedule" v={selected.weeklySchedule} /><Detail l="Pay Source" v={selected.subsidy} /><Detail l="Transportation" v={selected.transportation} /><Detail l="File Status" v={selected.licensingStatus} /><Detail l="Allergies / Alerts" v={selected.allergies} /><Detail l="Support Notes" v={selected.medicalNotes} /></div>{canManage && <div className="mt-5 flex justify-end gap-2"><button onClick={() => openEdit(selected)} className="inline-flex items-center gap-2 rounded-xl bg-[#445b37] px-4 py-2.5 text-sm font-black text-white"><Pencil className="h-4 w-4" /> Edit File</button><button onClick={() => void archive(selected)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-black"><Archive className="h-4 w-4" /> Archive</button></div>}</section></div>}
  </div></div></MainLayout>;
}

function Cell({ n, l, hot = false }: { n: number; l: string; hot?: boolean }) {
  return <div><p className={`text-xl font-black ${hot ? "text-[#b95d3b]" : ""}`}>{n}</p><p className="text-[9px] text-slate-500">{l}</p></div>;
}

function MiniStat({ icon, n, l }: { icon: ReactNode; n: number; l: string }) {
  return <div className="woodland-stat"><span className="woodland-stat-icon">{icon}</span><div><p className="text-2xl font-black leading-none">{n}</p><p className="mt-1 text-xs font-semibold text-slate-500">{l}</p></div></div>;
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} className={`woodland-pill ${active ? "woodland-pill-active" : "woodland-pill-idle"}`}>{children}</button>;
}

function Action({ icon, n, label }: { icon: ReactNode; n: number; label: string }) {
  return <div className="flex items-center gap-3 rounded-lg bg-white px-3 py-2"><span className="text-[#b95d3b]">{icon}</span><p className="text-sm"><strong>{n}</strong> {label}</p></div>;
}

function Detail({ l, v }: { l: string; v: string }) {
  return <div className="rounded-xl bg-[#f7f4ee] p-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{l}</p><p className="mt-1 text-sm font-bold text-slate-800">{v || "Not entered"}</p></div>;
}
