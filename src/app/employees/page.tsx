"use client";

import MainLayout from "@/components/layout/MainLayout";
import { PageIntro, SectionCard, StatCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { useAuth } from "@/components/providers/AuthProvider";
import { type StaffLaneProfile, laneDisplayName, laneLevelLabel } from "@/lib/staff-lanes";
import { BriefcaseBusiness, Link2, LoaderCircle, Search, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type LanePayload = {
  lanes: StaffLaneProfile[];
  currentUserId: string;
  canManageLanes: boolean;
};

export default function EmployeesPage() {
  const { session, isSystemOwner } = useAuth();
  const [payload, setPayload] = useState<LanePayload>({ lanes: [], currentUserId: "", canManageLanes: false });
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("All Lanes");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const response = await fetch("/api/staff-lanes", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({})) as LanePayload & { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not load employees.");
      setPayload(body);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load employees.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => ["All Lanes", ...Array.from(new Set(payload.lanes.map((lane) => lane.lane_group)))], [payload.lanes]);
  const filtered = useMemo(() => payload.lanes.filter((lane) => {
    const term = search.trim().toLowerCase();
    const matchesTerm = !term || [
      lane.full_name,
      lane.preferred_name,
      lane.job_title,
      lane.secondary_title,
      lane.primary_location,
      lane.department,
      lane.reports_to_label,
    ].filter(Boolean).join(" ").toLowerCase().includes(term);
    const matchesGroup = group === "All Lanes" || lane.lane_group === group;
    return matchesTerm && matchesGroup;
  }), [group, payload.lanes, search]);

  const linked = payload.lanes.filter((lane) => lane.staff_user_id).length;
  const leadership = payload.lanes.filter((lane) => lane.lane_level && lane.lane_level <= 3).length;
  const activeAccounts = payload.lanes.filter((lane) => lane.account_active === true).length;

  return <MainLayout><div className="mx-auto max-w-[1550px] space-y-6 pb-12">
    <PageIntro
      eyebrow="Live team directory"
      title="Employees"
      description="Employee identity comes from the approved TCS lane sheets. Hub access, locations, scheduling, training, performance, and files sit underneath that lane instead of replacing the person’s real job title."
      actions={isSystemOwner ? <Link href="/team-access" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white"><ShieldCheck className="h-4 w-4" /> Manage Hub Access</Link> : undefined}
    />

    {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">{error}</div>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Approved Lanes" value={payload.lanes.length} icon={<BriefcaseBusiness className="h-5 w-5" />} />
      <StatCard label="Leadership Lanes" value={leadership} icon={<Users className="h-5 w-5" />} tone="emerald" />
      <StatCard label="Hub Accounts Linked" value={linked} icon={<Link2 className="h-5 w-5" />} tone="blue" />
      <StatCard label="Active Hub Accounts" value={activeAccounts} icon={<ShieldCheck className="h-5 w-5" />} tone="amber" />
    </section>

    <SectionCard>
      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
        <label className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee, lane, site, department, or supervisor…" /></label>
        <select className={inputClass} value={group} onChange={(event) => setGroup(event.target.value)}>{groups.map((item) => <option key={item}>{item}</option>)}</select>
      </div>
    </SectionCard>

    {loading ? <div className="flex min-h-72 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-sm font-black text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading live team directory…</div> :
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((lane) => <article key={lane.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-lg font-black text-emerald-900">{lane.full_name.split(/\s+/).map((item) => item[0]).join("").slice(0, 2)}</div>
            <div className="flex flex-wrap justify-end gap-2">{lane.lane_level && <StatusBadge tone="green">{laneLevelLabel(lane)}</StatusBadge>}<StatusBadge tone={lane.staff_user_id ? lane.account_active ? "blue" : "amber" : "slate"}>{lane.staff_user_id ? lane.account_active ? "Hub Active" : "Hub Paused" : "No Hub Login"}</StatusBadge></div>
          </div>
          <h2 className="mt-4 text-xl font-black text-slate-950">{laneDisplayName(lane)}</h2>
          <p className="text-sm font-black text-emerald-800">{lane.job_title}</p>
          {lane.secondary_title && <p className="mt-1 text-xs font-bold text-amber-700">{lane.secondary_title}</p>}
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm">
            <p><span className="font-black text-slate-500">Lane:</span> <span className="font-semibold text-slate-800">{lane.lane_group}</span></p>
            {lane.primary_location && <p className="mt-2"><span className="font-black text-slate-500">Primary location:</span> <span className="font-semibold text-slate-800">{lane.primary_location}</span></p>}
            <p className="mt-2"><span className="font-black text-slate-500">Reports to:</span> <span className="font-semibold text-slate-800">{lane.reports_to_label || "Executive / ownership level"}</span></p>
          </div>
          {lane.lane_summary && <p className="mt-4 text-xs font-semibold leading-5 text-slate-600">{lane.lane_summary}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/organization" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">View Organization</Link>
            {lane.staff_user_id && <Link href="/staff-performance" className="rounded-xl bg-emerald-800 px-3 py-2 text-xs font-black text-white">Performance</Link>}
            {isSystemOwner && <Link href="/team-access" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">Access</Link>}
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3 text-[9px] font-black uppercase tracking-wider text-slate-400">Hub access: {lane.access_role || "Not assigned"} • Source: {lane.source_label}</div>
        </article>)}
      </section>
    }
  </div></MainLayout>;
}
