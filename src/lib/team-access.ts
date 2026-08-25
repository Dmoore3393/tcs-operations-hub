export const ACCESS_ROLES = ["Owner / Admin", "Location Licensee", "Employee"] as const;

export type AccessRole = (typeof ACCESS_ROLES)[number];

export const EMPLOYEE_PERMISSION_OPTIONS = [
  {
    key: "children_basic",
    label: "Children & care alerts",
    description: "View assigned-location child names, schedules, allergies, and care instructions needed for supervision.",
  },
  {
    key: "daily_care",
    label: "Daily Care",
    description: "Record meals, bottles, diaper changes, potty progress, rest, and daily notes.",
  },
  {
    key: "meals",
    label: "Meals & Menus",
    description: "Record what was served and what children ate at assigned locations.",
  },
  {
    key: "shift_reports",
    label: "Opening & Closing Reports",
    description: "Complete internal opening, closing, and shift-handoff reports.",
  },
  {
    key: "work_plans",
    label: "Work Plans",
    description: "View assigned tasks and add staff initials as tasks are completed.",
  },
  {
    key: "schedules",
    label: "Schedules & Attendance",
    description: "View child schedules and update approved attendance-related information.",
  },
  {
    key: "ratios",
    label: "Ratios",
    description: "View daily ratio plans and printable ratio images for assigned locations.",
  },
  {
    key: "transportation",
    label: "Transportation",
    description: "View routes, schools, vehicles, and complete vehicle-readiness tasks.",
  },
  {
    key: "health_safety",
    label: "Health & Safety",
    description: "View care alerts and create incident, illness, medication, and safety entries.",
  },
  {
    key: "printables",
    label: "Printable Studio",
    description: "Create approved printable ratio, menu, work-plan, notice, and transportation graphics from accessible records.",
  },
  {
    key: "ai_assistant",
    label: "TCS AI Assistant",
    description: "Use the private AI workspace with only the records and locations already included in the employee’s access.",
  },
] as const;

export type EmployeePermission = (typeof EMPLOYEE_PERMISSION_OPTIONS)[number]["key"];

export const DEFAULT_EMPLOYEE_PERMISSIONS: EmployeePermission[] = [
  "children_basic",
  "daily_care",
  "meals",
  "shift_reports",
  "work_plans",
  "schedules",
  "ratios",
  "health_safety",
];

const ownerRoleNames = new Set([
  "owner / admin",
  "owner/admin",
  "owner / director",
  "administrator",
  "admin",
  "director",
  "corporate / admin",
  "corporate admin",
  "operations admin",
]);

const licenseeRoleNames = new Set([
  "location licensee",
  "licensee",
  "licensee/admin",
  "licensee / admin",
]);

const employeeRoleNames = new Set([
  "employee",
  "teacher",
  "driver",
  "teacher in training",
  "scanning support",
]);

export function normalizeAccessRole(role = "") {
  return role.trim().toLowerCase();
}

export function isOwnerAccessRole(role = "") {
  return ownerRoleNames.has(normalizeAccessRole(role));
}

export function isLicenseeAccessRole(role = "") {
  return licenseeRoleNames.has(normalizeAccessRole(role));
}

export function isEmployeeAccessRole(role = "") {
  return employeeRoleNames.has(normalizeAccessRole(role));
}

export function isSupportedAccessRole(role = "") {
  return isOwnerAccessRole(role) || isLicenseeAccessRole(role) || isEmployeeAccessRole(role);
}

export function canonicalAccessRole(role = ""): AccessRole {
  if (isOwnerAccessRole(role)) return "Owner / Admin";
  if (isLicenseeAccessRole(role)) return "Location Licensee";
  return "Employee";
}

export function sanitizeEmployeePermissions(values: string[] | undefined | null): EmployeePermission[] {
  const allowed = new Set<EmployeePermission>(EMPLOYEE_PERMISSION_OPTIONS.map((item) => item.key));
  return [...new Set((values ?? []).filter((value): value is EmployeePermission => allowed.has(value as EmployeePermission)))];
}

