"use client";

import MainLayout from "@/components/layout/MainLayout";
import { DemoNotice, inputClass, Modal, PrimaryButton, SecondaryButton, SectionCard, StatCard, StatusBadge } from "@/components/hub/HubUI";
import { AnimatedStep, FloatingOperationsGraphic, SuccessBurst } from "@/components/hub/AnimatedVisuals";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  nextTimesheetStage,
  prepComplete,
  stageIndex,
  starterDepartmentRoutes,
  starterTimesheets,
  timesheetStageOrder,
  type DepartmentRoute,
  type TestUserRole,
  type TimesheetRecord,
  type TimesheetStage,
} from "@/lib/compliance-ops";
import { initialChildren, type ChildRecord } from "@/lib/children";
import { currentServicePeriod } from "@/lib/date-utils";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  FileClock,
  FilePenLine,
  Mail,
  Pencil,
  Plus,
  ScanLine,
  Search,
  Send,
  Settings2,
  Signature,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { recordAuditEvent } from "@/lib/audit";

const checklistLabels: Array<[keyof TimesheetRecord["prep"], string, string]> = [
  ["parentSignature", "Parent signature", "Parent signed the location timesheet"],
  ["providerSignature", "Provider/licensee signature", "Licensee signed for the location"],
  ["formDated", "Form dated", "Required dates are written on the form"],
  ["noAttendanceXs", "No-attendance X marks", "Every day without attendance is marked X"],
  ["schoolPickupTimes", "School pickup times", "Pickup times are written where required"],
  ["closureDates", "Closure dates", "School and childcare closures are recorded"],
];

const stageDetails: Record<TimesheetStage, { title: string; helper: string; icon: React.ReactNode }> = {
  "Licensee Preparation": { title: "Licensee Prep", helper: "Signatures, dates, X marks, pickup times, and closures", icon: <Signature className="h-4 w-4" /> },
  "Dynasty Review": { title: "Dynasty Review", helper: "Confirm every location timesheet is accounted for", icon: <ClipboardCheck className="h-4 w-4" /> },
  "Jennifer Received": { title: "Batch Received", helper: "Record the physical batch handoff", icon: <UserCheck className="h-4 w-4" /> },
  Completion: { title: "Fill Out", helper: "Only Danielle or Jennifer completes the timesheet", icon: <FilePenLine className="h-4 w-4" /> },
  Scanning: { title: "Scan", helper: "Danielle, Jennifer, or Tony can scan", icon: <ScanLine className="h-4 w-4" /> },
  "Jennifer Email": { title: "Final Email", helper: "Danielle or Jennifer submits to the correct department", icon: <Mail className="h-4 w-4" /> },
  Complete: { title: "Complete", helper: "Signed, filled out, scanned, and submitted", icon: <CheckCircle2 className="h-4 w-4" /> },
};

