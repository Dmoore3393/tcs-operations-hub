"use client";

import MainLayout from "@/components/layout/MainLayout";
import { canAccessRoute, useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { starterEnrollmentLeads } from "@/lib/admin-ops";
import type { ChildRecord } from "@/lib/children";
import {
  buildEnrollmentForecast,
  pipelineDemandByAge,
  upcomingEnrollmentEvents,
  type ForecastHorizon,
} from "@/lib/enrollment-forecast";
import { normalizeLocation } from "@/lib/location-config";
import { normalizeTourLead, type TourBoardLead } from "@/lib/tour-board";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Baby,
  Building2,
  CalendarDays,
  CheckCircle2,
  LoaderCircle,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type LiveLocation = {
  id: string;
  slug: string;
  name: string;
  fullName: string;
  capacity: number;
  programType: string;
  colorPrimary: string;
  colorSecondary: string;
};

function formatDate(value: string) {
  if (!value) return "Date needed";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export default function EnrollmentForecastPage() {
  const { session, profile } = useAuth();
  const { location, availableLocations } = useHubLocation();
  const [horizon, setHorizon] = useState<ForecastHorizon>(30);
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [locations, setLocations] = useState<LiveLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [storedLeads, , leadsHydrated] = usePersistentState<TourBoardLead[]>(
    "tcs-enrollment-pipeline-v1",
    starterEnrollmentLeads.map((item) => normalizeTourLead(item as any)),
  );

  const allowed = canAccessRoute(profile, "/enrollment-forecast");

  const load = useCallback(async () => {
    if (!session?.access_token || !allowed) return;
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/children", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as {
        children?: ChildRecord[];
        locations?: LiveLocation[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Could not load enrollment records.");
      setChildren(Array.isArray(payload.children) ? payload.children : []);
      setLocations(Array.isArray(payload.locations) ? payload.locations : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load enrollment records.");
    } finally {
      setLoading(false);
    }
  }, [allowed, session?.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  const leads = useMemo(
    () => storedLeads.map((item) => normalizeTourLead(item as any)),
    [storedLeads],
  );

  const authorizedLocationNames = useMemo(
    () => new Set(
      availableLocations
        .filter((item) => item !== "All Locations")
        .map((item) => normalizeLocation(item)),
    ),
    [availableLocations],
  );

  const visibleLocations = useMemo(() => locations.filter((site) => {
    const key = normalizeLocation(`${site.slug} ${site.name} ${site.fullName}`);
    if (key === "All Locations") return false;
    if (!authorizedLocationNames.has(key)) return false;
    return location === "All Locations" || key === normalizeLocation(location);
  }), [authorizedLocationNames, location, locations]);

  const visibleKeys = useMemo(
    () => new Set(
      visibleLocations
        .map((site) => normalizeLocation(`${site.slug} ${site.name} ${site.fullName}`))
        .filter((item) => item !== "All Locations"),
    ),
    [visibleLocations],
  );

  const visibleChildren = useMemo(
    () => children.filter((child) => {
      const key = normalizeLocation(child.location);
      return key !== "All Locations" && visibleKeys.has(key);
    }),
    [children, visibleKeys],
  );

  const visibleLeads = useMemo(
    () => leads.filter((lead) => {
      const key = normalizeLocation(lead.location);
      return key !== "All Locations" && visibleKeys.has(key);
    }),
    [leads, visibleKeys],
  );

  const snapshot = useMemo(
    () => buildEnrollmentForecast({
      children: visibleChildren,
      leads: visibleLeads,
      locations: visibleLocations,
      horizon,
    }),
    [horizon, visibleChildren, visibleLeads, visibleLocations],
  );

  const events = useMemo(
    () => upcomingEnrollmentEvents({
      children: visibleChildren,
      leads: visibleLeads,
      horizon: 90,
    }).slice(0, 16),
    [visibleChildren, visibleLeads],
  );

  const demandByAge = useMemo(() => pipelineDemandByAge(visibleLeads), [visibleLeads]);
  const unknownDates = snapshot.totals.undatedPending + snapshot.totals.undatedPipeline;
  const projectedPct = pct(snapshot.totals.projectedEnrollment, snapshot.totals.capacity);

  if (!allowed) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-3xl rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-9 w-9 text-amber-600" />
          <h1 className="mt-3 text-2xl font-black text-slate-950">Enrollment Forecast is restricted</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">This planning view is available to Owner/Admin and authorized enrollment leadership.</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1500px] space-y-6 pb-12">
        <section className="overflow-hidden rounded-[32px] bg-gradient-to-br from-[#102a20] via-[#1f5a3d] to-[#4b7b59] p-6 text-white shadow-xl sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[.2em] text-emerald-200">Enrollment planning</p>
              <h1 className="mt-2 text-3xl font-black sm:text-4xl">Enrollment Forecast</h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-emerald-50/80">
                See expected openings before they happen. Confirmed projections use active enrollment, planned child exits, pending child start dates, and enrolled Tour Board families. General prospects stay separate as pipeline demand so they do not inflate confirmed enrollment.
              </p>
            </div>

            <div className="flex rounded-2xl bg-white/10 p-1">
              {([30, 60, 90] as ForecastHorizon[]).map((days) => (
                <button
                  key={days}
                  onClick={() => setHorizon(days)}
                  className={`rounded-xl px-4 py-2.5 text-xs font-black transition ${horizon === days ? "bg-white text-emerald-950 shadow-sm" : "text-white/75 hover:bg-white/10"}`}
                >
                  {days} Days
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-xs font-semibold text-emerald-50/75">
            Forecast window: <strong className="text-white">{formatDate(snapshot.asOf)}</strong> through <strong className="text-white">{formatDate(snapshot.through)}</strong>
          </div>
        </section>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900">{error}</div>}

        {(loading || !leadsHydrated) ? (
          <section className="grid min-h-72 place-items-center rounded-[28px] border border-slate-200 bg-white">
            <div className="text-center">
              <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-emerald-700" />
              <p className="mt-3 text-sm font-black text-slate-600">Building the enrollment forecast…</p>
            </div>
          </section>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <MetricCard icon={<Users />} label="Current Enrolled" value={snapshot.totals.currentActive} helper={`${snapshot.totals.capacity} licensed spaces`} tone="slate" />
              <MetricCard icon={<ArrowUpRight />} label="Confirmed Starts" value={snapshot.totals.confirmedStarts} helper={`Within ${horizon} days`} tone="green" />
              <MetricCard icon={<ArrowDownRight />} label="Planned Exits" value={snapshot.totals.plannedExits} helper={`Within ${horizon} days`} tone="amber" />
              <MetricCard icon={<TrendingUp />} label="Projected Enrolled" value={snapshot.totals.projectedEnrollment} helper={`${projectedPct}% of capacity`} tone="blue" />
              <MetricCard icon={<CheckCircle2 />} label="Projected Openings" value={snapshot.totals.projectedOpenSpots} helper={snapshot.totals.projectedOverCapacity ? `${snapshot.totals.projectedOverCapacity} over capacity` : "Confirmed projection"} tone={snapshot.totals.projectedOverCapacity ? "red" : "green"} />
              <MetricCard icon={<Sparkles />} label="Pipeline Demand" value={snapshot.totals.pipelineDemand} helper="Prospects, not confirmed" tone="purple" />
            </section>

            {unknownDates > 0 && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-700" />
                  <div>
                    <p className="font-black text-amber-950">{unknownDates} enrollment item{unknownDates === 1 ? "" : "s"} need a date</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-amber-800">
                      {snapshot.totals.undatedPending} pending child record{snapshot.totals.undatedPending === 1 ? "" : "s"} and {snapshot.totals.undatedPipeline} active Tour Board lead{snapshot.totals.undatedPipeline === 1 ? "" : "s"} do not have a planned/preferred start date, so they are not included in timed projections.
                    </p>
                  </div>
                </div>
              </section>
            )}

            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-700">By location</p>
                  <h2 className="mt-1 text-xl font-black text-slate-950">Projected capacity</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Confirmed occupancy and separate pipeline pressure for the selected forecast window.</p>
                </div>
                <div className="flex gap-2">
                  <Link href="/children" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">Child Records</Link>
                  <Link href="/enrollment-pipeline" className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white">Tour Board</Link>
                </div>
              </div>

              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-3">Location</th>
                      <th className="px-3 py-3 text-center">Capacity</th>
                      <th className="px-3 py-3 text-center">Current</th>
                      <th className="px-3 py-3 text-center">Starts</th>
                      <th className="px-3 py-3 text-center">Exits</th>
                      <th className="px-3 py-3 text-center">Projected</th>
                      <th className="px-3 py-3 text-center">Open</th>
                      <th className="px-3 py-3 text-center">Pipeline</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {snapshot.rows.map((row) => {
                      const occupancy = pct(row.projectedEnrollment, row.capacity);
                      return (
                        <tr key={row.location} className={row.projectedOverCapacity ? "bg-red-50/50" : ""}>
                          <td className="px-3 py-4">
                            <div className="flex items-start gap-3">
                              <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Building2 className="h-4 w-4" /></span>
                              <div>
                                <p className="font-black text-slate-950">{row.location}</p>
                                <p className="mt-1 max-w-64 text-[10px] font-semibold text-slate-500">{row.displayName}</p>
                                <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-slate-100">
                                  <div className={`h-full rounded-full ${row.projectedOverCapacity ? "bg-red-500" : occupancy >= 90 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, occupancy)}%` }} />
                                </div>
                              </div>
                            </div>
                          </td>
                          <NumberCell value={row.capacity} />
                          <NumberCell value={row.currentActive} />
                          <NumberCell value={row.confirmedStarts} tone={row.confirmedStarts ? "green" : undefined} />
                          <NumberCell value={row.plannedExits} tone={row.plannedExits ? "amber" : undefined} />
                          <NumberCell value={row.projectedEnrollment} strong tone={row.projectedOverCapacity ? "red" : undefined} />
                          <NumberCell value={row.projectedOpenSpots} strong tone={row.projectedOpenSpots ? "green" : row.projectedOverCapacity ? "red" : undefined} />
                          <NumberCell value={row.pipelineDemand} tone={row.pipelineDemand ? "purple" : undefined} />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
              <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-5 w-5 text-blue-700" />
                  <div>
                    <h2 className="font-black text-slate-950">Next 90 Days</h2>
                    <p className="text-xs font-semibold text-slate-500">Confirmed starts, planned exits, and dated pipeline interest.</p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {events.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm font-semibold text-slate-500">No dated enrollment changes have been entered for the next 90 days.</p>
                  ) : events.map((event, index) => (
                    <div key={`${event.date}-${event.type}-${event.name}-${index}`} className="grid grid-cols-[88px_1fr_auto] items-center gap-3 rounded-2xl border border-slate-200 p-3">
                      <span className="text-xs font-black text-slate-600">{formatDate(event.date).replace(`, ${new Date().getFullYear()}`, "")}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-950">{event.name}</p>
                        <p className="mt-1 truncate text-[10px] font-semibold text-slate-500">{event.location} • {event.detail}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[9px] font-black ${event.type === "Confirmed Start" ? "bg-emerald-100 text-emerald-800" : event.type === "Planned Exit" ? "bg-amber-100 text-amber-900" : "bg-violet-100 text-violet-800"}`}>{event.type}</span>
                    </div>
                  ))}
                </div>
              </section>

              <div className="space-y-6">
                <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <Baby className="h-5 w-5 text-violet-700" />
                    <div>
                      <h2 className="font-black text-slate-950">Pipeline Demand by Program</h2>
                      <p className="text-xs font-semibold text-slate-500">What prospective families are asking for.</p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {demandByAge.length === 0 ? (
                      <p className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No active pipeline demand yet.</p>
                    ) : demandByAge.slice(0, 8).map((item) => {
                      const max = demandByAge[0]?.count || 1;
                      return (
                        <div key={item.label}>
                          <div className="flex items-center justify-between text-xs"><span className="font-bold text-slate-700">{item.label}</span><strong>{item.count}</strong></div>
                          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.max(8, Math.round((item.count / max) * 100))}%` }} /></div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-5">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-5 w-5 flex-none text-emerald-700" />
                    <div>
                      <h2 className="font-black text-emerald-950">How to keep this accurate</h2>
                      <p className="mt-2 text-xs font-semibold leading-5 text-emerald-900/80">Use <strong>Planned Start Date</strong> for pending children, <strong>Planned Last Day</strong> when a family gives notice, and <strong>Preferred Start Date</strong> on Tour Board leads. Prospects remain separate until enrollment is confirmed.</p>
                    </div>
                  </div>
                  <Link href="/children" className="mt-4 inline-flex items-center gap-2 text-xs font-black text-emerald-900">Update child dates <ArrowRight className="h-4 w-4" /></Link>
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}

function MetricCard({
  icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  helper: string;
  tone: "slate" | "green" | "amber" | "blue" | "purple" | "red";
}) {
  const styles = {
    slate: "border-slate-200 bg-white text-slate-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    purple: "border-violet-200 bg-violet-50 text-violet-900",
    red: "border-red-200 bg-red-50 text-red-900",
  };

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${styles[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/70 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <strong className="text-2xl font-black">{value}</strong>
      </div>
      <p className="mt-3 text-[10px] font-black uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 text-[10px] font-semibold opacity-70">{helper}</p>
    </div>
  );
}

function NumberCell({
  value,
  tone,
  strong = false,
}: {
  value: number;
  tone?: "green" | "amber" | "purple" | "red";
  strong?: boolean;
}) {
  const tones = {
    green: "text-emerald-700",
    amber: "text-amber-700",
    purple: "text-violet-700",
    red: "text-red-700",
  };

  return (
    <td className={`px-3 py-4 text-center ${strong ? "text-base font-black" : "text-sm font-bold"} ${tone ? tones[tone] : "text-slate-700"}`}>
      {value}
    </td>
  );
}
