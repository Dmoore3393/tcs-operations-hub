import { initialChildren, type ChildRecord } from "@/lib/children";
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

function block(start: string, end: string, location: Exclude<LocationKey, "All Locations">): CareBlock {
  return { id: `${location}-${start}-${end}`, start, end, location };
}

function weekdays(start: string, end: string, location: Exclude<LocationKey, "All Locations">) {
  const week = emptyWeek();
  dayNames.slice(0, 5).forEach((day) => {
    week[day] = { noCare: false, blocks: [block(start, end, location)], note: "" };
  });
  return week;
}

function makeRecord(childId: number, childName: string, ageGroup: string, defaultLocation: Exclude<LocationKey, "All Locations">, days?: Record<DayName, ChildDaySchedule>): ChildScheduleRecord {
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

const childById = new Map(initialChildren.map((child) => [child.id, child]));
const info = (id: number) => childById.get(id)!;

const kaylaWeek = emptyWeek();
["Tuesday", "Thursday", "Friday"].forEach((day) => {
  kaylaWeek[day as DayName] = { noCare: false, blocks: [block("16:00", "20:00", "Division")], note: "Home transportation" };
});
["Saturday", "Sunday"].forEach((day) => {
  kaylaWeek[day as DayName] = { noCare: false, blocks: [block("12:00", "19:00", "Division")], note: "Weekend care" };
});

const kendruWeek = emptyWeek();
["Tuesday", "Thursday", "Friday"].forEach((day) => {
  kendruWeek[day as DayName] = { noCare: false, blocks: [block("16:00", "20:00", "Halcom")], note: "Home transportation" };
});
["Saturday", "Sunday"].forEach((day) => {
  kendruWeek[day as DayName] = { noCare: false, blocks: [block("12:00", "19:00", "Halcom")], note: "Weekend care" };
});

const alarikWeek = weekdays("09:00", "18:00", "Halcom");
alarikWeek.Monday = { noCare: false, blocks: [block("10:00", "18:00", "Halcom")], note: "Arrival may vary between 9 and 10" };

export const starterChildSchedules: ChildScheduleRecord[] = [
  makeRecord(1, `${info(1).firstName} ${info(1).lastName}`, info(1).ageGroup, "Halcom", weekdays("06:00", "14:00", "Halcom")),
  makeRecord(2, `${info(2).firstName} ${info(2).lastName}`, info(2).ageGroup, "Halcom", weekdays("08:00", "15:30", "Halcom")),
  makeRecord(3, `${info(3).firstName} ${info(3).lastName}`, info(3).ageGroup, "Division", weekdays("06:00", "14:00", "Division")),
  makeRecord(4, `${info(4).firstName} ${info(4).lastName}`, info(4).ageGroup, "Division", weekdays("06:00", "14:00", "Division")),
  makeRecord(5, `${info(5).firstName} ${info(5).lastName}`, info(5).ageGroup, "Division", weekdays("07:30", "21:00", "Division")),
  makeRecord(6, `${info(6).firstName} ${info(6).lastName}`, info(6).ageGroup, "Division", weekdays("07:30", "21:00", "Division")),
  makeRecord(7, `${info(7).firstName} ${info(7).lastName}`, info(7).ageGroup, "Division", weekdays("08:00", "21:00", "Division")),
  makeRecord(8, `${info(8).firstName} ${info(8).lastName}`, info(8).ageGroup, "Division", weekdays("08:00", "21:00", "Division")),
  makeRecord(9, `${info(9).firstName} ${info(9).lastName}`, info(9).ageGroup, "Halcom", weekdays("08:00", "21:00", "Halcom")),
  makeRecord(10, `${info(10).firstName} ${info(10).lastName}`, info(10).ageGroup, "Halcom", alarikWeek),
  makeRecord(11, `${info(11).firstName} ${info(11).lastName}`, info(11).ageGroup, "Division", kaylaWeek),
  makeRecord(12, `${info(12).firstName} ${info(12).lastName}`, info(12).ageGroup, "Halcom", kendruWeek),
];

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
  const text = minutesToTime(minutes);
  return text.replace(":00", "").replace(" ", " ");
}

export function scheduleSummary(day: ChildDaySchedule) {
  if (day.noCare || day.blocks.length === 0) return "No care";
  return day.blocks.map((item) => `${compactTime(timeToMinutes(item.start))}–${compactTime(timeToMinutes(item.end))}${item.location ? ` • ${item.location}` : ""}`).join(" + ");
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

/**
 * Returns true when a child is enrolled primarily at a location or has at
 * least one scheduled care block there. RLS still decides which schedule
 * fragments the signed-in staff member is allowed to receive.
 */
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