export default function TimesheetsPage() {
  const [timesheets, setTimesheets] = usePersistentState<TimesheetRecord[]>("tcs-timesheets-v1", starterTimesheets);
  const [routes, setRoutes] = usePersistentState<DepartmentRoute[]>("tcs-timesheet-department-routes-v1", starterDepartmentRoutes);
  const [children] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const { profile, canManageSystem, isLocationLicensee } = useAuth();
  const actorName = profile?.full_name || "Approved Administrator";
  const userRole = useMemo<TestUserRole>(() => {
    const name = profile?.full_name.toLowerCase() ?? "";
    const role = profile?.role.toLowerCase() ?? "";
    if (name.includes("danielle")) return "Danielle";
    if (name.includes("jennifer")) return "Jennifer";
    if (name.includes("dynasty")) return "Dynasty";
    if (name.includes("tony") || name.includes("anthony")) return "Tony";
    if (["administrator", "admin", "director", "owner / director", "corporate / admin", "corporate admin", "operations admin"].includes(role)) return "Administrator";
    return "Location Licensee";
  }, [profile]);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<"All" | TimesheetStage>("All");
  const [selected, setSelected] = useState<TimesheetRecord | null>(null);
  const [editingRoute, setEditingRoute] = useState<DepartmentRoute | null>(null);
  const [showRoutes, setShowRoutes] = useState(false);
  const [success, setSuccess] = useState("");
  const { location: selectedHubLocation, theme } = useHubLocation();
  const reducedMotion = useReducedMotion();
  const servicePeriod = useMemo(() => currentServicePeriod(), []);

  const visible = useMemo(() => timesheets.filter((record) => {
    const hubMatch = selectedHubLocation === "All Locations" || record.location.includes(selectedHubLocation);
    const searchMatch = `${record.childName} ${record.familyName} ${record.location} ${record.fundingSource}`.toLowerCase().includes(search.toLowerCase());
    const stageMatch = stageFilter === "All" || record.stage === stageFilter;
    return hubMatch && searchMatch && stageMatch;
  }), [timesheets, selectedHubLocation, search, stageFilter]);

  const completeCount = visible.filter((item) => item.stage === "Complete").length;
  const licenseeCount = visible.filter((item) => item.stage === "Licensee Preparation").length;
  const scanCount = visible.filter((item) => item.stage === "Scanning").length;
  const emailCount = visible.filter((item) => item.stage === "Jennifer Email").length;

  function flash(message: string) {
    setSuccess(message);
    window.setTimeout(() => setSuccess(""), 2400);
  }

  function updateRecord(id: number, updater: (record: TimesheetRecord) => TimesheetRecord, message?: string) {
    const source = selected?.id === id ? selected : timesheets.find((record) => record.id === id);
    if (!source) return;
    const next = updater(source);
    const staged = { ...next, stage: nextTimesheetStage(next) };
    setTimesheets((current) => current.map((record) => record.id === id ? staged : record));
    if (selected?.id === id) setSelected(staged);
    if (source.dynastyStatus !== staged.dynastyStatus || source.stage !== staged.stage || source.jenniferReceivedAt !== staged.jenniferReceivedAt || source.completedAt !== staged.completedAt || source.scannedAt !== staged.scannedAt || source.emailedByJenniferAt !== staged.emailedByJenniferAt) {
      void recordAuditEvent({
        action: "REVIEW",
        tableName: "timesheets",
        legacyId: id,
        location: staged.location,
        metadata: { fromStage: source.stage, toStage: staged.stage, dynastyStatus: staged.dynastyStatus, actor: actorName },
      });
    }
    if (message) flash(message);
  }

  function now() {
    return new Date().toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function permission(step: "prep" | "dynasty" | "receive" | "complete" | "scan" | "email") {
    // Danielle and Jennifer are full-workflow users and can step in at any point.
    if (userRole === "Danielle" || userRole === "Jennifer" || userRole === "Administrator") return true;
    if (step === "prep") return userRole === "Location Licensee";
    if (step === "dynasty") return userRole === "Dynasty";
    if (step === "scan") return userRole === "Tony";
    return false;
  }

  function roleMessage(step: "prep" | "dynasty" | "receive" | "complete" | "scan" | "email") {
    const names = {
      prep: "the location licensee, Danielle, or Jennifer",
      dynasty: "Dynasty, Danielle, or Jennifer",
      receive: "Danielle or Jennifer",
      complete: "Danielle or Jennifer",
      scan: "Danielle, Jennifer, or Tony",
      email: "Danielle or Jennifer",
    };
    return `This step is restricted to ${names[step]}. Your signed-in account does not have permission for this action.`;
  }

  function routeFor(record: TimesheetRecord) {
    return routes.find((route) => route.location === record.location && route.fundingSource === record.fundingSource);
  }

  function createNextBatch() {
    const nextId = Math.max(0, ...timesheets.map((item) => item.id)) + 1;
    const existingNames = new Set(timesheets.filter((item) => item.servicePeriod === servicePeriod).map((item) => `${item.childName}|${item.location}`));
    const additions = children.filter((child) => {
      const locationAllowed = !isLocationLicensee || selectedHubLocation === "All Locations" || child.location.includes(selectedHubLocation);
      return locationAllowed && child.enrollmentStatus === "Active" && child.subsidy !== "Private Pay" && !existingNames.has(`${child.firstName} ${child.lastName}|${child.location}`);
    }).map((child, index): TimesheetRecord => ({
      id: nextId + index,
      childName: `${child.firstName} ${child.lastName}`,
      familyName: `${child.lastName} Family`,
      servicePeriod,
      location: child.location,
      fundingSource: child.subsidy === "DCFS" ? "DCFS" : child.subsidy === "CCCC" ? "CCCC" : "CCRC",
      stage: "Licensee Preparation",
      prep: { parentSignature: false, providerSignature: false, formDated: false, noAttendanceXs: false, schoolPickupTimes: false, closureDates: false },
      licenseeInitials: "",
      licenseeSubmittedAt: "",
      dynastyStatus: "Awaiting",
      dynastyInitials: "",
      dynastyReviewedAt: "",
      jenniferReceivedAt: "",
      batchReceivedBy: "",
      completedBy: "",
      completedAt: "",
      scannedBy: "",
      scannedAt: "",
      scanQualityChecked: false,
      sentToJenniferAt: "",
      department: "",
      departmentEmail: "",
      emailedByJenniferAt: "",
      emailedBy: "",
      attachmentConfirmed: false,
      confirmationReceived: false,
      notes: "New monthly timesheet created for location preparation.",
    }));
    if (!additions.length) return flash(`No new ${servicePeriod} timesheets are needed`);
    setTimesheets((current) => [...current, ...additions]);
    flash(`${additions.length} ${servicePeriod} timesheets created`);
  }

  function saveRoute() {
    if (!editingRoute) return;
    setRoutes((current) => current.map((route) => route.id === editingRoute.id ? editingRoute : route));
    setEditingRoute(null);
    flash("Submission route saved");
  }

  function statusTone(stage: TimesheetStage): "green" | "amber" | "red" | "blue" | "purple" | "slate" {
    if (stage === "Complete") return "green";
    if (stage === "Jennifer Email") return "purple";
    if (stage === "Scanning") return "blue";
    if (stage === "Dynasty Review" || stage === "Completion") return "amber";
    if (stage === "Licensee Preparation") return "red";
    return "slate";
  }

  return (
    <MainLayout>
      <SuccessBurst show={Boolean(success)} text={success} />
      <div className="mx-auto max-w-[1600px] space-y-6">
        <section className="relative overflow-hidden rounded-[2rem] text-white shadow-xl" style={{ background: `linear-gradient(135deg, ${theme.primaryDark}, ${theme.primary}, ${theme.accent})` }}>
          <div className="tcs-animated-gradient grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.25fr_.75fr] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/75">Controlled document workflow</p>
              <h1 className="mt-3 text-3xl font-black sm:text-4xl">Timesheet Command Center</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-white/85 sm:text-base">Track every physical timesheet from location preparation through final submission. Danielle and Jennifer have full access to complete any workflow step, while supporting roles remain limited to their assigned responsibilities.</p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <PrimaryButton onClick={createNextBatch}><Plus className="h-4 w-4" /> Create {servicePeriod} Batch</PrimaryButton>
                {canManageSystem && <button onClick={() => setShowRoutes(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-black text-white hover:bg-white/20"><Settings2 className="h-4 w-4" /> Submission Routing</button>}
              </div>
            </div>
            <FloatingOperationsGraphic variant="timesheets" />
          </div>
        </section>

        <DemoNotice />


        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="In Licensee Prep" value={licenseeCount} helper="Signatures and attendance details" icon={<Signature className="h-5 w-5" />} tone="red" />
          <StatCard label="Waiting to Scan" value={scanCount} helper="Danielle, Jennifer, or Tony" icon={<ScanLine className="h-5 w-5" />} tone="blue" />
          <StatCard label="Waiting to Email" value={emailCount} helper="Danielle or Jennifer" icon={<Mail className="h-5 w-5" />} tone="purple" />
          <StatCard label="Complete" value={completeCount} helper="Successfully submitted" icon={<CheckCircle2 className="h-5 w-5" />} tone="emerald" />
          <StatCard label="Total Showing" value={visible.length} helper={selectedHubLocation === "All Locations" ? "All locations" : selectedHubLocation} icon={<FileCheck2 className="h-5 w-5" />} tone="slate" />
        </section>

        <SectionCard title="Workflow Journey" description="Each card lights up when a timesheet reaches that handoff">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            {timesheetStageOrder.map((stage, index) => {
              const count = visible.filter((item) => item.stage === stage).length;
              const detail = stageDetails[stage];
              return <div key={stage} className="relative"><AnimatedStep active={count > 0 && stage !== "Complete"} complete={stage === "Complete" && count > 0} icon={detail.icon} title={detail.title} helper={`${count} currently here`} index={index} />{index < timesheetStageOrder.length - 1 && <ChevronRight className="absolute -right-3 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 text-slate-300 xl:block" />}</div>;
            })}
          </div>
        </SectionCard>

        <SectionCard title="Timesheet Tracker" description="Open a record to complete the next authorized step" action={<StatusBadge tone={visible.some((item) => item.stage !== "Complete") ? "amber" : "green"}>{visible.filter((item) => item.stage !== "Complete").length} still in progress</StatusBadge>}>
          <div className="grid gap-3 border-b border-slate-100 pb-5 md:grid-cols-[1fr_240px]">
            <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search child, family, location, or funding source" /></label>
            <select className={inputClass} value={stageFilter} onChange={(event) => setStageFilter(event.target.value as "All" | TimesheetStage)}><option value="All">All workflow stages</option>{timesheetStageOrder.map((stage) => <option key={stage}>{stage}</option>)}</select>
          </div>
          <div className="mt-5 space-y-3">
            <AnimatePresence initial={false}>
              {visible.map((record) => {
                const route = routeFor(record);
                const configured = Boolean(route?.department && route?.email);
                const progress = Math.round((stageIndex(record.stage) / (timesheetStageOrder.length - 1)) * 100);
                return (
                  <motion.button key={record.id} layout initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={() => setSelected(record)} className="tcs-hover-lift w-full rounded-2xl border border-slate-200 p-4 text-left">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white"><FileClock className="h-6 w-6" /></div>
                        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-950">{record.childName}</p><StatusBadge tone={statusTone(record.stage)}>{record.stage}</StatusBadge>{!configured && <StatusBadge tone="red">Routing not set</StatusBadge>}</div><p className="mt-1 text-sm font-semibold text-slate-600">{record.servicePeriod} • {record.fundingSource}</p><p className="mt-1 text-xs text-slate-500">{record.location}</p></div>
                      </div>
                      <div className="min-w-[260px] xl:w-[34%]"><div className="flex items-center justify-between text-xs font-black text-slate-500"><span>{stageDetails[record.stage].title}</span><span>{progress}%</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100"><motion.div className="h-full rounded-full" style={{ background: record.stage === "Complete" ? "#16a34a" : "var(--theme-600)" }} initial={reducedMotion ? false : { width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: .6 }} /></div></div>
                      <span className="inline-flex items-center gap-2 text-xs font-black text-emerald-800">Open workflow <ChevronRight className="h-4 w-4" /></span>
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        </SectionCard>

        {selected && (
          <Modal title={`${selected.childName} • ${selected.servicePeriod}`} description={`${selected.location} • ${selected.fundingSource}`} onClose={() => setSelected(null)} footer={<SecondaryButton onClick={() => setSelected(null)}>Close</SecondaryButton>}>
            <TimesheetWorkflow
              record={selected}
              route={routeFor(selected)}
              role={userRole}
              actor={actorName}
              permission={permission}
              roleMessage={roleMessage}
              update={(updater, message) => updateRecord(selected.id, updater, message)}
              editRoute={(route) => route ? setEditingRoute(route) : setShowRoutes(true)}
              now={now}
            />
          </Modal>
        )}

        {canManageSystem && showRoutes && (
          <Modal title="Timesheet Submission Routing" description="Enter the exact department and email for each location and funding source. Blank starter fields are intentional—we do not want to guess live submission information." onClose={() => setShowRoutes(false)} footer={<SecondaryButton onClick={() => setShowRoutes(false)}>Close</SecondaryButton>}>
            <div className="space-y-3">
              {routes.map((route) => <button key={route.id} onClick={() => setEditingRoute(route)} className="tcs-hover-lift flex w-full items-start justify-between gap-3 rounded-2xl border border-slate-200 p-4 text-left"><div><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-950">{route.location}</p><StatusBadge tone="blue">{route.fundingSource}</StatusBadge></div><p className="mt-1 text-sm text-slate-500">{route.department || "Department not entered"}</p><p className="text-xs text-slate-400">{route.email || "Email not entered"}</p></div><Pencil className="mt-1 h-4 w-4 text-slate-400" /></button>)}
            </div>
          </Modal>
        )}

        {canManageSystem && editingRoute && (
          <Modal title="Edit Submission Route" description={`${editingRoute.location} • ${editingRoute.fundingSource}`} onClose={() => setEditingRoute(null)} footer={<><SecondaryButton onClick={() => setEditingRoute(null)}>Cancel</SecondaryButton><PrimaryButton onClick={saveRoute}>Save Route</PrimaryButton></>}>
            <div className="space-y-4">
              <Field label="Correct department"><input className={inputClass} value={editingRoute.department} onChange={(event) => setEditingRoute({ ...editingRoute, department: event.target.value })} placeholder="Enter exact department name" /></Field>
              <Field label="Submission email"><input type="email" className={inputClass} value={editingRoute.email} onChange={(event) => setEditingRoute({ ...editingRoute, email: event.target.value })} placeholder="Enter exact department email" /></Field>
              <Field label="Submission deadline"><input className={inputClass} value={editingRoute.deadline} onChange={(event) => setEditingRoute({ ...editingRoute, deadline: event.target.value })} placeholder="Example: 5th business day" /></Field>
              <Field label="File naming format"><input className={inputClass} value={editingRoute.fileNameFormat} onChange={(event) => setEditingRoute({ ...editingRoute, fileNameFormat: event.target.value })} /></Field>
              <Field label="Notes"><textarea className={`${inputClass} min-h-24`} value={editingRoute.notes} onChange={(event) => setEditingRoute({ ...editingRoute, notes: event.target.value })} /></Field>
            </div>
          </Modal>
        )}
      </div>
    </MainLayout>
  );
}

function TimesheetWorkflow({ record, route, role, actor, permission, roleMessage, update, editRoute, now }: {
  record: TimesheetRecord;
  route?: DepartmentRoute;
  role: TestUserRole;
  actor: string;
  permission: (step: "prep" | "dynasty" | "receive" | "complete" | "scan" | "email") => boolean;
  roleMessage: (step: "prep" | "dynasty" | "receive" | "complete" | "scan" | "email") => string;
  update: (updater: (record: TimesheetRecord) => TimesheetRecord, message?: string) => void;
  editRoute: (route?: DepartmentRoute) => void;
  now: () => string;
}) {
  const routeReady = Boolean(route?.department && route?.email);
  const step = stageIndex(record.stage);
  const [initials, setInitials] = useState(record.licenseeInitials);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-slate-400">Current workflow stage</p><p className="mt-1 text-xl font-black text-slate-950">{record.stage}</p></div><StatusBadge tone={record.stage === "Complete" ? "green" : "amber"}>Signed in: {actor}</StatusBadge></div>
        <div className="mt-5 grid gap-2 sm:grid-cols-4 lg:grid-cols-7">{timesheetStageOrder.map((stage, index) => <div key={stage} className={`rounded-xl px-2 py-3 text-center text-[10px] font-black ${index < step || record.stage === "Complete" ? "bg-emerald-600 text-white" : index === step ? "bg-amber-400 text-amber-950" : "bg-white text-slate-400"}`}>{stageDetails[stage].title}</div>)}</div>
      </div>

      <WorkflowSection title="1. Location licensee preparation" helper="The location licensee normally prepares the form; Danielle or Jennifer can step in when needed." icon={<Signature className="h-5 w-5" />} locked={!permission("prep")} lockMessage={roleMessage("prep")}>
        <div className="grid gap-3 sm:grid-cols-2">
          {checklistLabels.map(([key, title, helper]) => <label key={key} className={`flex items-start gap-3 rounded-2xl border p-4 ${record.prep[key] ? "border-emerald-200 bg-emerald-50" : "border-slate-200"}`}><input type="checkbox" disabled={!permission("prep")} checked={record.prep[key]} onChange={(event) => update((current) => ({ ...current, prep: { ...current.prep, [key]: event.target.checked } }))} className="mt-1 h-5 w-5" /><span><span className="block font-black text-slate-900">{title}</span><span className="text-xs leading-5 text-slate-500">{helper}</span></span></label>)}
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row"><input className={inputClass} disabled={!permission("prep")} value={initials} onChange={(event) => setInitials(event.target.value.toUpperCase())} placeholder="Licensee initials" /><PrimaryButton disabled={!permission("prep") || !prepComplete(record.prep) || !initials.trim()} onClick={() => update((current) => ({ ...current, licenseeInitials: initials.trim(), licenseeSubmittedAt: now(), dynastyStatus: "Awaiting" }), "Sent to Dynasty review")}>Ready for Dynasty</PrimaryButton></div>
      </WorkflowSection>

      <WorkflowSection title="2. Dynasty Lara accountability review" helper="Dynasty normally verifies the batch; Danielle or Jennifer can also complete or correct this review." icon={<ClipboardCheck className="h-5 w-5" />} locked={!permission("dynasty")} lockMessage={roleMessage("dynasty")}>
        <div className="flex flex-wrap gap-2"><button disabled={!permission("dynasty")} onClick={() => update((current) => ({ ...current, dynastyStatus: "Needs Correction", dynastyInitials: role === "Dynasty" ? "DL" : role === "Danielle" ? "DM" : role === "Jennifer" ? "J" : "ADM", dynastyReviewedAt: now(), licenseeInitials: "", licenseeSubmittedAt: "", notes: `${current.notes}\nReturned to location for correction.`.trim() }), "Returned for correction")} className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-black text-red-800 disabled:opacity-40">Needs Correction</button><PrimaryButton disabled={!permission("dynasty") || !record.licenseeSubmittedAt} onClick={() => update((current) => ({ ...current, dynastyStatus: "Accounted For", dynastyInitials: role === "Dynasty" ? "DL" : role === "Danielle" ? "DM" : role === "Jennifer" ? "J" : "ADM", dynastyReviewedAt: now() }), `${actor} marked it accounted for`)}>Accounted For</PrimaryButton></div>
        <p className="mt-3 text-xs text-slate-500">Status: {record.dynastyStatus} {record.dynastyReviewedAt && `• ${record.dynastyReviewedAt}`}</p>
      </WorkflowSection>

      <WorkflowSection title="3. Batch received for completion" helper="Danielle or Jennifer records that the verified batch is ready to be filled out." icon={<UserCheck className="h-5 w-5" />} locked={!permission("receive")} lockMessage={roleMessage("receive")}>
        <PrimaryButton disabled={!permission("receive") || record.dynastyStatus !== "Accounted For"} onClick={() => update((current) => ({ ...current, jenniferReceivedAt: now(), batchReceivedBy: actor }), `Batch receipt recorded by ${actor}`)}>Confirm Batch Received</PrimaryButton>
        <p className="mt-3 text-xs text-slate-500">Received by: {record.batchReceivedBy || "Not recorded"} {record.jenniferReceivedAt && `• ${record.jenniferReceivedAt}`}</p>
      </WorkflowSection>

      <WorkflowSection title="4. Danielle and Jennifer fill out timesheets" helper="Danielle or Jennifer can complete and verify the timesheet." icon={<FilePenLine className="h-5 w-5" />} locked={!permission("complete")} lockMessage={roleMessage("complete")}>
        <PrimaryButton disabled={!permission("complete") || !record.jenniferReceivedAt} onClick={() => update((current) => ({ ...current, completedBy: actor, completedAt: now() }), `Timesheet completed by ${actor}`)}>Mark Filled Out</PrimaryButton>
        <p className="mt-3 text-xs text-slate-500">Completed by: {record.completedBy || "Not completed"} {record.completedAt && `• ${record.completedAt}`}</p>
      </WorkflowSection>

      <WorkflowSection title="5. Scan the completed form" helper="Danielle, Jennifer, or Tony can scan and quality-check the completed packet." icon={<ScanLine className="h-5 w-5" />} locked={!permission("scan")} lockMessage={roleMessage("scan")}>
        <label className="mb-4 flex items-center gap-3 rounded-2xl border border-slate-200 p-4"><input type="checkbox" disabled={!permission("scan")} checked={record.scanQualityChecked} onChange={(event) => update((current) => ({ ...current, scanQualityChecked: event.target.checked }))} className="h-5 w-5" /><span><span className="block font-black text-slate-900">Scan quality checked</span><span className="text-xs text-slate-500">All pages are readable, upright, and complete</span></span></label>
        <PrimaryButton disabled={!permission("scan") || !record.completedAt || !record.scanQualityChecked} onClick={() => update((current) => ({ ...current, scannedBy: actor, scannedAt: now(), sentToJenniferAt: now() }), `Scanned packet recorded by ${actor}`)}>Mark Scanned & Ready</PrimaryButton>
        <p className="mt-3 text-xs text-slate-500">Scanned by: {record.scannedBy || "Not scanned"} {record.scannedAt && `• ${record.scannedAt}`}</p>
      </WorkflowSection>

      <WorkflowSection title="6. Email the correct department" helper="Danielle or Jennifer completes the final submission using the editable route for this location and funding source." icon={<Send className="h-5 w-5" />} locked={!permission("email")} lockMessage={roleMessage("email")}>
        <div className={`rounded-2xl border p-4 ${routeReady ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className={`font-black ${routeReady ? "text-emerald-950" : "text-red-950"}`}>{routeReady ? route?.department : "Submission route not configured"}</p><p className={`mt-1 text-sm ${routeReady ? "text-emerald-800" : "text-red-800"}`}>{routeReady ? route?.email : "Enter the exact department and email before final submission."}</p></div><button onClick={() => editRoute(route)} className="inline-flex items-center gap-2 rounded-xl border border-current px-3 py-2 text-xs font-black"><Pencil className="h-3.5 w-3.5" /> Edit route</button></div></div>
        <label className="my-4 flex items-center gap-3 rounded-2xl border border-slate-200 p-4"><input type="checkbox" disabled={!permission("email")} checked={record.attachmentConfirmed} onChange={(event) => update((current) => ({ ...current, attachmentConfirmed: event.target.checked }))} className="h-5 w-5" /><span><span className="block font-black text-slate-900">Attachment confirmed</span><span className="text-xs text-slate-500">Correct child, service period, and all pages attached</span></span></label>
        <PrimaryButton disabled={!permission("email") || !record.sentToJenniferAt || !record.attachmentConfirmed || !routeReady} onClick={() => update((current) => ({ ...current, department: route?.department ?? "", departmentEmail: route?.email ?? "", emailedByJenniferAt: now(), emailedBy: actor }), `Final email submitted by ${actor}`)}>Mark Emailed</PrimaryButton>
        <p className="mt-3 text-xs text-slate-500">Emailed by: {record.emailedBy || "Not submitted"} {record.emailedByJenniferAt && `• ${record.emailedByJenniferAt}`}</p>
      </WorkflowSection>

      {record.stage === "Complete" && <motion.div initial={{ opacity: 0, scale: .95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center"><Sparkles className="mx-auto h-8 w-8 text-amber-500" /><p className="mt-2 text-xl font-black text-emerald-950">Timesheet complete!</p><p className="mt-1 text-sm text-emerald-800">Every required handoff and final submission has been recorded.</p></motion.div>}

      <WorkflowSection title="Notes and correction history" helper="Internal operations notes only" icon={<AlertTriangle className="h-5 w-5" />}>
        <textarea className={`${inputClass} min-h-28`} value={record.notes} onChange={(event) => update((current) => ({ ...current, notes: event.target.value }))} />
      </WorkflowSection>
    </div>
  );
}

function WorkflowSection({ title, helper, icon, locked = false, lockMessage = "", children }: { title: string; helper: string; icon: React.ReactNode; locked?: boolean; lockMessage?: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-slate-200 p-5"><div className="mb-4 flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800">{icon}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-950">{title}</h3>{locked && <StatusBadge tone="slate">Locked for this role</StatusBadge>}</div><p className="mt-1 text-sm leading-6 text-slate-500">{helper}</p></div></div>{locked && <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{lockMessage}</div>}{children}</section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className="mb-1.5 block text-sm font-bold text-slate-700">{label}</span>{children}</label>;
}
