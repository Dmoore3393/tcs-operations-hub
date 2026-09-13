"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import type { ChildRecord } from "@/lib/children";
import { auditSummary } from "@/lib/child-file-audits";
import { emergencyCardReadiness } from "@/lib/emergency-cards";
import { defaultImmunizationProgram, immunizationStatus, normalizeImmunizationRecord } from "@/lib/immunization-tracker";
import {
  starterFiles,
  starterRoutes,
  starterShifts,
  starterTasks,
  type FileRecord,
  type Shift,
  type TransportationRoute,
  type WorkTask,
} from "@/lib/hub-data";
import { starterTransportationFees, type TransportationFeeRecord } from "@/lib/admin-ops";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  Bus,
  CheckCircle2,
  CircleDollarSign,
  LoaderCircle,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type LeadLike = {
  id?: number | string;
  stage?: string;
  location?: string;
  source?: string;
  leadSource?: string;
  tourHistory?: Array<{ status?: string }>;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export default function ExecutiveDashboardPage() {
  const { session } = useAuth();
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [locations, setLocations] = useState<Array<{ id: string; name: string; fullName: string; capacity: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [routes] = usePersistentState<TransportationRoute[]>("tcs-routes", starterRoutes);
  const [shifts] = usePersistentState<Shift[]>("tcs-shifts", starterShifts);
  const [files] = usePersistentState<FileRecord[]>("tcs-files", starterFiles);
  const [tasks] = usePersistentState<WorkTask[]>("tcs-work-tasks", starterTasks);
  const [leads] = usePersistentState<LeadLike[]>("tcs-enrollment-pipeline-v1", []);
  const [transportFees] = usePersistentState<TransportationFeeRecord[]>("tcs-transportation-fees-v1", starterTransportationFees);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const response = await fetch("/api/children", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json() as {
        children?: ChildRecord[];
        locations?: Array<{ id: string; name: string; fullName: string; capacity: number }>;
      };
      if (response.ok) {
        setChildren(Array.isArray(payload.children) ? payload.children : []);
        setLocations(Array.isArray(payload.locations) ? payload.locations : []);
      }
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  const activeChildren = children.filter((child) => child.enrollmentStatus === "Active");
  const pendingChildren = children.filter((child) => child.enrollmentStatus === "Pending");
  const totalCapacity = locations.reduce((sum, item) => sum + (Number(item.capacity) || 0), 0);
  const openSpaces = Math.max(totalCapacity - activeChildren.length, 0);
  const capacityPct = totalCapacity ? Math.round((activeChildren.length / totalCapacity) * 100) : 0;
  const routesNeedingReview = routes.filter((route) => route.status === "Needs Review").length;
  const fileAttention = files.filter((file) => file.status !== "Complete").length;
  const urgentTasks = tasks.filter((task) => !task.completed && task.priority === "Urgent").length;
  const openLeads = leads.filter((lead) => !["Enrolled", "Declined"].includes(String(lead.stage || ""))).length;
  const scheduledTours = leads.filter((lead) => String(lead.stage || "") === "Tour Scheduled").length;
  const enrolledLeads = leads.filter((lead) => String(lead.stage || "") === "Enrolled").length;
  const conversionRate = leads.length ? Math.round((enrolledLeads / leads.length) * 100) : 0;
  const noShows = leads.reduce((sum, lead) => sum + (lead.tourHistory ?? []).filter((tour) => tour.status === "No Show").length, 0);

  const childReadinessScores = activeChildren.map((child) => {
    const audits = Array.isArray(child.fileAudits) ? child.fileAudits : [];
    const latestAudit = [...audits].sort((a, b) => (b.auditDate || b.updatedAt || "").localeCompare(a.auditDate || a.updatedAt || ""))[0];
    const fileReady = Boolean(latestAudit && auditSummary(latestAudit).complete && child.licensingStatus === "Complete" && child.missingDocuments.length === 0);
    const emergencyReady = emergencyCardReadiness(child).ready;
    const shotRecord = normalizeImmunizationRecord(child.immunizationRecord, defaultImmunizationProgram(child.ageGroup, child.location));
    const shotStatus = immunizationStatus(child.dateOfBirth, shotRecord);
    const shotReady = ["Requirements Met", "Conditional", "Medical Exemption"].includes(shotStatus);
    return Math.round(([fileReady, emergencyReady, shotReady].filter(Boolean).length / 3) * 100);
  });
  const childReadiness = childReadinessScores.length
    ? Math.round(childReadinessScores.reduce((sum, value) => sum + value, 0) / childReadinessScores.length)
    : 100;

  const totalExpectedTransport = transportFees.reduce((sum, record) => sum + record.expectedAmount, 0);
  const totalChargedTransport = transportFees.reduce((sum, record) => sum + record.chargedAmount, 0);
  const paidTransport = transportFees.reduce((sum, record) => sum + (record.paymentStatus === "Paid" ? Math.max(record.chargedAmount, record.expectedAmount) : 0), 0);
  const transportCollectionPct = totalChargedTransport ? Math.round((paidTransport / totalChargedTransport) * 100) : 100;
  const unpaidTransport = transportFees.filter((record) => record.paymentStatus === "Unpaid" && record.expectedAmount > 0).length;

  const funding = useMemo(() => {
    const map = new Map<string, number>();
    activeChildren.forEach((child) => map.set(child.subsidy || "Not Set", (map.get(child.subsidy || "Not Set") || 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [activeChildren]);

  const locationsSummary = useMemo(() => locations.map((site) => {
    const enrolled = activeChildren.filter((child) =>
      child.location.toLowerCase().includes(site.name.toLowerCase()) ||
      child.location.toLowerCase().includes(site.fullName.toLowerCase()) ||
      site.fullName.toLowerCase().includes(child.location.toLowerCase()),
    ).length;
    const capacity = Number(site.capacity) || 0;
    return { ...site, enrolled, open: Math.max(capacity - enrolled, 0), utilization: capacity ? Math.round((enrolled / capacity) * 100) : 0 };
  }), [activeChildren, locations]);

  return <MainLayout><div className="mx-auto max-w-[1600px] space-y-6 pb-12">
    <section className="overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-950 via-[#173d29] to-[#1f4d73] p-6 text-white shadow-2xl sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[.18em] text-emerald-200">Owner / Admin business intelligence</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Executive Operations Dashboard</h1><p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-slate-200">Enrollment, capacity, funding, transportation, compliance, tours, work-plan risk, and billing signals in one company-level view.</p></div>
        <Link href="/ai-director" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950"><Bot className="h-4 w-4" /> Ask TCS AI</Link>
      </div>
    </section>

    {loading ? <div className="flex min-h-28 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Refreshing executive metrics…</div> : null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
      <Kpi icon={<Users className="h-5 w-5" />} label="Active Enrollment" value={activeChildren.length} tone="green" />
      <Kpi icon={<Users className="h-5 w-5" />} label="Pending" value={pendingChildren.length} tone="blue" />
      <Kpi icon={<TrendingUp className="h-5 w-5" />} label="Open Spaces" value={openSpaces} tone="purple" />
      <Kpi icon={<BarChart3 className="h-5 w-5" />} label="Capacity Used" value={`${capacityPct}%`} tone="green" />
      <Kpi icon={<Bus className="h-5 w-5" />} label="Routes Review" value={routesNeedingReview} tone={routesNeedingReview ? "amber" : "green"} />
      <Kpi icon={<ShieldCheck className="h-5 w-5" />} label="File Attention" value={fileAttention} tone={fileAttention ? "amber" : "green"} />
      <Kpi icon={<AlertTriangle className="h-5 w-5" />} label="Urgent Work" value={urgentTasks} tone={urgentTasks ? "red" : "green"} />
      <Kpi icon={<BriefcaseBusiness className="h-5 w-5" />} label="Open Leads" value={openLeads} tone="blue" />
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi icon={<ShieldCheck className="h-5 w-5" />} label="Child Readiness" value={`${childReadiness}%`} tone={childReadiness >= 90 ? "green" : childReadiness >= 75 ? "amber" : "red"} />
      <Kpi icon={<TrendingUp className="h-5 w-5" />} label="Lead Conversion" value={`${conversionRate}%`} tone={conversionRate >= 40 ? "green" : "blue"} />
      <Kpi icon={<BriefcaseBusiness className="h-5 w-5" />} label="Tour No-Shows" value={noShows} tone={noShows ? "amber" : "green"} />
      <Kpi icon={<CircleDollarSign className="h-5 w-5" />} label="Transport Collection" value={`${transportCollectionPct}%`} tone={transportCollectionPct >= 95 ? "green" : transportCollectionPct >= 80 ? "amber" : "red"} />
    </section>

    <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-black text-slate-950">Location capacity</h2><p className="mt-1 text-xs font-semibold text-slate-500">Current active enrollment against configured site capacity.</p></div><Link href="/locations" className="text-xs font-black text-emerald-700">Manage locations →</Link></div>
        <div className="mt-4 space-y-3">{locationsSummary.map((site) => <div key={site.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-slate-950">{site.fullName || site.name}</strong><p className="mt-1 text-[10px] text-slate-500">{site.enrolled} enrolled • {site.open} open</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-700">{site.utilization}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(site.utilization, 100)}%` }} /></div></div>)}</div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black text-slate-950">Funding mix</h2><p className="mt-1 text-xs font-semibold text-slate-500">Active children by current funding source.</p>
        <div className="mt-4 space-y-2">{funding.map(([source, count]) => <div key={source} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3"><span className="text-sm font-bold text-slate-800">{source}</span><strong className="text-sm text-slate-950">{count}</strong></div>)}</div>
        <Link href="/billing-command-center" className="mt-4 inline-flex items-center gap-2 text-xs font-black text-blue-700">Open billing & subsidy <ArrowRight className="h-4 w-4" /></Link>
      </section>
    </div>

    <div className="grid gap-6 xl:grid-cols-3">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3"><BriefcaseBusiness className="h-5 w-5 text-purple-700" /><h2 className="font-black text-slate-950">Enrollment pipeline</h2></div>
        <div className="mt-4 grid grid-cols-2 gap-3"><Mini label="Open leads" value={String(openLeads)} /><Mini label="Tours scheduled" value={String(scheduledTours)} /><Mini label="Enrolled leads" value={String(enrolledLeads)} /><Mini label="Conversion" value={`${conversionRate}%`} /></div>
        <Link href="/enrollment-pipeline" className="mt-4 inline-flex text-xs font-black text-purple-700">Open Tour Board →</Link>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3"><CircleDollarSign className="h-5 w-5 text-emerald-700" /><h2 className="font-black text-slate-950">Transportation revenue audit</h2></div>
        <div className="mt-4 grid grid-cols-2 gap-3"><Mini label="Expected" value={money(totalExpectedTransport)} /><Mini label="Charged" value={money(totalChargedTransport)} /></div>
        <p className="mt-3 text-xs font-semibold text-slate-500">{unpaidTransport} billing group{unpaidTransport === 1 ? "" : "s"} currently marked unpaid.</p>
        <Link href="/transportation-fees" className="mt-4 inline-flex text-xs font-black text-emerald-700">Review fees →</Link>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-blue-700" /><h2 className="font-black text-slate-950">Operating workload</h2></div>
        <div className="mt-4 grid grid-cols-2 gap-3"><Mini label="Staff shifts stored" value={String(shifts.length)} /><Mini label="Urgent tasks" value={String(urgentTasks)} /></div>
        <p className="mt-3 text-xs font-semibold text-slate-500">Use Ratios and Work Plans for the detailed daily operating picture.</p>
        <div className="mt-4 flex gap-3"><Link href="/ratios" className="text-xs font-black text-blue-700">Ratios →</Link><Link href="/work-plans" className="text-xs font-black text-blue-700">Work plans →</Link></div>
      </section>
    </div>
  </div></MainLayout>;
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number | string; tone: "green" | "blue" | "purple" | "amber" | "red" }) {
  const styles = { green: "bg-emerald-100 text-emerald-800", blue: "bg-blue-100 text-blue-800", purple: "bg-purple-100 text-purple-800", amber: "bg-amber-100 text-amber-900", red: "bg-red-100 text-red-800" };
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`grid h-9 w-9 place-items-center rounded-xl ${styles[tone]}`}>{icon}</span><strong className="mt-2 block text-2xl font-black text-slate-950">{value}</strong><span className="text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</span></div>;
}
function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><span className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</span><strong className="mt-1 block text-lg font-black text-slate-900">{value}</strong></div>;
}
