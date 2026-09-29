import type { ChildRecord } from "@/lib/children";
import { normalizeLocation, type LocationKey } from "@/lib/location-config";
import type { TourBoardLead } from "@/lib/tour-board";

export type ForecastHorizon = 30 | 60 | 90;

export type ForecastLocationInput = {
  name: string;
  fullName: string;
  capacity: number;
};

export type EnrollmentForecastRow = {
  location: Exclude<LocationKey, "All Locations">;
  displayName: string;
  capacity: number;
  currentActive: number;
  confirmedStarts: number;
  plannedExits: number;
  projectedEnrollment: number;
  projectedOpenSpots: number;
  projectedOverCapacity: number;
  pipelineDemand: number;
  undatedPending: number;
  undatedPipeline: number;
};

export type EnrollmentForecastSnapshot = {
  horizon: ForecastHorizon;
  asOf: string;
  through: string;
  rows: EnrollmentForecastRow[];
  totals: {
    capacity: number;
    currentActive: number;
    confirmedStarts: number;
    plannedExits: number;
    projectedEnrollment: number;
    projectedOpenSpots: number;
    projectedOverCapacity: number;
    pipelineDemand: number;
    undatedPending: number;
    undatedPipeline: number;
  };
};

function dateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function localDateKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function withinWindow(value: string, start: string, end: string) {
  const date = dateOnly(value);
  return Boolean(date && date >= start && date <= end);
}

function activePipelineLead(lead: TourBoardLead) {
  return !["Enrolled", "Waitlist", "Declined"].includes(lead.stage);
}

function locationKey(value: string): Exclude<LocationKey, "All Locations"> | null {
  const normalized = normalizeLocation(value);
  return normalized === "All Locations" ? null : normalized;
}

export function buildEnrollmentForecast(args: {
  children: ChildRecord[];
  leads: TourBoardLead[];
  locations: ForecastLocationInput[];
  horizon: ForecastHorizon;
  asOf?: Date;
}): EnrollmentForecastSnapshot {
  const asOf = args.asOf ?? new Date();
  const start = localDateKey(asOf);
  const through = localDateKey(addDays(asOf, args.horizon));

  const rows = args.locations
    .map((site): EnrollmentForecastRow | null => {
      const location = locationKey(`${site.name} ${site.fullName}`);
      if (!location) return null;

      const children = args.children.filter((child) => locationKey(child.location) === location);
      const leads = args.leads.filter((lead) => locationKey(lead.location) === location);

      const currentActive = children.filter((child) => child.enrollmentStatus === "Active").length;
      const confirmedStartsFromChildren = children.filter((child) =>
        child.enrollmentStatus === "Pending"
        && withinWindow(child.plannedStartDate || "", start, through)
      ).length;

      const confirmedStartsFromTourBoard = leads.filter((lead) =>
        lead.stage === "Enrolled"
        && !lead.childRecordStartedAt
        && withinWindow(lead.preferredStartDate || "", start, through)
      ).length;

      const confirmedStarts = confirmedStartsFromChildren + confirmedStartsFromTourBoard;

      const plannedExits = children.filter((child) =>
        child.enrollmentStatus === "Active"
        && withinWindow(child.plannedLastDay || "", start, through)
      ).length;

      const projectedEnrollment = Math.max(0, currentActive + confirmedStarts - plannedExits);
      const capacity = Math.max(0, Number(site.capacity) || 0);

      const pipelineDemand = leads.filter((lead) =>
        activePipelineLead(lead)
        && withinWindow(lead.preferredStartDate || "", start, through)
      ).length;

      const undatedPending = children.filter((child) =>
        child.enrollmentStatus === "Pending" && !dateOnly(child.plannedStartDate || "")
      ).length;

      const undatedPipeline = leads.filter((lead) =>
        activePipelineLead(lead) && !dateOnly(lead.preferredStartDate || "")
      ).length;

      return {
        location,
        displayName: site.fullName || site.name || location,
        capacity,
        currentActive,
        confirmedStarts,
        plannedExits,
        projectedEnrollment,
        projectedOpenSpots: Math.max(0, capacity - projectedEnrollment),
        projectedOverCapacity: Math.max(0, projectedEnrollment - capacity),
        pipelineDemand,
        undatedPending,
        undatedPipeline,
      };
    })
    .filter((row): row is EnrollmentForecastRow => Boolean(row))
    .sort((a, b) => a.location.localeCompare(b.location));

  const totals = rows.reduce(
    (total, row) => ({
      capacity: total.capacity + row.capacity,
      currentActive: total.currentActive + row.currentActive,
      confirmedStarts: total.confirmedStarts + row.confirmedStarts,
      plannedExits: total.plannedExits + row.plannedExits,
      projectedEnrollment: total.projectedEnrollment + row.projectedEnrollment,
      projectedOpenSpots: total.projectedOpenSpots + row.projectedOpenSpots,
      projectedOverCapacity: total.projectedOverCapacity + row.projectedOverCapacity,
      pipelineDemand: total.pipelineDemand + row.pipelineDemand,
      undatedPending: total.undatedPending + row.undatedPending,
      undatedPipeline: total.undatedPipeline + row.undatedPipeline,
    }),
    {
      capacity: 0,
      currentActive: 0,
      confirmedStarts: 0,
      plannedExits: 0,
      projectedEnrollment: 0,
      projectedOpenSpots: 0,
      projectedOverCapacity: 0,
      pipelineDemand: 0,
      undatedPending: 0,
      undatedPipeline: 0,
    },
  );

  return {
    horizon: args.horizon,
    asOf: start,
    through,
    rows,
    totals,
  };
}

