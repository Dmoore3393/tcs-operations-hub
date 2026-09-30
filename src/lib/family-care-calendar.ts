export const CARE_CALENDAR_TIME_ZONE = "America/Los_Angeles";

export type CareCalendarSettings = {
  weeksAhead: number;
  lateGraceHours: number;
  deadlineTime: string;
  timeZone: string;
};

export const defaultCareCalendarSettings: CareCalendarSettings = {
  weeksAhead: 8,
  lateGraceHours: 48,
  deadlineTime: "18:00",
  timeZone: CARE_CALENDAR_TIME_ZONE,
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function addIsoDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function mondayOfWeek(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const weekday = date.getUTCDay();
  const delta = weekday === 0 ? -6 : 1 - weekday;
  return addIsoDays(value, delta);
}

export function weekDates(weekOf: string) {
  return Array.from({ length: 7 }, (_, index) => addIsoDays(weekOf, index));
}

export function isoDateInTimeZone(date = new Date(), timeZone = CARE_CALENDAR_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

export function zonedLocalToUtc(dateIso: string, timeValue: string, timeZone = CARE_CALENDAR_TIME_ZONE) {
  const [year, month, day] = dateIso.split("-").map(Number);
  const [hour, minute] = timeValue.slice(0, 5).split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = desired;

  for (let pass = 0; pass < 3; pass += 1) {
    const actual = zonedParts(new Date(timestamp), timeZone);
    const actualPseudo = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    const correction = desired - actualPseudo;
    timestamp += correction;
    if (correction === 0) break;
  }

  return new Date(timestamp);
}

export function deadlineForWeek(weekOf: string, deadlineTime = "18:00", timeZone = CARE_CALENDAR_TIME_ZONE) {
  const fridayBefore = addIsoDays(weekOf, -3);
  return zonedLocalToUtc(fridayBefore, deadlineTime, timeZone);
}

export function firstUpcomingWeek(now = new Date(), timeZone = CARE_CALENDAR_TIME_ZONE) {
  const today = isoDateInTimeZone(now, timeZone);
  return addIsoDays(mondayOfWeek(today), 7);
}

export function minutesLate(now: Date, deadline: Date) {
  return Math.max(0, Math.floor((now.getTime() - deadline.getTime()) / 60000));
}

export function lateDurationLabel(totalMinutes: number) {
  if (totalMinutes <= 0) return "On time";
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days}d ${hours}h late`;
  if (hours) return `${hours}h ${minutes}m late`;
  return `${minutes}m late`;
}

export function timeLabel(value: string) {
  const [hourValue, minuteValue] = value.slice(0, 5).split(":").map(Number);
  const suffix = hourValue >= 12 ? "PM" : "AM";
  const hour = hourValue % 12 || 12;
  return `${hour}:${pad(minuteValue)} ${suffix}`;
}

export function displayDate(value: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", options ?? { month: "short", day: "numeric" })
    .format(new Date(`${value}T12:00:00Z`));
}
