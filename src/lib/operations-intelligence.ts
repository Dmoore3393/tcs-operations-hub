import { dateToDayName, timeToMinutes, type ChildScheduleRecord } from "@/lib/child-schedules";
import type { ChildRecord } from "@/lib/children";
import type { FileRecord, Shift, TransportationRoute, VehicleRecord, WorkTask } from "@/lib/hub-data";
import { careLocations, locationThemes, type LocationHoursRecord, type LocationKey } from "@/lib/location-config";

export type AlertSeverity = "critical" | "warning" | "info" | "success";

export type SmartAlert = {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  location: string;
  href: string;
  actionLabel: string;
  category: "Ratio" | "Schedule" | "Transportation" | "Files" | "Work Plan" | "Operations";
};

export type CoverageWindow = {
  location: Exclude<LocationKey, "All Locations">;
  start: number;
  end: number;
  childNames: string[];
  childCount: number;
  infantCount: number;
  staffNames: string[];
  staffCount: number;
  requiredStaff: number;
  capacity: number;
  inRatio: boolean;
};

export type OperationsIntelligenceInput = {
  date: string;
  accessibleLocations: Exclude<LocationKey, "All Locations">[];
  children: ChildRecord[];
  schedules: ChildScheduleRecord[];
  shifts: Shift[];
  routes: TransportationRoute[];
  vehicles: VehicleRecord[];
  hours: LocationHoursRecord[];
  files?: FileRecord[];
  tasks?: WorkTask[];
};

export type OperationsBriefingSnapshot = {
  date: string;
  weekday: string;
  accessibleLocationCount: number;
  scheduledChildren: number;
  scheduledStaff: number;
  criticalAlerts: number;
  warningAlerts: number;
  routesNeedingReview: number;
  missingOrUnsignedFiles: number;
  urgentTasks: number;
  topAlerts: Array<Pick<SmartAlert, "severity" | "title" | "detail" | "location" | "category">>;
};

export function requiredStaffFor(location: Exclude<LocationKey, "All Locations">, childCount: number, infantCount: number) {
  if (childCount <= 0) return 0;
  if (location === "Division") return Math.ceil(childCount / 14);
  if (infantCount > 0) return Math.ceil(childCount / 6);
  return Math.ceil(childCount / 8);
}

function locationHoursFor(input: OperationsIntelligenceInput, location: Exclude<LocationKey, "All Locations">) {
  const day = dateToDayName(input.date);
  return input.hours.find((record) => record.location === location)?.days[day];
}

export function buildCoverageWindows(input: OperationsIntelligenceInput) {
  const day = dateToDayName(input.date);
  const windows: CoverageWindow[] = [];

  input.accessibleLocations.forEach((location) => {
    const dailyHours = locationHoursFor(input, location);
    const scheduleBlocks = input.schedules.flatMap((record) =>
      (record.days[day]?.blocks ?? [])
        .filter((block) => block.location === location)
        .map((block) => ({
          record,
          start: timeToMinutes(block.start),
          end: timeToMinutes(block.end),
        })),
    );
    const locationShifts = input.shifts
      .filter((shift) => shift.day === day && shift.location === location)
      .map((shift) => ({ shift, start: timeToMinutes(shift.start), end: timeToMinutes(shift.end) }));

    const boundaries = new Set<number>();
    if (dailyHours && !dailyHours.closed) {
      boundaries.add(timeToMinutes(dailyHours.open));
      boundaries.add(timeToMinutes(dailyHours.close));
    }
    scheduleBlocks.forEach((block) => {
      boundaries.add(block.start);
      boundaries.add(block.end);
    });
    locationShifts.forEach((shift) => {
      boundaries.add(shift.start);
      boundaries.add(shift.end);
    });

    const sorted = [...boundaries].filter(Number.isFinite).sort((a, b) => a - b);
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const start = sorted[index];
      const end = sorted[index + 1];
      if (end <= start) continue;
      const midpoint = start + (end - start) / 2;
      const present = scheduleBlocks.filter((block) => block.start <= midpoint && block.end > midpoint).map((block) => block.record);
      const staff = locationShifts.filter((shift) => shift.start <= midpoint && shift.end > midpoint).map((shift) => shift.shift);
      if (!present.length && !staff.length) continue;
      const infantCount = present.filter((record) => record.ageGroup === "Infant").length;
      const requiredStaff = requiredStaffFor(location, present.length, infantCount);
      windows.push({
        location,
        start,
        end,
        childNames: present.map((record) => record.childName),
        childCount: present.length,
        infantCount,
        staffNames: staff.map((record) => record.employee),
        staffCount: staff.length,
        requiredStaff,
        capacity: locationThemes[location].capacity,
        inRatio: staff.length >= requiredStaff,
      });
    }
  });

  return windows;
}