export function upcomingEnrollmentEvents(args: {
  children: ChildRecord[];
  leads: TourBoardLead[];
  horizon?: number;
  asOf?: Date;
}) {
  const asOf = args.asOf ?? new Date();
  const start = localDateKey(asOf);
  const through = localDateKey(addDays(asOf, args.horizon ?? 90));

  const starts = args.children
    .filter((child) =>
      child.enrollmentStatus === "Pending"
      && withinWindow(child.plannedStartDate || "", start, through)
    )
    .map((child) => ({
      date: child.plannedStartDate || "",
      type: "Confirmed Start" as const,
      name: `${child.firstName} ${child.lastName}`.trim(),
      location: locationKey(child.location) || child.location,
      detail: child.ageGroup,
    }));

  const exits = args.children
    .filter((child) =>
      child.enrollmentStatus === "Active"
      && withinWindow(child.plannedLastDay || "", start, through)
    )
    .map((child) => ({
      date: child.plannedLastDay || "",
      type: "Planned Exit" as const,
      name: `${child.firstName} ${child.lastName}`.trim(),
      location: locationKey(child.location) || child.location,
      detail: child.ageGroup,
    }));

  const prospects = args.leads
    .filter((lead) =>
      activePipelineLead(lead)
      && withinWindow(lead.preferredStartDate || "", start, through)
    )
    .map((lead) => ({
      date: lead.preferredStartDate,
      type: "Pipeline Start" as const,
      name: lead.childName || lead.familyName,
      location: locationKey(lead.location) || lead.location,
      detail: `${lead.stage}${lead.ageGroup ? ` • ${lead.ageGroup}` : ""}`,
    }));

  return [...starts, ...exits, ...prospects].sort((a, b) =>
    a.date.localeCompare(b.date) || a.location.localeCompare(b.location) || a.name.localeCompare(b.name)
  );
}

export function pipelineDemandByAge(leads: TourBoardLead[]) {
  const counts = new Map<string, number>();
  leads
    .filter(activePipelineLead)
    .forEach((lead) => {
      const key = lead.ageGroup?.trim() || lead.programType?.trim() || "Age / program not entered";
      counts.set(key, (counts.get(key) || 0) + 1);
    });

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
