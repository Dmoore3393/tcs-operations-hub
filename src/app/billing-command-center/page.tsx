"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import type { ChildRecord } from "@/lib/children";
import { starterTimesheets, type TimesheetRecord } from "@/lib/compliance-ops";
import { starterTransportationFees, transportationChargeStatus, type TransportationFeeRecord } from "@/lib/admin-ops";
import {
  AlertTriangle,
  BadgeDollarSign,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  FileClock,
  LoaderCircle,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function matchesLocation(value: string, selected: string) {
  if (selected === "All Locations") return true;
  return value.toLowerCase().includes(selected.toLowerCase()) || selected.toLowerCase().includes(value.toLowerCase());
}

export default function BillingCommandCenterPage() {
  const { session } = useAuth();
  const { location } = useHubLocation();
  const [timesheets] = usePersistentState<TimesheetRecord[]>("tcs-timesheets-v1", starterTimesheets);
  const [transportFees] = usePersistentState<TransportationFeeRecord[]>("tcs-transportation-fees-v1", starterTransportationFees);
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const loadChildren = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const response = await fetch("/api/children", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json() as { children?: ChildRecord[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load funding records.");
      setChildren(Array.isArray(payload.children) ? payload.children : []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load funding records.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { void loadChildren(); }, [loadChildren]);

  const activeChildren = useMemo(() => children.filter((child) =>
    child.enrollmentStatus !== "Archived" && matchesLocation(child.location, location),
  ), [children, location]);

  const fundingGroups = useMemo(() => {
    const groups = new Map<string, ChildRecord[]>();
    activeChildren.forEach((child) => {
      const key = child.subsidy || "Not Set";
      groups.set(key, [...(groups.get(key) ?? []), child]);
    });
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [activeChildren]);

  const visibleTimesheets = useMemo(() => timesheets.filter((sheet) =>
    matchesLocation(sheet.location, location),
  ), [location, timesheets]);
  const openTimesheets = visibleTimesheets.filter((sheet) => sheet.stage !== "Complete");
  const visibleTransportFees = useMemo(() => transportFees.filter((fee) =>
    matchesLocation(fee.location, location),
  ), [location, transportFees]);
  const transportAttention = visibleTransportFees.filter((fee) => !["Correct", "Resolved"].includes(transportationChargeStatus(fee)));
  const unpaidTransport = visibleTransportFees.filter((fee) => fee.paymentStatus === "Unpaid" && fee.expectedAmount > 0);
  const expectedTransport = visibleTransportFees.reduce((sum, fee) => sum + fee.expectedAmount, 0);
  const chargedTransport = visibleTransportFees.reduce((sum, fee) => sum + fee.chargedAmount, 0);

  const familyRows = useMemo(() => {
    const map = new Map<string, {
      key: string;
      family: string;
      guardian: string;
      funding: string;
      location: string;
      children: string[];
    }>();
    activeChildren.forEach((child) => {
      const key = String(child.familyId ?? child.familyName ?? child.phone ?? child.primaryGuardian ?? child.id);
      const row = map.get(key) ?? {
        key,
        family: child.familyName || child.primaryGuardian || "Family",
        guardian: child.primaryGuardian,
        funding: child.subsidy || "Not Set",
        location: child.location,
        children: [],
      };
      row.children.push(`${child.firstName} ${child.lastName}`.trim());
      map.set(key, row);
    });
    const query = search.trim().toLowerCase();
    return [...map.values()]
      .filter((row) => !query || `${row.family} ${row.guardian} ${row.funding} ${row.children.join(" ")}`.toLowerCase().includes(query))
      .sort((a, b) => a.family.localeCompare(b.family));
  }, [activeChildren, search]);

  const subsidyChildren = activeChildren.filter((child) => child.subsidy && child.subsidy !== "Cash Pay");
  const cashPayChildren = activeChildren.filter((child) => child.subsidy === "Cash Pay");
  const unsetFunding = activeChildren.filter((child) => !child.subsidy || child.subsidy === "Not Set");

  return <MainLayout><div className="mx-auto max-w-[1550px] space-y-6 pb-12">
    <section className="overflow-hidden rounded-[30px] bg-gradient-to-br from-[#132b42] via-[#1f4d73] to-[#173d29] p-6 text-white shadow-xl sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[.18em] text-blue-200">Family funding + subsidy operations</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Billing & Subsidy Command Center</h1><p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-blue-50/80">See who pays privately, which agency funds each child, what subsidy timesheets are still moving through the workflow, and whether transportation charges match the current route data.</p></div>
        <Link href="/timesheets" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950"><FileClock className="h-4 w-4" /> Open Timesheet Command Center</Link>
      </div>
    </section>

    {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">{error}</div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Metric icon={<Users className="h-5 w-5" />} label="Active Children" value={activeChildren.length} tone="blue" />
      <Metric icon={<CircleDollarSign className="h-5 w-5" />} label="Cash Pay" value={cashPayChildren.length} tone="green" />
      <Metric icon={<Building2 className="h-5 w-5" />} label="Agency Funded" value={subsidyChildren.length} tone="purple" />
      <Metric icon={<FileClock className="h-5 w-5" />} label="Open Timesheets" value={openTimesheets.length} tone={openTimesheets.length ? "amber" : "green"} />
      <Metric icon={<BadgeDollarSign className="h-5 w-5" />} label="Transport Billing Reviews" value={transportAttention.length} tone={transportAttention.length ? "amber" : "green"} />
      <Metric icon={<AlertTriangle className="h-5 w-5" />} label="Funding Not Set" value={unsetFunding.length} tone={unsetFunding.length ? "red" : "green"} />
    </section>

    <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h2 className="text-xl font-black text-slate-950">Funding mix</h2><p className="mt-1 text-xs font-semibold text-slate-500">Current child funding source by selected location scope.</p></div>
        <div className="mt-4 space-y-3">{loading ? <div className="flex min-h-36 items-center justify-center gap-2 text-sm font-bold text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading funding…</div> : fundingGroups.map(([source, group]) => <div key={source} className="flex items-center justify-between rounded-xl border border-slate-200 p-3"><div><strong className="text-sm text-slate-900">{source}</strong><p className="mt-1 text-[10px] text-slate-500">{group.length} child{group.length === 1 ? "" : "ren"}</p></div><span className="grid h-10 min-w-10 place-items-center rounded-xl bg-slate-100 px-2 text-sm font-black text-slate-800">{group.length}</span></div>)}</div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-black text-slate-950">Transportation billing audit</h2><p className="mt-1 text-xs font-semibold text-slate-500">Reconcile route-driven expected charges against what was actually charged.</p></div><Link href="/transportation-fees" className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">Review Fees</Link></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SmallMetric label="Expected" value={money(expectedTransport)} />
          <SmallMetric label="Charged" value={money(chargedTransport)} />
          <SmallMetric label="Unpaid Groups" value={String(unpaidTransport.length)} />
        </div>
        {transportAttention.length > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900"><AlertTriangle className="mr-1 inline h-4 w-4" />{transportAttention.length} transportation billing group{transportAttention.length === 1 ? "" : "s"} need review.</div>}
      </section>
    </div>

    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-5 md:flex-row md:items-end md:justify-between"><div><h2 className="text-xl font-black text-slate-950">Family funding roster</h2><p className="mt-1 text-xs font-semibold text-slate-500">A clean family-level view of the funding source stored in secured child records.</p></div><label className="relative w-full md:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search family, child, or funding…" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm font-semibold" /></label></div>
      <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><th className="px-4 py-3">Family</th><th className="px-4 py-3">Children</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Funding</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{familyRows.map((row) => <tr key={row.key} className="border-b border-slate-100 last:border-0"><td className="px-4 py-4"><p className="font-black text-slate-950">{row.family}</p><p className="mt-1 text-xs text-slate-500">{row.guardian}</p></td><td className="px-4 py-4 font-semibold text-slate-700">{row.children.join(", ")}</td><td className="px-4 py-4 text-xs font-semibold text-slate-600">{row.location}</td><td className="px-4 py-4"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-800">{row.funding}</span></td><td className="px-4 py-4">{row.funding === "Not Set" ? <span className="inline-flex items-center gap-1 text-xs font-black text-red-700"><AlertTriangle className="h-4 w-4" /> Needs correction</span> : <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Set</span>}</td></tr>)}</tbody></table></div>
    </section>

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Quick href="/timesheets" title="Subsidy Timesheets" helper="CCRC Stage 1/2, CCCC, DCFS, Respite workflow" />
      <Quick href="/transportation-fees" title="Transportation Fees" helper="Route-driven weekly charge audit" />
      <Quick href="/families" title="Family Records" helper="Funding source, guardians, enrollment, transportation" />
      <Quick href="/family-access" title="Family Access & Privacy" helper="Separate households, split responsibility, and private parent access" />
    </div>

    <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold leading-5 text-blue-950"><ShieldCheck className="mr-1 inline h-4 w-4" />The Hub does not invent agency payment amounts or department email destinations. Financial totals shown here come only from records already entered in secured TCS workflows.</div>
  </div></MainLayout>;
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "blue" | "green" | "purple" | "amber" | "red" }) {
  const styles = { blue: "bg-blue-100 text-blue-800", green: "bg-emerald-100 text-emerald-800", purple: "bg-purple-100 text-purple-800", amber: "bg-amber-100 text-amber-900", red: "bg-red-100 text-red-800" };
  return <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`grid h-10 w-10 place-items-center rounded-xl ${styles[tone]}`}>{icon}</span><div><strong className="block text-2xl font-black text-slate-950">{value}</strong><span className="text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</span></div></div>;
}
function SmallMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-4"><span className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</span><strong className="mt-1 block text-lg font-black text-slate-900">{value}</strong></div>;
}
function Quick({ href, title, helper }: { href: string; title: string; helper: string }) {
  return <Link href={href} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:bg-slate-50"><strong className="text-sm text-slate-950">{title}</strong><p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p></Link>;
}
