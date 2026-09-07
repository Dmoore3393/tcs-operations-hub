import type { LocationKey } from "@/lib/location-config";

export type CareCategory = "Meal" | "Bottle" | "Diaper" | "Potty" | "Rest" | "Daily Note";

export type CareLogEntry = {
  id: string;
  childId: number;
  childName: string;
  location: Exclude<LocationKey, "All Locations">;
  date: string;
  time: string;
  category: CareCategory;
  action: string;
  result: string;
  notes: string;
  initials: string;
  createdAt: string;
  mealServiceId?: string;
  foodServed?: string;
  drinkServed?: string;
};

export type ShiftReportType = "Opening" | "Closing";
export type ShiftReportStatus = "Draft" | "Submitted" | "Reviewed";

export type ShiftReport = {
  id: string;
  type: ShiftReportType;
  location: Exclude<LocationKey, "All Locations">;
  date: string;
  shiftWindow: string;
  completedBy: string;
  initials: string;
  positiveBehaviors: string;
  babyUpdates: string;
  misbehaviors: string;
  booBoos: string;
  parentCommunication: string;
  pickupInformation: string;
  operationsNotes: string;
  checklist: Record<string, boolean>;
  status: ShiftReportStatus;
  submittedAt?: string;
  reviewedBy?: string;
  reviewerInitials?: string;
  reviewedAt?: string;
};

export type HandoffItem = {
  id: string;
  sourceReportId: string;
  location: Exclude<LocationKey, "All Locations">;
  date: string;
  category: "Pickup Information" | "Behavior" | "Health" | "Supplies" | "Transportation" | "Other";
  details: string;
  priority: "Normal" | "Important" | "Urgent";
  completed: boolean;
  completedByInitials: string;
  completedAt?: string;
};

export type HealthSafetyType = "Boo-Boo / Incident" | "Illness / Pickup" | "Medication" | "Allergy / Medical Alert";
export type HealthSafetyRecord = {
  id: string;
  childId: number;
  childName: string;
  location: Exclude<LocationKey, "All Locations">;
  date: string;
  time: string;
  type: HealthSafetyType;
  summary: string;
  actionTaken: string;
  parentContact: "Not Needed" | "Needs Contact" | "Contacted" | "Pickup Requested";
  formalReport: boolean;
  initials: string;
  status: "Open" | "Resolved" | "Director Review";
  createdAt: string;
};

export type TeamRole = "Owner / Director" | "Location Licensee" | "Licensee / Admin" | "Corporate / Admin" | "Scanning Support" | "Licensee" | "Teacher" | "Driver" | "Teacher in Training";
export type TeamAccount = {
  id: number;
  employeeName: string;
  email: string;
  role: TeamRole;
  assignedLocations: string[];
  status: "Active" | "Invite Pending" | "Paused";
  lastActive: string;
};

/**
 * Care, health/safety, handoff, shift-report, and staff-account records are
 * live operational data. They must be created through the authenticated Hub
 * and stored in Supabase, never bundled into public application source.
 */
export const starterCareLogs: CareLogEntry[] = [];
export const starterShiftReports: ShiftReport[] = [];
export const starterHandoffs: HandoffItem[] = [];
export const starterHealthSafety: HealthSafetyRecord[] = [];
export const starterTeamAccounts: TeamAccount[] = [];

export const openingChecklist = [
  "Attendance and expected arrivals reviewed",
  "Medication, allergy, and emergency plans reviewed",
  "Rooms, exits, gates, and playground checked",
  "Kitchen and refrigerator temperatures checked",
  "Morning staffing and ratio coverage confirmed",
];

export const closingChecklist = [
  "All children signed out or handed off to overnight staff",
  "Parent pickup reminders addressed or carried forward",
  "Kitchen, classrooms, and bathrooms checked",
  "Doors, gates, windows, and alarms secured",
  "Unfinished tasks and next-shift needs documented",
];

export const rolePermissions: Record<TeamRole, string[]> = {
  "Owner / Director": ["All pages and locations", "Create and edit records", "Review internal reports", "Manage employee access", "Complete every step of the timesheet workflow", "Fill out, scan, and submit timesheets", "Export operations data"],
  "Location Licensee": ["Operational tools for the assigned location only", "Prepare location timesheets and send them into the workflow", "Meals, menus, schedules, ratios, reports, KidKare, and compliance for the assigned location", "No Settings, Team Access, location configuration, or company-wide view"],
  "Licensee / Admin": ["Timesheet accountability review when specifically assigned", "Assigned location operations", "Review internal reports", "No system Settings or Team Access"],
  "Corporate / Admin": ["Complete every step of the timesheet workflow", "Receive and verify batches", "Fill out and scan timesheets", "Email the correct departments", "KidKare and compliance oversight"],
  "Scanning Support": ["View completed timesheets waiting to scan", "Upload and quality-check scans", "Send scanned copies to Jennifer", "No permission to fill out or email timesheets"],
  Licensee: ["Assigned location operations", "Meals, menus, daily care, and health logs", "Opening and closing reports", "Ratios, schedules, and work plans", "Review staff entries"],
  Teacher: ["Assigned child care and meal logs", "Opening and closing reports", "Work plans and handoffs", "View health alerts", "No access to billing or system settings"],
  Driver: ["Transportation routes", "Emergency child information", "Vehicle checklists", "Transportation handoffs", "No access to general child medical notes"],
  "Teacher in Training": ["Assigned classroom view", "Enter care and meal logs with supervision", "Complete work-plan tasks", "No report review or settings access"],
};
