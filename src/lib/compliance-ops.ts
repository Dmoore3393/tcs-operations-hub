import { initialChildren } from "@/lib/children";

export const programLocations = [
  "Moore Family Childcare • Halcom",
  "Cathers Family Childcare • 21st Street",
  "The School Age Center • Division",
  "Cornejo Family Childcare • 33rd Street",
  "Lara Family Childcare • 42nd Street",
  "Tehachapi Transportation Hub",
] as const;

export type ProgramLocation = (typeof programLocations)[number];

export type KidKareStatus = "Not Started" | "Information Needed" | "Submitted" | "Enrolled" | "Needs Correction";

export type KidKareEnrollment = {
  id: number;
  childId: number;
  childName: string;
  location: string;
  required: boolean;
  status: KidKareStatus;
  dateAdded: string;
  completedBy: string;
  kidKareChildId: string;
  lastVerified: string;
  notes: string;
};

// This remains derived from the secured child collection. initialChildren is
// intentionally empty in production source control, so no child information is
// bundled into the application or used to seed a fresh database.
export const starterKidKareEnrollments: KidKareEnrollment[] = initialChildren.flatMap((child, index) => {
  const records: KidKareEnrollment[] = [
    {
      id: index * 10 + 1,
      childId: child.id,
      childName: `${child.firstName} ${child.lastName}`,
      location: child.location,
      required: child.enrollmentStatus !== "Archived",
      status: "Not Started",
      dateAdded: "",
      completedBy: "",
      kidKareChildId: "",
      lastVerified: "",
      notes: "",
    },
  ];
  return records;
});

export type TimesheetStage =
  | "Licensee Preparation"
  | "Dynasty Review"
  | "Jennifer Received"
  | "Completion"
  | "Scanning"
  | "Jennifer Email"
  | "Complete";

export type PrepChecklist = {
  parentSignature: boolean;
  providerSignature: boolean;
  formDated: boolean;
  noAttendanceXs: boolean;
  schoolPickupTimes: boolean;
  closureDates: boolean;
};

export type TimesheetRecord = {
  id: number;
  childName: string;
  familyName: string;
  servicePeriod: string;
  location: string;
  fundingSource: "CCRC" | "DCFS" | "CCCC" | "Private Pay";
  stage: TimesheetStage;
  prep: PrepChecklist;
  licenseeInitials: string;
  licenseeSubmittedAt: string;
  dynastyStatus: "Awaiting" | "Received" | "Needs Correction" | "Accounted For";
  dynastyInitials: string;
  dynastyReviewedAt: string;
  jenniferReceivedAt: string;
  batchReceivedBy: string;
  completedBy: string;
  completedAt: string;
  scannedBy: string;
  scannedAt: string;
  scanQualityChecked: boolean;
  sentToJenniferAt: string;
  department: string;
  departmentEmail: string;
  emailedByJenniferAt: string;
  emailedBy: string;
  attachmentConfirmed: boolean;
  confirmationReceived: boolean;
  notes: string;
};

/**
 * Timesheets are created from live subsidized child records in Supabase.
 * Never hard-code a child's name, family, agency, or service period here.
 */
export const starterTimesheets: TimesheetRecord[] = [];

export type DepartmentRoute = {
  id: number;
  location: string;
  fundingSource: "CCRC" | "DCFS" | "CCCC" | "Private Pay";
  department: string;
  email: string;
  deadline: string;
  fileNameFormat: string;
  notes: string;
};

export const starterDepartmentRoutes: DepartmentRoute[] = programLocations.flatMap((location, locationIndex) =>
  (["CCRC", "DCFS", "CCCC"] as const).map((fundingSource, sourceIndex) => ({
    id: locationIndex * 10 + sourceIndex + 1,
    location,
    fundingSource,
    department: "",
    email: "",
    deadline: "",
    fileNameFormat: "LastName_FirstName_ServiceMonth_Location.pdf",
    notes: "Enter the exact department and submission email before using live records.",
  })),
);

export type TestUserRole = "Danielle" | "Jennifer" | "Dynasty" | "Tony" | "Location Licensee" | "Administrator";

export const testUserRoles: TestUserRole[] = ["Danielle", "Jennifer", "Dynasty", "Tony", "Location Licensee", "Administrator"];

export const timesheetStageOrder: TimesheetStage[] = [
  "Licensee Preparation",
  "Dynasty Review",
  "Jennifer Received",
  "Completion",
  "Scanning",
  "Jennifer Email",
  "Complete",
];

export function prepComplete(prep: PrepChecklist) {
  return Object.values(prep).every(Boolean);
}

export function stageIndex(stage: TimesheetStage) {
  return timesheetStageOrder.indexOf(stage);
}

export function nextTimesheetStage(record: TimesheetRecord): TimesheetStage {
  if (!prepComplete(record.prep) || !record.licenseeInitials) return "Licensee Preparation";
  if (record.dynastyStatus !== "Accounted For" || !record.dynastyInitials) return "Dynasty Review";
  if (!record.jenniferReceivedAt) return "Jennifer Received";
  if (!record.completedBy || !record.completedAt) return "Completion";
  if (!record.scannedBy || !record.scannedAt || !record.scanQualityChecked || !record.sentToJenniferAt) return "Scanning";
  if (!record.emailedByJenniferAt || !record.attachmentConfirmed) return "Jennifer Email";
  return "Complete";
}
