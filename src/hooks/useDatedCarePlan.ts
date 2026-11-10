"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { emptyPlannerData, type PlannerData } from "@/lib/weekly-care-planner";
import { useAuth } from "@/components/providers/AuthProvider";
import { withRequestTimeout } from "@/lib/request-timeout";

export function useDatedCarePlan(start: string, end: string, enabled = true) {
  const instance = useId();
  const { profile } = useAuth();
  const org = profile?.organization_id;
  const scope = [org, profile?.user_id, start, end].join("/");
  const [state, setState] = useState<{ scope: string; data?: PlannerData; error?: string }>({ scope: "" });
  const sequence = useRef(0);
  const activeScope = useRef("");
  const load = useCallback(async () => {
    const client = supabase;
    if (!enabled || !org || !client || activeScope.current !== scope) return false;
    const read = ++sequence.current;
    try {
      if (window.navigator.onLine === false)
        throw new Error("Offline — reconnect to verify the current schedule.");
      const [locations, children, overrides, closures, schools] = await withRequestTimeout((signal) => Promise.all([
        client
          .from("locations")
          .select("id,name,slug,full_name,capacity,program_type")
          .eq("organization_id", org)
          .eq("is_active", true)
          .order("name")
          .abortSignal(signal),
        client
          .from("children")
          .select(
            "id,legacy_id,record_key:record_data->>id,first_name,last_name,age_group,location_id,planned_start:record_data->>plannedStartDate,planned_end:record_data->>plannedLastDay",
          )
          .eq("organization_id", org)
          .neq("enrollment_status", "Archived")
          .order("first_name")
          .abortSignal(signal),
        client
          .from("child_schedule_overrides")
          .select(
            "child_id,location_id,service_date,no_care,start_time,end_time,note,planner_status,care_blocks,updated_at",
          )
          .eq("organization_id", org)
          .gte("service_date", start)
          .lte("service_date", end)
          .abortSignal(signal),
        client
          .from("care_calendar_closures")
          .select("location_id,closure_date,title,note")
          .eq("organization_id", org)
          .gte("closure_date", start)
          .lte("closure_date", end)
          .abortSignal(signal),
        client
          .from("child_schedule_school_notes")
          .select("location_id,service_date,no_school,minimum_day,updated_at")
          .eq("organization_id", org)
          .gte("service_date", start)
          .lte("service_date", end)
          .abortSignal(signal),
      ]));
      const failure = [locations, children, overrides, closures, schools].find((r) => r.error)?.error;
      if (failure) throw new Error(failure.message);
      // An old request must not replace a different week, account, or newer read.
      if (read !== sequence.current || activeScope.current !== scope) return false;
      setState({
        scope,
        data: {
          locations: locations.data ?? [],
          children: children.data ?? [],
          overrides: overrides.data ?? [],
          closures: closures.data ?? [],
          schools: schools.data ?? [],
        } as PlannerData,
      });
      return true;
    } catch (reason) {
      if (read === sequence.current && activeScope.current === scope)
        setState({
          scope,
          error: reason instanceof Error ? reason.message : "Could not load dated schedules.",
        });
      return false;
    }
  }, [enabled, org, start, end, scope]);

  useEffect(() => {
    if (!enabled || !org || !supabase) return;
    activeScope.current = scope;
    let disposed = false;
    const first = setTimeout(() => void load(), 0);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (disposed) return;
      clearTimeout(timer);
      timer = setTimeout(() => void load(), 100);
    };
    const visibleRefresh = () => {
      if (document.visibilityState !== "hidden") refresh();
    };
    const channel = supabase.channel(`dated-care-${scope}-${instance}`);
    for (const table of [
      "children",
      "child_schedule_overrides",
      "care_calendar_closures",
      "child_schedule_school_notes",
    ]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    }
    // Re-read after reconnecting: events while the app slept may have been missed.
    channel.subscribe((status) => { if (status === "SUBSCRIBED") refresh(); });
    window.addEventListener("focus", visibleRefresh);
    window.addEventListener("pageshow", visibleRefresh);
    window.addEventListener("online", visibleRefresh);
    window.addEventListener("offline", visibleRefresh);
    document.addEventListener("visibilitychange", visibleRefresh);
    // Realtime is the fast path; this covers lost events and native resume gaps.
    const poll = setInterval(() => {
      if (window.navigator.onLine !== false) visibleRefresh();
    }, 30_000);
    return () => {
      disposed = true;
      activeScope.current = "";
      sequence.current += 1;
      clearTimeout(first);
      clearTimeout(timer);
      clearInterval(poll);
      window.removeEventListener("focus", visibleRefresh);
      window.removeEventListener("pageshow", visibleRefresh);
      window.removeEventListener("online", visibleRefresh);
      window.removeEventListener("offline", visibleRefresh);
      document.removeEventListener("visibilitychange", visibleRefresh);
      void supabase?.removeChannel(channel);
    };
  }, [enabled, org, scope, load, instance]);
  const current = enabled && org && supabase && state.scope === scope ? state : undefined;
  return {
    data: current?.data ?? emptyPlannerData,
    ready: Boolean(current?.data),
    error: current?.error ?? "",
    reload: load,
  };
}
