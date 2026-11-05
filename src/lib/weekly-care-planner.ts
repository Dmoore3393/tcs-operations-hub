import { isoDateInTimeZone } from "@/lib/family-care-calendar";
import {
  emptyWeek,
  dateToDayName,
  timeToMinutes,
  type CareBlock,
  type ChildScheduleRecord,
} from "@/lib/child-schedules";
import { normalizeLocation } from "@/lib/location-config";
import type { StaffingLocation } from "@/lib/staffing-command";

export type PlanStatus = "scheduled" | "pending" | "no-care";
export type PlanBlock = { locationId: string; start: string; end: string };
export type PlannerChild = {
  id: string;
  legacy_id: string;
  record_key: string | null;
  location_id: string;
  first_name: string;
  last_name: string;
  age_group: string;
  planned_start: string | null;
  planned_end: string | null;
};
export type DatedPlan = {
  child_id: string;
  location_id: string;
  service_date: string;
  no_care: boolean;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
  planner_status: PlanStatus | null;
  care_blocks: PlanBlock[] | null;
  updated_at: string;
};
export type PlanClosure = {
  location_id: string | null;
  closure_date: string;
  title: string;
  note: string | null;
};
export type SchoolNotes = {
  location_id: string;
  service_date: string;
  no_school: string;
  minimum_day: string;
  updated_at: string;
};
export type PlannerData = {
  locations: StaffingLocation[];
  children: PlannerChild[];
  overrides: DatedPlan[];
  closures: PlanClosure[];
  schools: SchoolNotes[];
};
export type DayRow = {
  child: PlannerChild;
  name: string;
  status: PlanStatus;
  blocks: PlanBlock[];
  note: string;
  source: "Dated plan" | "Family approved" | "Usual hours" | "Awaiting schedule";
};
export const emptyPlannerData: PlannerData = {
  locations: [],
  children: [],
  overrides: [],
  closures: [],
  schools: [],
};

export function validatePlanBlocks(blocks: PlanBlock[]) {
  if (!blocks.length) return "Enter at least one care block.";
  const ordered = [...blocks].sort((a, b) => a.start.localeCompare(b.start));
  for (const [i, block] of ordered.entries()) {
    if (
      !block.locationId ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(block.start) ||
      !/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(block.end)
    )
      return "Enter an arrival, pickup and location for each block.";
    if (block.end <= block.start) return "Pickup must follow arrival. Split overnight care at midnight.";
    if (i && ordered[i - 1].end > block.start) return "Care blocks overlap. Check the times at each location.";
  }
  return "";
}

export function planForDate(data: PlannerData, regular: ChildScheduleRecord[], date: string): DayRow[] {
  const day = dateToDayName(date);
  const locations = new Map(data.locations.map((site) => [normalizeLocation(site.name), site.id]));
  const overrides = new Map(data.overrides.filter((o) => o.service_date === date).map((o) => [o.child_id, o]));
  const defaults = new Map(regular.map((r) => [String(r.childId), r]));
  return data.children
    .filter((c) => (!c.planned_start || c.planned_start <= date) && (!c.planned_end || c.planned_end >= date))
    .map((child) => {
      const override = overrides.get(child.id);
      const name = [child.first_name, child.last_name].filter(Boolean).join(" ");
      if (override) {
        const blocks =
          override.care_blocks ??
          (!override.no_care && override.start_time && override.end_time
            ? [
                {
                  locationId: override.location_id,
                  start: override.start_time.slice(0, 5),
                  end: override.end_time.slice(0, 5),
                },
              ]
            : []);
        return {
          child,
          name,
          status: override.planner_status ?? (override.no_care ? "no-care" : "scheduled"),
          blocks,
          note: override.note ?? "",
          source: override.planner_status ? "Dated plan" : "Family approved",
        };
      }
      const pattern = defaults.get(child.record_key ?? "") ?? defaults.get(child.legacy_id);
      const entry = pattern?.days[day];
      const blocks = entry?.noCare
        ? []
        : (entry?.blocks ?? []).flatMap((b) => {
            const locationId = locations.get(b.location);
            return locationId && b.start && b.end
              ? [
                  {
                    locationId,
                    start: b.start,
                    end: b.end === "00:00" && b.start !== "00:00" ? "24:00" : b.end,
                  },
                ]
              : [];
          });
      // Legacy empty weekdays were created automatically. Only an explicit dated
      // No Care entry confirms that the family does not need care.
      return {
        child,
        name,
        status: blocks.length ? "scheduled" : "pending",
        blocks,
        note: entry?.note ?? "",
        source: blocks.length ? "Usual hours" : "Awaiting schedule",
      };
    });
}

