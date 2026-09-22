import type { ChildRecord } from "@/lib/children";
import type { ChildScheduleRecord } from "@/lib/child-schedules";
import { dateToDayName, timeToMinutes } from "@/lib/child-schedules";
import { normalizeLocation, type LocationKey } from "@/lib/location-config";

export type StaffingLocation = {
  id: string;
  slug: string;
  name: string;
  full_name: string;
  capacity: number;
  program_type: string;
};

export type StaffShiftRow = {
  id: string;
  location_id: string;
  user_id: string | null;
  staff_name: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  status: "Draft" | "Published" | "Cancelled";
  position_label: string | null;
  notes: string | null;
};

export type StaffActivityRow = {
  id: string;
  location_id: string;
  shift_id: string | null;
  user_id: string | null;
  staff_name: string;
  activity_date: string;
  start_time: string;
  end_time: string;
  activity_type: "Floor" | "Transportation" | "Break" | "Admin" | "Training" | "Offsite" | "Other";
  counts_toward_floor: boolean;
  reason: string | null;
  source_key?: string | null;
};

export type StaffingRuleRow = {
  id: string;
  location_id: string;
  rule_name: string;
  age_group: string | null;
  children_per_staff: number | null;
  minimum_staff: number | null;
  maximum_group_size: number | null;
  effective_from: string;
  effective_to: string | null;
  source_type: string;
  source_note: string | null;
  is_active: boolean;
};

export type CoverageStatus = "covered" | "tight" | "gap" | "over-capacity" | "rule-needed";

export type CoverageWindow = {
  start: number;
  end: number;
  children: ChildScheduleRecord[];
  childCount: number;
  staffNames: string[];
  staffCount: number;
  requiredStaff: number | null;
  status: CoverageStatus;
  offFloorNames: string[];
};

function dateWithin(date: string, start: string, end: string | null) {
  return date >= start && (!end || date <= end);
}

export function locationKeyForDbLocation(location: StaffingLocation): Exclude<LocationKey, "All Locations"> | null {
  const normalized = normalizeLocation(`${location.name} ${location.full_name} ${location.slug}`);
  return normalized === "All Locations" ? null : normalized;
}

export function configuredStaffRequirement(
  children: ChildScheduleRecord[],
  rules: StaffingRuleRow[],
  locationId: string,
  date: string,
): number | null {
  if (!children.length) return 0;
  const active = rules.filter((rule) =>
    rule.location_id === locationId &&
    rule.is_active &&
    dateWithin(date, rule.effective_from, rule.effective_to),
  );
  if (!active.length) return null;

  const generic = active.filter((rule) => !rule.age_group || ["all", "all ages", "mixed"].includes(rule.age_group.trim().toLowerCase()));
  if (generic.length) {
    const requirements = generic.map((rule) => {
      const ratioNeed = rule.children_per_staff ? Math.ceil(children.length / rule.children_per_staff) : 0;
      return Math.max(ratioNeed, rule.minimum_staff ?? 0);
    });
    const result = Math.max(...requirements);
    return result > 0 ? result : null;
  }

  const groups = new Map<string, number>();
  children.forEach((child) => groups.set(child.ageGroup.toLowerCase(), (groups.get(child.ageGroup.toLowerCase()) ?? 0) + 1));
  let total = 0;
  for (const [ageGroup, count] of groups) {
    const matches = active.filter((rule) => (rule.age_group ?? "").trim().toLowerCase() === ageGroup);
    if (!matches.length) return null;
    const needs = matches.map((rule) => {
      const ratioNeed = rule.children_per_staff ? Math.ceil(count / rule.children_per_staff) : 0;
      return Math.max(ratioNeed, rule.minimum_staff ?? 0);
    });
    const groupNeed = Math.max(...needs);
    if (groupNeed <= 0) return null;
    total += groupNeed;
  }
  return total;
}

