export type PerformancePeriod = "Month" | "90 Days" | "Year";

export type PerformanceStaff = {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
};

export type PerformanceLocation = {
  id: string;
  name: string;
  full_name: string;
  slug: string;
  color_primary: string;
  color_secondary: string;
};

export type StaffLocationAssignment = {
  user_id: string;
  location_id: string;
};

export type PerformanceEventType = {
  id: string;
  code: string;
  label: string;
  category: "Recognition" | "Accountability";
  description: string | null;
  suggested_points: number;
  requires_review: boolean;
  is_active: boolean;
  sort_order: number;
};

export type PerformanceEvent = {
  id: string;
  staff_user_id: string;
  location_id: string;
  event_type_id: string;
  event_date: string;
  summary: string;
  notes: string | null;
  recognition_points: number;
  status: "Pending Review" | "Confirmed" | "Dismissed";
  source_system: string;
  source_reference: string | null;
  created_at: string;
};

export type CoachingRecord = {
  id: string;
  staff_user_id: string;
  location_id: string;
  record_type: "Coaching Note" | "Verbal Warning" | "Written Warning" | "Final Warning" | "Other";
  incident_date: string;
  summary: string;
  expectations: string | null;
  follow_up_date: string | null;
  status: "Draft" | "Open" | "Resolved" | "Void";
  created_at: string;
};

export type StaffPerformancePayload = {
  from: string;
  to: string;
  canConfigurePoints: boolean;
  locations: PerformanceLocation[];
  assignments: StaffLocationAssignment[];
  staff: PerformanceStaff[];
  eventTypes: PerformanceEventType[];
  events: PerformanceEvent[];
  coachingRecords: CoachingRecord[];
};

export type StaffPerformanceSummary = {
  recognitionPoints: number;
  recognitionCount: number;
  accountabilityCount: number;
  pendingCount: number;
  openCoachingCount: number;
};

export function localDatePlus(date: string, days: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, "0");
  const day = String(next.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function rangeForPerformancePeriod(period: PerformancePeriod, today: string) {
  if (period === "90 Days") return { from: localDatePlus(today, -89), to: today };
  if (period === "Year") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

export function performanceDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export function performanceInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "TCS";
}

export function summarizeStaffPerformance(
  staffUserId: string,
  events: PerformanceEvent[],
  coachingRecords: CoachingRecord[],
  eventTypes: PerformanceEventType[],
): StaffPerformanceSummary {
  const typeMap = new Map(eventTypes.map((type) => [type.id, type]));
  const confirmed = events.filter((event) => event.staff_user_id === staffUserId && event.status === "Confirmed");
  const recognition = confirmed.filter((event) => typeMap.get(event.event_type_id)?.category === "Recognition");
  const accountability = confirmed.filter((event) => typeMap.get(event.event_type_id)?.category === "Accountability");

  return {
    recognitionPoints: recognition.reduce((sum, event) => sum + event.recognition_points, 0),
    recognitionCount: recognition.length,
    accountabilityCount: accountability.length,
    pendingCount: events.filter((event) => event.staff_user_id === staffUserId && event.status === "Pending Review").length,
    openCoachingCount: coachingRecords.filter((record) => record.staff_user_id === staffUserId && record.status === "Open").length,
  };
}
