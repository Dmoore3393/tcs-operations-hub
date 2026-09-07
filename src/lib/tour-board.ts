import type { EnrollmentLeadRecord } from "@/lib/admin-ops";

export type TourBoardStage =
  | "New Inquiry"
  | "Contacted"
  | "Tour Scheduled"
  | "Toured"
  | "Follow-Up"
  | "Enrolled"
  | "Waitlist"
  | "Declined";

export type TourVisitStatus = "Scheduled" | "Completed" | "No Show" | "Cancelled" | "Rescheduled";
export type TourRating = "Excellent Fit" | "Good Fit" | "Needs Follow-Up" | "Not a Fit" | "Not Rated";
export type LeadSource = "Website" | "Facebook" | "Instagram" | "Google" | "Parent Referral" | "Phone" | "Text" | "Walk-In" | "Community Event" | "Agency" | "Other";
export type ContactMethod = "Phone Call" | "Text" | "Email" | "Website" | "Facebook" | "Instagram" | "In Person" | "Other";

export type TourVisit = {
  id: string;
  scheduledAt: string;
  status: TourVisitStatus;
  arrivalAt?: string;
  lateMinutes: number;
  conductedBy: string;
  rating: TourRating;
  familyReaction: string;
  questionsConcerns: string;
  notes: string;
  nextStep: string;
  followUpDate: string;
  loggedAt: string;
  loggedBy: string;
};

export type LeadActivity = {
  id: string;
  at: string;
  kind: "Inquiry" | "Contact" | "Reminder" | "Tour" | "Follow-Up" | "Packet" | "Status Change" | "Note";
  by: string;
  note: string;
};

export type TourBoardLead = Omit<EnrollmentLeadRecord, "stage"> & {
  stage: TourBoardStage;
  programType: string;
  ageGroup: string;
  leadSource: LeadSource;
  inquiryMethod: ContactMethod;
  preferredStartDate: string;
  contactedAt: string;
  nextAction: string;
  priority: "Normal" | "Hot Lead" | "Urgent";
  enrollmentPacketSentAt: string;
  enrolledAt: string;
  waitlistReason: string;
  declinedReason: string;
  updatedAt: string;
  tourHistory: TourVisit[];
  activity: LeadActivity[];
};

export const TOUR_BOARD_COLUMNS: TourBoardStage[] = [
  "New Inquiry",
  "Contacted",
  "Tour Scheduled",
  "Toured",
  "Follow-Up",
  "Enrolled",
  "Waitlist",
];

export function makeTourId(prefix = "tour") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function mapLegacyStage(stage: string): TourBoardStage {
  switch (stage) {
    case "Inquiry": return "New Inquiry";
    case "Tour Scheduled": return "Tour Scheduled";
    case "Tour Completed": return "Toured";
    case "Application":
    case "Documents Needed":
    case "Agency Pending": return "Follow-Up";
    case "Enrolled": return "Enrolled";
    case "Waitlist": return "Waitlist";
    case "Declined": return "Declined";
    case "Contacted": return "Contacted";
    case "Follow-Up": return "Follow-Up";
    case "Toured": return "Toured";
    case "New Inquiry": return "New Inquiry";
    default: return "New Inquiry";
  }
}

export function normalizeTourLead(input: Partial<TourBoardLead> & Partial<EnrollmentLeadRecord>): TourBoardLead {
  const id = Number(input.id || Date.now());
  const createdAt = input.createdAt || new Date().toISOString().slice(0, 10);
  const existingTours = Array.isArray(input.tourHistory) ? input.tourHistory : [];
  const legacyTour = !existingTours.length && input.tourDate
    ? [{
        id: `legacy-tour-${id}`,
        scheduledAt: input.tourDate,
        status: mapLegacyStage(String(input.stage)) === "Toured" ? "Completed" as const : "Scheduled" as const,
        lateMinutes: 0,
        conductedBy: input.assignedTo || "",
        rating: "Not Rated" as const,
        familyReaction: "",
        questionsConcerns: "",
        notes: "",
        nextStep: "",
        followUpDate: input.followUpDate || "",
        loggedAt: createdAt,
        loggedBy: input.assignedTo || "",
      }]
    : [];
  const activity = Array.isArray(input.activity) && input.activity.length
    ? input.activity
    : [{ id: `legacy-inquiry-${id}`, at: createdAt, kind: "Inquiry" as const, by: input.assignedTo || "", note: "Lead added to the enrollment pipeline." }];

  return {
    id,
    location: input.location || "Division",
    familyName: input.familyName || "",
    parentName: input.parentName || "",
    phone: input.phone || "",
    email: input.email || "",
    childName: input.childName || "",
    childAge: input.childAge || "",
    requestedCare: input.requestedCare || "",
    transportationNeeded: Boolean(input.transportationNeeded),
    subsidy: input.subsidy || "",
    stage: mapLegacyStage(String(input.stage || "Inquiry")),
    tourDate: input.tourDate || "",
    followUpDate: input.followUpDate || "",
    assignedTo: input.assignedTo || "",
    notes: input.notes || "",
    createdAt,
    programType: input.programType || input.requestedCare || "",
    ageGroup: input.ageGroup || input.childAge || "",
    leadSource: input.leadSource || "Other",
    inquiryMethod: input.inquiryMethod || "Other",
    preferredStartDate: input.preferredStartDate || "",
    contactedAt: input.contactedAt || "",
    nextAction: input.nextAction || "",
    priority: input.priority || "Normal",
    enrollmentPacketSentAt: input.enrollmentPacketSentAt || "",
    enrolledAt: input.enrolledAt || "",
    waitlistReason: input.waitlistReason || "",
    declinedReason: input.declinedReason || "",
    updatedAt: input.updatedAt || createdAt,
    tourHistory: [...existingTours, ...legacyTour],
    activity,
  };
}

export function latestTour(lead: TourBoardLead) {
  return [...lead.tourHistory].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))[0];
}
