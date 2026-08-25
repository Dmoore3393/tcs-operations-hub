"use client";

import MainLayout from "@/components/layout/MainLayout";
import { SectionCard, StatCard, StatusBadge } from "@/components/hub/HubUI";
import DashboardHero from "@/components/dashboard/Hero";
import MorningBriefing from "@/components/dashboard/MorningBriefing";
import SmartAlertsPanel from "@/components/dashboard/SmartAlertsPanel";
import TodayAtTCS from "@/components/dashboard/TodayAtTCS";
import { canAccessRoute, useAuth } from "@/components/providers/AuthProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { initialChildren, type ChildRecord } from "@/lib/children";
import { childAttendsLocation, starterChildSchedules, type ChildScheduleRecord } from "@/lib/child-schedules";
import { starterKidKareEnrollments, starterTimesheets, type KidKareEnrollment, type TimesheetRecord } from "@/lib/compliance-ops";
import { starterFiles, starterRoutes, starterShifts, starterTasks, starterVehicles, type FileRecord, type Shift, type TransportationRoute, type VehicleRecord, type WorkTask } from "@/lib/hub-data";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { careLocations, locationThemes, starterLocationHours, summarizeHours, type LocationHoursRecord } from "@/lib/location-config";
import { buildBriefingSnapshot, buildSmartAlerts } from "@/lib/operations-intelligence";
import { localIsoDate } from "@/lib/date-utils";
import { buildTransportationFeeExpectations, mondayOfWeek, starterDigitalForms, starterEnrollmentLeads, starterTransportationFees, transportationChargeStatus, type DigitalFormRecord, type EnrollmentLeadRecord, type TransportationFeeRecord } from "@/lib/admin-ops";
import { ArrowRight, Bus, CalendarClock, CheckCircle2, FileCheck2, FileText, FileWarning, HeartPulse, Lock, Printer, ShieldCheck, Utensils, Users } from "lucide-react";
import Link from "next/link";

