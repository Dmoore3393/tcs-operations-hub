export type ChildFileAuditItemStatus = "Not Checked" | "On File" | "Missing" | "N/A";

export type ChildFileAuditTemplate = "In-Home" | "School Age Center";

export type ChildFileAuditItem = {
  documentId: number;
  status: ChildFileAuditItemStatus;
  dateChecked: string;
  expirationDate: string;
  note: string;
};

export type ChildFileAuditStatusFlag =
  | "File Complete"
  | "Missing Documents"
  | "Expirations Updated"
  | "Needs Parent Follow-Up"
  | "Special Care Plan Active"
  | "Behavior Plan Active"
  | "Transportation Child"
  | "Medication on Site";

export type ChildFileAudit = {
  id: string;
  template?: ChildFileAuditTemplate;
  auditDate: string;
  nextAuditDue: string;
  dateEnrolled: string;
  auditedBy: string;
  teacherPrimary: string;
  school?: string;
  grade?: string;
  signature?: string;
  notes: string;
  statusFlags: ChildFileAuditStatusFlag[];
  items: ChildFileAuditItem[];
  createdAt: string;
  updatedAt: string;
};

export type ChildFileAuditDocument = {
  id: number;
  section: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  sectionTitle: string;
  sectionSubtitle: string;
  name: string;
  appliesWhen?: string;
  requirement: "Required" | "If Applicable" | "As Needed" | "For Internal Use" | "Required for any child with special needs or behaviors";
};

// These IDs are kept only to display entries from an older in-home audit.
export const retiredHomeAuditDocuments = [
  { id: 3, name: "LIC 995 – Child Care Center Notification of Parent’s Rights" },
  { id: 4, name: "LIC 702 – Child’s Preadmission Health History (Parent/Authorized Representative)" },
  { id: 5, name: "LIC 613A – Personal Rights Child Care Centers" },
];

const extendedHoursCare = {
  id: 42, name: "Extended Hours Care Agreement", requirement: "If Applicable",
  appliesWhen: "For children enrolled in extended-hours care.",
} as const;

