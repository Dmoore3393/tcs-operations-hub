export type LocationKey =
  | "All Locations"
  | "Halcom"
  | "21st Street"
  | "Division"
  | "33rd Street"
  | "Tehachapi"
  | "42nd Street";

export type DayName = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";

export type DailyHours = {
  closed: boolean;
  open: string;
  close: string;
};

export type LocationHoursRecord = {
  location: Exclude<LocationKey, "All Locations">;
  days: Record<DayName, DailyHours>;
};

export const dayNames: DayName[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const locationThemes: Record<LocationKey, {
  label: string;
  fullName: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  primarySoft: string;
  ink: string;
  textOnPrimary: string;
  accent: string;
  capacity: number;
  programType: string;
}> = {
  "All Locations": { label: "All Locations", fullName: "Thomason Childcare Solutions", primary: "#15803d", primaryDark: "#14532d", primaryLight: "#4ade80", primarySoft: "#dcfce7", ink: "#052e16", textOnPrimary: "#ffffff", accent: "#fbbf24", capacity: 0, programType: "Multi-site Operations" },
  Halcom: { label: "Halcom", fullName: "Moore Family Childcare • Halcom", primary: "#15803d", primaryDark: "#052e16", primaryLight: "#4ade80", primarySoft: "#dcfce7", ink: "#052e16", textOnPrimary: "#ffffff", accent: "#111827", capacity: 14, programType: "Family Childcare" },
  "21st Street": { label: "21st Street", fullName: "Cathers Family Childcare • 21st Street", primary: "#111827", primaryDark: "#030712", primaryLight: "#6b7280", primarySoft: "#e5e7eb", ink: "#030712", textOnPrimary: "#ffffff", accent: "#d1d5db", capacity: 14, programType: "Family Childcare" },
  Division: { label: "Division", fullName: "The School Age Center • Division", primary: "#dc2626", primaryDark: "#7f1d1d", primaryLight: "#fb7185", primarySoft: "#fee2e2", ink: "#450a0a", textOnPrimary: "#ffffff", accent: "#111827", capacity: 17, programType: "School Age Center" },
  "33rd Street": { label: "33rd Street", fullName: "Cornejo Family Childcare • 33rd Street", primary: "#ca8a04", primaryDark: "#713f12", primaryLight: "#fde047", primarySoft: "#fef9c3", ink: "#422006", textOnPrimary: "#111827", accent: "#111827", capacity: 14, programType: "Family Childcare" },
  Tehachapi: { label: "Tehachapi", fullName: "Tehachapi Transportation Hub", primary: "#1e3a8a", primaryDark: "#172554", primaryLight: "#60a5fa", primarySoft: "#dbeafe", ink: "#172554", textOnPrimary: "#ffffff", accent: "#fbbf24", capacity: 14, programType: "Transportation / Care Hub" },
  "42nd Street": { label: "42nd Street", fullName: "Lara Family Childcare • 42nd Street", primary: "#7e22ce", primaryDark: "#581c87", primaryLight: "#c084fc", primarySoft: "#f3e8ff", ink: "#3b0764", textOnPrimary: "#ffffff", accent: "#fbbf24", capacity: 14, programType: "Family Childcare" },
};

export const selectableLocations = Object.keys(locationThemes) as LocationKey[];
export const careLocations = selectableLocations.filter((item): item is Exclude<LocationKey, "All Locations"> => item !== "All Locations");

function hours(open: string, close: string): DailyHours {
  return { closed: false, open, close };
}
function closed(): DailyHours {
  return { closed: true, open: "", close: "" };
}

export const starterLocationHours: LocationHoursRecord[] = [
  { location: "Halcom", days: { Monday: hours("06:00", "23:00"), Tuesday: hours("06:00", "23:00"), Wednesday: hours("06:00", "23:00"), Thursday: hours("06:00", "23:00"), Friday: hours("06:00", "18:00"), Saturday: hours("06:00", "23:00"), Sunday: hours("06:00", "23:00") } },
  { location: "21st Street", days: { Monday: hours("06:00", "23:00"), Tuesday: hours("06:00", "23:00"), Wednesday: hours("06:00", "23:00"), Thursday: hours("06:00", "23:00"), Friday: hours("06:00", "23:00"), Saturday: hours("06:00", "23:00"), Sunday: hours("06:00", "23:00") } },
  { location: "Division", days: { Monday: hours("06:00", "19:00"), Tuesday: hours("06:00", "19:00"), Wednesday: hours("06:00", "19:00"), Thursday: hours("06:00", "19:00"), Friday: hours("06:00", "19:00"), Saturday: closed(), Sunday: closed() } },
  { location: "33rd Street", days: { Monday: hours("06:00", "23:00"), Tuesday: hours("06:00", "23:00"), Wednesday: hours("06:00", "23:00"), Thursday: hours("06:00", "23:00"), Friday: hours("06:00", "23:00"), Saturday: hours("06:00", "23:00"), Sunday: hours("06:00", "23:00") } },
  { location: "Tehachapi", days: { Monday: hours("06:00", "19:00"), Tuesday: hours("06:00", "19:00"), Wednesday: hours("06:00", "19:00"), Thursday: hours("06:00", "19:00"), Friday: hours("06:00", "19:00"), Saturday: closed(), Sunday: closed() } },
  { location: "42nd Street", days: { Monday: hours("06:00", "23:00"), Tuesday: hours("06:00", "23:00"), Wednesday: hours("06:00", "23:00"), Thursday: hours("06:00", "23:00"), Friday: hours("06:00", "23:00"), Saturday: hours("06:00", "23:00"), Sunday: hours("06:00", "23:00") } },
];

export function normalizeLocation(value: string): LocationKey {
  const lower = value.toLowerCase();
  if (lower.includes("halcom")) return "Halcom";
  if (lower.includes("21st") || lower.includes("cathers")) return "21st Street";
  if (lower.includes("division") || lower.includes("school age center") || lower.includes("astor")) return "Division";
  if (lower.includes("cornejo") || lower.includes("33rd")) return "33rd Street";
  if (lower.includes("tehachapi")) return "Tehachapi";
  if (lower.includes("lara") || lower.includes("42nd")) return "42nd Street";
  return "All Locations";
}

export function formatClock(value: string) {
  if (!value) return "—";
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText || "0");
  const suffix = hour >= 12 ? "PM" : "AM";
  const normalized = hour % 12 || 12;
  return `${normalized}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function summarizeHours(record: LocationHoursRecord) {
  const weekdays = dayNames.slice(0, 5).map((day) => record.days[day]);
  const sameWeekday = weekdays.every((entry) => entry.closed === weekdays[0].closed && entry.open === weekdays[0].open && entry.close === weekdays[0].close);
  if (sameWeekday && !weekdays[0].closed) return `Mon–Fri ${formatClock(weekdays[0].open)}–${formatClock(weekdays[0].close)}`;
  return dayNames.map((day) => `${day.slice(0, 3)} ${record.days[day].closed ? "Closed" : `${formatClock(record.days[day].open)}–${formatClock(record.days[day].close)}`}`).join(" • ");
}
