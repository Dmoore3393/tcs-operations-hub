"use client";

import MainLayout from "@/components/layout/MainLayout";
import { PageIntro, PrimaryButton, SectionCard, StatCard, StatusBadge } from "@/components/hub/HubUI";
import { hubLocations, starterEmployees, starterFamilies, starterFiles, starterRoutes } from "@/lib/hub-data";
import { starterCareLogs, starterHealthSafety, starterShiftReports, type CareLogEntry, type HealthSafetyRecord, type ShiftReport } from "@/lib/employee-care";
import { starterKidKareEnrollments, starterTimesheets, type KidKareEnrollment, type TimesheetRecord } from "@/lib/compliance-ops";
import { starterMealServices, type MealServiceRecord } from "@/lib/meals";
import { usePersistentState } from "@/hooks/usePersistentState";
import { BarChart3, Download, FileCheck2, FileSpreadsheet, FileText, HeartPulse, Lock, ShieldCheck, TrendingUp, Utensils, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { recordAuditEvent } from "@/lib/audit";

const attendance = [
  { day: "Mon", present: 37, scheduled: 43 },
  { day: "Tue", present: 40, scheduled: 45 },
  { day: "Wed", present: 36, scheduled: 42 },
  { day: "Thu", present: 40, scheduled: 46 },
  { day: "Fri", present: 32, scheduled: 39 },
];

export default function ReportsPage() {
  const [period, setPeriod] = useState("This Week");
  const [careLogs] = usePersistentState<CareLogEntry[]>("tcs-daily-care-v1", starterCareLogs);
  const [shiftReports] = usePersistentState<ShiftReport[]>("tcs-shift-reports-v1", starterShiftReports);
  const [healthRecords] = usePersistentState<HealthSafetyRecord[]>("tcs-health-safety-v1", starterHealthSafety);
  const [kidKareRecords] = usePersistentState<KidKareEnrollment[]>("tcs-kidkare-enrollments-v1", starterKidKareEnrollments);
  const [timesheets] = usePersistentState<TimesheetRecord[]>("tcs-timesheets-v1", starterTimesheets);
  const [mealServices] = usePersistentState<MealServiceRecord[]>("tcs-meal-services-v1", starterMealServices);
  const enrollment = hubLocations.reduce((sum, location) => sum + location.enrolled, 0);
  const capacity = hubLocations.reduce((sum, location) => sum + location.capacity, 0);

  async function downloadReport() {
    const rows = [
      ["TCS Operations Summary", period],
      ["Metric", "Value"],
      ["Total Enrollment", enrollment],
      ["Licensed Capacity", capacity],
      ["Active Families", starterFamilies.filter((family) => family.status === "Active").length],
      ["Employees", starterEmployees.length],
      ["Open File Items", starterFiles.filter((file) => file.status !== "Complete").length],
      ["Routes Needing Review", starterRoutes.filter((route) => route.status === "Needs Review").length],
      ["Daily Care Entries", careLogs.length],
      ["Meal Services Logged", mealServices.length],
      ["Internal Shift Reports", shiftReports.length],
      ["Health / Safety Open", healthRecords.filter((record) => record.status !== "Resolved").length],
      ["KidKare Enrollments Needing Action", kidKareRecords.filter((record) => record.required && record.status !== "Enrolled").length],
      ["Timesheets In Progress", timesheets.filter((record) => record.stage !== "Complete").length],
      [],
      ["Location", "Capacity", "Enrolled", "Present", "Available"],
      ...hubLocations.map((location) => [location.shortName, location.capacity, location.enrolled, location.present, location.capacity - location.enrolled]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    await recordAuditEvent({ action: "EXPORT", tableName: "reports", metadata: { report: "TCS Operations Summary", period, rowCount: rows.length } });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "tcs-operations-summary.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-6">
    <PageIntro eyebrow="Performance and oversight" title="Reports" description="Review enrollment, attendance, capacity, staffing, compliance, and transportation indicators across the childcare programs." actions={<><select className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold" value={period} onChange={(e) => setPeriod(e.target.value)}><option>This Week</option><option>Last Week</option><option>This Month</option><option>School Year</option></select><PrimaryButton onClick={() => void downloadReport()}><Download className="h-4 w-4" /> Export Summary</PrimaryButton></>} />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Enrollment" value={enrollment} helper={`${Math.round((enrollment / capacity) * 100)}% of entered capacity`} icon={<Users className="h-5 w-5" />} />
      <StatCard label="Average Attendance" value="87%" helper="Based on this week’s sample schedule" icon={<TrendingUp className="h-5 w-5" />} tone="blue" />
      <StatCard label="Open Compliance Items" value={starterFiles.filter((file) => file.status !== "Complete").length} icon={<FileSpreadsheet className="h-5 w-5" />} tone="amber" />
      <StatCard label="Locations Reporting" value={hubLocations.length} icon={<BarChart3 className="h-5 w-5" />} tone="purple" />
    </section>

    <SectionCard title="Employee Operations Summary" description="Private staff records are summarized here but are never included in family-facing exports." action={<span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-700"><Lock className="h-3.5 w-3.5" /> Internal only</span>}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ReportLink href="/meals" icon={<Utensils className="h-5 w-5" />} label="Meal Services" value={mealServices.length} helper={`${careLogs.filter((entry) => entry.category === "Meal").length} individual child meal entries`} />
        <ReportLink href="/daily-care" icon={<Utensils className="h-5 w-5" />} label="Daily Care Entries" value={careLogs.length} helper={`${careLogs.filter((entry) => entry.category === "Bottle").length} bottle logs plus diapers, potty, rest, and notes`} />
        <ReportLink href="/kidkare" icon={<ShieldCheck className="h-5 w-5" />} label="KidKare Actions" value={kidKareRecords.filter((record) => record.required && record.status !== "Enrolled").length} helper="Child-location enrollments still needing confirmation" />
        <ReportLink href="/timesheets" icon={<FileCheck2 className="h-5 w-5" />} label="Timesheets Moving" value={timesheets.filter((record) => record.stage !== "Complete").length} helper={`${timesheets.filter((record) => record.stage === "Jennifer Email").length} waiting on final email`} />
        <ReportLink href="/shift-reports" icon={<FileText className="h-5 w-5" />} label="Shift Reports" value={shiftReports.length} helper={`${shiftReports.filter((report) => report.status === "Submitted").length} awaiting review`} />
        <ReportLink href="/health-safety" icon={<HeartPulse className="h-5 w-5" />} label="Health & Safety" value={healthRecords.length} helper={`${healthRecords.filter((record) => record.status !== "Resolved").length} open or reviewing`} />
        <ReportLink href="/team-access" icon={<Users className="h-5 w-5" />} label="Access Scope" value="Staff" helper="Parent portal remains disabled" />
      </div>
    </SectionCard>

    <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
      <SectionCard title="Attendance Trend" description={`${period} • present compared with scheduled`}>
        <div className="flex h-72 items-end gap-4 pt-6">{attendance.map((item) => { const height = (item.present / 50) * 100; const scheduledHeight = (item.scheduled / 50) * 100; return <div key={item.day} className="flex min-w-0 flex-1 flex-col items-center"><div className="relative flex h-56 w-full max-w-20 items-end justify-center rounded-t-xl bg-slate-100"><div className="absolute bottom-0 w-full rounded-t-xl bg-slate-300" style={{ height: `${scheduledHeight}%` }} /><div className="absolute bottom-0 w-3/5 rounded-t-lg bg-emerald-500" style={{ height: `${height}%` }} /><span className="absolute -top-6 text-xs font-black text-slate-700">{item.present}/{item.scheduled}</span></div><p className="mt-3 text-sm font-black text-slate-600">{item.day}</p></div>; })}</div>
        <div className="mt-4 flex justify-center gap-5 text-xs font-bold text-slate-500"><span className="flex items-center gap-2"><i className="h-3 w-3 rounded bg-emerald-500" /> Present</span><span className="flex items-center gap-2"><i className="h-3 w-3 rounded bg-slate-300" /> Scheduled</span></div>
      </SectionCard>
      <SectionCard title="Enrollment Mix" description="Current sample enrollment by program"><div className="space-y-4">{hubLocations.map((location) => { const percent = Math.round((location.enrolled / enrollment) * 100); return <div key={location.id}><div className="flex justify-between text-sm"><span className="font-bold text-slate-800">{location.shortName}</span><span className="font-black text-slate-950">{location.enrolled} • {percent}%</span></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent * 2.2}%` }} /></div></div>; })}</div></SectionCard>
    </div>

    <SectionCard title="Location Scorecard" description="A compact view for weekly review">
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400"><th className="pb-3">Location</th><th className="pb-3">Capacity</th><th className="pb-3">Enrolled</th><th className="pb-3">Present</th><th className="pb-3">Available</th><th className="pb-3">Utilization</th><th className="pb-3">Status</th></tr></thead><tbody>{hubLocations.map((location) => { const utilization = Math.round((location.enrolled / location.capacity) * 100); return <tr key={location.id} className="border-b border-slate-100 last:border-0"><td className="py-4"><p className="font-black text-slate-950">{location.name}</p><p className="text-xs text-slate-500">{location.shortName}</p></td><td className="py-4 font-bold">{location.capacity}</td><td className="py-4 font-bold">{location.enrolled}</td><td className="py-4 font-bold">{location.present}</td><td className="py-4 font-black text-emerald-700">{location.capacity - location.enrolled}</td><td className="py-4">{utilization}%</td><td className="py-4"><StatusBadge tone={utilization >= 95 ? "amber" : "green"}>{utilization >= 95 ? "Nearly Full" : "Available"}</StatusBadge></td></tr>; })}</tbody></table></div>
    </SectionCard>
  </div></MainLayout>;
}


function ReportLink({ href, icon, label, value, helper }: { href: string; icon: React.ReactNode; label: string; value: string | number; helper: string }) {
  return <Link href={href} className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-emerald-300 hover:bg-emerald-50/30"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">{icon}</div><div><p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p><p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p></div></Link>;
}