function clock(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function severityRank(severity: AlertSeverity) {
  return { critical: 0, warning: 1, info: 2, success: 3 }[severity];
}

export function buildSmartAlerts(input: OperationsIntelligenceInput) {
  const alerts: SmartAlert[] = [];
  const day = dateToDayName(input.date);
  const windows = buildCoverageWindows(input);

  input.accessibleLocations.forEach((location) => {
    const hours = locationHoursFor(input, location);
    const blocks = input.schedules.flatMap((record) =>
      (record.days[day]?.blocks ?? [])
        .filter((block) => block.location === location)
        .map((block) => ({ record, block, start: timeToMinutes(block.start), end: timeToMinutes(block.end) })),
    );

    if (hours?.closed && blocks.length) {
      alerts.push({
        id: `closed-${location}`,
        severity: "critical",
        category: "Schedule",
        location,
        title: `${location} is marked closed but children are scheduled`,
        detail: `${blocks.length} care block${blocks.length === 1 ? " is" : "s are"} entered for ${day}.`,
        href: "/child-schedules",
        actionLabel: "Review schedules",
      });
    }

    if (hours && !hours.closed) {
      const opening = timeToMinutes(hours.open);
      const closing = timeToMinutes(hours.close);
      const outside = blocks.filter(({ start, end }) => start < opening || end > closing);
      if (outside.length) {
        alerts.push({
          id: `hours-${location}`,
          severity: "warning",
          category: "Schedule",
          location,
          title: `${outside.length} ${location} schedule block${outside.length === 1 ? " is" : "s are"} outside operating hours`,
          detail: `Operating hours are ${clock(opening)}–${clock(closing)} on ${day}.`,
          href: "/child-schedules",
          actionLabel: "Fix care times",
        });
      }
    }
  });

  windows.filter((window) => window.childCount > 0 && !window.inRatio).forEach((window) => {
    alerts.push({
      id: `ratio-${window.location}-${window.start}-${window.end}`,
      severity: "critical",
      category: "Ratio",
      location: window.location,
      title: `${window.location} needs ratio coverage ${clock(window.start)}–${clock(window.end)}`,
      detail: `${window.childCount} children, ${window.staffCount} staff entered, and ${window.requiredStaff} required by the Hub’s current ratio rule.`,
      href: "/ratios",
      actionLabel: "Review coverage",
    });
  });

  windows.filter((window) => window.childCount > window.capacity).forEach((window) => {
    alerts.push({
      id: `capacity-${window.location}-${window.start}`,
      severity: "critical",
      category: "Schedule",
      location: window.location,
      title: `${window.location} exceeds entered capacity`,
      detail: `${window.childCount} children are scheduled during ${clock(window.start)}–${clock(window.end)}; entered capacity is ${window.capacity}.`,
      href: "/child-schedules",
      actionLabel: "Review enrollment times",
    });
  });

  const dayShifts = input.shifts.filter((shift) => shift.day === day);
  const employees = [...new Set(dayShifts.map((shift) => shift.employee))];
  employees.forEach((employee) => {
    const employeeShifts = dayShifts.filter((shift) => shift.employee === employee);
    for (let a = 0; a < employeeShifts.length; a += 1) {
      for (let b = a + 1; b < employeeShifts.length; b += 1) {
        const first = employeeShifts[a];
        const second = employeeShifts[b];
        const overlaps = timeToMinutes(first.start) < timeToMinutes(second.end) && timeToMinutes(second.start) < timeToMinutes(first.end);
        if (overlaps && first.location !== second.location) {
          alerts.push({
            id: `staff-conflict-${employee}-${first.id}-${second.id}`,
            severity: "critical",
            category: "Schedule",
            location: "All Locations",
            title: `${employee} is scheduled at two locations at once`,
            detail: `${first.location} ${first.start}–${first.end} overlaps ${second.location} ${second.start}–${second.end}.`,
            href: "/scheduling",
            actionLabel: "Resolve conflict",
          });
        }
      }
    }
  });

  const accessibleRouteLocations = new Set(input.accessibleLocations);
  input.routes
    .filter((route) => route.status !== "Not Riding" && (accessibleRouteLocations.has(route.location as Exclude<LocationKey, "All Locations">) || route.location === "All Sites"))
    .forEach((route) => {
      const driverMissing = !route.driver.trim() || route.driver === "TBD" || route.driver === "—";
      const vehicleMissing = !route.vehicle.trim() || route.vehicle === "TBD" || route.vehicle === "—";
      if (route.status === "Needs Review" || driverMissing || vehicleMissing) {
        alerts.push({
          id: `route-${route.id}`,
          severity: driverMissing || vehicleMissing ? "warning" : "info",
          category: "Transportation",
          location: route.location,
          title: `${route.child} transportation needs review`,
          detail: `${driverMissing ? "Driver missing. " : ""}${vehicleMissing ? "Vehicle missing. " : ""}${route.school} • ${route.days}`.trim(),
          href: "/transportation",
          actionLabel: "Open route",
        });
      }
    });

  const routeGroups = new Map<string, TransportationRoute[]>();
  input.routes.filter((route) => route.status === "Confirmed" && route.vehicle.trim()).forEach((route) => {
    const key = `${route.vehicle}|${route.pickup}|${route.days}`;
    routeGroups.set(key, [...(routeGroups.get(key) ?? []), route]);
  });
  routeGroups.forEach((group, key) => {
    const [vehicleName] = key.split("|");
    const vehicle = input.vehicles.find((item) => item.name === vehicleName);
    if (vehicle && group.length > vehicle.passengerCapacity) {
      alerts.push({
        id: `vehicle-capacity-${key}`,
        severity: "critical",
        category: "Transportation",
        location: group[0].location,
        title: `${vehicleName} route exceeds passenger capacity`,
        detail: `${group.length} riders are assigned; vehicle capacity is ${vehicle.passengerCapacity}.`,
        href: "/transportation",
        actionLabel: "Reassign riders",
      });
    }
  });

  const openFiles = (input.files ?? []).filter((file) => file.status !== "Complete");
  if (openFiles.length) {
    alerts.push({
      id: "files-open",
      severity: openFiles.some((file) => file.status === "Missing") ? "warning" : "info",
      category: "Files",
      location: "Accessible locations",
      title: `${openFiles.length} file item${openFiles.length === 1 ? " needs" : "s need"} attention`,
      detail: "Missing, unsigned, or expiring documents are still open.",
      href: "/files",
      actionLabel: "Review files",
    });
  }

  const urgentTasks = (input.tasks ?? []).filter((task) => !task.completed && task.priority === "Urgent");
  if (urgentTasks.length) {
    alerts.push({
      id: "urgent-work",
      severity: "warning",
      category: "Work Plan",
      location: "Accessible locations",
      title: `${urgentTasks.length} urgent work-plan item${urgentTasks.length === 1 ? " is" : "s are"} still open`,
      detail: urgentTasks.slice(0, 2).map((task) => task.title).join(" • "),
      href: "/work-plans",
      actionLabel: "Open work plans",
    });
  }

  if (!alerts.length) {
    alerts.push({
      id: "all-clear",
      severity: "success",
      category: "Operations",
      location: "Accessible locations",
      title: "No major schedule or coverage conflicts found",
      detail: "The Hub did not find an operating-hours, capacity, staffing, or route conflict in the information currently entered.",
      href: "/ratios",
      actionLabel: "View today’s plan",
    });
  }

  return alerts.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.title.localeCompare(b.title));
}

