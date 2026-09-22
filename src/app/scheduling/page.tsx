"use client";

import MainLayout from "@/components/layout/MainLayout";
import { Modal, PrimaryButton, SecondaryButton, SectionCard, StatCard, inputClass } from "@/components/hub/HubUI";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { initialChildren, type ChildRecord } from "@/lib/children";
import { compactTime, starterChildSchedules, type ChildScheduleRecord } from "@/lib/child-schedules";
import { localIsoDate } from "@/lib/date-utils";
import { sendHubNotificationEvent } from "@/lib/notification-client";
import {
  buildCoverageWindows,
  checkedInAtLocation,
  locationKeyForDbLocation,
  type CoverageStatus,
  type StaffActivityRow,
  type StaffShiftRow,
  type StaffingLocation,
  type StaffingRuleRow,
} from "@/lib/staffing-command";
import { supabase } from "@/lib/supabase/client";
import {
  AlertTriangle,
  Bus,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Plus,
  Printer,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type StaffOption = {
  user_id: string;
  full_name: string;
  role: string;
  locations: string[];
};

type ShiftDraft = {
  id?: string;
  location_id: string;
  user_id: string;
  staff_name: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  status: "Draft" | "Published" | "Cancelled";
  position_label: string;
  notes: string;
};

type ActivityDraft = {
  id?: string;
  shift_id: string;
  location_id: string;
  user_id: string;
  staff_name: string;
  activity_date: string;
  start_time: string;
  end_time: string;
  activity_type: StaffActivityRow["activity_type"];
  counts_toward_floor: boolean;
  reason: string;
};

type RuleDraft = {
  id?: string;
  location_id: string;
  rule_name: string;
  age_group: string;
  children_per_staff: string;
  minimum_staff: string;
  maximum_group_size: string;
  effective_from: string;
  effective_to: string;
  source_type: string;
  source_note: string;
};

type SchedulePublication = {
  id: string;
  location_id: string;
  week_of: string;
  status: "Draft" | "Published" | "Superseded";
  revision: number;
  published_at: string | null;
  published_by: string | null;
  notes: string | null;
  needs_republish: boolean;
};

type PublishedShiftSnapshot = {
  id: string;
  publication_id: string;
  location_id: string;
  source_shift_id: string | null;
  user_id: string | null;
  staff_name: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  position_label: string | null;
  notes: string | null;
  revision: number;
};

type ScheduleAcknowledgement = {
  id: string;
  publication_id: string;
  location_id: string;
  user_id: string;
  revision: number;
  acknowledged_at: string;
  notes: string | null;
};

const statusOrder: CoverageStatus[] = ["over-capacity", "gap", "rule-needed", "tight", "covered"];

function datePlus(date: string, days: number) {
  const parsed = new Date(`${date}T12:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return localIsoDate(parsed);
}

function mondayFor(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  const day = parsed.getDay();
  parsed.setDate(parsed.getDate() - (day === 0 ? 6 : day - 1));
  return localIsoDate(parsed);
}

function weekDates(date: string) {
  const monday = mondayFor(date);
  return Array.from({ length: 7 }, (_, index) => datePlus(monday, index));
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "numeric", day: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function timeLabel(value: string) {
  const [hourText, minuteText] = value.slice(0, 5).split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${minuteText} ${suffix}`;
}

function statusMeta(status: CoverageStatus | "empty") {
  if (status === "over-capacity") return { label: "Over Capacity", className: "border-red-300 bg-red-50 text-red-800", dot: "bg-red-600" };
  if (status === "gap") return { label: "Coverage Gap", className: "border-rose-300 bg-rose-50 text-rose-800", dot: "bg-rose-600" };
  if (status === "rule-needed") return { label: "Rule Needed", className: "border-violet-300 bg-violet-50 text-violet-800", dot: "bg-violet-600" };
  if (status === "tight") return { label: "Tight Coverage", className: "border-amber-300 bg-amber-50 text-amber-900", dot: "bg-amber-500" };
  if (status === "covered") return { label: "Covered", className: "border-emerald-300 bg-emerald-50 text-emerald-800", dot: "bg-emerald-600" };
  return { label: "No Activity", className: "border-slate-200 bg-slate-50 text-slate-600", dot: "bg-slate-400" };
}

function worstStatus(statuses: CoverageStatus[]) {
  if (!statuses.length) return "empty" as const;
  return [...statuses].sort((a, b) => statusOrder.indexOf(a) - statusOrder.indexOf(b))[0];
}

function toNullableNumber(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export default function SchedulingPage() {
  const { session, profile, isSystemOwner, isLocationLicensee } = useAuth();
  const { location: hubLocation, setLocation: setHubLocation } = useHubLocation();
  const [schedules] = usePersistentState<ChildScheduleRecord[]>("tcs-child-schedules-v2", starterChildSchedules);
  const [children] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const [locations, setLocations] = useState<StaffingLocation[]>([]);
  const [shifts, setShifts] = useState<StaffShiftRow[]>([]);
  const [activities, setActivities] = useState<StaffActivityRow[]>([]);
  const [rules, setRules] = useState<StaffingRuleRow[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [publications, setPublications] = useState<SchedulePublication[]>([]);
  const [publishedSnapshots, setPublishedSnapshots] = useState<PublishedShiftSnapshot[]>([]);
  const [acknowledgements, setAcknowledgements] = useState<ScheduleAcknowledgement[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => localIsoDate());
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [view, setView] = useState<"Day" | "Week">("Day");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [shiftDraft, setShiftDraft] = useState<ShiftDraft | null>(null);
  const [activityDraft, setActivityDraft] = useState<ActivityDraft | null>(null);
  const [ruleDraft, setRuleDraft] = useState<RuleDraft | null>(null);

  const dates = useMemo(() => weekDates(selectedDate), [selectedDate]);
  const weekStart = dates[0];
  const weekEnd = dates[6];

  const load = useCallback(async () => {
    if (!supabase || !session?.access_token) return;
    setLoading(true);
    const [locationResult, shiftResult, activityResult, ruleResult, staffResult, publicationResult] = await Promise.all([
      supabase.from("locations").select("id,slug,name,full_name,capacity,program_type").eq("is_active", true).order("name"),
      supabase.from("staff_shifts").select("id,location_id,user_id,staff_name,shift_date,start_time,end_time,status,position_label,notes").gte("shift_date", weekStart).lte("shift_date", weekEnd).order("shift_date").order("start_time"),
      supabase.from("staff_activity_intervals").select("id,location_id,shift_id,user_id,staff_name,activity_date,start_time,end_time,activity_type,counts_toward_floor,reason,source_key").gte("activity_date", weekStart).lte("activity_date", weekEnd).order("activity_date").order("start_time"),
      supabase.from("staffing_rules").select("id,location_id,rule_name,age_group,children_per_staff,minimum_staff,maximum_group_size,effective_from,effective_to,source_type,source_note,is_active").eq("is_active", true).order("effective_from", { ascending: false }),
      supabase.from("staff_access").select("user_id,full_name,role,locations").eq("is_active", true).order("full_name"),
      supabase.from("schedule_publications").select("id,location_id,week_of,status,revision,published_at,published_by,notes,needs_republish").eq("week_of", weekStart).order("updated_at", { ascending: false }),
    ]);

    const requiredError = locationResult.error || shiftResult.error || activityResult.error || ruleResult.error || publicationResult.error;
    if (requiredError) {
      setError(requiredError.message);
    } else {
      const nextPublications = (publicationResult.data ?? []) as SchedulePublication[];
      let nextAcknowledgements: ScheduleAcknowledgement[] = [];
      let nextSnapshots: PublishedShiftSnapshot[] = [];
      const publicationIds = nextPublications.map((item) => item.id);
      if (publicationIds.length) {
        const [acknowledgementResult, snapshotResult] = await Promise.all([
          supabase
            .from("staff_schedule_acknowledgements")
            .select("id,publication_id,location_id,user_id,revision,acknowledged_at,notes")
            .in("publication_id", publicationIds),
          supabase
            .from("staff_schedule_publication_shifts")
            .select("id,publication_id,location_id,source_shift_id,user_id,staff_name,shift_date,start_time,end_time,position_label,notes,revision")
            .in("publication_id", publicationIds)
            .gte("shift_date", weekStart)
            .lte("shift_date", weekEnd),
        ]);
        if (acknowledgementResult.error || snapshotResult.error) {
          setError(acknowledgementResult.error?.message || snapshotResult.error?.message || "Could not load published schedule details.");
          setLoading(false);
          return;
        }
        nextAcknowledgements = (acknowledgementResult.data ?? []) as ScheduleAcknowledgement[];
        nextSnapshots = (snapshotResult.data ?? []) as PublishedShiftSnapshot[];
      }
      setError("");
      setLocations((locationResult.data ?? []) as StaffingLocation[]);
      setShifts((shiftResult.data ?? []) as StaffShiftRow[]);
      setActivities((activityResult.data ?? []) as StaffActivityRow[]);
      setRules((ruleResult.data ?? []) as StaffingRuleRow[]);
      setPublications(nextPublications);
      setPublishedSnapshots(nextSnapshots);
      setAcknowledgements(nextAcknowledgements);
    }

    const staffRows = staffResult.error ? [] : (staffResult.data ?? []) as StaffOption[];
    if (staffRows.length) setStaff(staffRows);
    else if (profile) setStaff([{ user_id: profile.user_id, full_name: profile.full_name, role: profile.role, locations: profile.locations }]);
    setLoading(false);
  }, [profile, session?.access_token, weekEnd, weekStart]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!supabase || !session?.access_token) return;
    const channel = supabase
      .channel(`staffing-command-${profile?.user_id ?? "staff"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_shifts" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_activity_intervals" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "staffing_rules" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_publications" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_schedule_acknowledgements" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_schedule_publication_shifts" }, () => void load())
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [load, profile?.user_id, session?.access_token]);

  useEffect(() => {
    if (!locations.length) return;
    const preferred = hubLocation === "All Locations"
      ? locations[0]
      : locations.find((item) => locationKeyForDbLocation(item) === hubLocation);
    if (preferred && !locations.some((item) => item.id === selectedLocationId)) setSelectedLocationId(preferred.id);
    else if (preferred && hubLocation !== "All Locations") setSelectedLocationId(preferred.id);
  }, [hubLocation, locations, selectedLocationId]);

  const selectedLocation = locations.find((item) => item.id === selectedLocationId) ?? locations[0] ?? null;
  const selectedWindows = useMemo(() => selectedLocation ? buildCoverageWindows({
    date: selectedDate,
    location: selectedLocation,
    schedules,
    shifts,
    activities,
    rules,
  }) : [], [activities, rules, schedules, selectedDate, selectedLocation, shifts]);

  const allDayWindows = useMemo(() => locations.flatMap((location) => buildCoverageWindows({
    date: selectedDate,
    location,
    schedules,
    shifts,
    activities,
    rules,
  }).map((window) => ({ location, window }))), [activities, locations, rules, schedules, selectedDate, shifts]);

  const scheduledChildren = new Set(allDayWindows.flatMap(({ window }) => window.children.map((child) => child.childId))).size;
  const dayShiftRows = shifts.filter((shift) => shift.shift_date === selectedDate && shift.status !== "Cancelled");
  const scheduledStaff = new Set(dayShiftRows.map((shift) => shift.user_id || shift.staff_name.toLowerCase())).size;
  const offFloorToday = activities.filter((item) => item.activity_date === selectedDate && !item.counts_toward_floor).length;
  const actionWindows = allDayWindows.filter(({ window }) => ["gap", "over-capacity", "rule-needed"].includes(window.status)).length;
  const canManageRules = isSystemOwner || isLocationLicensee;

  function showMessage(value: string) {
    setMessage(value);
    window.setTimeout(() => setMessage(""), 2600);
  }

  function chooseLocation(location: StaffingLocation) {
    setSelectedLocationId(location.id);
    const key = locationKeyForDbLocation(location);
    if (key) setHubLocation(key);
  }

  function openNewShift(location = selectedLocation, date = selectedDate, start = "08:00", end = "17:00") {
    if (!location) return;
    setShiftDraft({
      location_id: location.id,
      user_id: "",
      staff_name: "",
      shift_date: date,
      start_time: start,
      end_time: end,
      status: "Draft",
      position_label: "Floor Coverage",
      notes: "",
    });
  }

  function editShift(shift: StaffShiftRow) {
    setShiftDraft({
      id: shift.id,
      location_id: shift.location_id,
      user_id: shift.user_id ?? "",
      staff_name: shift.staff_name,
      shift_date: shift.shift_date,
      start_time: shift.start_time.slice(0, 5),
      end_time: shift.end_time.slice(0, 5),
      status: shift.status,
      position_label: shift.position_label ?? "",
      notes: shift.notes ?? "",
    });
  }

  async function saveShift(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !shiftDraft || !shiftDraft.staff_name.trim()) return;
    setSaving(true);
    setError("");
    const payload = {
      location_id: shiftDraft.location_id,
      user_id: shiftDraft.user_id || null,
      staff_name: shiftDraft.staff_name.trim(),
      shift_date: shiftDraft.shift_date,
      start_time: shiftDraft.start_time,
      end_time: shiftDraft.end_time,
      status: shiftDraft.status,
      position_label: shiftDraft.position_label.trim() || null,
      notes: shiftDraft.notes.trim() || null,
    };
    const result = shiftDraft.id
      ? await supabase.from("staff_shifts").update(payload).eq("id", shiftDraft.id)
      : await supabase.from("staff_shifts").insert(payload);
    if (result.error) setError(result.error.message);
    else {
      const location = locations.find((item) => item.id === shiftDraft.location_id);
      void sendHubNotificationEvent({
        accessToken: session?.access_token,
        eventType: "schedule_update",
        location: location ? (locationKeyForDbLocation(location) ?? "All Locations") : "All Locations",
        eventKey: `staffing:${shiftDraft.id ?? "new"}:${Date.now()}`,
      });
      setShiftDraft(null);
      showMessage("Staff shift saved to the live schedule.");
      await load();
    }
    setSaving(false);
  }

  async function deleteShift() {
    if (!supabase || !shiftDraft?.id) return;
    setSaving(true);
    const result = await supabase.from("staff_shifts").delete().eq("id", shiftDraft.id);
    if (result.error) setError(result.error.message);
    else {
      setShiftDraft(null);
      showMessage("Shift removed.");
      await load();
    }
    setSaving(false);
  }

  function openActivityForShift(shift: StaffShiftRow, type: StaffActivityRow["activity_type"] = "Transportation") {
    setActivityDraft({
      shift_id: shift.id,
      location_id: shift.location_id,
      user_id: shift.user_id ?? "",
      staff_name: shift.staff_name,
      activity_date: shift.shift_date,
      start_time: shift.start_time.slice(0, 5),
      end_time: shift.end_time.slice(0, 5),
      activity_type: type,
      counts_toward_floor: type === "Floor",
      reason: "",
    });
  }

  function openActivity() {
    if (!selectedLocation) return;
    setActivityDraft({
      shift_id: "",
      location_id: selectedLocation.id,
      user_id: "",
      staff_name: "",
      activity_date: selectedDate,
      start_time: "14:00",
      end_time: "16:00",
      activity_type: "Transportation",
      counts_toward_floor: false,
      reason: "",
    });
  }

  async function saveActivity(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !activityDraft || !activityDraft.staff_name.trim()) return;
    setSaving(true);
    const payload = {
      shift_id: activityDraft.shift_id || null,
      location_id: activityDraft.location_id,
      user_id: activityDraft.user_id || null,
      staff_name: activityDraft.staff_name.trim(),
      activity_date: activityDraft.activity_date,
      start_time: activityDraft.start_time,
      end_time: activityDraft.end_time,
      activity_type: activityDraft.activity_type,
      counts_toward_floor: activityDraft.activity_type === "Floor" ? true : activityDraft.counts_toward_floor,
      reason: activityDraft.reason.trim() || null,
    };
    const result = activityDraft.id
      ? await supabase.from("staff_activity_intervals").update(payload).eq("id", activityDraft.id)
      : await supabase.from("staff_activity_intervals").insert(payload);
    if (result.error) setError(result.error.message);
    else {
      setActivityDraft(null);
      showMessage("Staff activity saved. Coverage recalculated.");
      await load();
    }
    setSaving(false);
  }

  async function deleteActivity(id: string) {
    if (!supabase) return;
    const result = await supabase.from("staff_activity_intervals").delete().eq("id", id);
    if (result.error) setError(result.error.message);
    else {
      showMessage("Activity removed. Coverage recalculated.");
      await load();
    }
  }

  function openRule(location = selectedLocation) {
    if (!location) return;
    setRuleDraft({
      location_id: location.id,
      rule_name: "Configured staffing rule",
      age_group: "All",
      children_per_staff: "",
      minimum_staff: "",
      maximum_group_size: "",
      effective_from: selectedDate,
      effective_to: "",
      source_type: "TCS Configured",
      source_note: "",
    });
  }

  async function saveRule(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !ruleDraft) return;
    const ratio = toNullableNumber(ruleDraft.children_per_staff);
    const minimum = toNullableNumber(ruleDraft.minimum_staff);
    if (!ratio && !minimum) {
      setError("Enter children per staff, minimum staff, or both.");
      return;
    }
    setSaving(true);
    const payload = {
      location_id: ruleDraft.location_id,
      rule_name: ruleDraft.rule_name.trim(),
      age_group: ruleDraft.age_group.trim() || null,
      children_per_staff: ratio,
      minimum_staff: minimum,
      maximum_group_size: toNullableNumber(ruleDraft.maximum_group_size),
      effective_from: ruleDraft.effective_from,
      effective_to: ruleDraft.effective_to || null,
      source_type: ruleDraft.source_type,
      source_note: ruleDraft.source_note.trim() || null,
      is_active: true,
    };
    const result = ruleDraft.id
      ? await supabase.from("staffing_rules").update(payload).eq("id", ruleDraft.id)
      : await supabase.from("staffing_rules").insert(payload);
    if (result.error) setError(result.error.message);
    else {
      setRuleDraft(null);
      showMessage("Coverage rule saved.");
      await load();
    }
    setSaving(false);
  }

  async function publishSelectedWeek() {
    if (!supabase || !selectedLocation || !profile?.user_id) return;
    const weekShifts = shifts.filter((shift) =>
      shift.location_id === selectedLocation.id &&
      shift.shift_date >= weekStart &&
      shift.shift_date <= weekEnd &&
      shift.status !== "Cancelled",
    );
    if (!weekShifts.length) {
      setError("Add at least one staff shift before publishing this week.");
      return;
    }
    const unlinked = weekShifts.filter((shift) => !shift.user_id);

    setSaving(true);
    setError("");
    const currentPublication = publications.find((item) =>
      item.location_id === selectedLocation.id &&
      item.week_of === weekStart &&
      item.status === "Published",
    ) ?? publications.find((item) =>
      item.location_id === selectedLocation.id &&
      item.week_of === weekStart,
    );
    const nextRevision = (currentPublication?.revision ?? 0) + 1;
    const publishedAt = new Date().toISOString();

    const shiftResult = await supabase
      .from("staff_shifts")
      .update({ status: "Published" })
      .eq("location_id", selectedLocation.id)
      .gte("shift_date", weekStart)
      .lte("shift_date", weekEnd)
      .neq("status", "Cancelled");

    if (shiftResult.error) {
      setError(shiftResult.error.message);
      setSaving(false);
      return;
    }

    const publicationPayload = {
      location_id: selectedLocation.id,
      week_of: weekStart,
      status: "Published" as const,
      revision: nextRevision,
      published_at: publishedAt,
      published_by: profile.user_id,
      notes: `Published from Staffing Command Center • revision ${nextRevision}`,
    };

    const publicationResult = currentPublication
      ? await supabase.from("schedule_publications").update(publicationPayload).eq("id", currentPublication.id)
      : await supabase.from("schedule_publications").insert(publicationPayload);

    if (publicationResult.error) {
      setError(publicationResult.error.message);
      setSaving(false);
      return;
    }

    const locationKey = locationKeyForDbLocation(selectedLocation) ?? "All Locations";
    void sendHubNotificationEvent({
      accessToken: session?.access_token,
      eventType: "schedule_published",
      location: locationKey,
      eventKey: `staffing-publish:${selectedLocation.id}:${weekStart}:r${nextRevision}`,
    });
    showMessage(unlinked.length
      ? `Week published as revision ${nextRevision}. ${unlinked.length} unlinked shift${unlinked.length === 1 ? " will" : "s will"} publish normally but cannot appear in an employee's My Schedule until linked to a staff account.`
      : `Week published as revision ${nextRevision}. Staff can now view and acknowledge it in My Schedule.`);
    await load();
    setSaving(false);
  }

  const selectedShifts = dayShiftRows.filter((shift) => !selectedLocation || shift.location_id === selectedLocation.id);
  const selectedActivities = activities.filter((item) => item.activity_date === selectedDate && (!selectedLocation || item.location_id === selectedLocation.id) && !item.counts_toward_floor);
  const selectedRules = rules.filter((rule) => !selectedLocation || rule.location_id === selectedLocation.id);
  const selectedWeekShifts = shifts.filter((shift) =>
    !selectedLocation ? false : shift.location_id === selectedLocation.id && shift.shift_date >= weekStart && shift.shift_date <= weekEnd && shift.status !== "Cancelled",
  );
  const selectedPublication = selectedLocation
    ? (publications.find((item) => item.location_id === selectedLocation.id && item.week_of === weekStart && item.status === "Published")
      ?? publications.find((item) => item.location_id === selectedLocation.id && item.week_of === weekStart)
      ?? null)
    : null;
  const scheduledUserIds = new Set(selectedWeekShifts.map((shift) => shift.user_id).filter((value): value is string => Boolean(value)));
  const currentAcknowledgements = selectedPublication
    ? acknowledgements.filter((item) => item.publication_id === selectedPublication.id && item.revision === selectedPublication.revision)
    : [];
  const acknowledgedUserIds = new Set(currentAcknowledgements.map((item) => item.user_id));
  const unlinkedShiftCount = selectedWeekShifts.filter((shift) => !shift.user_id).length;
  const weeklyCoverage = selectedLocation
    ? dates.flatMap((date) => buildCoverageWindows({ date, location: selectedLocation, schedules, shifts, activities, rules }))
    : [];
  const weeklyAttention = weeklyCoverage.filter((window) => ["gap", "over-capacity", "rule-needed"].includes(window.status)).length;
  const canPublishSchedule = isSystemOwner || isLocationLicensee;
  const today = localIsoDate();

  return <MainLayout><div className="mx-auto max-w-[1700px] space-y-6 pb-12">
    <section className="overflow-hidden rounded-[32px] bg-gradient-to-br from-[#0b2f23] via-[#155b3b] to-[#0b3153] p-6 text-white shadow-xl sm:p-8">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-4xl">
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-emerald-300/15 px-3 py-1 text-[10px] font-black uppercase tracking-[.18em] text-emerald-100">Live Operations</span><span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[.14em]">Supabase + Realtime</span></div>
          <h1 className="mt-4 text-3xl font-black sm:text-5xl">Staffing Command Center</h1>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/75">Child schedules create the demand. Staff shifts create planned coverage. Transportation, breaks, training, admin, and off-site work automatically remove staff from floor coverage during those times.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[180px_auto_auto]">
          <input type="date" className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm font-black text-white outline-none [color-scheme:dark]" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
          <div className="flex rounded-xl bg-white/10 p-1"><button onClick={() => setView("Day")} className={`rounded-lg px-4 py-2 text-sm font-black ${view === "Day" ? "bg-white text-slate-950" : "text-white/70"}`}>Day</button><button onClick={() => setView("Week")} className={`rounded-lg px-4 py-2 text-sm font-black ${view === "Week" ? "bg-white text-slate-950" : "text-white/70"}`}>Week</button></div>
          <button onClick={() => window.print()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-black hover:bg-white/20"><Printer className="h-4 w-4" /> Print</button>
        </div>
      </div>
    </section>

    {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-900">{message}</div>}
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">{error}</div>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Children Scheduled" value={scheduledChildren} helper={shortDate(selectedDate)} icon={<Users className="h-5 w-5" />} />
      <StatCard label="Staff Scheduled" value={scheduledStaff} helper="Across visible locations" icon={<CalendarDays className="h-5 w-5" />} tone="blue" />
      <StatCard label="Off-Floor Blocks" value={offFloorToday} helper="Transportation, breaks, admin & more" icon={<Bus className="h-5 w-5" />} tone="purple" />
      <StatCard label="Needs Attention" value={actionWindows} helper="Gaps, capacity, or missing rule" icon={actionWindows ? <ShieldAlert className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />} tone={actionWindows ? "red" : "emerald"} />
    </section>

    {loading ? <div className="flex min-h-72 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-sm font-black text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading live staffing data…</div> : <>
      {selectedLocation && <SectionCard
        title={`Publish Staff Schedule • ${selectedLocation.name}`}
        description={`Week of ${shortDate(weekStart)} • Publishing makes linked employee shifts visible in My Schedule and starts a new acknowledgement revision.`}
        action={canPublishSchedule ? <PrimaryButton disabled={saving || !selectedWeekShifts.length} onClick={() => void publishSelectedWeek()}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {selectedPublication?.status === "Published" ? "Republish Week" : "Publish Week"}</PrimaryButton> : undefined}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MiniMetric label="Week Shifts" value={selectedWeekShifts.length} />
          <MiniMetric label="Linked Staff" value={scheduledUserIds.size} />
          <MiniMetric label="Unlinked Shifts" value={unlinkedShiftCount} />
          <MiniMetric label="Acknowledged" value={selectedPublication?.status === "Published" ? `${acknowledgedUserIds.size}/${scheduledUserIds.size}` : "—"} />
          <MiniMetric label="Coverage Flags" value={weeklyAttention} />
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className={`rounded-2xl border p-4 text-sm font-semibold ${selectedPublication?.status === "Published" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
            {selectedPublication?.status === "Published"
              ? <><strong>Published revision {selectedPublication.revision}.</strong> {selectedPublication.published_at ? `Last published ${new Date(selectedPublication.published_at).toLocaleString()}.` : ""} Republishing creates a new revision, so employees must acknowledge the updated schedule again.</>
              : <><strong>Not published yet.</strong> Draft shifts are not shown in My Schedule until this week is published.</>}
          </div>
          <div className="flex flex-wrap gap-2">
            {unlinkedShiftCount > 0 && <span className="rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-800">{unlinkedShiftCount} unlinked shift{unlinkedShiftCount === 1 ? "" : "s"}</span>}
            {weeklyAttention > 0 && <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900">{weeklyAttention} coverage flag{weeklyAttention === 1 ? "" : "s"} to review</span>}
            {selectedPublication?.status === "Published" && scheduledUserIds.size > acknowledgedUserIds.size && <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800">{scheduledUserIds.size - acknowledgedUserIds.size} acknowledgement{scheduledUserIds.size - acknowledgedUserIds.size === 1 ? "" : "s"} pending</span>}
          </div>
        </div>
      </SectionCard>}
      <SectionCard title={view === "Day" ? `${shortDate(selectedDate)} • All Locations` : `Week of ${shortDate(weekStart)}`} description="Status is calculated from live child schedules, staff shifts, off-floor blocks, site capacity, and the staffing rules you configure.">
        {view === "Day" ? <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{locations.map((location) => {
          const windows = buildCoverageWindows({ date: selectedDate, location, schedules, shifts, activities, rules });
          const status = worstStatus(windows.map((window) => window.status));
          const meta = statusMeta(status);
          const peak = windows.reduce((max, window) => Math.max(max, window.childCount), 0);
          const checkedIn = selectedDate === today ? checkedInAtLocation(children, location, selectedDate).length : 0;
          const locationShifts = shifts.filter((shift) => shift.location_id === location.id && shift.shift_date === selectedDate && shift.status !== "Cancelled");
          return <button key={location.id} onClick={() => chooseLocation(location)} className={`rounded-3xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${selectedLocation?.id === location.id ? "border-emerald-400 ring-2 ring-emerald-100" : "border-slate-200"}`}>
            <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">{location.program_type}</p><h3 className="mt-1 text-xl font-black text-slate-950">{location.name}</h3></div><span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${meta.className}`}><span className={`mr-1 inline-block h-2 w-2 rounded-full ${meta.dot}`} />{meta.label}</span></div>
            <div className="mt-5 grid grid-cols-4 gap-2 text-center"><MiniMetric label="Peak Kids" value={peak} /><MiniMetric label="Staff" value={new Set(locationShifts.map((row) => row.staff_name)).size} /><MiniMetric label={selectedDate === today ? "Checked In" : "Capacity"} value={selectedDate === today ? checkedIn : location.capacity} /><MiniMetric label="Capacity" value={location.capacity} /></div>
          </button>;
        })}</div> : selectedLocation && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">{dates.map((date) => {
          const windows = buildCoverageWindows({ date, location: selectedLocation, schedules, shifts, activities, rules });
          const status = worstStatus(windows.map((window) => window.status));
          const meta = statusMeta(status);
          const peak = windows.reduce((max, window) => Math.max(max, window.childCount), 0);
          return <button key={date} onClick={() => { setSelectedDate(date); setView("Day"); }} className="rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-emerald-300"><p className="text-xs font-black text-slate-500">{shortDate(date)}</p><p className="mt-3 text-2xl font-black text-slate-950">{peak}</p><p className="text-[10px] font-black uppercase text-slate-400">Peak children</p><span className={`mt-3 inline-flex rounded-full border px-2 py-1 text-[9px] font-black uppercase ${meta.className}`}>{meta.label}</span></button>;
        })}</div>}
      </SectionCard>

      {selectedLocation && <div className="grid gap-6 2xl:grid-cols-[1.35fr_.65fr]">
        <SectionCard title={`${selectedLocation.name} Coverage Timeline`} description="Staff marked as Transportation, Break, Admin, Training, Offsite, or another non-floor activity do not count toward floor coverage during that block.">
          {selectedWindows.length ? <div className="space-y-3">{selectedWindows.map((window, index) => {
            const meta = statusMeta(window.status);
            const start = compactTime(window.start);
            const end = compactTime(window.end);
            return <div key={`${window.start}-${window.end}-${index}`} className={`grid gap-3 rounded-2xl border p-4 lg:grid-cols-[150px_1fr_115px_115px_150px_auto] lg:items-center ${meta.className}`}>
              <div><p className="font-black">{start}–{end}</p><p className="mt-1 text-[10px] font-black uppercase opacity-60">{meta.label}</p></div>
              <div><p className="text-sm font-black">{window.childCount} child{window.childCount === 1 ? "" : "ren"}</p><p className="mt-1 line-clamp-2 text-xs font-semibold opacity-70">{window.children.map((child) => child.childName).join(", ") || "No children scheduled"}</p>{window.offFloorNames.length > 0 && <p className="mt-2 text-[10px] font-black uppercase">Off floor: {window.offFloorNames.join(", ")}</p>}</div>
              <MetricCell label="Floor Staff" value={window.staffCount} />
              <MetricCell label="Needed" value={window.requiredStaff ?? "—"} />
              <div><p className="text-[10px] font-black uppercase opacity-60">On Floor</p><p className="mt-1 text-xs font-black">{window.staffNames.join(", ") || "None"}</p></div>
              <div className="flex justify-end">{window.status === "gap" && <button onClick={() => openNewShift(selectedLocation, selectedDate, String(Math.floor(window.start / 60)).padStart(2, "0") + ":" + String(window.start % 60).padStart(2, "0"), String(Math.floor(window.end / 60)).padStart(2, "0") + ":" + String(window.end % 60).padStart(2, "0"))} className="rounded-xl bg-rose-700 px-3 py-2 text-xs font-black text-white">Assign Coverage</button>}{window.status === "rule-needed" && canManageRules && <button onClick={() => openRule(selectedLocation)} className="rounded-xl bg-violet-700 px-3 py-2 text-xs font-black text-white">Add Rule</button>}</div>
            </div>;
          })}</div> : <EmptyState title="No staffing activity for this day" detail="Add child schedules or staff shifts and this timeline will build itself automatically." />}
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Coverage Rules" description="The Hub will not guess licensing ratios. Enter only verified rules for this site/program.">
            <div className="space-y-3">{selectedRules.length ? selectedRules.map((rule) => <div key={rule.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-950">{rule.rule_name}</p><p className="mt-1 text-xs font-semibold text-slate-500">{rule.age_group || "All"} • effective {rule.effective_from}{rule.effective_to ? `–${rule.effective_to}` : ""}</p></div><SlidersHorizontal className="h-4 w-4 text-violet-600" /></div><div className="mt-3 grid grid-cols-3 gap-2"><MiniMetric label="Kids / Staff" value={rule.children_per_staff ?? "—"} /><MiniMetric label="Minimum" value={rule.minimum_staff ?? "—"} /><MiniMetric label="Max Group" value={rule.maximum_group_size ?? "—"} /></div><p className="mt-3 text-[10px] font-bold text-slate-400">{rule.source_type}{rule.source_note ? ` • ${rule.source_note}` : ""}</p></div>) : <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm font-bold text-violet-900"><AlertTriangle className="mr-1 inline h-4 w-4" />No verified staffing rule is configured yet. Coverage will show “Rule Needed” instead of inventing a ratio.</div>}</div>
            {canManageRules && <button onClick={() => openRule()} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-800"><Plus className="h-3.5 w-3.5" /> Add Verified Rule</button>}
          </SectionCard>

          <SectionCard title={selectedDate === today ? "Live Attendance" : "Attendance"} description={selectedDate === today ? "Pulled from Check-In / Check-Out." : "Live attendance is shown for today only."}>
            <div className="flex items-center justify-between rounded-2xl bg-emerald-50 p-4"><div><p className="text-3xl font-black text-emerald-900">{selectedDate === today ? checkedInAtLocation(children, selectedLocation, selectedDate).length : "—"}</p><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Checked in now</p></div><CheckCircle2 className="h-8 w-8 text-emerald-600" /></div>
          </SectionCard>
        </div>
      </div>}

      {selectedLocation && <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <SectionCard title={`${selectedLocation.name} Staff Schedule`} description="These shifts are saved in the live staffing database and update coverage immediately.">
          <div className="mb-4 flex flex-wrap gap-2"><PrimaryButton onClick={() => openNewShift()}><Plus className="h-4 w-4" /> Add Shift</PrimaryButton><SecondaryButton onClick={openActivity}><Bus className="h-4 w-4" /> Add Off-Floor Block</SecondaryButton></div>
          <div className="space-y-3">{selectedShifts.length ? selectedShifts.map((shift) => <div key={shift.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><button onClick={() => editShift(shift)} className="text-left"><p className="font-black text-slate-950">{shift.staff_name}</p><p className="mt-1 text-xs font-semibold text-slate-500">{shift.position_label || "Staff"} • {timeLabel(shift.start_time)}–{timeLabel(shift.end_time)} • {shift.status}</p></button><div className="flex flex-wrap gap-2"><button onClick={() => openActivityForShift(shift, "Transportation")} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800">Transportation</button><button onClick={() => openActivityForShift(shift, "Break")} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900">Break</button><button onClick={() => editShift(shift)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">Edit</button></div></div>) : <EmptyState title="No staff shifts entered" detail="Add a shift to start building floor coverage." />}</div>
        </SectionCard>

        <SectionCard title="Off-Floor Assignments" description="Transportation and other non-floor duties are subtracted from staffing coverage.">
          <div className="space-y-3">{selectedActivities.length ? selectedActivities.map((item) => <div key={item.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-950">{item.staff_name}</p><p className="mt-1 text-xs font-bold text-blue-700">{item.activity_type} • {timeLabel(item.start_time)}–{timeLabel(item.end_time)}</p><p className="mt-1 text-xs text-slate-500">{item.reason || "No note entered"}</p></div><button onClick={() => void deleteActivity(item.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-700" aria-label="Remove activity"><X className="h-4 w-4" /></button></div></div>) : <EmptyState title="Everyone is counted on floor" detail="Add transportation, breaks, training, admin, or off-site blocks when staff leave floor coverage." />}</div>
        </SectionCard>
      </div>}
    </>}

    {shiftDraft && <Modal title={shiftDraft.id ? "Edit Live Shift" : "Assign Coverage"} description="Saving updates the shared staffing schedule immediately." onClose={() => setShiftDraft(null)} footer={<>{shiftDraft.id && <button disabled={saving} onClick={() => void deleteShift()} className="mr-auto rounded-xl px-4 py-2 text-sm font-black text-red-700 hover:bg-red-50">Delete</button>}<SecondaryButton onClick={() => setShiftDraft(null)}>Cancel</SecondaryButton><PrimaryButton onClick={() => document.getElementById("live-shift-save")?.click()}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save Shift</PrimaryButton></>}>
      <form onSubmit={saveShift} className="grid gap-4 sm:grid-cols-2">
        <Field label="Employee"><select className={inputClass} value={shiftDraft.user_id} onChange={(event) => { const option = staff.find((item) => item.user_id === event.target.value); setShiftDraft({ ...shiftDraft, user_id: event.target.value, staff_name: option?.full_name ?? shiftDraft.staff_name }); }}><option value="">Choose employee…</option>{staff.map((item) => <option key={item.user_id} value={item.user_id}>{item.full_name} • {item.role}</option>)}</select><input className={`${inputClass} mt-2`} placeholder="Or type staff name" value={shiftDraft.staff_name} onChange={(event) => setShiftDraft({ ...shiftDraft, staff_name: event.target.value, user_id: "" })} /></Field>
        <Field label="Location"><select className={inputClass} value={shiftDraft.location_id} onChange={(event) => setShiftDraft({ ...shiftDraft, location_id: event.target.value })}>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Date"><input type="date" className={inputClass} value={shiftDraft.shift_date} onChange={(event) => setShiftDraft({ ...shiftDraft, shift_date: event.target.value })} /></Field>
        <Field label="Status"><select className={inputClass} value={shiftDraft.status} onChange={(event) => setShiftDraft({ ...shiftDraft, status: event.target.value as ShiftDraft["status"] })}><option>Draft</option><option>Published</option><option>Cancelled</option></select></Field>
        <Field label="Start"><input type="time" required className={inputClass} value={shiftDraft.start_time} onChange={(event) => setShiftDraft({ ...shiftDraft, start_time: event.target.value })} /></Field>
        <Field label="End"><input type="time" required className={inputClass} value={shiftDraft.end_time} onChange={(event) => setShiftDraft({ ...shiftDraft, end_time: event.target.value })} /></Field>
        <Field label="Position / Assignment" wide><input className={inputClass} value={shiftDraft.position_label} onChange={(event) => setShiftDraft({ ...shiftDraft, position_label: event.target.value })} /></Field>
        <Field label="Notes" wide><textarea className={`${inputClass} min-h-24`} value={shiftDraft.notes} onChange={(event) => setShiftDraft({ ...shiftDraft, notes: event.target.value })} /></Field>
        <button id="live-shift-save" type="submit" className="hidden">Save</button>
      </form>
    </Modal>}

    {activityDraft && <Modal title="Off-Floor Assignment" description="Use this whenever a scheduled employee is temporarily unavailable for floor coverage." onClose={() => setActivityDraft(null)} footer={<><SecondaryButton onClick={() => setActivityDraft(null)}>Cancel</SecondaryButton><PrimaryButton onClick={() => document.getElementById("activity-save")?.click()}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save Activity</PrimaryButton></>}>
      <form onSubmit={saveActivity} className="grid gap-4 sm:grid-cols-2">
        <Field label="Employee"><select className={inputClass} value={activityDraft.user_id} onChange={(event) => { const option = staff.find((item) => item.user_id === event.target.value); setActivityDraft({ ...activityDraft, user_id: event.target.value, staff_name: option?.full_name ?? activityDraft.staff_name }); }}><option value="">Choose employee…</option>{staff.map((item) => <option key={item.user_id} value={item.user_id}>{item.full_name}</option>)}</select><input className={`${inputClass} mt-2`} placeholder="Or type staff name" value={activityDraft.staff_name} onChange={(event) => setActivityDraft({ ...activityDraft, staff_name: event.target.value, user_id: "" })} /></Field>
        <Field label="Activity"><select className={inputClass} value={activityDraft.activity_type} onChange={(event) => { const type = event.target.value as StaffActivityRow["activity_type"]; setActivityDraft({ ...activityDraft, activity_type: type, counts_toward_floor: type === "Floor" }); }}>{["Transportation","Break","Admin","Training","Offsite","Other","Floor"].map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Date"><input type="date" className={inputClass} value={activityDraft.activity_date} onChange={(event) => setActivityDraft({ ...activityDraft, activity_date: event.target.value })} /></Field>
        <Field label="Location"><select className={inputClass} value={activityDraft.location_id} onChange={(event) => setActivityDraft({ ...activityDraft, location_id: event.target.value })}>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Start"><input type="time" className={inputClass} value={activityDraft.start_time} onChange={(event) => setActivityDraft({ ...activityDraft, start_time: event.target.value })} /></Field>
        <Field label="End"><input type="time" className={inputClass} value={activityDraft.end_time} onChange={(event) => setActivityDraft({ ...activityDraft, end_time: event.target.value })} /></Field>
        <Field label="Reason / Route" wide><input className={inputClass} placeholder="Example: Miller Elementary pickup route" value={activityDraft.reason} onChange={(event) => setActivityDraft({ ...activityDraft, reason: event.target.value })} /></Field>
        <label className="sm:col-span-2 flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-bold"><input type="checkbox" disabled={activityDraft.activity_type === "Floor"} checked={activityDraft.counts_toward_floor} onChange={(event) => setActivityDraft({ ...activityDraft, counts_toward_floor: event.target.checked })} /> Counts toward floor coverage</label>
        <button id="activity-save" type="submit" className="hidden">Save</button>
      </form>
    </Modal>}

    {ruleDraft && <Modal title="Verified Staffing Rule" description="Enter the rule TCS has verified for this location/program. This screen intentionally does not supply a legal ratio for you." onClose={() => setRuleDraft(null)} footer={<><SecondaryButton onClick={() => setRuleDraft(null)}>Cancel</SecondaryButton><PrimaryButton onClick={() => document.getElementById("rule-save")?.click()}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save Rule</PrimaryButton></>}>
      <form onSubmit={saveRule} className="grid gap-4 sm:grid-cols-2">
        <Field label="Rule Name" wide><input required className={inputClass} value={ruleDraft.rule_name} onChange={(event) => setRuleDraft({ ...ruleDraft, rule_name: event.target.value })} /></Field>
        <Field label="Age Group"><select className={inputClass} value={ruleDraft.age_group} onChange={(event) => setRuleDraft({ ...ruleDraft, age_group: event.target.value })}><option>All</option><option>Infant</option><option>Toddler</option><option>Preschool</option><option>School Age</option></select></Field>
        <Field label="Children Per Staff"><input type="number" min="1" className={inputClass} value={ruleDraft.children_per_staff} onChange={(event) => setRuleDraft({ ...ruleDraft, children_per_staff: event.target.value })} /></Field>
        <Field label="Minimum Staff"><input type="number" min="0" className={inputClass} value={ruleDraft.minimum_staff} onChange={(event) => setRuleDraft({ ...ruleDraft, minimum_staff: event.target.value })} /></Field>
        <Field label="Maximum Group Size"><input type="number" min="1" className={inputClass} value={ruleDraft.maximum_group_size} onChange={(event) => setRuleDraft({ ...ruleDraft, maximum_group_size: event.target.value })} /></Field>
        <Field label="Effective From"><input type="date" className={inputClass} value={ruleDraft.effective_from} onChange={(event) => setRuleDraft({ ...ruleDraft, effective_from: event.target.value })} /></Field>
        <Field label="Effective To"><input type="date" className={inputClass} value={ruleDraft.effective_to} onChange={(event) => setRuleDraft({ ...ruleDraft, effective_to: event.target.value })} /></Field>
        <Field label="Source Type"><select className={inputClass} value={ruleDraft.source_type} onChange={(event) => setRuleDraft({ ...ruleDraft, source_type: event.target.value })}><option>TCS Configured</option><option>License/Regulation</option><option>Certificate/Program</option><option>Other</option></select></Field>
        <Field label="Source / Verification Note" wide><textarea className={`${inputClass} min-h-24`} placeholder="Document where this rule came from and who verified it." value={ruleDraft.source_note} onChange={(event) => setRuleDraft({ ...ruleDraft, source_note: event.target.value })} /></Field>
        <button id="rule-save" type="submit" className="hidden">Save</button>
      </form>
    </Modal>}
  </div></MainLayout>;
}

function MiniMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-xl bg-slate-50 p-2"><strong className="block text-lg font-black text-slate-950">{value}</strong><span className="text-[8px] font-black uppercase tracking-wider text-slate-400">{label}</span></div>;
}

function MetricCell({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><p className="text-[9px] font-black uppercase opacity-60">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-7 text-center"><Clock3 className="mx-auto h-6 w-6 text-slate-400" /><p className="mt-3 font-black text-slate-800">{title}</p><p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{detail}</p></div>;
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-sm font-black text-slate-700">{label}</span>{children}</label>;
}
