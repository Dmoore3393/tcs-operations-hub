"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { emptyPlannerData, type PlannerData } from "@/lib/weekly-care-planner";
import { useAuth } from "@/components/providers/AuthProvider";

export function useDatedCarePlan(start: string, end: string, enabled = true) {
  const instance = useId();
  const { profile } = useAuth();
  const org = profile?.organization_id;
  const scope = [org, profile?.user_id, start, end].join("/");
  const [state, setState] = useState<{ scope: string; data?: PlannerData; error?: string }>({ scope: "" });
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const client = supabase;
    if (!enabled || !org || !client) return false;
    const read = ++sequence.current;
    try {
      const [locations, children, overrides, closures, schools] = await Promise.all([
        client
          .from("locations")
          .select("id,name,slug,full_name,capacity,program_type")
          .eq("organization_id", org)
          .eq("is_active", true)
          .order("name"),
        client
          .from("children")
          .select(
            "id,legacy_id,record_key:record_data->>id,first_name,last_name,age_group,location_id,planned_start:record_data->>plannedStartDate,planned_end:record_data->>plannedLastDay",
          )
          .eq("organization_id", org)
          .neq("enrollment_status", "Archived")
          .order("first_name"),
        client
          .from("child_schedule_overrides")
          .select(
            "child_id,location_id,service_date,no_care,start_time,end_time,note,planner_status,care_blocks,updated_at",
          )
          .eq("organization_id", org)
          .gte("service_date", start)
          .lte("service_date", end),
        client
          .from("care_calendar_closures")
          .select("location_id,closure_date,title,note")
          .eq("organization_id", org)
          .gte("closure_date", start)
          .lte("closure_date", end),
        client
          .from("child_schedule_school_notes")
          .select("location_id,service_date,no_school,minimum_day,updated_at")
          .eq("organization_id", org)
          .gte("service_date", start)
          .lte("service_date", end),
      ]);
      const failure = [locations, children, overrides, closures, schools].find((r) => r.error)?.error;
      if (failure) throw new Error(failure.message);
      if (read === sequence.current)
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
      if (read === sequence.current)
        setState({
          scope,
          error: reason instanceof Error ? reason.message : "Could not load dated schedules.",
        });
      return false;
    }
  }, [enabled, org, start, end, scope]);

  useEffect(() => {
    if (!enabled || !org || !supabase) return;
    const first = setTimeout(() => void load(), 0);
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void load(), 100);
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
    channel.subscribe();
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(first);
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      void supabase?.removeChannel(channel);
    };
  }, [enabled, org, scope, load, instance]);
  const current = state.scope === scope ? state : undefined;
  return {
    data: current?.data ?? emptyPlannerData,
    ready: Boolean(current?.data),
    error: current?.error ?? "",
    reload: load,
  };
}
