import type { StaffShiftRow, StaffingLocation } from "@/lib/staffing-command";

export type TeamScheduleData = {
  weekOf: string;
  location: StaffingLocation;
  publication: { id: string; revision: number; published_at: string | null } | null;
  shifts: StaffShiftRow[];
};

export function scheduleDatePlus(date: string, days: number) {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function scheduleMonday(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return scheduleDatePlus(date, -(day === 0 ? 6 : day - 1));
}

export function pacificScheduleDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function nextPublishedScheduleWeek(shifts: { shift_date: string }[], today: string) {
  const nextDate = shifts.map(shift => shift.shift_date).filter(date => date >= today).sort()[0];
  return nextDate ? scheduleMonday(nextDate) : null;
}

export function initialTeamScheduleWeek(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", weekday: "long", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  const monday = scheduleMonday(`${part("year")}-${part("month")}-${part("day")}`);
  return ["Saturday", "Sunday"].includes(part("weekday")) || (part("weekday") === "Friday" && Number(part("hour")) >= 18)
    ? scheduleDatePlus(monday, 7) : monday;
}
