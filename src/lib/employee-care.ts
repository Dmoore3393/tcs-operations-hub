import { initialChildren } from "@/lib/children";
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

const childByName = Object.fromEntries(initialChildren.map((child) => [`${child.firstName} ${child.lastName}`, child]));

function childId(name: string) {
  return childByName[name]?.id ?? 0;
}

export const starterCareLogs: CareLogEntry[] = [
  {
    id: "care-1",
    childId: childId("Bryson Brinkley"),
    childName: "Bryson Brinkley",
    location: "Halcom",
    date: "2026-07-30",
    time: "08:05",
    category: "Meal",
    action: "Breakfast",
    result: "Ate most",
    notes: "Drank milk and ate fruit.",
    initials: "LM",
    createdAt: "2026-07-30T08:06:00-07:00",
  },
  {
    id: "care-2",
    childId: childId("Tiffany Palomo"),
    childName: "Tiffany Palomo",
    location: "Halcom",
    date: "2026-07-30",
    time: "08:42",
    category: "Potty",
    action: "Potty attempt",
    result: "Urinated • reminded",
    notes: "Clothing stayed dry.",
    initials: "LM",
    createdAt: "2026-07-30T08:43:00-07:00",
  },
  {
    id: "care-3",
    childId: childId("Bryson Brinkley"),
    childName: "Bryson Brinkley",
    location: "Halcom",
    date: "2026-07-30",
    time: "09:10",
    category: "Diaper",
    action: "Diaper change",
    result: "Wet",
    notes: "Skin clear. No cream needed.",
    initials: "LM",
    createdAt: "2026-07-30T09:11:00-07:00",
  },
  {
    id: "care-4",
    childId: childId("Scarlett Diaz"),
    childName: "Scarlett Diaz",
    location: "Halcom",
    date: "2026-07-30",
    time: "09:30",
    category: "Daily Note",
    action: "Morning participation",
    result: "Calm and engaged",
    notes: "Joined the matching activity after a smooth drop-off.",
    initials: "DM",
    createdAt: "2026-07-30T09:31:00-07:00",
  },
  {
    id: "care-5",
    childId: childId("Ezekiel Brinkley"),
    childName: "Ezekiel Brinkley",
    location: "Division",
    date: "2026-07-30",
    time: "09:35",
    category: "Meal",
    action: "Morning snack",
    result: "Ate all",
    notes: "Water offered and finished.",
    initials: "DM",
    createdAt: "2026-07-30T09:36:00-07:00",
  },
];

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

function checklist(items: string[], checked = false) {
  return Object.fromEntries(items.map((item) => [item, checked]));
}

export const starterShiftReports: ShiftReport[] = [
  {
    id: "report-1",
    type: "Opening",
    location: "Halcom",
    date: "2026-07-30",
    shiftWindow: "6:00 AM–12:00 PM",
    completedBy: "Latrice",
    initials: "LM",
    positiveBehaviors: "The children arrived in good moods and settled into morning activities well. The school-age children played cooperatively during the first part of the morning.",
    babyUpdates: "No infant-specific concerns this morning. Bottles, diapers, and rest updates are recorded in Daily Care.",
    misbehaviors: "One child needed reminders about kind words and personal space. Staff redirected successfully and the morning improved.",
    booBoos: "None reported this morning.",
    parentCommunication: "One parent shared a schedule change for tomorrow. The change still needs to be entered in Child Schedules.",
    pickupInformation: "Please remind the family to bring additional pull-ups and a change of clothes at pickup.",
    operationsNotes: "Morning staffing and ratios are covered. Snack supplies should be checked before afternoon snack.",
    checklist: checklist(openingChecklist, true),
    status: "Submitted",
    submittedAt: "2026-07-30T11:42:00-07:00",
  },
];

export const starterHandoffs: HandoffItem[] = [
  {
    id: "handoff-1",
    sourceReportId: "report-1",
    location: "Halcom",
    date: "2026-07-30",
    category: "Pickup Information",
    details: "Remind the family to bring additional pull-ups and a change of clothes.",
    priority: "Important",
    completed: false,
    completedByInitials: "",
  },
];

export const starterHealthSafety: HealthSafetyRecord[] = [
  {
    id: "health-1",
    childId: childId("Scarlett Diaz"),
    childName: "Scarlett Diaz",
    location: "Halcom",
    date: "2026-07-30",
    time: "10:15",
    type: "Boo-Boo / Incident",
    summary: "Small scrape on knee while playing outside.",
    actionTaken: "Area cleaned, bandage applied, and child returned to play comfortably.",
    parentContact: "Needs Contact",
    formalReport: true,
    initials: "LM",
    status: "Director Review",
    createdAt: "2026-07-30T10:18:00-07:00",
  },
];

export const starterTeamAccounts: TeamAccount[] = [
  { id: 1, employeeName: "Danielle Moore", email: "danielle@tcsstaff.com", role: "Owner / Director", assignedLocations: ["All Locations"], status: "Active", lastActive: "Today at 1:08 PM" },
  { id: 2, employeeName: "Latrice", email: "latrice@tcsstaff.com", role: "Licensee", assignedLocations: ["Halcom"], status: "Active", lastActive: "Today at 11:42 AM" },
  { id: 3, employeeName: "Akeyla", email: "akeyla@tcsstaff.com", role: "Driver", assignedLocations: ["All Locations"], status: "Invite Pending", lastActive: "Not signed in yet" },
  { id: 4, employeeName: "Evangeline", email: "evangeline@tcsstaff.com", role: "Teacher", assignedLocations: ["33rd Street", "Halcom"], status: "Invite Pending", lastActive: "Not signed in yet" },
  { id: 5, employeeName: "Jordan", email: "jordan@tcsstaff.com", role: "Teacher in Training", assignedLocations: ["Halcom"], status: "Paused", lastActive: "July 27 at 4:12 PM" },
  { id: 6, employeeName: "Dynasty Lara", email: "dynasty@tcsstaff.com", role: "Licensee / Admin", assignedLocations: ["All Locations"], status: "Invite Pending", lastActive: "Not signed in yet" },
  { id: 7, employeeName: "Jennifer", email: "jennifer@tcsstaff.com", role: "Corporate / Admin", assignedLocations: ["All Locations"], status: "Invite Pending", lastActive: "Not signed in yet" },
  { id: 8, employeeName: "Anthony (Tony)", email: "tony@tcsstaff.com", role: "Scanning Support", assignedLocations: ["All Locations"], status: "Invite Pending", lastActive: "Not signed in yet" },
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