export function closedSites(data: PlannerData, date: string) {
  return new Set(
    data.closures
      .filter((c) => c.closure_date === date)
      .flatMap((c) => (c.location_id ? [c.location_id] : data.locations.map((l) => l.id))),
  );
}

export function effectiveScheduleRecords(data: PlannerData, regular: ChildScheduleRecord[], date: string) {
  const day = dateToDayName(date);
  const sites = new Map(data.locations.map((site) => [site.id, normalizeLocation(site.name)]));
  const closed = closedSites(data, date);
  const patterns = new Map(regular.map((r) => [String(r.childId), r]));
  return planForDate(data, regular, date).flatMap((row) => {
    const home = sites.get(row.child.location_id);
    if (!home || home === "All Locations") return [];
    const base = patterns.get(row.child.record_key ?? "") ?? patterns.get(row.child.legacy_id);
    const blocks: CareBlock[] =
      row.status === "scheduled"
        ? row.blocks.flatMap((b, i) => {
            const location = sites.get(b.locationId);
            return !location || location === "All Locations" || closed.has(b.locationId)
              ? []
              : [{ location, start: b.start, end: b.end, id: `${row.child.id}-${i}` }];
          })
        : [];
    const days = base?.days ?? emptyWeek();
    return [
      {
        childId: base?.childId ?? row.child.record_key ?? row.child.legacy_id ?? row.child.id,
        childName: row.name,
        defaultLocation: home,
        ageGroup: row.child.age_group || "Unknown",
        days: { ...days, [day]: { noCare: !blocks.length, blocks, note: row.note } },
      } as ChildScheduleRecord,
    ];
  });
}

// The Cottage sheet lists children who attend any part of a window. MAX counts
// only those present together. Departures are exclusive, including at midnight.
const ratioBoundaries = [0, 360, 600, 720, 840, 873, 1080, 1140, 1260, 1320, 1380, 1440];
export function buildDailyRatio(rows: DayRow[], locationId: string, isClosed = false) {
  const intervals = isClosed
    ? []
    : rows
        .filter((r) => r.status === "scheduled")
        .flatMap((row) =>
          row.blocks
            .filter((b) => b.locationId === locationId)
            .map((b) => ({ row, start: timeToMinutes(b.start), end: timeToMinutes(b.end) }))
            .filter((b) => b.end > b.start),
        );
  const times = [...new Set(intervals.flatMap((b) => [b.start, b.end]))].sort((a, b) => a - b);
  const segments = times
    .slice(0, -1)
    .map((start, i) => ({
      start,
      end: times[i + 1],
      count: new Set(intervals.filter((b) => b.start <= start && b.end > start).map((b) => b.row.child.id))
        .size,
    }));
  const max = segments.reduce((n, s) => Math.max(n, s.count), 0);
  const peak = segments.find((s) => max > 0 && s.count === max);
  let peakEnd = peak?.end;
  for (const s of segments) if (peak && s.start === peakEnd && s.count === max) peakEnd = s.end;
  const windows = ratioBoundaries.slice(0, -1).map((start, i) => {
    const end = ratioBoundaries[i + 1];
    const members = new Map(
      intervals.filter((b) => b.start < end && b.end > start).map((b) => [b.row.child.id, b.row]),
    );
    const count = segments
      .filter((s) => s.start < end && s.end > start)
      .reduce((n, s) => Math.max(n, s.count), 0);
    return { start, end, children: [...members.values()].sort((a, b) => a.name.localeCompare(b.name)), count };
  });
  return { max, peakStart: peak?.start, peakEnd, windows };
}

export type PlannerQuery = Record<string, string | string[] | undefined>;
export function plannerPageSelection(query: PlannerQuery) {
  const date = typeof query.date === "string" ? query.date : "";
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date;
  return {
    initialDate: valid ? date : isoDateInTimeZone(),
    initialLocation: typeof query.location === "string" ? query.location : "",
  };
}
