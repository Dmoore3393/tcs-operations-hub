"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChildScheduleRecord } from "@/lib/child-schedules";
import type { LocationKey } from "@/lib/location-config";
import {
  buildCoverageWindows,
  locationKeyForDbLocation,
  type CoverageWindow,
  type StaffActivityRow,
  type StaffShiftRow,
  type StaffingLocation,
  type StaffingRuleRow,
} from "@/lib/staffing-command";
import { supabase } from "@/lib/supabase/client";

export type LiveCoverageWindow = CoverageWindow & {
  location: Exclude<LocationKey, "All Locations">;
  capacity: number;
};

export type LiveShiftView = {
  id: string;
  staffName: string;
  location: Exclude<LocationKey, "All Locations">;
  start: string;
  end: string;
  assignment: string;
  status: StaffShiftRow["status"];
};

export function useLiveStaffingSnapshot(args: {
  date: string;
  schedules: ChildScheduleRecord[];
  accessibleLocations: Exclude<LocationKey, "All Locations">[];
  enabled?: boolean;
}) {
  const { date, schedules, accessibleLocations, enabled = true } = args;
  const [locations, setLocations] = useState<StaffingLocation[]>([]);
  const [shifts, setShifts] = useState<StaffShiftRow[]>([]);
  const [activities, setActivities] = useState<StaffActivityRow[]>([]);
  const [rules, setRules] = useState<StaffingRuleRow[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!enabled || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [locationResult, shiftResult, activityResult, ruleResult] = await Promise.all([
      supabase.from("locations").select("id,slug,name,full_name,capacity,program_type").eq("is_active", true).order("name"),
      supabase.from("staff_shifts").select("id,location_id,user_id,staff_name,shift_date,start_time,end_time,status,position_label,notes").eq("shift_date", date).neq("status", "Cancelled").order("start_time"),
      supabase.from("staff_activity_intervals").select("id,location_id,shift_id,user_id,staff_name,activity_date,start_time,end_time,activity_type,counts_toward_floor,reason,source_key").eq("activity_date", date).order("start_time"),
      supabase.from("staffing_rules").select("id,location_id,rule_name,age_group,children_per_staff,minimum_staff,maximum_group_size,effective_from,effective_to,source_type,source_note,is_active").eq("is_active", true).order("effective_from", { ascending: false }),
    ]);
    const failure = locationResult.error || shiftResult.error || activityResult.error || ruleResult.error;
    if (failure) setError(failure.message);
    else {
      setError("");
      setLocations((locationResult.data ?? []) as StaffingLocation[]);
      setShifts((shiftResult.data ?? []) as StaffShiftRow[]);
      setActivities((activityResult.data ?? []) as StaffActivityRow[]);
      setRules((ruleResult.data ?? []) as StaffingRuleRow[]);
    }
    setLoading(false);
  }, [date, enabled]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!enabled || !supabase) return;
    const channel = supabase
      .channel(`live-staffing-snapshot-${date}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_shifts" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_activity_intervals" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "staffing_rules" }, () => void load())
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [date, enabled, load]);

  const accessibleSet = useMemo(() => new Set(accessibleLocations), [accessibleLocations]);

  const coverageWindows = useMemo<LiveCoverageWindow[]>(() => locations.flatMap((location) => {
    const key = locationKeyForDbLocation(location);
    if (!key || !accessibleSet.has(key)) return [];
    return buildCoverageWindows({ date, location, schedules, shifts, activities, rules })
      .map((window) => ({ ...window, location: key, capacity: location.capacity }));
  }), [accessibleSet, activities, date, locations, rules, schedules, shifts]);

  const shiftViews = useMemo<LiveShiftView[]>(() => shifts.flatMap((shift) => {
    const location = locations.find((item) => item.id === shift.location_id);
    const key = location ? locationKeyForDbLocation(location) : null;
    if (!key || !accessibleSet.has(key)) return [];
    return [{
      id: shift.id,
      staffName: shift.staff_name,
      location: key,
      start: shift.start_time.slice(0, 5),
      end: shift.end_time.slice(0, 5),
      assignment: shift.position_label || "Floor Coverage",
      status: shift.status,
    }];
  }), [accessibleSet, locations, shifts]);

  return {
    locations,
    shifts,
    activities,
    rules,
    coverageWindows,
    shiftViews,
    loading,
    error,
    refresh: load,
  };
}