export const childFileAuditDocuments: ChildFileAuditDocument[] = [
  { id: 1, section: 1, sectionTitle: "Licensing Documents", sectionSubtitle: "Family child care home", name: "LIC 700 – Identification and Emergency Information", requirement: "Required" },
  { id: 2, section: 1, sectionTitle: "Licensing Documents", sectionSubtitle: "Family child care home", name: "LIC 627 – Consent for Emergency Medical Treatment", requirement: "Required" },
  { id: 43, section: 1, sectionTitle: "Licensing Documents", sectionSubtitle: "Family child care home", name: "LIC 995A – Family Child Care Home Notification of Parents’ Rights", requirement: "Required" },
  { id: 44, section: 1, sectionTitle: "Licensing Documents", sectionSubtitle: "Family child care home", name: "LIC 9212 – Family Child Care Consumer Awareness Information", requirement: "Required" },
  { id: 41, section: 1, sectionTitle: "Licensing Documents", sectionSubtitle: "Family child care home", name: "LIC 9150 – Parent Notification of Additional Children in Care", requirement: "If Applicable", appliesWhen: "When a small home plans to care for more than 6 children or a large home for more than 12." },
  { id: 6, section: 1, sectionTitle: "Licensing Documents", sectionSubtitle: "Family child care home", name: "LIC 995E – Caregiver Background Check Process (California Department of Social Services)", requirement: "Required" },
  { id: 7, section: 1, sectionTitle: "Licensing Documents", sectionSubtitle: "Family child care home", name: "Immunization Record (CAIR)", requirement: "If Applicable", appliesWhen: "For children who are not enrolled in a public or private elementary school." },

  { id: 8, section: 2, sectionTitle: "Enrollment Documents", sectionSubtitle: "Program enrollment paperwork", name: "Cover Sheet", requirement: "Required" },
  { id: 9, section: 2, sectionTitle: "Enrollment Documents", sectionSubtitle: "Program enrollment paperwork", name: "Family Questionnaire", requirement: "Required" },
  { id: 10, section: 2, sectionTitle: "Enrollment Documents", sectionSubtitle: "Program enrollment paperwork", name: "Tuition Agreement", requirement: "Required" },
  { id: 11, section: 2, sectionTitle: "Enrollment Documents", sectionSubtitle: "Program enrollment paperwork", name: "Brightwheel Agreement", requirement: "Required" },
  { id: 12, section: 2, sectionTitle: "Enrollment Documents", sectionSubtitle: "Program enrollment paperwork", name: "Equal Opportunity Form", requirement: "Required" },
  { id: 13, section: 2, sectionTitle: "Enrollment Documents", sectionSubtitle: "Program enrollment paperwork", name: "Evacuation Consent Form", requirement: "Required" },
  { id: 14, section: 2, sectionTitle: "Enrollment Documents", sectionSubtitle: "Program enrollment paperwork", name: "Photo Consent", requirement: "Required" },
  { id: 15, section: 2, sectionTitle: "Enrollment Documents", sectionSubtitle: "Program enrollment paperwork", name: "Electronic Policy", requirement: "Required" },
  { id: 16, section: 2, sectionTitle: "Enrollment Documents", sectionSubtitle: "Program enrollment paperwork", name: "Gaming Contract", requirement: "If Applicable" },
  { id: 17, section: 2, sectionTitle: "Enrollment Documents", sectionSubtitle: "Program enrollment paperwork", name: "School Calendar", requirement: "If Applicable" },
  { id: 18, section: 2, sectionTitle: "Enrollment Documents", sectionSubtitle: "Program enrollment paperwork", name: "Allergy Form", requirement: "Required" },
  { id: 19, section: 2, sectionTitle: "Enrollment Documents", sectionSubtitle: "Program enrollment paperwork", name: "Acknowledgement Form – Family Handbook", requirement: "Required" },

  { id: 20, section: 3, sectionTitle: "Program-Specific Forms", sectionSubtitle: "If Applicable", name: "Preschool Agreement (if applicable)", requirement: "If Applicable" },
  { id: 21, section: 3, sectionTitle: "Program-Specific Forms", sectionSubtitle: "If Applicable", name: "School Transportation Consent (if applicable)", requirement: "If Applicable" },
  { id: 22, section: 3, sectionTitle: "Program-Specific Forms", sectionSubtitle: "If Applicable", name: "School Transportation Fee Agreement (if applicable)", requirement: "If Applicable" },
  { id: 23, section: 3, sectionTitle: "Program-Specific Forms", sectionSubtitle: "If Applicable", name: "Infant Sleeping Plan (if applicable)", requirement: "If Applicable" },
  { id: 24, section: 3, sectionTitle: "Program-Specific Forms", sectionSubtitle: "If Applicable", name: "Needs & Services Plan (if applicable)", requirement: "If Applicable" },
  { id: 25, section: 3, sectionTitle: "Program-Specific Forms", sectionSubtitle: "If Applicable", name: "Illness Policy Acknowledgement (if applicable)", requirement: "If Applicable" },
  { ...extendedHoursCare, section: 3, sectionTitle: "Program-Specific Forms", sectionSubtitle: "If Applicable" },

  { id: 26, section: 4, sectionTitle: "Medical & Special Care", sectionSubtitle: "If Applicable", name: "Allergy Action Plan (if applicable)", requirement: "If Applicable" },
  { id: 27, section: 4, sectionTitle: "Medical & Special Care", sectionSubtitle: "If Applicable", name: "Medication Authorization (if applicable)", requirement: "If Applicable" },
  { id: 28, section: 4, sectionTitle: "Medical & Special Care", sectionSubtitle: "If Applicable", name: "Medication Log (if applicable)", requirement: "If Applicable" },
  { id: 29, section: 4, sectionTitle: "Medical & Special Care", sectionSubtitle: "If Applicable", name: "Special Diet Documentation (if applicable)", requirement: "If Applicable" },
  { id: 30, section: 4, sectionTitle: "Medical & Special Care", sectionSubtitle: "If Applicable", name: "Individualized Care Plan (if applicable)", requirement: "Required for any child with special needs or behaviors" },
  { id: 31, section: 4, sectionTitle: "Medical & Special Care", sectionSubtitle: "If Applicable", name: "Physician Orders (if applicable)", requirement: "If Applicable" },
  { id: 32, section: 4, sectionTitle: "Medical & Special Care", sectionSubtitle: "If Applicable", name: "Behavior Support Plan (if applicable)", requirement: "Required for any child with special needs or behaviors" },

  { id: 33, section: 5, sectionTitle: "Permissions & Authorizations", sectionSubtitle: "If Applicable", name: "Field Trip Permission Slip", requirement: "If Applicable" },
  { id: 34, section: 5, sectionTitle: "Permissions & Authorizations", sectionSubtitle: "If Applicable", name: "Water Activity Permission", requirement: "If Applicable" },
  { id: 35, section: 5, sectionTitle: "Permissions & Authorizations", sectionSubtitle: "If Applicable", name: "Sunscreen Authorization", requirement: "If Applicable" },
  { id: 36, section: 5, sectionTitle: "Permissions & Authorizations", sectionSubtitle: "If Applicable", name: "Additional Parent Consents / Permissions (if applicable)", requirement: "If Applicable" },

  { id: 37, section: 6, sectionTitle: "File History & Communication", sectionSubtitle: "", name: "Parent Communication Log", requirement: "As Needed" },
  { id: 38, section: 6, sectionTitle: "File History & Communication", sectionSubtitle: "", name: "Incident Reports", requirement: "As Needed" },
  { id: 39, section: 6, sectionTitle: "File History & Communication", sectionSubtitle: "", name: "Behavior Plans / Notes", requirement: "As Needed" },
  { id: 40, section: 6, sectionTitle: "File History & Communication", sectionSubtitle: "", name: "Audit Tracking Sheet", requirement: "For Internal Use" },
];