export function buildCoverageWindows(args: {
  date: string;
  location: StaffingLocation;
  schedules: ChildScheduleRecord[];
  shifts: StaffShiftRow[];
  activities: StaffActivityRow[];
  rules: StaffingRuleRow[];
}) {
  const { date, location, schedules, shifts, activities, rules } = args;
  const locationKey = locationKeyForDbLocation(location);
  if (!locationKey) return [] as CoverageWindow[];
  const day = dateToDayName(date);

  const scheduleBlocks = schedules.flatMap((record) =>
    (record.days[day]?.blocks ?? [])
      .filter((block) => block.location === locationKey)
      .map((block) => ({
        record,
        start: timeToMinutes(block.start),
        end: timeToMinutes(block.end),
      })),
  );

  const locationShifts = shifts
    .filter((shift) => shift.location_id === location.id && shift.shift_date === date && shift.status !== "Cancelled")
    .map((shift) => ({
      shift,
      start: timeToMinutes(shift.start_time.slice(0, 5)),
      end: timeToMinutes(shift.end_time.slice(0, 5)),
    }));

  const locationActivities = activities
    .filter((activity) => activity.location_id === location.id && activity.activity_date === date)
    .map((activity) => ({
      activity,
      start: timeToMinutes(activity.start_time.slice(0, 5)),
      end: timeToMinutes(activity.end_time.slice(0, 5)),
    }));

  const boundaries = new Set<number>();
  scheduleBlocks.forEach((block) => { boundaries.add(block.start); boundaries.add(block.end); });
  locationShifts.forEach((shift) => { boundaries.add(shift.start); boundaries.add(shift.end); });
  locationActivities.forEach((activity) => { boundaries.add(activity.start); boundaries.add(activity.end); });
  const sorted = [...boundaries].filter(Number.isFinite).sort((a, b) => a - b);
  const windows: CoverageWindow[] = [];

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    if (end <= start) continue;
    const midpoint = start + (end - start) / 2;
    const present = scheduleBlocks.filter((block) => block.start <= midpoint && block.end > midpoint).map((block) => block.record);
    const activeShifts = locationShifts.filter((item) => item.start <= midpoint && item.end > midpoint).map((item) => item.shift);
    const offFloor = locationActivities
      .filter((item) => !item.activity.counts_toward_floor && item.start <= midpoint && item.end > midpoint)
      .map((item) => item.activity);

    const offFloorShiftIds = new Set(offFloor.map((item) => item.shift_id).filter(Boolean));
    const offFloorUserIds = new Set(offFloor.map((item) => item.user_id).filter(Boolean));
    const offFloorNames = new Set(offFloor.map((item) => item.staff_name.trim().toLowerCase()));

    const floorStaff = activeShifts.filter((shift) =>
      !offFloorShiftIds.has(shift.id) &&
      !(shift.user_id && offFloorUserIds.has(shift.user_id)) &&
      !offFloorNames.has(shift.staff_name.trim().toLowerCase()),
    );
    const staffNames = [...new Set(floorStaff.map((shift) => shift.staff_name))];
    const requiredStaff = configuredStaffRequirement(present, rules, location.id, date);
    const status: CoverageStatus = present.length > location.capacity
      ? "over-capacity"
      : requiredStaff === null
        ? "rule-needed"
        : staffNames.length < requiredStaff
          ? "gap"
          : staffNames.length === requiredStaff
            ? "tight"
            : "covered";

    const row: CoverageWindow = {
      start,
      end,
      children: present,
      childCount: present.length,
      staffNames,
      staffCount: staffNames.length,
      requiredStaff,
      status,
      offFloorNames: [...new Set(offFloor.map((item) => item.staff_name))],
    };

    const prior = windows.at(-1);
    if (
      prior &&
      prior.end === row.start &&
      prior.status === row.status &&
      prior.childCount === row.childCount &&
      prior.staffNames.join("|") === row.staffNames.join("|") &&
      prior.offFloorNames.join("|") === row.offFloorNames.join("|")
    ) {
      prior.end = row.end;
    } else if (row.childCount || row.staffCount || row.offFloorNames.length) {
      windows.push(row);
    }
  }

  return windows;
}

export function checkedInAtLocation(children: ChildRecord[], location: StaffingLocation, date: string) {
  const key = locationKeyForDbLocation(location);
  if (!key) return [];
  return children.filter((child) =>
    child.enrollmentStatus === "Active" &&
    child.attendanceDate === date &&
    child.attendanceToday === "Present" &&
    normalizeLocation(child.location) === key,
  );
}