export default function Home() {
  const { profile } = useAuth();
  const { availableLocations } = useHubLocation();
  const canUseChildren = canAccessRoute(profile, "/children");
  const canUseKidKare = canAccessRoute(profile, "/kidkare");
  const canUseTimesheets = canAccessRoute(profile, "/timesheets");
  const canManageTeam = canAccessRoute(profile, "/team-access");
  const canManageLocations = canAccessRoute(profile, "/locations");
  const canUsePrintStudio = canAccessRoute(profile, "/print-studio");
  const canUseMeals = canAccessRoute(profile, "/meals");
  const canUseDailyCare = canAccessRoute(profile, "/daily-care");
  const canUseShiftReports = canAccessRoute(profile, "/shift-reports");
  const canUseHealthSafety = canAccessRoute(profile, "/health-safety");
  const canUseTransportation = canAccessRoute(profile, "/transportation");
  const canUseTransportationFees = canAccessRoute(profile, "/transportation-fees");
  const canUseEnrollment = canAccessRoute(profile, "/enrollment-pipeline");
  const canUseCompliance = canAccessRoute(profile, "/compliance");
  const canUseDigitalForms = canAccessRoute(profile, "/digital-forms");
  const canUseRatios = canAccessRoute(profile, "/ratios");
  const canUseFiles = canAccessRoute(profile, "/files");
  const canUseWorkPlans = canAccessRoute(profile, "/work-plans");
  const canUseScheduling = canAccessRoute(profile, "/scheduling");
  const canUseAIDirector = canAccessRoute(profile, "/ai-director");
  const administrativeToolsVisible = canUseKidKare || canUseTimesheets;
  const visibleCareLocations = careLocations.filter((item) => availableLocations.includes(item));
  const [children] = usePersistentState<ChildRecord[]>("tcs-children-v1", canUseChildren ? initialChildren : []);
  const [childSchedules] = usePersistentState<ChildScheduleRecord[]>("tcs-child-schedules-v2", (canUseChildren || canUseMeals || canUseTransportation || canUseRatios) ? starterChildSchedules : []);
  const [tasks] = usePersistentState<WorkTask[]>("tcs-work-tasks", canUseWorkPlans ? starterTasks : []);
  const [routes] = usePersistentState<TransportationRoute[]>("tcs-routes", (canUseTransportation || canUseTransportationFees) ? starterRoutes : []);
  const [kidKareRecords] = usePersistentState<KidKareEnrollment[]>("tcs-kidkare-enrollments-v1", canUseKidKare ? starterKidKareEnrollments : []);
  const [timesheets] = usePersistentState<TimesheetRecord[]>("tcs-timesheets-v1", canUseTimesheets ? starterTimesheets : []);
  const [files] = usePersistentState<FileRecord[]>("tcs-files", canUseFiles ? starterFiles : []);
  const [shifts] = usePersistentState<Shift[]>("tcs-shifts", (canUseScheduling || canUseRatios) ? starterShifts : []);
  const [hours] = usePersistentState<LocationHoursRecord[]>("tcs-location-hours-v2", canUseRatios ? starterLocationHours : []);
  const [vehicles] = usePersistentState<VehicleRecord[]>("tcs-vehicles-v2", canUseTransportation ? starterVehicles : []);
  const [enrollmentLeads] = usePersistentState<EnrollmentLeadRecord[]>("tcs-enrollment-pipeline-v1", canUseEnrollment ? starterEnrollmentLeads : []);
  const [digitalForms] = usePersistentState<DigitalFormRecord[]>("tcs-digital-forms-v1", canUseDigitalForms ? starterDigitalForms : []);
  const [transportationFees] = usePersistentState<TransportationFeeRecord[]>("tcs-transportation-fees-v1", canUseTransportationFees ? starterTransportationFees : []);

  const activeChildren = children.filter((child) => child.enrollmentStatus === "Active");
  const totalEnrolled = activeChildren.length;
  const totalPresent = children.filter((child) => child.attendanceToday === "Present").length;
  const openTasks = tasks.filter((task) => !task.completed);
  const urgentTasks = openTasks.filter((task) => task.priority === "Urgent").length;
  const routesNeedingReview = routes.filter((route) => route.status === "Needs Review");
  const kidKareNeedsAction = kidKareRecords.filter((record) => record.required && record.status !== "Enrolled");
  const timesheetsInProgress = timesheets.filter((record) => record.stage !== "Complete");
  const openFiles = files.filter((file) => file.status !== "Complete");
  const openDigitalForms = digitalForms.filter((item) => !["Signed", "Archived"].includes(item.status));
  const activeEnrollmentLeads = enrollmentLeads.filter((item) => !["Enrolled", "Declined"].includes(item.stage));
  const currentWeek = mondayOfWeek();
  const feeExpectations = canUseTransportationFees ? buildTransportationFeeExpectations(children, routes) : [];
  const currentFeeRecords = transportationFees.filter((item) => item.weekOf === currentWeek);
  const feeRecordKeys = new Set(currentFeeRecords.map((item) => `${item.location}|${item.familyKey}`));
  const missingFeeGroups = feeExpectations.filter((item) => !feeRecordKeys.has(`${item.location}|${item.familyKey}`)).length;
  const transportationBillingNeedsAttention = missingFeeGroups + currentFeeRecords.filter((item) => !["Correct", "Resolved"].includes(transportationChargeStatus(item))).length;
  const todayName = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date());
  const todayShifts = shifts.filter((shift) => shift.day === todayName);
  const intelligenceInput = {
    date: localIsoDate(),
    accessibleLocations: visibleCareLocations,
    children,
    schedules: childSchedules,
    shifts,
    routes,
    vehicles,
    hours,
    files,
    tasks,
  };
  const smartAlerts = buildSmartAlerts(intelligenceInput).filter((alert) => canAccessRoute(profile, alert.href));
  const briefingSnapshot = buildBriefingSnapshot(intelligenceInput, smartAlerts);

  const locationPulse = visibleCareLocations.map((location) => {
    const theme = locationThemes[location];
    const matching = activeChildren.filter((child) => childAttendsLocation(child, childSchedules.find((record) => record.childId === child.id), location));
    const present = matching.filter((child) => child.attendanceToday === "Present").length;
    const hoursRecord = hours.find((record) => record.location === location);
    return {
      location,
      name: theme.fullName,
      type: theme.programType,
      capacity: theme.capacity,
      enrolled: matching.length,
      present,
      hours: hoursRecord ? summarizeHours(hoursRecord) : "Hours not entered",
    };
  });

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1600px] space-y-6">
        <DashboardHero />
        <MorningBriefing snapshot={briefingSnapshot} />
        <TodayAtTCS
          date={localIsoDate()}
          shifts={shifts}
          routes={routes}
          tasks={tasks}
          leads={enrollmentLeads}
          permissions={{ scheduling: canUseScheduling, transportation: canUseTransportation, workPlans: canUseWorkPlans, enrollment: canUseEnrollment, meals: canUseMeals }}
        />

        <section className={`grid gap-4 sm:grid-cols-2 ${administrativeToolsVisible ? "xl:grid-cols-6" : "xl:grid-cols-4"}`}>
          <StatCard label="Children Enrolled" value={totalEnrolled} helper={`Across ${visibleCareLocations.length} accessible location${visibleCareLocations.length === 1 ? "" : "s"}`} icon={<Users className="h-5 w-5" />} tone="emerald" />
          <StatCard label="Present Today" value={totalPresent} helper={`${Math.max(totalEnrolled - totalPresent, 0)} absent or not marked present`} icon={<CheckCircle2 className="h-5 w-5" />} tone="blue" />
          {canUseWorkPlans && <StatCard label="Open Work Items" value={openTasks.length} helper={`${urgentTasks} marked urgent`} icon={<CalendarClock className="h-5 w-5" />} tone="amber" />}
          {canUseTransportation && <StatCard label="Routes to Review" value={routesNeedingReview.length} helper="Rider or route details need attention" icon={<Bus className="h-5 w-5" />} tone="purple" />}
          {canUseKidKare && <StatCard label="KidKare Actions" value={kidKareNeedsAction.length} helper="Child-location records not confirmed" icon={<ShieldCheck className="h-5 w-5" />} tone="amber" />}
          {canUseTimesheets && <StatCard label="Timesheets Moving" value={timesheetsInProgress.length} helper="Across the submission workflow" icon={<FileCheck2 className="h-5 w-5" />} tone="blue" />}
        </section>

        <SmartAlertsPanel alerts={smartAlerts} />

        {(canUseCompliance || canUseEnrollment || canUseTransportationFees || canUseDigitalForms) && <SectionCard title="Administrative Control Center" description="Private Owner/Admin and Licensee workflows only appear when your login is authorized.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {canUseCompliance && <QuickTool href="/compliance" icon={<ShieldCheck className="h-5 w-5" />} title="Compliance Center" helper={`${openFiles.length} file items need attention`} />}
            {canUseEnrollment && <QuickTool href="/enrollment-pipeline" icon={<Users className="h-5 w-5" />} title="Enrollment Pipeline" helper={`${activeEnrollmentLeads.length} active prospect${activeEnrollmentLeads.length === 1 ? "" : "s"}`} />}
            {canUseTransportationFees && <QuickTool href="/transportation-fees" icon={<Bus className="h-5 w-5" />} title="Transportation Fees" helper={transportationBillingNeedsAttention ? `${transportationBillingNeedsAttention} billing item${transportationBillingNeedsAttention === 1 ? "" : "s"} need review` : "Current week matches entered billing records"} />}
            {canUseDigitalForms && <QuickTool href="/digital-forms" icon={<FileText className="h-5 w-5" />} title="Digital Forms" helper={`${openDigitalForms.length} open signature workflow${openDigitalForms.length === 1 ? "" : "s"}`} />}
          </div>
        </SectionCard>}

        <SectionCard title="Employee Care Tools" description="Fast staff-only entry points for today’s classroom and shift workflow" action={<span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-700"><Lock className="h-3.5 w-3.5" /> Parent portal off</span>}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {canUseMeals && <QuickTool href="/meals" icon={<Utensils className="h-5 w-5" />} title="Meals & Menus" helper="Weekly menu, food served, child intake" />}
            {canUseDailyCare && <QuickTool href="/daily-care" icon={<Utensils className="h-5 w-5" />} title="Daily Care" helper="Bottles, diapers, potty, rest, notes" />}
            {canUseKidKare && <QuickTool href="/kidkare" icon={<ShieldCheck className="h-5 w-5" />} title="KidKare" helper="Enrollment by child and attending location" />}
            {canUseTimesheets && <QuickTool href="/timesheets" icon={<FileCheck2 className="h-5 w-5" />} title="Timesheets" helper="Signatures, handoffs, scanning, and email" />}
            {canUseShiftReports && <QuickTool href="/shift-reports" icon={<FileText className="h-5 w-5" />} title="Opening / Closing" helper="Private team reports and pickup handoff" />}
            {canUseHealthSafety && <QuickTool href="/health-safety" icon={<HeartPulse className="h-5 w-5" />} title="Health & Safety" helper="Incidents, illness, medication, follow-up" />}
            {canUsePrintStudio && <QuickTool href="/print-studio" icon={<Printer className="h-5 w-5" />} title="Printable Studio" helper="Ratio plans, menus, notices, and more" />}
            {canManageTeam && <QuickTool href="/team-access" icon={<ShieldCheck className="h-5 w-5" />} title="Team Access" helper="Real staff roles, locations, and permissions" />}
          </div>
        </SectionCard>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
          <SectionCard title="Location Pulse" description="Live enrollment and attendance by accessible location" action={canManageLocations ? <Link href="/locations" className="text-sm font-bold text-emerald-700 hover:text-emerald-800">Manage locations →</Link> : undefined}>
            <div className="space-y-4">
              {locationPulse.map((location) => {
                const enrollmentPercent = location.capacity ? Math.round((location.enrolled / location.capacity) * 100) : 0;
                return <div key={location.location} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-slate-950">{location.name}</p><p className="mt-1 text-xs text-slate-500">{location.type} • {location.hours}</p></div><div className="flex gap-5 text-sm"><Metric label="PRESENT" value={location.present} /><Metric label="ENROLLED" value={location.enrolled} /><Metric label="SPACE" value={Math.max(location.capacity - location.enrolled, 0)} green /></div></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(enrollmentPercent, 100)}%` }} /></div><p className="mt-2 text-right text-xs font-bold text-slate-500">{enrollmentPercent}% enrolled</p></div>;
              })}
            </div>
          </SectionCard>

          <div className="space-y-6">
            <SectionCard title="Needs Attention" description="Live items still open">
              <div className="space-y-3">
                {canUseFiles && <AlertItem icon={<FileWarning className="h-5 w-5" />} title={`${openFiles.length} file items open`} helper="Missing, unsigned, or expiring records" href="/files" tone={openFiles.length ? "red" : "blue"} />}
                {canUseTransportationFees && transportationBillingNeedsAttention > 0 && <AlertItem icon={<Bus className="h-5 w-5" />} title={`${transportationBillingNeedsAttention} transportation billing item${transportationBillingNeedsAttention === 1 ? "" : "s"} need review`} helper="Routes and weekly charges do not fully match yet" href="/transportation-fees" tone="amber" />}
                {canUseEnrollment && activeEnrollmentLeads.some((lead) => lead.followUpDate && new Date(`${lead.followUpDate}T12:00:00`) < new Date()) && <AlertItem icon={<Users className="h-5 w-5" />} title="Enrollment follow-up is overdue" helper="Open the pipeline to review pending family follow-ups" href="/enrollment-pipeline" tone="amber" />}
                {canUseTransportation && <AlertItem icon={<Bus className="h-5 w-5" />} title={`${routesNeedingReview.length} routes need review`} helper="Confirm riders, drivers, vehicles, and school times" href="/transportation" tone="amber" />}
                {canUseKidKare && <AlertItem icon={<ShieldCheck className="h-5 w-5" />} title={`${kidKareNeedsAction.length} KidKare records need action`} helper="Every child needs enrollment for each location attended" href="/kidkare" tone="amber" />}
                {canUseTimesheets && <AlertItem icon={<FileCheck2 className="h-5 w-5" />} title={`${timesheetsInProgress.length} timesheets are in progress`} helper="See exactly which person or handoff is next" href="/timesheets" tone="blue" />}
              </div>
            </SectionCard>

            <SectionCard title="Friday Deadline" description="Family schedules are due by 6 PM"><div className="rounded-2xl bg-emerald-50 p-4"><div className="flex items-start gap-3"><CalendarClock className="mt-0.5 h-5 w-5 text-emerald-700" /><div><p className="font-black text-emerald-950">Send schedule reminder</p><p className="mt-1 text-sm leading-6 text-emerald-800">Remind families that late schedules may affect available care and transportation.</p></div></div>{canUseAIDirector && <Link href="/ai-director" className="mt-4 inline-flex items-center gap-2 text-sm font-black text-emerald-800">Draft reminder <ArrowRight className="h-4 w-4" /></Link>}</div></SectionCard>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          {canUseScheduling && <SectionCard title="Today’s Coverage" description={`${todayName} staff shifts`}>
            <div className="space-y-3">{todayShifts.length ? todayShifts.map((shift) => <div key={shift.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3"><div><p className="font-bold text-slate-900">{shift.location}</p><p className="text-sm text-slate-500">{shift.employee} • {shift.start}–{shift.end} • {shift.assignment}</p></div><StatusBadge tone="green">Scheduled</StatusBadge></div>) : <EmptyMessage text="No staff shifts have been entered for today." href="/scheduling" label="Open Staff Scheduling" />}</div>
          </SectionCard>}

          {canUseWorkPlans && <SectionCard title="This Week’s Priorities" description={`${openTasks.length} items still open`} action={<Link href="/work-plans" className="text-sm font-bold text-emerald-700">View all →</Link>}>
            <div className="space-y-3">{openTasks.length ? openTasks.slice(0, 5).map((task) => <div key={task.id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0"><div><p className="font-bold text-slate-900">{task.title}</p><p className="mt-1 text-xs text-slate-500">{task.owner} • Due {task.due}</p></div><StatusBadge tone={task.priority === "Urgent" ? "red" : task.priority === "High" ? "amber" : "slate"}>{task.priority}</StatusBadge></div>) : <EmptyMessage text="No open work-plan items yet." href="/work-plans" label="Create Work Plan" />}</div>
          </SectionCard>}
        </div>
      </div>
    </MainLayout>
  );
}

function Metric({ label, value, green = false }: { label: string; value: number; green?: boolean }) { return <div><p className="text-xs font-bold text-slate-400">{label}</p><p className={`font-black ${green ? "text-emerald-700" : "text-slate-900"}`}>{value}</p></div>; }

function EmptyMessage({ text, href, label }: { text: string; href: string; label: string }) { return <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center"><p className="text-sm text-slate-500">{text}</p><Link href={href} className="mt-3 inline-flex text-sm font-black text-emerald-800">{label} →</Link></div>; }

function AlertItem({ icon, title, helper, href, tone }: { icon: React.ReactNode; title: string; helper: string; href: string; tone: "red" | "amber" | "blue" }) {
  const colors = { red: "bg-red-50 text-red-700", amber: "bg-amber-50 text-amber-700", blue: "bg-blue-50 text-blue-700" };
  return <Link href={href} className="flex items-start gap-3 rounded-2xl border border-slate-200 p-3 transition hover:border-emerald-300 hover:bg-emerald-50/30"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colors[tone]}`}>{icon}</div><div className="min-w-0 flex-1"><p className="font-black text-slate-950">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p></div><ArrowRight className="mt-2 h-4 w-4 text-slate-400" /></Link>;
}

function QuickTool({ href, icon, title, helper }: { href: string; icon: React.ReactNode; title: string; helper: string }) {
  return <Link href={href} className="group flex items-start gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-emerald-300 hover:bg-emerald-50/30"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 transition group-hover:bg-emerald-600 group-hover:text-white">{icon}</div><div className="min-w-0 flex-1"><p className="font-black text-slate-950">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p></div><ArrowRight className="mt-2 h-4 w-4 text-slate-400" /></Link>;
}
