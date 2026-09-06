"use client";

import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import { DemoNotice, inputClass, Modal, PrimaryButton, SecondaryButton, StatusBadge } from "@/components/hub/HubUI";
import { SuccessBurst } from "@/components/hub/AnimatedVisuals";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { initialChildren, type ChildRecord } from "@/lib/children";
import { programLocations, starterKidKareEnrollments, type KidKareEnrollment, type KidKareStatus } from "@/lib/compliance-ops";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardPlus,
  FileBarChart2,
  Filter,
  Heart,
  IdCard,
  ListChecks,
  MapPin,
  Pencil,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  UtensilsCrossed,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { staffInitials, useAuth } from "@/components/providers/AuthProvider";
import { localIsoDate } from "@/lib/date-utils";

const statuses: KidKareStatus[] = ["Not Started", "Information Needed", "Submitted", "Enrolled", "Needs Correction"];

const navItems = [
  { label: "Children", href: "/children", icon: UsersRound, tone: "bg-blue-600" },
  { label: "Attendance", href: "/daily-care", icon: ClipboardCheck, tone: "bg-green-600" },
  { label: "Meals", href: "/meals", icon: UtensilsCrossed, tone: "bg-orange-500" },
  { label: "Activities", href: "/work-plans", icon: CalendarDays, tone: "bg-violet-600" },
  { label: "Reports", href: "/reports", icon: BarChart3, tone: "bg-blue-700" },
];