export function buildBriefingSnapshot(input: OperationsIntelligenceInput, alerts = buildSmartAlerts(input)): OperationsBriefingSnapshot {
  const day = dateToDayName(input.date);
  const accessible = new Set(input.accessibleLocations);
  const scheduledChildIds = new Set<number>();
  input.schedules.forEach((schedule) => {
    if ((schedule.days[day]?.blocks ?? []).some((block) => accessible.has(block.location))) scheduledChildIds.add(schedule.childId);
  });
  const scheduledStaff = new Set(input.shifts.filter((shift) => shift.day === day && accessible.has(shift.location as Exclude<LocationKey, "All Locations">)).map((shift) => shift.employee));
  return {
    date: input.date,
    weekday: day,
    accessibleLocationCount: input.accessibleLocations.length,
    scheduledChildren: scheduledChildIds.size,
    scheduledStaff: scheduledStaff.size,
    criticalAlerts: alerts.filter((alert) => alert.severity === "critical").length,
    warningAlerts: alerts.filter((alert) => alert.severity === "warning").length,
    routesNeedingReview: input.routes.filter((route) => route.status === "Needs Review").length,
    missingOrUnsignedFiles: (input.files ?? []).filter((file) => file.status === "Missing" || file.status === "Needs Signature").length,
    urgentTasks: (input.tasks ?? []).filter((task) => !task.completed && task.priority === "Urgent").length,
    topAlerts: alerts.filter((alert) => alert.severity !== "success").slice(0, 6).map(({ severity, title, detail, location, category }) => ({ severity, title, detail, location, category })),
  };
}

export function buildLocalBriefing(snapshot: OperationsBriefingSnapshot) {
  const alertText = snapshot.criticalAlerts
    ? `${snapshot.criticalAlerts} critical item${snapshot.criticalAlerts === 1 ? " needs" : "s need"} attention first.`
    : snapshot.warningAlerts
      ? `${snapshot.warningAlerts} warning${snapshot.warningAlerts === 1 ? " is" : "s are"} worth reviewing.`
      : "No major schedule or coverage conflicts are showing.";
  const top = snapshot.topAlerts.slice(0, 3).map((alert) => alert.title);
  return {
    headline: `${snapshot.weekday} operations at a glance`,
    summary: `${snapshot.scheduledChildren} children and ${snapshot.scheduledStaff} staff members are represented in today’s entered schedules across ${snapshot.accessibleLocationCount} accessible location${snapshot.accessibleLocationCount === 1 ? "" : "s"}. ${alertText}`,
    priorities: top.length ? top : ["Review today’s ratios", "Confirm opening and closing reports", "Keep care logs current"],
  };
}

export function defaultAccessibleCareLocations(values: string[]) {
  const filtered = careLocations.filter((location) => values.includes(location));
  return filtered.length ? filtered : careLocations;
}
