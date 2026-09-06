"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle, BarChart3, CalendarDays, CheckCircle2, ClipboardCheck, ClipboardPlus,
  FileBarChart2, Filter, Heart, IdCard, ListChecks, MapPin, Pencil, Search, ShieldCheck,
  Sparkles, Star, UtensilsCrossed, UsersRound,
} from "lucide-react";

import MainLayout from "@/components/layout/MainLayout";
import { DemoNotice, inputClass, Modal, PrimaryButton, SecondaryButton, StatusBadge } from "@/components/hub/HubUI";
import { SuccessBurst } from "@/components/hub/AnimatedVisuals";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { staffInitials, useAuth } from "@/components/providers/AuthProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { initialChildren, type ChildRecord } from "@/lib/children";
import { programLocations, starterKidKareEnrollments, type KidKareEnrollment, type KidKareStatus } from "@/lib/compliance-ops";
import { localIsoDate } from "@/lib/date-utils";

const statuses: KidKareStatus[] = ["Not Started", "Information Needed", "Submitted", "Enrolled", "Needs Correction"];

const topNav = [
  { label: "Children", href: "/children", icon: UsersRound, color: "bg-blue-600" },
  { label: "Attendance", href: "/daily-care", icon: ClipboardCheck, color: "bg-green-600" },
  { label: "Meals", href: "/meals", icon: UtensilsCrossed, color: "bg-orange-500" },
  { label: "Activities", href: "/work-plans", icon: CalendarDays, color: "bg-violet-600" },
  { label: "Reports", href: "/reports", icon: BarChart3, color: "bg-blue-700" },
];

function createBlankEnrollment(children: ChildRecord[]): Omit<KidKareEnrollment, "id"> {
  const first = children.find((child) => child.enrollmentStatus !== "Archived");
  return {
    childId: first?.id ?? 0,
    childName: first ? `${first.firstName} ${first.lastName}` : "",
    location: first?.location ?? programLocations[0],
    required: true,
    status: "Not Started",
    dateAdded: "",
    completedBy: "",
    kidKareChildId: "",
    lastVerified: "",
    notes: "",
  };
}

function statusTone(status: KidKareStatus): "green" | "amber" | "red" | "blue" | "purple" | "slate" {
  if (status === "Enrolled") return "green";
  if (status === "Submitted") return "blue";
  if (status === "Needs Correction") return "red";
  if (status === "Information Needed") return "amber";
  return "slate";
}

function Donut({ percent, label }: { percent: number; label: string }) {
  const safe = Math.max(0, Math.min(100, percent));
  return (
    <div className="relative grid h-36 w-36 place-items-center rounded-full" style={{ background: `conic-gradient(#31a53a ${safe}%, #f7c531 ${safe}% 100%)` }}>
      <div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center shadow-inner">
        <div><div className="text-3xl font-black text-[#13285a]">{safe}%</div><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</div></div>
      </div>
    </div>
  );
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-xs font-black uppercase tracking-[.12em] text-slate-500">{label}</span>{children}</label>;
}