export const ROLE_PERMISSION_SUMMARIES: Record<AccessRole, string[]> = {
  "Owner / Admin": [
    "Full access to every Hub page and every location",
    "Invite Owner/Admin, Licensee, and Employee accounts by email",
    "Change roles, assigned locations, employee permissions, and account status",
    "Manage location colors, capacities, settings, and security controls",
    "Complete every step of the Timesheet workflow",
  ],
  "Location Licensee": [
    "Operational access for the assigned location only",
    "Children, schedules, ratios, meals, KidKare, internal reports, employee/child files, transportation fees, enrollment, digital forms, compliance, and work plans for that location",
    "Prepare location Timesheets and send them into the workflow",
    "No Team Access, global Settings, role management, or other-location records",
  ],
  Employee: [
    "Invited by email and assigned to one or more work locations",
    "Only sees the operational tools individually approved by an Owner/Admin",
    "No Team Access, global Settings, role management, security controls, or company-wide administration",
    "No KidKare or Timesheet access; those tools are limited to Owner/Admin and Location Licensee accounts",
    "No transportation billing, confidential employee files, or confidential child files",
    "No parent or family portal access",
  ],
};

const routePermissionMap: Record<string, EmployeePermission> = {
  "/children": "children_basic",
  "/child-schedules": "schedules",
  "/daily-care": "daily_care",
  "/meals": "meals",
  "/shift-reports": "shift_reports",
  "/work-plans": "work_plans",
  "/ratios": "ratios",
  "/transportation": "transportation",
  "/health-safety": "health_safety",
  "/print-studio": "printables",
  "/ai-director": "ai_assistant",
};

const employeeAlwaysAllowedRoutes = new Set(["/", "/login", "/accept-invite"]);

export function employeeCanAccessRoute(permissions: string[], pathname: string) {
  if (employeeAlwaysAllowedRoutes.has(pathname)) return true;
  const required = routePermissionMap[pathname];
  return required ? permissions.includes(required) : false;
}

function hasAnyPermission(permissions: string[], required: EmployeePermission[]) {
  return required.some((permission) => permissions.includes(permission));
}

export function employeeCanReadState(permissions: string[], stateKey: string) {
  switch (stateKey) {
    case "tcs-children-v1":
      return hasAnyPermission(permissions, ["children_basic", "daily_care", "meals", "schedules", "ratios", "transportation", "health_safety"]);
    case "tcs-child-schedules-v2":
      return hasAnyPermission(permissions, ["schedules", "meals", "ratios", "transportation"]);
    case "tcs-daily-care-v1":
      return hasAnyPermission(permissions, ["daily_care", "meals", "shift_reports"]);
    case "tcs-meal-services-v1":
    case "tcs-weekly-menus-v1":
      return hasAnyPermission(permissions, ["meals", "daily_care"]);
    case "tcs-shift-handoffs-v1":
    case "tcs-shift-reports-v1":
      return permissions.includes("shift_reports");
    case "tcs-work-tasks":
      return permissions.includes("work_plans");
    case "tcs-routes":
    case "tcs-schools-v2":
    case "tcs-vehicles-v2":
    case "tcs-vehicle-readiness-v2":
      return permissions.includes("transportation");
    case "tcs-health-safety-v1":
      return hasAnyPermission(permissions, ["health_safety", "shift_reports"]);
    case "tcs-location-hours-v2":
    case "tcs-shifts":
      return permissions.includes("ratios");
    default:
      return false;
  }
}

export function employeeCanWriteState(permissions: string[], stateKey: string) {
  switch (stateKey) {
    case "tcs-daily-care-v1":
      return hasAnyPermission(permissions, ["daily_care", "meals"]);
    case "tcs-meal-services-v1":
    case "tcs-weekly-menus-v1":
      return permissions.includes("meals");
    case "tcs-child-schedules-v2":
      return permissions.includes("schedules");
    case "tcs-shift-handoffs-v1":
    case "tcs-shift-reports-v1":
      return permissions.includes("shift_reports");
    case "tcs-work-tasks":
      return permissions.includes("work_plans");
    case "tcs-routes":
    case "tcs-vehicle-readiness-v2":
      return permissions.includes("transportation");
    case "tcs-health-safety-v1":
      return permissions.includes("health_safety");
    default:
      return false;
  }
}

export type TeamAccessAccount = {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  locations: string[];
  permissions: string[];
  is_active: boolean;
  organization_id: string;
  invited_at: string | null;
  accepted_at: string | null;
  last_sign_in_at: string | null;
  created_at: string | null;
  status: "Invite Pending" | "Active" | "Paused";
};