export const schoolAgeChildFileAuditDocuments: ChildFileAuditDocument[] = [
  { id: 1, section: 1, sectionTitle: "Licensing Documents", sectionSubtitle: "Required by CDSS", name: "LIC 995 – Child Care Center Notification of Parent’s Rights", requirement: "Required" },
  { id: 2, section: 1, sectionTitle: "Licensing Documents", sectionSubtitle: "Required by CDSS", name: "LIC 700 – Identification and Emergency Information", requirement: "Required" },
  { id: 3, section: 1, sectionTitle: "Licensing Documents", sectionSubtitle: "Required by CDSS", name: "LIC 613A – Personal Rights Child Care Centers", requirement: "Required" },
  { id: 4, section: 1, sectionTitle: "Licensing Documents", sectionSubtitle: "Required by CDSS", name: "LIC 702 – Child’s Preadmission Health History – Parent/Authorized Representative Report", requirement: "Required" },
  { id: 5, section: 1, sectionTitle: "Licensing Documents", sectionSubtitle: "Required by CDSS", name: "LIC 627 – Consent for Emergency Medical Treatment – Child Care Centers", requirement: "Required" },
  { id: 6, section: 1, sectionTitle: "Licensing Documents", sectionSubtitle: "Required by CDSS", name: "LIC 995E – Caregiver Background Check Process – California Department of Social Services", requirement: "Required" },
  { id: 7, section: 1, sectionTitle: "Licensing Documents", sectionSubtitle: "Required by CDSS", name: "Immunization Record", requirement: "Required" },

  { id: 8, section: 2, sectionTitle: "Center Program Documents", sectionSubtitle: "Not Licensing", name: "TCS Allergy Form", requirement: "Required" },
  { id: 9, section: 2, sectionTitle: "Center Program Documents", sectionSubtitle: "Not Licensing", name: "TCS Illness Policy", requirement: "Required" },
  { id: 10, section: 2, sectionTitle: "Center Program Documents", sectionSubtitle: "Not Licensing", name: "TCS Participation Agreement", requirement: "Required" },
  { id: 11, section: 2, sectionTitle: "Center Program Documents", sectionSubtitle: "Not Licensing", name: "TCS Photo Consent", requirement: "Required" },
  { id: 12, section: 2, sectionTitle: "Center Program Documents", sectionSubtitle: "Not Licensing", name: "TCS Electronic Policy", requirement: "Required" },
  { id: 13, section: 2, sectionTitle: "Center Program Documents", sectionSubtitle: "Not Licensing", name: "TCS Gaming Contract", requirement: "Required" },
  { id: 14, section: 2, sectionTitle: "Center Program Documents", sectionSubtitle: "Not Licensing", name: "TCS School Transportation Fee Agreement", requirement: "Required" },
  { id: 15, section: 2, sectionTitle: "Center Program Documents", sectionSubtitle: "Not Licensing", name: "The School Shuttle School Transportation Consent", requirement: "Required" },
  { id: 16, section: 2, sectionTitle: "Center Program Documents", sectionSubtitle: "Not Licensing", name: "Evacuation Drill Permission Form", requirement: "Required" },
  { id: 17, section: 2, sectionTitle: "Center Program Documents", sectionSubtitle: "Not Licensing", name: "Equal Opportunity Statement Acknowledgement Form for TCS", requirement: "Required" },
  { id: 18, section: 2, sectionTitle: "Center Program Documents", sectionSubtitle: "Not Licensing", name: "TCS School-Age Center Agreement", requirement: "Required" },
  { id: 19, section: 2, sectionTitle: "Center Program Documents", sectionSubtitle: "Not Licensing", name: "Acknowledgement Form – Family Handbook", requirement: "Required" },
  { id: 20, section: 2, sectionTitle: "Center Program Documents", sectionSubtitle: "Not Licensing", name: "PUB 515 – Effects of Lead Exposure Brochure", requirement: "Required" },
  { ...extendedHoursCare, section: 2, sectionTitle: "Center Program Documents", sectionSubtitle: "Not Licensing" },

  { id: 21, section: 3, sectionTitle: "Additional Licensing Documents", sectionSubtitle: "If Applicable", name: "LIC 9212 – Family Child Care Consumer Awareness Information", requirement: "If Applicable" },
  { id: 22, section: 3, sectionTitle: "Additional Licensing Documents", sectionSubtitle: "If Applicable", name: "LIC 9222 – Blood Glucose Testing Consent/Verification Child Care Facilities", requirement: "If Applicable" },
  { id: 23, section: 3, sectionTitle: "Additional Licensing Documents", sectionSubtitle: "If Applicable", name: "LIC 9224 – Acknowledgement of Receipt of Licensing Reports", requirement: "If Applicable" },
  { id: 24, section: 3, sectionTitle: "Additional Licensing Documents", sectionSubtitle: "If Applicable", name: "LIC 9166 – Nebulizer Care Consent/Verification Child Care Facilities", requirement: "If Applicable" },
  { id: 25, section: 3, sectionTitle: "Additional Licensing Documents", sectionSubtitle: "If Applicable", name: "LIC 624 – Unusual Incident/Injury Report", requirement: "If Applicable" },
  { id: 26, section: 3, sectionTitle: "Additional Licensing Documents", sectionSubtitle: "If Applicable", name: "LIC 622 – Centrally Stored Medication and Destruction Record", requirement: "If Applicable" },
  { id: 27, section: 3, sectionTitle: "Additional Licensing Documents", sectionSubtitle: "If Applicable", name: "LIC 921 – Parent Consent for Administering Medication", requirement: "If Applicable" },

  { id: 28, section: 4, sectionTitle: "Request Copies of Required Documents", sectionSubtitle: "", name: "Medical Insurance Card", requirement: "Required" },
  { id: 29, section: 4, sectionTitle: "Request Copies of Required Documents", sectionSubtitle: "", name: "Current Immunization Record", requirement: "Required" },
  { id: 30, section: 4, sectionTitle: "Request Copies of Required Documents", sectionSubtitle: "", name: "Individualized Education Program (IEP) or 504 Plan (if applicable)", requirement: "If Applicable" },

  { id: 31, section: 5, sectionTitle: "Behavior Plan", sectionSubtitle: "If Applicable", name: "Behavior Plan", requirement: "If Applicable" },

  { id: 32, section: 6, sectionTitle: "Incidents & Communication", sectionSubtitle: "", name: "Parent Communication Log", requirement: "As Needed" },
  { id: 33, section: 6, sectionTitle: "Incidents & Communication", sectionSubtitle: "", name: "Incident Reports", requirement: "As Needed" },
  { id: 34, section: 6, sectionTitle: "Incidents & Communication", sectionSubtitle: "", name: "Behavior Documentation", requirement: "As Needed" },
  { id: 35, section: 6, sectionTitle: "Incidents & Communication", sectionSubtitle: "", name: "Parent Meeting Notes", requirement: "As Needed" },
  { id: 36, section: 6, sectionTitle: "Incidents & Communication", sectionSubtitle: "", name: "Suspension / Exclusion Documentation", requirement: "If Applicable" },

  { id: 37, section: 7, sectionTitle: "File Audit", sectionSubtitle: "", name: "Child File Audit Sheet", requirement: "For Internal Use" },
  { id: 38, section: 7, sectionTitle: "File Audit", sectionSubtitle: "", name: "Annual Review Checklist", requirement: "For Internal Use" },
];

