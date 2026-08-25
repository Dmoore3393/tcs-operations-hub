"use client";

import MainLayout from "@/components/layout/MainLayout";
import { DemoNotice, inputClass, Modal, PrimaryButton, SecondaryButton, SectionCard, StatCard, StatusBadge } from "@/components/hub/HubUI";
import { AnimatedProgressRing, FloatingOperationsGraphic, SuccessBurst } from "@/components/hub/AnimatedVisuals";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { initialChildren, type ChildRecord } from "@/lib/children";
import { programLocations, starterKidKareEnrollments, type KidKareEnrollment, type KidKareStatus } from "@/lib/compliance-ops";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, CheckCircle2, CircleDashed, ClipboardPlus, Filter, IdCard, MapPin, Pencil, Search, ShieldCheck, Sparkles, UserRoundCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { staffInitials, useAuth } from "@/components/providers/AuthProvider";
import { localIsoDate } from "@/lib/date-utils";

const statuses: KidKareStatus[] = ["Not Started", "Information Needed", "Submitted", "Enrolled", "Needs Correction"];

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

export default function KidKarePage() {
  const [records, setRecords] = usePersistentState<KidKareEnrollment[]>("tcs-kidkare-enrollments-v1", starterKidKareEnrollments);
  const [children] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const { profile } = useAuth();
  const { location: selectedHubLocation, theme } = useHubLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | KidKareStatus>("All");
  const [locationFilter, setLocationFilter] = useState("All Locations");
  const [editing, setEditing] = useState<KidKareEnrollment | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Omit<KidKareEnrollment, "id">>(() => createBlankEnrollment([]));
  const [formMessage, setFormMessage] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const reducedMotion = useReducedMotion();
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

  function openAdd() {
    setEditing(null);
    setForm(createBlankEnrollment(activeChildren));
    setFormMessage("");
    setModalOpen(true);
  }

  function openEdit(record: KidKareEnrollment) {
    setFormMessage("");
    setEditing(record);
    setModalOpen(true);
    const { id: _id, ...rest } = record;
    void _id;
    setForm(rest);
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
    setEditing(null);
    setModalOpen(false);
    setForm(createBlankEnrollment(activeChildren));
    setFormMessage("");
    setShowSuccess(true);
    window.setTimeout(() => setShowSuccess(false), 2200);
  }

  function quickEnroll(record: KidKareEnrollment) {
    const today = localIsoDate();
    setRecords((current) => current.map((item) => item.id === record.id ? { ...item, status: "Enrolled", dateAdded: item.dateAdded || today, lastVerified: today, completedBy: item.completedBy || staffInitials(profile), kidKareChildId: item.kidKareChildId } : item));
    setShowSuccess(true);
    window.setTimeout(() => setShowSuccess(false), 2200);
  }

  function statusTone(status: KidKareStatus): "green" | "amber" | "red" | "blue" | "purple" | "slate" {
    if (status === "Enrolled") return "green";
    if (status === "Submitted") return "blue";
    if (status === "Needs Correction") return "red";
    if (status === "Information Needed") return "amber";
    return "slate";
  }


  return (
    <MainLayout>
      <SuccessBurst show={showSuccess} text="KidKare record updated" />
      <div className="mx-auto max-w-[1500px] space-y-6">
        <section className="relative overflow-hidden rounded-[2rem] text-white shadow-xl" style={{ background: `linear-gradient(135deg, ${theme.primaryDark}, ${theme.primary}, ${theme.accent})` }}>
          <div className="tcs-animated-gradient grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.25fr_.75fr] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/75">Food program compliance</p>
              <h1 className="mt-3 text-3xl font-black sm:text-4xl">KidKare Enrollment Tracker</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/85 sm:text-base">Every child must be enrolled in KidKare for every location they attend. This queue catches missing second-location enrollments before they become a meal-count problem.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <PrimaryButton onClick={openAdd}><ClipboardPlus className="h-4 w-4" /> Add Location Enrollment</PrimaryButton>
                <span className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-black"><ShieldCheck className="h-4 w-4" /> Employee-only tracker</span>
              </div>
            </div>
            <FloatingOperationsGraphic variant="enrollment" />
          </div>
        </section>

        <DemoNotice />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Required Enrollments" value={required.length} helper="One record per child and location" icon={<MapPin className="h-5 w-5" />} tone="emerald" />
          <StatCard label="Fully Enrolled" value={enrolled.length} helper={`${completion}% of required location records`} icon={<CheckCircle2 className="h-5 w-5" />} tone="blue" />
          <StatCard label="Submitted" value={submitted.length} helper="Waiting for enrollment confirmation" icon={<CircleDashed className="h-5 w-5" />} tone="purple" />
          <StatCard label="Needs Action" value={attention.length} helper="Not started, missing info, or correction" icon={<AlertTriangle className="h-5 w-5" />} tone="amber" />
        </section>

        <div className="grid gap-6 xl:grid-cols-[.72fr_1.28fr]">
          <SectionCard title="Enrollment Progress" description={selectedHubLocation === "All Locations" ? "Across all active locations" : `Filtered to ${selectedHubLocation}`}>
            <AnimatedProgressRing value={completion} label="KidKare completion" helper={`${enrolled.length} of ${required.length} required child-location enrollments are confirmed.`} />
            <div className="mt-6 space-y-3">
              {programLocations.map((location) => {
                const locationRecords = records.filter((item) => item.required && item.location === location);
                const locationEnrolled = locationRecords.filter((item) => item.status === "Enrolled").length;
                const percent = locationRecords.length ? Math.round((locationEnrolled / locationRecords.length) * 100) : 100;
                return (
                  <button key={location} onClick={() => setLocationFilter(location)} className="tcs-hover-lift w-full rounded-2xl border border-slate-200 p-3 text-left">
                    <div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-black text-slate-900">{location}</p><span className="text-xs font-black text-slate-500">{locationEnrolled}/{locationRecords.length}</span></div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><motion.div className="h-full rounded-full" style={{ background: "var(--theme-600)" }} initial={reducedMotion ? false : { width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: .7 }} /></div>
                  </button>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title="Enrollment Queue" description="Edit status, confirmation details, and location-specific KidKare IDs" action={<StatusBadge tone={attention.length ? "amber" : "green"}>{attention.length ? `${attention.length} need action` : "All caught up"}</StatusBadge>}>
            <div className="grid gap-3 border-b border-slate-100 pb-5 md:grid-cols-[1fr_190px_230px]">
              <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search child, location, or KidKare ID" /></label>
              <label className="relative"><Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><select className={`${inputClass} pl-10`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "All" | KidKareStatus)}><option value="All">All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
              <select className={inputClass} value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}><option>All Locations</option>{programLocations.map((location) => <option key={location}>{location}</option>)}</select>
            </div>

            <div className="mt-5 space-y-3">
              <AnimatePresence initial={false}>
                {filtered.map((record) => (
                  <motion.article key={record.id} layout initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="tcs-hover-lift rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${record.status === "Enrolled" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}><UserRoundCheck className="h-6 w-6" /></div>
                        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-950">{record.childName}</p><StatusBadge tone={statusTone(record.status)}>{record.status}</StatusBadge></div><p className="mt-1 text-sm font-semibold text-slate-600">{record.location}</p><p className="mt-1 text-xs text-slate-500">KidKare ID: {record.kidKareChildId || "Not assigned"} • Last verified: {record.lastVerified || "Not verified"}</p>{record.notes && <p className="mt-2 text-xs leading-5 text-slate-500">{record.notes}</p>}</div>
                      </div>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {record.status !== "Enrolled" && <button onClick={() => quickEnroll(record)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-black text-white hover:bg-emerald-700"><Sparkles className="h-4 w-4" /> Mark Enrolled</button>}
                        <button onClick={() => openEdit(record)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"><Pencil className="h-4 w-4" /> Edit</button>
                      </div>
                    </div>
                  </motion.article>
                ))}
              </AnimatePresence>
              {!filtered.length && <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center"><IdCard className="mx-auto h-10 w-10 text-slate-400" /><p className="mt-3 font-black text-slate-900">No KidKare records match these filters.</p></div>}
            </div>
          </SectionCard>
        </div>

        {modalOpen && (
          <Modal title={editing ? "Edit KidKare Enrollment" : "Add KidKare Enrollment"} description="A separate record is required for each location the child attends." onClose={() => { setEditing(null); setModalOpen(false); setForm(createBlankEnrollment(activeChildren)); setFormMessage(""); }} footer={<><SecondaryButton onClick={() => { setEditing(null); setModalOpen(false); setForm(createBlankEnrollment(activeChildren)); setFormMessage(""); }}>Cancel</SecondaryButton><PrimaryButton onClick={save}>Save Enrollment</PrimaryButton></>}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Child"><select className={inputClass} value={form.childId} onChange={(event) => { const childId = Number(event.target.value); const child = activeChildren.find((item) => item.id === childId); setForm((current) => ({ ...current, childId, childName: child ? `${child.firstName} ${child.lastName}` : current.childName, location: child?.location ?? current.location })); }}><option value={0}>Select child</option>{activeChildren.map((child) => <option key={child.id} value={child.id}>{child.firstName} {child.lastName}</option>)}</select></Field>
              <Field label="KidKare location"><select className={inputClass} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })}>{programLocations.map((location) => <option key={location}>{location}</option>)}</select></Field>
              <Field label="Enrollment status"><select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as KidKareStatus })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></Field>
              <Field label="KidKare child ID"><input className={inputClass} value={form.kidKareChildId} onChange={(event) => setForm({ ...form, kidKareChildId: event.target.value })} placeholder="Enter after enrollment" /></Field>
              <Field label="Date added"><input type="date" className={inputClass} value={form.dateAdded} onChange={(event) => setForm({ ...form, dateAdded: event.target.value })} /></Field>
              <Field label="Last verified"><input type="date" className={inputClass} value={form.lastVerified} onChange={(event) => setForm({ ...form, lastVerified: event.target.value })} /></Field>
              <Field label="Completed by / initials"><input className={inputClass} value={form.completedBy} onChange={(event) => setForm({ ...form, completedBy: event.target.value.toUpperCase() })} /></Field>
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4"><input type="checkbox" checked={form.required} onChange={(event) => setForm({ ...form, required: event.target.checked })} className="h-5 w-5" /><span><span className="block font-black text-slate-900">KidKare required</span><span className="text-xs text-slate-500">Child attends meals at this location</span></span></label>
              <Field label="Notes" wide><textarea className={`${inputClass} min-h-28`} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
              {formMessage && <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">{formMessage}</div>}
            </div>
          </Modal>
        )}
      </div>
    </MainLayout>
  );
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-sm font-bold text-slate-700">{label}</span>{children}</label>;
}
