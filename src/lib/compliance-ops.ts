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

export const starterKidKareEnrollments: KidKareEnrollment[] = initialChildren.flatMap((child, index) => {
  const records: KidKareEnrollment[] = [
    {
      id: index * 10 + 1,
      childId: child.id,
      childName: `${child.firstName} ${child.lastName}`,
      location: child.location,
      required: child.enrollmentStatus !== "Archived",
      status: index % 5 === 0 ? "Not Started" : index % 5 === 1 ? "Information Needed" : index % 5 === 2 ? "Submitted" : "Enrolled",
      dateAdded: index % 5 >= 2 ? "2026-07-28" : "",
      completedBy: index % 5 >= 2 ? "DM" : "",
      kidKareChildId: index % 5 === 3 || index % 5 === 4 ? `KK-${String(2600 + child.id)}` : "",
      lastVerified: index % 5 === 3 || index % 5 === 4 ? "2026-07-30" : "",
      notes: index % 5 === 1 ? "Guardian enrollment information still needed." : "",
    },
  ];

  // Starter examples for children who attend both home care and the school-age center.
  if ([3, 4, 7, 8, 11].includes(child.id)) {
    records.push({
      id: index * 10 + 2,
      childId: child.id,
      childName: `${child.firstName} ${child.lastName}`,
      location: "Moore Family Childcare • Halcom",
      required: true,
      status: child.id % 2 === 0 ? "Submitted" : "Not Started",
      dateAdded: child.id % 2 === 0 ? "2026-07-29" : "",
      completedBy: child.id % 2 === 0 ? "DL" : "",
      kidKareChildId: "",
      lastVerified: "",
      notes: "Second-location KidKare enrollment required.",
    });
  }

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

const completePrep: PrepChecklist = {
  parentSignature: true,
  providerSignature: true,
  formDated: true,
  noAttendanceXs: true,
  schoolPickupTimes: true,
  closureDates: true,
};

const partialPrep: PrepChecklist = {
  parentSignature: true,
  providerSignature: true,
  formDated: true,
  noAttendanceXs: false,
  schoolPickupTimes: false,
  closureDates: true,
};

export const starterTimesheets: TimesheetRecord[] = [
  {
    id: 1,
    childName: "Scarlett Diaz",
    familyName: "Diaz Family",
    servicePeriod: "July 2026",
    location: "Moore Family Childcare • Halcom",
    fundingSource: "CCRC",
    stage: "Licensee Preparation",
    prep: partialPrep,
    licenseeInitials: "",
    licenseeSubmittedAt: "",
    dynastyStatus: "Awaiting",
    dynastyInitials: "",
    dynastyReviewedAt: "",
    jenniferReceivedAt: "",
    batchReceivedBy: "",
    completedBy: "",
    completedAt: "",
    scannedBy: "",
    scannedAt: "",
    scanQualityChecked: false,
    sentToJenniferAt: "",
    department: "",
    departmentEmail: "",
    emailedByJenniferAt: "",
    emailedBy: "",
    attachmentConfirmed: false,
    confirmationReceived: false,
    notes: "Add school pickup times only when applicable; confirm no-attendance X marks.",
  },
  {
    id: 2,
    childName: "Ezekiel Brinkley",
    familyName: "Brinkley Family",
    servicePeriod: "July 2026",
    location: "The School Age Center • Division",
    fundingSource: "DCFS",
    stage: "Dynasty Review",
    prep: completePrep,
    licenseeInitials: "LM",
    licenseeSubmittedAt: "2026-08-01 4:10 PM",
    dynastyStatus: "Received",
    dynastyInitials: "DL",
    dynastyReviewedAt: "",
    jenniferReceivedAt: "",
    batchReceivedBy: "",
    completedBy: "",
    completedAt: "",
    scannedBy: "",
    scannedAt: "",
    scanQualityChecked: false,
    sentToJenniferAt: "",
    department: "",
    departmentEmail: "",
    emailedByJenniferAt: "",
    emailedBy: "",
    attachmentConfirmed: false,
    confirmationReceived: false,
    notes: "Physical form received; Dynasty is confirming the full location batch.",
  },
  {
    id: 3,
    childName: "Elias Brinkley",
    familyName: "Brinkley Family",
    servicePeriod: "July 2026",
    location: "The School Age Center • Division",
    fundingSource: "DCFS",
    stage: "Jennifer Received",
    prep: completePrep,
    licenseeInitials: "LM",
    licenseeSubmittedAt: "2026-08-01 4:10 PM",
    dynastyStatus: "Accounted For",
    dynastyInitials: "DL",
    dynastyReviewedAt: "2026-08-01 5:20 PM",
    jenniferReceivedAt: "2026-08-01 5:45 PM",
    batchReceivedBy: "Jennifer",
    completedBy: "",
    completedAt: "",
    scannedBy: "",
    scannedAt: "",
    scanQualityChecked: false,
    sentToJenniferAt: "",
    department: "",
    departmentEmail: "",
    emailedByJenniferAt: "",
    emailedBy: "",
    attachmentConfirmed: false,
    confirmationReceived: false,
    notes: "Ready for Danielle and Jennifer to complete.",
  },
  {
    id: 4,
    childName: "Tiffany Palomo",
    familyName: "Palomo Family",
    servicePeriod: "July 2026",
    location: "Moore Family Childcare • Halcom",
    fundingSource: "CCRC",
    stage: "Scanning",
    prep: completePrep,
    licenseeInitials: "LT",
    licenseeSubmittedAt: "2026-07-31 6:00 PM",
    dynastyStatus: "Accounted For",
    dynastyInitials: "DL",
    dynastyReviewedAt: "2026-08-01 9:15 AM",
    jenniferReceivedAt: "2026-08-01 9:45 AM",
    batchReceivedBy: "Jennifer",
    completedBy: "Danielle",
    completedAt: "2026-08-02 11:30 AM",
    scannedBy: "",
    scannedAt: "",
    scanQualityChecked: false,
    sentToJenniferAt: "",
    department: "",
    departmentEmail: "",
    emailedByJenniferAt: "",
    emailedBy: "",
    attachmentConfirmed: false,
    confirmationReceived: false,
    notes: "Completed form is waiting for Danielle or Tony to scan.",
  },
  {
    id: 5,
    childName: "Daniel Moreno",
    familyName: "Moreno Family",
    servicePeriod: "July 2026",
    location: "The School Age Center • Division",
    fundingSource: "CCRC",
    stage: "Jennifer Email",
    prep: completePrep,
    licenseeInitials: "LM",
    licenseeSubmittedAt: "2026-07-31 5:00 PM",
    dynastyStatus: "Accounted For",
    dynastyInitials: "DL",
    dynastyReviewedAt: "2026-08-01 8:30 AM",
    jenniferReceivedAt: "2026-08-01 9:00 AM",
    batchReceivedBy: "Jennifer",
    completedBy: "Jennifer",
    completedAt: "2026-08-01 2:00 PM",
    scannedBy: "Tony",
    scannedAt: "2026-08-01 4:30 PM",
    scanQualityChecked: true,
    sentToJenniferAt: "2026-08-01 4:45 PM",
    department: "",
    departmentEmail: "",
    emailedByJenniferAt: "",
    emailedBy: "",
    attachmentConfirmed: false,
    confirmationReceived: false,
    notes: "Scanned copy delivered to Jennifer; submission routing must be configured.",
  },
];

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