export const childFileAuditStatusFlags: ChildFileAuditStatusFlag[] = [
  "File Complete",
  "Missing Documents",
  "Expirations Updated",
  "Needs Parent Follow-Up",
  "Special Care Plan Active",
  "Behavior Plan Active",
  "Transportation Child",
  "Medication on Site",
];

export function templateForChildLocation(location: string): ChildFileAuditTemplate {
  const source = location.toLowerCase();
  return source.includes("division") || source.includes("school age center")
    ? "School Age Center"
    : "In-Home";
}

export function documentsForTemplate(template: ChildFileAuditTemplate | undefined) {
  return template === "School Age Center" ? schoolAgeChildFileAuditDocuments : childFileAuditDocuments;
}

export function documentsForAudit(audit: Pick<ChildFileAudit, "template">) {
  return documentsForTemplate(audit.template ?? "In-Home");
}

export function todayLocalIso() {
  const now = new Date();
  const adjusted = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 10);
}

export function createBlankChildFileAudit(
  auditedBy = "",
  template: ChildFileAuditTemplate = "In-Home",
): ChildFileAudit {
  const now = new Date().toISOString();
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    template,
    auditDate: todayLocalIso(),
    nextAuditDue: "",
    dateEnrolled: "",
    auditedBy,
    teacherPrimary: "",
    school: "",
    grade: "",
    signature: "",
    notes: "",
    statusFlags: [],
    items: documentsForTemplate(template).map((document) => ({
      documentId: document.id,
      status: "Not Checked",
      dateChecked: "",
      expirationDate: "",
      note: "",
    })),
    createdAt: now,
    updatedAt: now,
  };
}