export default function KidKarePage() {
  const [records, setRecords] = usePersistentState<KidKareEnrollment[]>("tcs-kidkare-enrollments-v1", starterKidKareEnrollments);
  const [children] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const { profile } = useAuth();
  const { location: selectedHubLocation } = useHubLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | KidKareStatus>("All");
  const [locationFilter, setLocationFilter] = useState("All Locations");
  const [editing, setEditing] = useState<KidKareEnrollment | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Omit<KidKareEnrollment, "id">>(() => createBlankEnrollment([]));
  const [formMessage, setFormMessage] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  const activeChildren = useMemo(() => children.filter((child) => child.enrollmentStatus !== "Archived"), [children]);
  const hubFiltered = useMemo(() => records.filter((record) => selectedHubLocation === "All Locations" || record.location.includes(selectedHubLocation)), [records, selectedHubLocation]);
  const filtered = useMemo(() => hubFiltered.filter((record) => {
    const haystack = `${record.childName} ${record.location} ${record.kidKareChildId}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (statusFilter === "All" || record.status === statusFilter) && (locationFilter === "All Locations" || record.location === locationFilter);
  }), [hubFiltered, search, statusFilter, locationFilter]);

  const required = hubFiltered.filter((record) => record.required);
  const enrolled = required.filter((record) => record.status === "Enrolled");
  const submitted = required.filter((record) => record.status === "Submitted");
  const attention = required.filter((record) => ["Not Started", "Information Needed", "Needs Correction"].includes(record.status));
  const completion = required.length ? Math.round((enrolled.length / required.length) * 100) : 100;
  const present = activeChildren.filter((child) => child.attendanceToday === "Present").length;
  const absent = activeChildren.filter((child) => child.attendanceToday === "Absent").length;
  const other = Math.max(0, activeChildren.length - present - absent);
  const attendancePercent = activeChildren.length ? Math.round((present / activeChildren.length) * 100) : 100;
  const recent = [...hubFiltered].slice(-5).reverse();

  function openAdd() { setEditing(null); setForm(createBlankEnrollment(activeChildren)); setFormMessage(""); setModalOpen(true); }
  function openEdit(record: KidKareEnrollment) { const { id: _id, ...rest } = record; void _id; setEditing(record); setForm(rest); setFormMessage(""); setModalOpen(true); }
  function closeModal() { setEditing(null); setModalOpen(false); setForm(createBlankEnrollment(activeChildren)); setFormMessage(""); }

  function save() {
    const child = activeChildren.find((item) => item.id === form.childId);
    if (!child) return setFormMessage("Select an active child before saving.");
    const duplicate = records.some((item) => item.id !== editing?.id && item.childId === form.childId && item.location === form.location);
    if (duplicate) return setFormMessage("This child already has a KidKare record for that location.");
    const normalized = { ...form, childName: `${child.firstName} ${child.lastName}` };
    if (editing) setRecords((current) => current.map((item) => item.id === editing.id ? { ...normalized, id: editing.id } : item));
    else setRecords((current) => [...current, { ...normalized, id: Math.max(0, ...current.map((item) => item.id)) + 1 }]);
    closeModal(); setShowSuccess(true); window.setTimeout(() => setShowSuccess(false), 2200);
  }

  function quickEnroll(record: KidKareEnrollment) {
    const today = localIsoDate();
    setRecords((current) => current.map((item) => item.id === record.id ? { ...item, status: "Enrolled", dateAdded: item.dateAdded || today, lastVerified: today, completedBy: item.completedBy || staffInitials(profile) } : item));
    setShowSuccess(true); window.setTimeout(() => setShowSuccess(false), 2200);
  }

  function jumpToQueue() { document.getElementById("kidkare-enrollment-queue")?.scrollIntoView({ behavior: "smooth", block: "start" }); }

  return (
    <MainLayout>
      <SuccessBurst show={showSuccess} text="KidKare record updated" />
      <div className="mx-auto max-w-[1580px] space-y-5 pb-10">
        <section className="relative overflow-hidden rounded-[2rem] border border-blue-100 bg-white shadow-[0_18px_55px_rgba(23,62,119,.15)]">
          <div className="absolute -left-20 -top-24 h-72 w-80 rotate-12 rounded-[44%] bg-[#ffc928]" />
          <div className="absolute -right-24 -top-24 h-72 w-[38rem] -rotate-6 rounded-[45%] bg-[#1d72d2]" />
          <div className="absolute bottom-0 left-0 h-16 w-3/4 rounded-tr-[100%] bg-[#1c63bb]" />
          <div className="absolute bottom-0 right-0 h-28 w-[39rem] rounded-tl-[85%] bg-[#064d9f]" />
          <div className="relative grid min-h-[300px] gap-4 px-7 py-7 lg:grid-cols-[1.2fr_.8fr] lg:items-center lg:px-12">
            <div className="relative z-10">
              <p className="inline-flex rounded-full bg-white/90 px-4 py-1.5 text-xs font-black uppercase tracking-[.18em] text-[#15336d] shadow-sm">TCS Operations Hub • KidKare</p>
              <div className="mt-4 flex items-end gap-3"><h1 className="text-5xl font-black tracking-tight sm:text-7xl"><span className="text-[#1268c9]">Kid</span><span className="text-[#63a92f]">K</span><span className="text-[#ffbf20]">are</span></h1></div>
              <p className="mt-3 max-w-xl text-base font-bold text-slate-600">Food program, enrollment, attendance, activities, and reports — organized by child and location.</p>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {topNav.map(({ label, href, icon: Icon, color }) => <Link key={label} href={href} className="group rounded-2xl bg-white/95 p-3 text-center shadow-md ring-1 ring-slate-100 transition hover:-translate-y-1"><div className={`mx-auto grid h-12 w-12 place-items-center rounded-full text-white ${color}`}><Icon className="h-6 w-6" /></div><p className="mt-2 text-xs font-black uppercase tracking-wide text-[#142c5d]">{label}</p></Link>)}
              </div>
            </div>
            <div className="relative z-10 hidden h-[230px] lg:block">
              <div className="absolute right-10 top-2 grid h-52 w-52 place-items-center rounded-full bg-white/95 text-[105px] shadow-2xl ring-8 ring-white/20">🐊</div>
              <div className="absolute right-4 top-3 rotate-6 rounded-xl bg-red-600 px-4 py-2 text-2xl font-black italic text-white shadow-lg">TCS</div>
              <Heart className="absolute right-0 top-0 h-9 w-9 text-white" strokeWidth={2.6} /><Star className="absolute bottom-6 right-1 h-10 w-10 fill-[#ffc928] text-[#ffc928]" />
              <p className="absolute bottom-7 left-0 max-w-[220px] -rotate-3 text-right text-xl font-black leading-7 text-white">Nourishing today.<br />Brighter tomorrows. 💛</p>
            </div>
          </div>
        </section>

        <DemoNotice />

        <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-xs font-black uppercase tracking-[.18em] text-[#1769d2]">KidKare today</p><h2 className="mt-1 text-4xl font-black text-[#13285a]">Welcome back!</h2><p className="mt-1 font-semibold text-slate-500">Here’s what’s happening in your food-program workflow.</p></div>
          <div className="flex flex-wrap gap-2"><div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700"><MapPin className="h-4 w-4 text-blue-600" />{selectedHubLocation}</div><button onClick={openAdd} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white shadow-sm"><ClipboardPlus className="h-4 w-4" /> Add Enrollment</button></div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Children Enrolled", required.length, "Tracked child-location records", UsersRound, "bg-[#eef6ff]", "bg-blue-600"],
            ["Today’s Attendance", present, `${attendancePercent}% marked present`, ClipboardCheck, "bg-[#f3fae9]", "bg-green-600"],
            ["Enrollment Ready", enrolled.length, `${completion}% confirmed`, CheckCircle2, "bg-[#fff2e7]", "bg-orange-500"],
            ["Needs Action", attention.length, "Missing info or corrections", AlertTriangle, "bg-[#f5efff]", "bg-violet-600"],
            ["Reports Ready", submitted.length + enrolled.length, "Verified or submitted records", BarChart3, "bg-[#edf6ff]", "bg-blue-700"],
          ].map(([label, value, helper, Icon, box, bubble]) => <article key={String(label)} className={`rounded-2xl border border-white p-4 shadow-sm ${box}`}><div className="flex items-center gap-3"><div className={`grid h-12 w-12 place-items-center rounded-full text-white ${bubble}`}><Icon className="h-6 w-6" /></div><div><p className="text-xs font-black text-slate-600">{label}</p><p className="text-3xl font-black text-[#13285a]">{value}</p></div></div><p className="mt-2 text-xs font-semibold text-slate-500">{helper}</p></article>)}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.05fr_.95fr_.95fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h3 className="text-lg font-black text-[#13285a]">Recent Entries</h3><button onClick={jumpToQueue} className="text-xs font-black text-blue-600">View all →</button></div><div className="mt-3 divide-y divide-slate-100">{recent.map((record) => <button key={record.id} onClick={() => openEdit(record)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-slate-50"><div className={`grid h-9 w-9 place-items-center rounded-full text-white ${record.status === "Enrolled" ? "bg-green-600" : record.status === "Submitted" ? "bg-blue-600" : "bg-amber-500"}`}><IdCard className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-800">{record.childName}</p><p className="truncate text-xs font-semibold text-slate-500">{record.location}</p></div><StatusBadge tone={statusTone(record.status)}>{record.status}</StatusBadge></button>)}{!recent.length && <p className="py-8 text-center text-sm font-semibold text-slate-500">No entries yet.</p>}</div></article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h3 className="text-lg font-black text-[#13285a]">Enrollment Summary</h3><ShieldCheck className="h-5 w-5 text-green-600" /></div><div className="mt-5 flex items-center justify-center gap-5"><Donut percent={completion} label="ready" /><div className="space-y-2 text-sm font-bold text-slate-600"><p>🟢 {enrolled.length} enrolled</p><p>🔵 {submitted.length} submitted</p><p>🟡 {attention.length} need action</p></div></div></article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h3 className="text-lg font-black text-[#13285a]">Attendance Overview</h3><ClipboardCheck className="h-5 w-5 text-blue-600" /></div><div className="mt-5 flex items-center justify-center gap-5"><Donut percent={attendancePercent} label="present" /><div className="space-y-2 text-sm font-bold text-slate-600"><p>🟢 Present {present}</p><p>🟡 Absent {absent}</p><p>⚪ Other {other}</p><p className="pt-1 text-xs text-slate-400">{activeChildren.length} children visible</p></div></div></article>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.55fr_.65fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-amber-500" /><h3 className="text-lg font-black text-[#13285a]">Quick Actions</h3></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><button onClick={openAdd} className="rounded-2xl bg-blue-600 p-4 text-center text-white transition hover:-translate-y-1"><ClipboardPlus className="mx-auto h-7 w-7" /><p className="mt-2 text-sm font-black">Add Child</p></button><Link href="/daily-care" className="rounded-2xl bg-green-600 p-4 text-center text-white transition hover:-translate-y-1"><ClipboardCheck className="mx-auto h-7 w-7" /><p className="mt-2 text-sm font-black">Take Attendance</p></Link><Link href="/meals" className="rounded-2xl bg-orange-500 p-4 text-center text-white transition hover:-translate-y-1"><UtensilsCrossed className="mx-auto h-7 w-7" /><p className="mt-2 text-sm font-black">Log a Meal</p></Link><button onClick={jumpToQueue} className="rounded-2xl bg-violet-600 p-4 text-center text-white transition hover:-translate-y-1"><ListChecks className="mx-auto h-7 w-7" /><p className="mt-2 text-sm font-black">Review Queue</p></button><Link href="/reports" className="rounded-2xl bg-blue-700 p-4 text-center text-white transition hover:-translate-y-1"><BarChart3 className="mx-auto h-7 w-7" /><p className="mt-2 text-sm font-black">Run Report</p></Link></div></article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-black text-[#13285a]">Helpful Resources</h3><div className="mt-3 space-y-2">{[["Children & Families", "/children"], ["Meal Program", "/meals"], ["Compliance Center", "/compliance"], ["Reports", "/reports"]].map(([label, href]) => <Link key={label} href={href} className="flex items-center justify-between rounded-xl px-3 py-2 text-sm font-black text-slate-700 hover:bg-blue-50 hover:text-blue-600"><span>{label}</span><span>›</span></Link>)}</div></article>
        </section>

        <section id="kidkare-enrollment-queue" className="scroll-mt-24 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-blue-600">Administrative tracker</p><h3 className="mt-1 text-2xl font-black text-[#13285a]">KidKare Enrollment Queue</h3><p className="mt-1 text-sm font-semibold text-slate-500">One record per child and location, including second-location enrollments.</p></div><div className="flex gap-2"><StatusBadge tone={attention.length ? "amber" : "green"}>{attention.length ? `${attention.length} need action` : "All caught up"}</StatusBadge><button onClick={openAdd} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white">+ Add</button></div></div>
          <div className="mt-5 grid gap-3 border-y border-slate-100 py-4 md:grid-cols-[1fr_190px_230px]"><label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-10`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search child, location, or KidKare ID" /></label><label className="relative"><Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><select className={`${inputClass} pl-10`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "All" | KidKareStatus)}><option value="All">All statuses</option>{statuses.map((s) => <option key={s}>{s}</option>)}</select></label><select className={inputClass} value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}><option>All Locations</option>{programLocations.map((location) => <option key={location}>{location}</option>)}</select></div>
          <div className="mt-4 grid gap-3">{filtered.map((record) => <article key={record.id} className="rounded-2xl border border-slate-200 p-4 hover:border-blue-200"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex min-w-0 items-start gap-3"><div className={`grid h-12 w-12 place-items-center rounded-2xl ${record.status === "Enrolled" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}><IdCard className="h-6 w-6" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-950">{record.childName}</p><StatusBadge tone={statusTone(record.status)}>{record.status}</StatusBadge></div><p className="mt-1 text-sm font-semibold text-slate-600">{record.location}</p><p className="mt-1 text-xs text-slate-500">KidKare ID: {record.kidKareChildId || "Not assigned"} • Last verified: {record.lastVerified || "Not verified"}</p>{record.notes && <p className="mt-2 text-xs text-slate-500">{record.notes}</p>}</div></div><div className="flex flex-wrap gap-2">{record.status !== "Enrolled" && <button onClick={() => quickEnroll(record)} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-3.5 py-2 text-xs font-black text-white"><Sparkles className="h-4 w-4" /> Mark Enrolled</button>}<button onClick={() => openEdit(record)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-black text-slate-700"><Pencil className="h-4 w-4" /> Edit</button></div></div></article>)}{!filtered.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center"><IdCard className="mx-auto h-9 w-9 text-slate-400" /><p className="mt-3 font-black text-slate-800">No KidKare records match these filters.</p></div>}</div>
        </section>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/50 px-5 py-4 text-sm font-semibold text-slate-600"><strong className="text-[#13285a]">Access rule:</strong> KidKare stays limited to Owner/Admin and Location Licensee accounts. Licensees see only their assigned site; standard Employees do not receive KidKare access.</div>

        {modalOpen && <Modal title={editing ? "Edit KidKare Enrollment" : "Add KidKare Enrollment"} description="A separate record is required for each location the child attends." onClose={closeModal} footer={<><SecondaryButton onClick={closeModal}>Cancel</SecondaryButton><PrimaryButton onClick={save}>Save Enrollment</PrimaryButton></>}><div className="grid gap-4 sm:grid-cols-2"><Field label="Child"><select className={inputClass} value={form.childId} onChange={(e) => { const childId = Number(e.target.value); const child = activeChildren.find((item) => item.id === childId); setForm((current) => ({ ...current, childId, childName: child ? `${child.firstName} ${child.lastName}` : "", location: child?.location ?? current.location })); }}><option value={0}>Select child</option>{activeChildren.map((child) => <option key={child.id} value={child.id}>{child.firstName} {child.lastName}</option>)}</select></Field><Field label="Location"><select className={inputClass} value={form.location} onChange={(e) => setForm((c) => ({ ...c, location: e.target.value }))}>{programLocations.map((location) => <option key={location}>{location}</option>)}</select></Field><Field label="Status"><select className={inputClass} value={form.status} onChange={(e) => setForm((c) => ({ ...c, status: e.target.value as KidKareStatus }))}>{statuses.map((s) => <option key={s}>{s}</option>)}</select></Field><Field label="KidKare Child ID"><input className={inputClass} value={form.kidKareChildId} onChange={(e) => setForm((c) => ({ ...c, kidKareChildId: e.target.value }))} /></Field><Field label="Date Added"><input type="date" className={inputClass} value={form.dateAdded} onChange={(e) => setForm((c) => ({ ...c, dateAdded: e.target.value }))} /></Field><Field label="Last Verified"><input type="date" className={inputClass} value={form.lastVerified} onChange={(e) => setForm((c) => ({ ...c, lastVerified: e.target.value }))} /></Field><Field label="Completed By"><input className={inputClass} value={form.completedBy} onChange={(e) => setForm((c) => ({ ...c, completedBy: e.target.value }))} /></Field><Field label="Required"><select className={inputClass} value={form.required ? "Yes" : "No"} onChange={(e) => setForm((c) => ({ ...c, required: e.target.value === "Yes" }))}><option>Yes</option><option>No</option></select></Field><Field label="Notes" wide><textarea className={`${inputClass} min-h-24`} value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} /></Field>{formMessage && <p className="sm:col-span-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{formMessage}</p>}</div></Modal>}
      </div>
    </MainLayout>
  );
}
