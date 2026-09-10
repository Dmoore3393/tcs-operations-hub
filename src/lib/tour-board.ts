import type { EnrollmentLeadRecord } from "@/lib/admin-ops";
import { normalizeFundingSource } from "@/lib/children";

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
export type TourDisposition = "Ready to Enroll" | "Thinking It Over" | "Needs Follow-Up" | "Waitlist" | "Not a Fit" | "";
export type LeadSource =
  | "Website"
  | "Facebook"
  | "Instagram"
  | "Google"
  | "TikTok"
  | "Parent Referral"
  | "Staff Referral"
  | "Phone"
  | "Text"
  | "Walk-In"
  | "Community Event"
  | "CCRC"
  | "Crystal Stairs"
  | "DCFS"
  | "Other Agency"
  | "Agency"
  | "Other";
export type ContactMethod =
  | "Phone Call"
  | "Text"
  | "Email"
  | "Website"
  | "Facebook Messenger"
  | "Instagram DM"
  | "Facebook"
  | "Instagram"
  | "In Person"
  | "Other";

export type TourVisit = {
  id: string;
  scheduledAt: string;
  status: TourVisitStatus;
  arrivalAt?: string;
  lateMinutes: number;
  conductedBy: string;
  rating: TourRating;
  disposition?: TourDisposition;
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
  kind: "Inquiry" | "Contact" | "Reminder" | "Tour" | "Tour Check-In" | "Follow-Up" | "Packet" | "Status Change" | "Note";
  by: string;
  note: string;
};

export type TourBoardLead = Omit<EnrollmentLeadRecord, "stage"> & {
  stage: TourBoardStage;
  programType: string;
  ageGroup: string;
  additionalChildren: string;
  leadSource: LeadSource;
  inquiryMethod: ContactMethod;
  preferredStartDate: string;
  scheduleNeeded: string;
  schoolName: string;
  bestContactTime: string;
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
  tags: string[];
  childRecordStartedAt: string;
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
  const createdAt = input.createdAt || new Date().toISOString();
  const existingTours = Array.isArray(input.tourHistory) ? input.tourHistory : [];
  const legacyTour = !existingTours.length && input.tourDate
    ? [{
        id: `legacy-tour-${id}`,
        scheduledAt: input.tourDate,
        status: mapLegacyStage(String(input.stage)) === "Toured" ? "Completed" as const : "Scheduled" as const,
        lateMinutes: 0,
        conductedBy: input.assignedTo || "",
        rating: "Not Rated" as const,
        disposition: "" as const,
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
    subsidy: normalizeFundingSource(input.subsidy || ""),
    stage: mapLegacyStage(String(input.stage || "Inquiry")),
    tourDate: input.tourDate || "",
    followUpDate: input.followUpDate || "",
    assignedTo: input.assignedTo || "",
    notes: input.notes || "",
    createdAt,
    programType: input.programType || input.requestedCare || "",
    ageGroup: input.ageGroup || input.childAge || "",
    additionalChildren: input.additionalChildren || "",
    leadSource: input.leadSource || "Other",
    inquiryMethod: input.inquiryMethod || "Other",
    preferredStartDate: input.preferredStartDate || "",
    scheduleNeeded: input.scheduleNeeded || "",
    schoolName: input.schoolName || "",
    bestContactTime: input.bestContactTime || "",
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
    tags: Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim())).map((tag) => tag.trim()) : [],
    childRecordStartedAt: input.childRecordStartedAt || "",
  };
}

export function latestTour(lead: TourBoardLead) {
  return [...lead.tourHistory].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))[0];
}


export type CrmTemperature = "Hot" | "Warm" | "Normal" | "Needs Attention";

export function latestActivity(lead: TourBoardLead) {
  return [...lead.activity].sort((a, b) => b.at.localeCompare(a.at))[0];
}

export function lastContactActivity(lead: TourBoardLead) {
  return [...lead.activity]
    .filter((entry) => ["Contact", "Follow-Up", "Reminder", "Tour", "Tour Check-In"].includes(entry.kind))
    .sort((a, b) => b.at.localeCompare(a.at))[0];
}

export function daysSince(value: string, now = new Date()) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86400000));
}

export function leadAgeDays(lead: TourBoardLead, now = new Date()) {
  return daysSince(lead.createdAt, now) ?? 0;
}

export function leadNeedsAttention(lead: TourBoardLead, now = new Date()) {
  if (["Enrolled", "Waitlist", "Declined"].includes(lead.stage)) return false;
  const today = now.toISOString().slice(0, 10);
  if (lead.followUpDate && lead.followUpDate < today) return true;
  const lastTouch = lastContactActivity(lead);
  const untouchedDays = daysSince(lastTouch?.at || lead.createdAt, now) ?? 0;
  if (lead.stage === "New Inquiry" && untouchedDays >= 1) return true;
  return untouchedDays >= 5;
}

export function leadTemperature(lead: TourBoardLead, now = new Date()): CrmTemperature {
  if (leadNeedsAttention(lead, now)) return "Needs Attention";
  if (lead.priority === "Urgent" || lead.priority === "Hot Lead") return "Hot";
  if (["Tour Scheduled", "Toured", "Follow-Up"].includes(lead.stage)) return "Warm";
  return "Normal";
}

export function crmTags(lead: TourBoardLead) {
  const tags = new Set(lead.tags || []);
  if (lead.transportationNeeded) tags.add("Transportation");
  if (lead.subsidy) tags.add(lead.subsidy);
  if (lead.ageGroup) tags.add(lead.ageGroup);
  if (lead.additionalChildren?.trim()) tags.add("Sibling Enrollment");
  const requested = `${lead.requestedCare} ${lead.programType}`.toLowerCase();
  if (requested.includes("extended")) tags.add("Extended Hours");
  if (requested.includes("weekend")) tags.add("Weekend Care");
  if (lead.enrollmentPacketSentAt && lead.stage !== "Enrolled") tags.add("Packet Sent");
  return [...tags].filter(Boolean).slice(0, 8);
}