function createBlankEnrollment(children: ChildRecord[]): Omit<KidKareEnrollment, "id"> {
  const firstChild = children.find((child) => child.enrollmentStatus !== "Archived");
  return {
    childId: firstChild?.id ?? 0,
    childName: firstChild ? `${firstChild.firstName} ${firstChild.lastName}` : "",
    location: firstChild?.location ?? programLocations[0],
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

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function MiniDonut({ value, label, helper, accent }: { value: number; label: string; helper: string; accent: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-5">
      <div className="relative grid h-32 w-32 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${accent} ${clamped}%, #e8eef7 ${clamped}% 100%)` }}>
        <div className="grid h-[88px] w-[88px] place-items-center rounded-full bg-white text-center shadow-inner">
          <div>
            <div className="text-2xl font-black text-[#102a56]">{clamped}%</div>
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</div>
          </div>
        </div>
      </div>
      <p className="text-sm font-semibold leading-6 text-slate-600">{helper}</p>
    </div>
  );
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
    const matchesSearch = `${record.childName} ${record.location} ${record.kidKareChildId}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "All" || record.status === statusFilter;
    const matchesLocation = locationFilter === "All Locations" || record.location === locationFilter;
    return matchesSearch && matchesStatus && matchesLocation;
  }), [hubFiltered, search, statusFilter, locationFilter]);

  const required = hubFiltered.filter((record) => record.required);
  const enrolled = required.filter((record) => record.status === "Enrolled");
  const submitted = required.filter((record) => record.status === "Submitted");
  const attention = required.filter((record) => ["Not Started", "Information Needed", "Needs Correction"].includes(record.status));
  const completion = required.length ? Math.round((enrolled.length / required.length) * 100) : 100;
  const presentCount = activeChildren.filter((child) => child.attendanceToday === "Present").length;
  const absentCount = activeChildren.filter((child) => child.attendanceToday === "Absent").length;
  const otherAttendance = Math.max(0, activeChildren.length - presentCount - absentCount);
  const attendancePercent = activeChildren.length ? Math.round((presentCount / activeChildren.length) * 100) : 100;
  const recent = [...hubFiltered].slice(-5).reverse();

  function openAdd() {
    setEditing(null);
    setForm(createBlankEnrollment(activeChildren));
    setFormMessage("");
    setModalOpen(true);
  }

  function openEdit(record: KidKareEnrollment) {
    const { id: _id, ...rest } = record;
    void _id;
    setEditing(record);
    setForm(rest);
    setFormMessage("");
    setModalOpen(true);
  }

  function closeModal() {
    setEditing(null);
    setModalOpen(false);
    setForm(createBlankEnrollment(activeChildren));
    setFormMessage("");
  }

  function save() {
    const child = activeChildren.find((item) => item.id === form.childId);
    if (!child) {
      setFormMessage("Add or select an active child before saving this KidKare record.");
      return;
    }
    const duplicate = records.some((item) => item.id !== editing?.id && item.childId === form.childId && item.location === form.location);
    if (duplicate) {
      setFormMessage("This child already has a KidKare record for that location.");
      return;
    }
    const normalized = { ...form, childName: `${child.firstName} ${child.lastName}` };
    if (editing) {
      setRecords((current) => current.map((item) => item.id === editing.id ? { ...normalized, id: editing.id } : item));
    } else {
      setRecords((current) => [...current, { ...normalized, id: Math.max(0, ...current.map((item) => item.id)) + 1 }]);
    }
    closeModal();
    setShowSuccess(true);
    window.setTimeout(() => setShowSuccess(false), 2200);
  }

  function quickEnroll(record: KidKareEnrollment) {
    const today = localIsoDate();
    setRecords((current) => current.map((item) => item.id === record.id ? {
      ...item,
      status: "Enrolled",
      dateAdded: item.dateAdded || today,
      lastVerified: today,
      completedBy: item.completedBy || staffInitials(profile),
    } : item));
    setShowSuccess(true);
    window.setTimeout(() => setShowSuccess(false), 2200);
  }

  function showNeedsAction() {
    setStatusFilter("All");
    setLocationFilter("All Locations");
    setSearch("");
    window.setTimeout(() => document.getElementById("kidkare-enrollment-queue")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  return (
    <MainLayout>
      <SuccessBurst show={showSuccess} text="KidKare record updated" />
      <div className="mx-auto max-w-[1540px] space-y-6 pb-10">
        <section className="relative overflow-hidden rounded-[2rem] border border-blue-100 bg-white shadow-[0_18px_55px_rgba(26,62,120,0.16)]">
          <div className="absolute -left-16 -top-28 h-64 w-72 rotate-12 rounded-[45%] bg-[#ffc72c]" />
          <div className="absolute -right-16 -top-24 h-72 w-[34rem] -rotate-6 rounded-[45%] bg-[#1769d2]" />
          <div className="absolute -right-12 bottom-0 h-28 w-[34rem] rounded-tl-[70%] bg-[#0a53a7]" />
          <div className="absolute bottom-0 left-0 h-16 w-2/3 rounded-tr-[100%] bg-[#1b67c9]" />
          <div className="relative grid min-h-[290px] gap-6 px-6 py-7 sm:px-9 lg:grid-cols-[1.25fr_.75fr] lg:items-center lg:px-12">
            <div className="relative z-10">
              <div className="inline-flex items-center gap-3 rounded-2xl bg-white/90 px-4 py-2 shadow-sm ring-1 ring-blue-100">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#6caf35] text-xl font-black text-white">T</div>
                <div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">TCS Operations Hub</p><p className="text-sm font-black text-[#0f2a59]">Food Program Command Center</p></div>
              </div>
              <div className="mt-5 flex flex-wrap items-end gap-x-3 gap-y-1">
                <h1 className="text-5xl font-black tracking-tight sm:text-6xl"><span className="text-[#1769d2]">Kid</span><span className="text-[#65a92f]">K</span><span className="text-[#ffc72c]">are</span></h1>
                <span className="pb-2 text-sm font-black text-[#5b8e2d]">by Minute Menu™</span>
              </div>
              <p className="mt-3 max-w-2xl text-base font-semibold leading-7 text-slate-600">A bright, fast dashboard for enrollment readiness, attendance, meal-program work, activities, and reporting — while keeping every child tied to the correct TCS location.</p>
              <div className="mt-6 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-5">
                {navItems.map(({ label, href, icon: Icon, tone }) => (
                  <Link key={label} href={href} className="group rounded-2xl bg-white/95 p-3 text-center shadow-md ring-1 ring-slate-100 transition hover:-translate-y-1 hover:shadow-lg">
                    <div className={`mx-auto grid h-11 w-11 place-items-center rounded-full text-white shadow-sm ${tone}`}><Icon className="h-5 w-5" /></div><p className="mt-2 text-xs font-black uppercase tracking-wide text-[#102a56]">{label}</p>
                  </Link>
                ))}
              </div>
            </div>
            <div className="relative z-10 hidden min-h-[220px] lg:block">
              <div className="absolute right-8 top-3 h-56 w-56 rounded-full bg-white/90 shadow-2xl ring-8 ring-white/25"><div className="absolute inset-0 grid place-items-center text-[108px] drop-shadow-sm">🐊</div><div className="absolute -right-4 top-5 rotate-6 rounded-xl bg-[#e6272b] px-4 py-2 text-2xl font-black italic text-white shadow-lg">T</div></div>
              <Heart className="absolute right-1 top-0 h-9 w-9 text-white" strokeWidth={2.6} /><Star className="absolute bottom-4 right-2 h-10 w-10 fill-[#ffc72c] text-[#ffc72c]" />
              <p className="absolute bottom-8 left-3 max-w-[190px] -rotate-3 text-right text-xl font-black leading-7 text-white">Healthy kids.<br />Brighter tomorrows. 💛</p>
            </div>
          </div>
        </section>

        <DemoNotice />

        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-sm font-black uppercase tracking-[0.18em] text-[#1769d2]">KidKare today</p><h2 className="mt-1 text-3xl font-black text-[#102a56]">Welcome back! 👋</h2><p className="mt-1 text-sm font-semibold text-slate-500">Here’s what needs attention in KidKare right now.</p></div>
          <div className="flex flex-wrap gap-2"><div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700"><MapPin className="h-4 w-4 text-[#1769d2]" />{selectedHubLocation}</div><button onClick={openAdd} className="inline-flex items-center gap-2 rounded-xl bg-[#1769d2] px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-[#0b56b5]"><ClipboardPlus className="h-4 w-4" /> Add Enrollment</button></div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Required Enrollments", value: required.length, helper: "Child + location records", icon: UsersRound, box: "bg-[#eef6ff]", bubble: "bg-[#1769d2]" },
            { label: "Fully Enrolled", value: enrolled.length, helper: `${completion}% confirmed`, icon: CheckCircle2, box: "bg-[#f2faeb]", bubble: "bg-[#65a92f]" },
            { label: "Submitted", value: submitted.length, helper: "Waiting confirmation", icon: FileBarChart2, box: "bg-[#fff3e8]", bubble: "bg-[#f47b20]" },
            { label: "Needs Action", value: attention.length, helper: "Missing info/corrections", icon: AlertTriangle, box: "bg-[#f5efff]", bubble: "bg-[#7b3fc6]" },
            { label: "Completion", value: `${completion}%`, helper: "Across required records", icon: BarChart3, box: "bg-[#edf6ff]", bubble: "bg-[#0a53a7]" },
          ].map(({ label, value, helper, icon: Icon, box, bubble }) => (
            <article key={label} className={`rounded-2xl border border-white p-4 shadow-sm ${box}`}><div className="flex items-center gap-3"><div className={`grid h-12 w-12 place-items-center rounded-full text-white shadow-sm ${bubble}`}><Icon className="h-6 w-6" /></div><div><p className="text-xs font-black text-slate-600">{label}</p><p className="text-3xl font-black text-[#102a56]">{value}</p></div></div><p className="mt-2 text-xs font-semibold text-slate-500">{helper}</p></article>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.05fr_.95fr_.95fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-black text-[#102a56]">Recent KidKare Entries</h3><button onClick={() => document.getElementById("kidkare-enrollment-queue")?.scrollIntoView({ behavior: "smooth" })} className="text-xs font-black text-[#1769d2]">View all →</button></div>
            <div className="mt-4 divide-y divide-slate-100">
              {recent.map((record) => <button key={record.id} onClick={() => openEdit(record)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-slate-50"><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-white ${record.status === "Enrolled" ? "bg-[#65a92f]" : record.status === "Submitted" ? "bg-[#1769d2]" : "bg-[#f4b521]"}`}><IdCard className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-800">{record.childName}</p><p className="truncate text-xs font-semibold text-slate-500">{record.location}</p></div><StatusBadge tone={statusTone(record.status)}>{record.status}</StatusBadge></button>)}
              {!recent.length && <p className="py-8 text-center text-sm font-semibold text-slate-500">No KidKare entries yet.</p>}
            </div>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-black text-[#102a56]">Enrollment Readiness</h3><ShieldCheck className="h-5 w-5 text-[#65a92f]" /></div><div className="mt-6"><MiniDonut value={completion} label="ready" helper={`${enrolled.length} of ${required.length} required child-location enrollments are confirmed in the TCS KidKare tracker.`} accent="#1769d2" /></div><div className="mt-5 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-green-50 p-2"><p className="text-xl font-black text-green-700">{enrolled.length}</p><p className="text-[10px] font-black uppercase text-green-700">Enrolled</p></div><div className="rounded-xl bg-blue-50 p-2"><p className="text-xl font-black text-blue-700">{submitted.length}</p><p className="text-[10px] font-black uppercase text-blue-700">Submitted</p></div><div className="rounded-xl bg-amber-50 p-2"><p className="text-xl font-black text-amber-700">{attention.length}</p><p className="text-[10px] font-black uppercase text-amber-700">Action</p></div></div></article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-black text-[#102a56]">Attendance Overview</h3><ClipboardCheck className="h-5 w-5 text-[#1769d2]" /></div><div className="mt-6"><MiniDonut value={attendancePercent} label="present" helper={`${presentCount} children are marked present across the children visible to this login.`} accent="#39a935" /></div><div className="mt-5 space-y-2 text-sm font-bold text-slate-600"><div className="flex justify-between"><span>🟢 Present</span><span>{presentCount}</span></div><div className="flex justify-between"><span>🟡 Absent</span><span>{absentCount}</span></div><div className="flex justify-between"><span>⚪ Other / not scheduled</span><span>{otherAttendance}</span></div></div></article>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.55fr_.65fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-[#f4b521]" /><h3 className="text-lg font-black text-[#102a56]">Quick Actions</h3></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><button onClick={openAdd} className="rounded-2xl bg-[#1769d2] p-4 text-center text-white shadow-sm transition hover:-translate-y-1"><ClipboardPlus className="mx-auto h-7 w-7" /><p className="mt-2 text-sm font-black">Add Enrollment</p></button><Link href="/daily-care" className="rounded-2xl bg-[#65a92f] p-4 text-center text-white shadow-sm transition hover:-translate-y-1"><ClipboardCheck className="mx-auto h-7 w-7" /><p className="mt-2 text-sm font-black">Take Attendance</p></Link><Link href="/meals" className="rounded-2xl bg-[#f47b20] p-4 text-center text-white shadow-sm transition hover:-translate-y-1"><UtensilsCrossed className="mx-auto h-7 w-7" /><p className="mt-2 text-sm font-black">Meal Program</p></Link><button onClick={showNeedsAction} className="rounded-2xl bg-[#7b3fc6] p-4 text-center text-white shadow-sm transition hover:-translate-y-1"><ListChecks className="mx-auto h-7 w-7" /><p className="mt-2 text-sm font-black">Review Queue</p></button><Link href="/reports" className="rounded-2xl bg-[#0a53a7] p-4 text-center text-white shadow-sm transition hover:-translate-y-1"><BarChart3 className="mx-auto h-7 w-7" /><p className="mt-2 text-sm font-black">Run Report</p></Link></div></article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-black text-[#102a56]">Helpful Resources</h3><div className="mt-4 space-y-2">{[["Children & Family Profiles", "/children"], ["Meal Program", "/meals"], ["Compliance Center", "/compliance"], ["Reports", "/reports"]].map(([label, href]) => <Link key={label} href={href} className="flex items-center justify-between rounded-xl px-3 py-2 text-sm font-black text-slate-700 hover:bg-blue-50 hover:text-[#1769d2]"><span>{label}</span><span>›</span></Link>)}</div></article>
        </section>

        <section id="kidkare-enrollment-queue" className="scroll-mt-24 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#1769d2]">Administrative tracker</p><h3 className="mt-1 text-2xl font-black text-[#102a56]">KidKare Enrollment Queue</h3><p className="mt-1 text-sm font-semibold text-slate-500">One record per child and location, including second-location enrollments.</p></div><div className="flex flex-wrap items-center gap-2"><StatusBadge tone={attention.length ? "amber" : "green"}>{attention.length ? `${attention.length} need action` : "All caught up"}</StatusBadge><button onClick={openAdd} className="inline-flex items-center gap-2 rounded-xl bg-[#1769d2] px-4 py-2 text-sm font-black text-white"><ClipboardPlus className="h-4 w-4" /> Add</button></div></div>
          <div className="mt-5 grid gap-3 border-y border-slate-100 py-4 md:grid-cols-[1fr_190px_230px]"><label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search child, location, or KidKare ID" /></label><label className="relative"><Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><select className={`${inputClass} pl-10`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "All" | KidKareStatus)}><option value="All">All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label><select className={inputClass} value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}><option>All Locations</option>{programLocations.map((location) => <option key={location}>{location}</option>)}</select></div>
          <div className="mt-4 grid gap-3">
            {filtered.map((record) => <article key={record.id} className="rounded-2xl border border-slate-200 p-4 transition hover:border-blue-200 hover:shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex min-w-0 items-start gap-3"><div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${record.status === "Enrolled" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}><IdCard className="h-6 w-6" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-950">{record.childName}</p><StatusBadge tone={statusTone(record.status)}>{record.status}</StatusBadge></div><p className="mt-1 text-sm font-semibold text-slate-600">{record.location}</p><p className="mt-1 text-xs text-slate-500">KidKare ID: {record.kidKareChildId || "Not assigned"} • Last verified: {record.lastVerified || "Not verified"}</p>{record.notes && <p className="mt-2 text-xs leading-5 text-slate-500">{record.notes}</p>}</div></div><div className="flex flex-wrap gap-2 lg:justify-end">{record.status !== "Enrolled" && <button onClick={() => quickEnroll(record)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#65a92f] px-3.5 py-2 text-xs font-black text-white hover:bg-[#568f29]"><Sparkles className="h-4 w-4" /> Mark Enrolled</button>}<button onClick={() => openEdit(record)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"><Pencil className="h-4 w-4" /> Edit</button></div></div></article>)}
            {!filtered.length && <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center"><IdCard className="mx-auto h-10 w-10 text-slate-400" /><p className="mt-3 font-black text-slate-900">No KidKare records match these filters.</p></div>}
          </div>
        </section>

        <div className="rounded-2xl border border-blue-100 bg-[#f7fbff] px-5 py-4 text-sm font-semibold leading-6 text-slate-600"><strong className="text-[#102a56]">Access rule:</strong> KidKare remains an Owner/Admin and Location Licensee tool. Location Licensees see only their assigned site; standard Employees do not receive KidKare access.</div>

        {modalOpen && <Modal title={editing ? "Edit KidKare Enrollment" : "Add KidKare Enrollment"} description="A separate record is required for each location the child attends." onClose={closeModal} footer={<><SecondaryButton onClick={closeModal}>Cancel</SecondaryButton><PrimaryButton onClick={save}>Save Enrollment</PrimaryButton></>}><div className="grid gap-4 sm:grid-cols-2"><Field label="Child"><select className={inputClass} value={form.childId} onChange={(event) => { const childId = Number(event.target.value); const child = activeChildren.find((item) => item.id === childId); setForm((current) => ({ ...current, childId, childName: child ? `${child.firstName} ${child.lastName}` : current.childName, location: child?.location ?? current.location })); }}><option value={0}>Select child</option>{activeChildren.map((child) => <option key={child.id} value={child.id}>{child.firstName} {child.lastName}</option>)}</select></Field><Field label="Location"><select className={inputClass} value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}>{programLocations.map((location) => <option key={location}>{location}</option>)}</select></Field><Field label="Status"><select className={inputClass} value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as KidKareStatus }))}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></Field><Field label="KidKare Child ID"><input className={inputClass} value={form.kidKareChildId} onChange={(event) => setForm((current) => ({ ...current, kidKareChildId: event.target.value }))} placeholder="Optional until assigned" /></Field><Field label="Date Added"><input type="date" className={inputClass} value={form.dateAdded} onChange={(event) => setForm((current) => ({ ...current, dateAdded: event.target.value }))} /></Field><Field label="Last Verified"><input type="date" className={inputClass} value={form.lastVerified} onChange={(event) => setForm((current) => ({ ...current, lastVerified: event.target.value }))} /></Field><Field label="Completed By"><input className={inputClass} value={form.completedBy} onChange={(event) => setForm((current) => ({ ...current, completedBy: event.target.value }))} placeholder="Staff initials or name" /></Field><Field label="Required"><select className={inputClass} value={form.required ? "Yes" : "No"} onChange={(event) => setForm((current) => ({ ...current, required: event.target.value === "Yes" }))}><option>Yes</option><option>No</option></select></Field><Field label="Notes" wide><textarea className={`${inputClass} min-h-24`} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Missing information, correction details, or verification notes" /></Field></div>{formMessage && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">{formMessage}</div>}</Modal>}
      </div>
    </MainLayout>
  );
}