export function auditItemFor(audit: ChildFileAudit, documentId: number) {
  return audit.items.find((item) => item.documentId === documentId) ?? {
    documentId,
    status: "Not Checked" as const,
    dateChecked: "",
    expirationDate: "",
    note: "",
  };
}

export function latestFileAudit(audits: ChildFileAudit[] = []) {
  if (!Array.isArray(audits)) return null;
  return [...audits].sort((a, b) =>
    (b.auditDate || b.updatedAt || "").localeCompare(a.auditDate || a.updatedAt || "") ||
    (b.updatedAt || "").localeCompare(a.updatedAt || ""),
  )[0] ?? null;
}

export function auditForReview(audit: ChildFileAudit): ChildFileAudit {
  // Add today's checklist to the editor. Preserve every previously recorded item and note.
  const recordedIds = new Set(audit.items.map(item => item.documentId));
  const additions = documentsForAudit(audit).filter(doc => !recordedIds.has(doc.id));
  return { ...audit, items: [...audit.items, ...additions.map(doc => auditItemFor(audit, doc.id))] };
}

export function expirationState(value: string, asOf = todayLocalIso()) {
  if (!value) return "none" as const;
  if (value < asOf) return "expired" as const;
  const soon = new Date(`${asOf}T12:00:00`);
  soon.setDate(soon.getDate() + 30);
  const soonIso = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, "0")}-${String(soon.getDate()).padStart(2, "0")}`;
  return value <= soonIso ? "soon" as const : "current" as const;
}

export function auditItemExpiration(item: ChildFileAuditItem, asOf = todayLocalIso()) {
  return item.status === "N/A" ? "none" : expirationState(item.expirationDate, asOf);
}

export function auditSummary(audit: ChildFileAudit, asOf = todayLocalIso()) {
  const documents = documentsForAudit(audit);
  const catalog = new Map(documents.map(doc => [doc.id, doc]));
  // Score the items actually reviewed on this edition. Later additions do not reopen a signed audit.
  const items = (Array.isArray(audit.items) ? audit.items : []).filter(item => item && catalog.has(item.documentId));
  const missingRequired = items.filter(item => item.status === "Missing" ||
    (item.status === "Not Checked" && catalog.get(item.documentId)?.requirement === "Required"));
  const expired = items.filter(item => auditItemExpiration(item, asOf) === "expired");
  const expiringSoon = items.filter(item => auditItemExpiration(item, asOf) === "soon");
  const problemIds = new Set(missingRequired.map(item => item.documentId));
  for (const item of expired) {
    if (catalog.get(item.documentId)?.requirement === "Required") problemIds.add(item.documentId);
  }
  const missingDocuments = documents.filter(doc => problemIds.has(doc.id)).map(doc => doc.name);
  const checked = items.filter(item => item.status !== "Not Checked").length;

  return {
    total: items.length,
    checked,
    missingRequired,
    missingDocuments,
    expired,
    expiringSoon,
    complete: items.length > 0 && checked === items.length && !missingDocuments.length && !expired.length,
  };
}

export function auditStatusFlags(audit: ChildFileAudit, summary = auditSummary(audit)) {
  const flags: ChildFileAuditStatusFlag[] = audit.statusFlags.filter(flag => flag !== "File Complete" && flag !== "Missing Documents");
  if (summary.missingDocuments.length) flags.push("Missing Documents");
  if (summary.complete) flags.push("File Complete");
  return flags;
}

// Older profiles cached N/A rows as missing by name. Correct those on read, while retaining
// manually listed paperwork. On an audit save, replace the previous audit's list as well.
export function auditProfileDocuments(audit: ChildFileAudit | null, storedNames: string[], storedStatus: string, previousAudit?: ChildFileAudit | null): { missingDocuments: string[]; licensingStatus: "Missing Documents" | "Complete" } {
  if (!audit) return { missingDocuments: storedNames, licensingStatus: storedStatus === "Missing Documents" ? "Missing Documents" : "Complete" };
  const superseded = new Set(previousAudit ? auditSummary(previousAudit).missingDocuments : []);
  if (audit.template !== "School Age Center") {
    for (const doc of retiredHomeAuditDocuments) superseded.add(doc.name);
  }
  const documents = documentsForAudit(audit);
  for (const doc of documents) {
    const status = audit.items?.find(item => item?.documentId === doc.id)?.status;
    if (status === "N/A" || (status === "Not Checked" && doc.requirement !== "Required")) superseded.add(doc.name);
  }
  const missingDocuments = [...new Set([...storedNames.filter(name => !superseded.has(name)), ...auditSummary(audit).missingDocuments])];
  const unnamedManualFlag = previousAudit === undefined && !storedNames.length && storedStatus === "Missing Documents";
  return { missingDocuments, licensingStatus: missingDocuments.length || unnamedManualFlag ? "Missing Documents" : "Complete" };
}

export function currentAuditProfile(child: { fileAudits?: ChildFileAudit[]; missingDocuments: string[]; licensingStatus: string }) {
  return auditProfileDocuments(latestFileAudit(child.fileAudits), child.missingDocuments ?? [], child.licensingStatus);
}
