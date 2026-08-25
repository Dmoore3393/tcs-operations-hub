import type { ChildRecord } from "@/lib/children";
import type { TransportationRoute } from "@/lib/hub-data";

export type EnrollmentStage =
  | "Inquiry"
  | "Tour Scheduled"
  | "Tour Completed"
  | "Application"
  | "Documents Needed"
  | "Agency Pending"
  | "Enrolled"
  | "Waitlist"
  | "Declined";

export type EnrollmentLeadRecord = {
  id: number;
  location: string;
  familyName: string;
  parentName: string;
  phone: string;
  email: string;
  childName: string;
  childAge: string;
  requestedCare: string;
  transportationNeeded: boolean;
  subsidy: string;
  stage: EnrollmentStage;
  tourDate: string;
  followUpDate: string;
  assignedTo: string;
  notes: string;
  createdAt: string;
};

export const enrollmentStages: EnrollmentStage[] = [
  "Inquiry",
  "Tour Scheduled",
  "Tour Completed",
  "Application",
  "Documents Needed",
  "Agency Pending",
  "Enrolled",
  "Waitlist",
  "Declined",
];

export const starterEnrollmentLeads: EnrollmentLeadRecord[] = [
  {
    id: 1,
    location: "Division",
    familyName: "Sample Family",
    parentName: "Sample Parent",
    phone: "",
    email: "",
    childName: "Sample Child",
    childAge: "School age",
    requestedCare: "After-school care",
    transportationNeeded: true,
    subsidy: "CCRC",
    stage: "Tour Scheduled",
    tourDate: "2026-08-10T13:00",
    followUpDate: "2026-08-11",
    assignedTo: "Danielle",
    notes: "Starter record only — replace with live inquiry information after setup testing.",
    createdAt: "2026-08-07",
  },
];

export type DigitalFormStatus = "Draft" | "Ready to Send" | "Sent" | "Signed" | "Needs Correction" | "Archived";
export type SignatureMethod = "Not Signed" | "In Person" | "Uploaded Signed Copy" | "Staff Acknowledgment" | "Parent Portal (Future)";

export type DigitalFormRecord = {
  id: number;
  location: string;
  subjectType: "Child" | "Employee" | "Family" | "Transportation";
  subjectName: string;
  formName: string;
  signerName: string;
  status: DigitalFormStatus;
  signatureMethod: SignatureMethod;
  requestedAt: string;
  dueDate: string;
  signedAt: string;
  verifiedBy: string;
  notes: string;
};

export const starterDigitalForms: DigitalFormRecord[] = [
  {
    id: 1,
    location: "Division",
    subjectType: "Transportation",
    subjectName: "Sample Child",
    formName: "Transportation Consent",
    signerName: "Sample Parent",
    status: "Ready to Send",
    signatureMethod: "Not Signed",
    requestedAt: "2026-08-07",
    dueDate: "2026-08-11",
    signedAt: "",
    verifiedBy: "",
    notes: "Starter workflow record. Parent portal e-signing is not active yet.",
  },
];

export type TransportationPaymentStatus = "Unpaid" | "Paid" | "Waived" | "Not Required";

export type TransportationFeeRecord = {
  id: number;
  location: string;
  weekOf: string;
  familyKey: string;
  familyName: string;
  guardianName: string;
  children: string[];
  schools: string[];
  expectedAmount: number;
  chargedAmount: number;
  paymentStatus: TransportationPaymentStatus;
  dateCharged: string;
  datePaid: string;
  staffInitials: string;
  notes: string;
};

export const starterTransportationFees: TransportationFeeRecord[] = [];

export const TRANSPORTATION_WEEKLY_FEE = 10;

export function mondayOfWeek(input = new Date()) {
  const date = new Date(input);
  date.setHours(12, 0, 0, 0);
  const day = date.getDay();
  const distance = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + distance);
  return date.toISOString().slice(0, 10);
}

function fullName(child: ChildRecord) {
  return `${child.firstName} ${child.lastName}`.trim();
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function familyDisplayName(child: ChildRecord) {
  return `${child.lastName || "Family"} Family`;
}

function feeUnitKey(route: TransportationRoute) {
  const school = normalize(route.school);
  if (!school || school === "home transportation" || school === "home" || school === "—") {
    return `child:${normalize(route.child)}`;
  }
  return `school:${school}`;
}

export type TransportationFeeExpectation = {
  location: string;
  familyKey: string;
  familyName: string;
  guardianName: string;
  children: string[];
  schools: string[];
  expectedAmount: number;
  reviewNote: string;
};

export function buildTransportationFeeExpectations(
  children: ChildRecord[],
  routes: TransportationRoute[],
): TransportationFeeExpectation[] {
  const childMap = new Map(children.map((child) => [normalize(fullName(child)), child]));
  const groups = new Map<string, {
    location: string;
    familyKey: string;
    familyName: string;
    guardianName: string;
    children: Set<string>;
    schools: Set<string>;
    feeUnits: Set<string>;
    homeTransportation: boolean;
  }>();

  routes
    .filter((route) => route.status !== "Not Riding")
    .forEach((route) => {
      const child = childMap.get(normalize(route.child));
      if (!child) return;
      const guardianName = child.primaryGuardian.trim() || child.lastName;
      const familyKey = normalize(guardianName || child.lastName);
      const location = route.location || child.location;
      const key = `${normalize(location)}|${familyKey}`;
      const existing = groups.get(key) ?? {
        location,
        familyKey,
        familyName: familyDisplayName(child),
        guardianName,
        children: new Set<string>(),
        schools: new Set<string>(),
        feeUnits: new Set<string>(),
        homeTransportation: false,
      };
      existing.children.add(fullName(child));
      if (route.school?.trim()) existing.schools.add(route.school.trim());
      existing.feeUnits.add(feeUnitKey(route));
      if (normalize(route.school) === "home transportation") existing.homeTransportation = true;
      groups.set(key, existing);
    });

  return [...groups.values()]
    .map((group) => ({
      location: group.location,
      familyKey: group.familyKey,
      familyName: group.familyName,
      guardianName: group.guardianName,
      children: [...group.children].sort(),
      schools: [...group.schools].sort(),
      expectedAmount: group.feeUnits.size * TRANSPORTATION_WEEKLY_FEE,
      reviewNote: group.homeTransportation
        ? "Home transportation is calculated per child because the same-school sibling discount does not automatically apply."
        : "Same-family siblings attending the same school share one weekly transportation fee unit.",
    }))
    .sort((a, b) => a.familyName.localeCompare(b.familyName));
}

export function transportationChargeStatus(record: Pick<TransportationFeeRecord, "expectedAmount" | "chargedAmount" | "paymentStatus">) {
  if (record.paymentStatus === "Waived" || record.paymentStatus === "Not Required") return "Resolved" as const;
  if (record.chargedAmount === 0 && record.expectedAmount > 0) return "Needs Charge" as const;
  if (record.chargedAmount !== record.expectedAmount) return "Review" as const;
  return "Correct" as const;
}
