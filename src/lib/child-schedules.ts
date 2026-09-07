import type { ChildRecord } from "@/lib/children";
import { dayNames, normalizeLocation, type DayName, type LocationKey } from "@/lib/location-config";

export type CareBlock = {
  id: string;
  start: string;
  end: string;
  location: Exclude<LocationKey, "All Locations">;
};

export type ChildDaySchedule = {
  noCare: boolean;
  blocks: CareBlock[];
  note: string;
};

export type ChildScheduleRecord = {
  childId: number;
  childName: string;
  ageGroup: string;
  defaultLocation: Exclude<LocationKey, "All Locations">;
  days: Record<DayName, ChildDaySchedule>;
};

export const blankDay = (): ChildDaySchedule => ({ noCare: true, blocks: [], note: "" });

function emptyWeek(): Record<DayName, ChildDaySchedule> {
  return Object.fromEntries(dayNames.map((day) => [day, blankDay()])) as Record<DayName, ChildDaySchedule>;
}

function makeRecord(
  childId: number,
  childName: string,
  ageGroup: string,
  defaultLocation: Exclude<LocationKey, "All Locations">,
  days?: Record<DayName, ChildDaySchedule>,
): ChildScheduleRecord {
  return { childId, childName, ageGroup, defaultLocation, days: days ?? emptyWeek() };
}

export function createBlankChildSchedule(child: ChildRecord): ChildScheduleRecord {
  return makeRecord(
    child.id,
    `${child.firstName} ${child.lastName}`,
    child.ageGroup,
    locationForChildRecord(child.location),
    emptyWeek(),
  );
}

/**
 * Live child schedules are stored in Supabase. Do not place child names or
 * schedule details in source control; a new schedule is created only after a
 * real child record exists in the secured database.
 */
export const starterChildSchedules: ChildScheduleRecord[] = [];

export function timeToMinutes(value: string) {
  if (!value) return 0;
  if (/^\d{1,2}:\d{2}$/.test(value)) {
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  }
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) return 0;
  let hour = Number(match[1]) % 12;
  const minute = Number(match[2] ?? 0);
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + minute;
}

export function minutesToTime(minutes: number) {
  const normalized = Math.max(0, Math.min(minutes, 24 * 60));
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function compactTime(minutes: number) {
  const value = minutesToTime(minutes);
  return value.replace(":00", "").replace(" ", " ");
}

export function scheduleSummary(day: ChildDaySchedule) {
  if (day.noCare || day.blocks.length === 0) return "No care";
  return day.blocks
    .map((item) => `${compactTime(timeToMinutes(item.start))}–${compactTime(timeToMinutes(item.end))}${item.location ? ` • ${item.location}` : ""}`)
    .join(" + ");
}

export function dateToDayName(date: string): DayName {
  const parsed = new Date(`${date}T12:00:00`);
  const index = parsed.getDay();
  return (["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as DayName[])[index];
}

export function locationForChildRecord(value: string): Exclude<LocationKey, "All Locations"> {
  const normalized = normalizeLocation(value);
  return normalized === "All Locations" ? "Halcom" : normalized;
}

export function childAttendsLocation(
  child: ChildRecord,
  schedule: ChildScheduleRecord | undefined,
  location: Exclude<LocationKey, "All Locations">,
) {
  if (normalizeLocation(child.location) === location) return true;
  return Boolean(schedule && Object.values(schedule.days).some((day) =>
    day.blocks.some((careBlock) => careBlock.location === location),
  ));
}
