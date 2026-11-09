"use client";

import { useEffect, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import StaffWeekPlanner from "@/components/scheduling/StaffWeekPlanner";
import { hubRequest } from "@/lib/hub-request";
import { supabase } from "@/lib/supabase/client";
import { initialTeamScheduleWeek, scheduleDatePlus, type TeamScheduleData } from "@/lib/team-schedule";

const dateLabel = (date: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

export default function TeamScheduleView() {
  const { session, profile } = useAuth();
  const token = session?.access_token;
  const userId = profile?.user_id;
  const [week, setWeek] = useState(initialTeamScheduleWeek);
  const [data, setData] = useState<TeamScheduleData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!token || !userId) return;
    let cancelled = false;
    let requestNumber = 0;
    const load = async () => {
      const current = ++requestNumber;
      setLoading(true);
      try {
        const result = await hubRequest<TeamScheduleData>(`/api/staff-scheduling/team?week=${encodeURIComponent(week)}`, token);
        if (!cancelled && current === requestNumber) { setData(result); setError(""); }
      } catch (reason) {
        if (!cancelled && current === requestNumber) { setData(null); setError(reason instanceof Error ? reason.message : "Could not load your team's schedule."); }
      } finally {
        if (!cancelled && current === requestNumber) setLoading(false);
      }
    };
    const timer = window.setTimeout(() => void load(), 0);
    const channel = supabase?.channel(`team-schedule-${userId}-${week}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_publications" }, () => void load())
      .subscribe();
    return () => { cancelled = true; window.clearTimeout(timer); if (channel) void supabase?.removeChannel(channel); };
  }, [token, userId, week, refresh]);

  const current = data?.weekOf === week ? data : null;
  const dates = Array.from({ length: 7 }, (_, index) => scheduleDatePlus(week, index));
  return <MainLayout><div className="mx-auto max-w-[1700px] space-y-6 pb-12">
    <section className="rounded-3xl bg-emerald-950 p-6 text-white sm:p-8">
      <h1 className="text-3xl font-black">Team Staff Schedule</h1>
      <p className="mt-3 text-base leading-7">View your location’s published shifts for the whole team, including weekends. Administration publishes schedule changes.</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button className="min-h-11 rounded-xl bg-white/10 px-4 py-3 font-bold" onClick={() => setWeek(scheduleDatePlus(week, -7))}>Previous week</button>
        <strong className="text-base">{dateLabel(week)} – {dateLabel(dates[6])}</strong>
        <button className="min-h-11 rounded-xl bg-white/10 px-4 py-3 font-bold" onClick={() => setWeek(scheduleDatePlus(week, 7))}>Next week</button>
        <button className="min-h-11 rounded-xl bg-white/10 px-4 py-3 font-bold" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Refresh</button>
        <button className="min-h-11 rounded-xl bg-white/10 px-4 py-3 font-bold" onClick={() => window.print()}>Print</button>
      </div>
    </section>
    {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">{error}<button className="ml-4 min-h-11 rounded-xl border px-4 font-bold" onClick={() => setRefresh(value => value + 1)}>Try again</button></div>}
    {loading || (!current && !error) ? <p role="status" className="p-6 text-lg">Loading your team’s published schedule…</p> : current && <>
      <div className="rounded-2xl border border-emerald-200 bg-white p-4 text-base">
        <strong>{current.location.full_name || current.location.name}</strong>
        <p className="mt-2">{current.publication ? `Published revision ${current.publication.revision} · ${current.shifts.length} shifts` : "No schedule has been published for this week yet."}</p>
      </div>
      {current.publication && <StaffWeekPlanner dates={dates} location={current.location} shifts={current.shifts} readOnly />}
    </>}
  </div></MainLayout>;
}
