"use client";

import MainLayout from "@/components/layout/MainLayout";
import { PageIntro, SectionCard, StatCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { useAuth } from "@/components/providers/AuthProvider";
import { type StaffLaneProfile, laneDisplayName, laneLevelLabel } from "@/lib/staff-lanes";
import {
  Building2,
  Crown,
  LoaderCircle,
  Search,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type LanePayload = {
  lanes: StaffLaneProfile[];
  currentUserId: string;
  canManageLanes: boolean;
};

const groupOrder = [
  "Executive",
  "Regional Leadership",
  "Site Directors",
  "Classroom Leadership",
  "Classroom Team",
  "Substitute Team",
  "Maintenance Department",
];

function groupIcon(group: string) {
  if (group === "Executive") return <Crown className="h-5 w-5" />;
  if (group === "Maintenance Department") return <Wrench className="h-5 w-5" />;
  if (group === "Site Directors") return <Building2 className="h-5 w-5" />;
  return <Users className="h-5 w-5" />;
}

export default function OrganizationPage() {
  const { session } = useAuth();
  const [payload, setPayload] = useState<LanePayload>({ lanes: [], currentUserId: "", canManageLanes: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const response = await fetch("/api/staff-lanes", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({})) as LanePayload & { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not load the TCS lane directory.");
      setPayload(body);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the TCS lane directory.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return payload.lanes.filter((lane) => {
      if (!term) return true;
      return [
        lane.full_name,
        lane.preferred_name,
        lane.job_title,
        lane.secondary_title,
        lane.lane_group,
        lane.department,
        lane.primary_location,
        lane.reports_to_label,
      ].filter(Boolean).join(" ").toLowerCase().includes(term);
    });
  }, [payload.lanes, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, StaffLaneProfile[]>();
    for (const lane of visible) {
      const list = map.get(lane.lane_group) ?? [];
      list.push(lane);
      map.set(lane.lane_group, list);
    }
    return [...map.entries()].sort((a, b) => {
      const ai = groupOrder.indexOf(a[0]);
      const bi = groupOrder.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [visible]);

  const linkedAccounts = payload.lanes.filter((lane) => lane.staff_user_id).length;
  const ownerAdmins = payload.lanes.filter((lane) => lane.access_role === "Owner / Admin").length;
  const managers = payload.lanes.filter((lane) => lane.reports_to_label).length;

  return <MainLayout><div className="mx-auto max-w-[1600px] space-y-6 pb-12">
    <PageIntro
      eyebrow="Chain of command • lane sheets • authority"
      title="Organization & TCS Lanes"
      description="The lane sheet is the source of truth for each person’s job title, reporting line, and operational responsibilities. Hub access is tracked separately so software permissions never replace someone’s real TCS position."
    />

    <section className="overflow-hidden rounded-[30px] border border-amber-300/30 bg-gradient-to-br from-[#102419] via-[#174d34] to-[#8a6416] p-6 text-white shadow-xl">
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[.16em]"><ShieldCheck className="h-3.5 w-3.5" /> System access ≠ job title</div>
          <h2 className="mt-4 text-3xl font-black">The Hub follows the lane sheets.</h2>
          <p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-white/80">Example: Danielle remains Regional Director even with Owner/Admin technical access. Tony remains Owner • Director of Maintenance while holding full Owner/Admin access. Leadership routing follows the lane chain—not whatever permission label happens to be on the login.</p>
        </div>
        <div className="rounded-2xl bg-white/10 p-4 text-right"><p className="text-[10px] font-black uppercase tracking-wider text-white/65">Lane profiles</p><p className="mt-1 text-3xl font-black">{payload.lanes.length}</p></div>
      </div>
    </section>

    {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">{error}</div>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Lane Profiles" value={payload.lanes.length} icon={<Users className="h-5 w-5" />} />
      <StatCard label="Linked Hub Accounts" value={linkedAccounts} icon={<ShieldCheck className="h-5 w-5" />} tone="blue" />
      <StatCard label="Owner/Admin Access" value={ownerAdmins} icon={<Crown className="h-5 w-5" />} tone="amber" />
      <StatCard label="Reporting Lines" value={managers} icon={<Building2 className="h-5 w-5" />} tone="emerald" />
    </section>

    <SectionCard>
      <label className="relative block"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search person, title, department, location, or supervisor…" /></label>
    </SectionCard>

    {loading ? <div className="flex min-h-72 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-sm font-black text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading approved TCS lanes…</div> :
      <div className="space-y-6">{grouped.map(([group, lanes]) => <SectionCard key={group} title={group} description={group === "Maintenance Department" ? "Maintenance runs in its own department chain while owner-level access remains separate." : undefined} action={<div className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">{groupIcon(group)} {lanes.length}</div>}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{lanes.map((lane) => <article key={lane.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-sm font-black text-emerald-900">{lane.full_name.split(/\s+/).map((part) => part[0]).join("").slice(0,2)}</div>
            <div className="flex flex-wrap justify-end gap-2">{lane.lane_level && <StatusBadge tone="green">{laneLevelLabel(lane)}</StatusBadge>}{lane.access_role && <StatusBadge tone="blue">{lane.access_role}</StatusBadge>}</div>
          </div>
          <h3 className="mt-4 text-xl font-black text-slate-950">{laneDisplayName(lane)}</h3>
          <p className="mt-1 text-sm font-black text-emerald-800">{lane.job_title}</p>
          {lane.secondary_title && <p className="mt-1 text-xs font-bold text-amber-700">{lane.secondary_title}</p>}
          <div className="mt-4 space-y-2 rounded-2xl bg-slate-50 p-4 text-sm">
            {lane.primary_location && <p><span className="font-black text-slate-500">Location:</span> <span className="font-semibold text-slate-800">{lane.primary_location}</span></p>}
            {lane.department && <p><span className="font-black text-slate-500">Department:</span> <span className="font-semibold text-slate-800">{lane.department}</span></p>}
            <p><span className="font-black text-slate-500">Reports to:</span> <span className="font-semibold text-slate-800">{lane.reports_to_label || "Executive / ownership level"}</span></p>
          </div>
          {lane.lane_summary && <p className="mt-4 text-xs font-semibold leading-5 text-slate-600">{lane.lane_summary}</p>}
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[10px] font-black uppercase tracking-wider text-slate-400"><span>{lane.source_label}</span><span>{lane.staff_user_id ? "Hub linked" : "Lane only"}</span></div>
        </article>)}</div>
      </SectionCard>)}</div>
    }
  </div></MainLayout>;
}
