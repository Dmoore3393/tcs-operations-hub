export const familyPermissionKeys = [
  "viewProfile",
  "viewSchedule",
  "submitSchedule",
  "viewAttendance",
  "viewTransportation",
  "viewMedical",
  "viewDocuments",
  "viewIncidents",
  "viewMessages",
  "messageStaff",
  "managePickup",
  "editEmergencyContacts",
  "viewBilling",
  "makePayments",
] as const;

export type FamilyPermissionKey = (typeof familyPermissionKeys)[number];
export type FamilyAccessPermissions = Record<FamilyPermissionKey, boolean>;

export type FamilyBillingResponsibility = {
  mode: "Shared" | "Percentage" | "Fixed" | "Custom";
  percentage?: number;
  fixedWeeklyAmount?: number;
  covers?: string[];
};

export type FamilyAdultAccess = {
  id: string;
  name: string;
  email: string;
  relationship: string;
  householdId: string;
  householdName: string;
  status: "Active" | "Invited" | "Pending Approval" | "Suspended";
  authUserId?: string;
  invitedAt?: string;
  invitedBy?: string;
  acceptedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  financialPrivacy: "Shared" | "Private";
  permissions: FamilyAccessPermissions;
  billingResponsibility: FamilyBillingResponsibility;
};

type AnyRecord = Record<string, unknown>;

function object(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrUndefined(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export const fullFamilyPermissions: FamilyAccessPermissions = {
  viewProfile: true,
  viewSchedule: true,
  submitSchedule: true,
  viewAttendance: true,
  viewTransportation: true,
  viewMedical: true,
  viewDocuments: true,
  viewIncidents: true,
  viewMessages: true,
  messageStaff: true,
  managePickup: true,
  editEmergencyContacts: true,
  viewBilling: true,
  makePayments: true,
};

export const pickupOnlyFamilyPermissions: FamilyAccessPermissions = {
  viewProfile: true,
  viewSchedule: false,
  submitSchedule: false,
  viewAttendance: false,
  viewTransportation: false,
  viewMedical: false,
  viewDocuments: false,
  viewIncidents: false,
  viewMessages: false,
  messageStaff: false,
  managePickup: false,
  editEmergencyContacts: false,
  viewBilling: false,
  makePayments: false,
};

export function normalizeFamilyPermissions(value: unknown, fallback = fullFamilyPermissions): FamilyAccessPermissions {
  const raw = object(value);
  return familyPermissionKeys.reduce((permissions, key) => {
    permissions[key] = bool(raw[key], fallback[key]);
    return permissions;
  }, {} as FamilyAccessPermissions);
}

export function safeFamilyAccess(value: unknown): FamilyAdultAccess[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();

  return value.slice(0, 30).map((entry, index): FamilyAdultAccess | null => {
    const raw = object(entry);
    const email = text(raw.email).toLowerCase().slice(0, 254);
    if (!email || seen.has(email)) return null;
    seen.add(email);

    const responsibility = object(raw.billingResponsibility);
    const mode = ["Shared", "Percentage", "Fixed", "Custom"].includes(text(responsibility.mode))
      ? text(responsibility.mode) as FamilyBillingResponsibility["mode"]
      : "Shared";

    const percentage = numberOrUndefined(responsibility.percentage);
    const fixedWeeklyAmount = numberOrUndefined(responsibility.fixedWeeklyAmount);
    const covers = Array.isArray(responsibility.covers)
      ? responsibility.covers.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 20)
      : [];

    return {
      id: text(raw.id).slice(0, 120) || `adult-${index + 1}-${email.replace(/[^a-z0-9]/g, "-")}`,
      name: text(raw.name).slice(0, 160) || email,
      email,
      relationship: text(raw.relationship).slice(0, 100) || "Parent / Guardian",
      householdId: text(raw.householdId).slice(0, 120) || `household-${email}`,
      householdName: text(raw.householdName).slice(0, 160) || "Family Household",
      status: ["Active", "Invited", "Pending Approval", "Suspended"].includes(text(raw.status))
        ? text(raw.status) as FamilyAdultAccess["status"]
        : "Active",
      authUserId: text(raw.authUserId).slice(0, 120) || undefined,
      invitedAt: text(raw.invitedAt).slice(0, 40) || undefined,
      invitedBy: text(raw.invitedBy).slice(0, 160) || undefined,
      acceptedAt: text(raw.acceptedAt).slice(0, 40) || undefined,
      approvedAt: text(raw.approvedAt).slice(0, 40) || undefined,
      approvedBy: text(raw.approvedBy).slice(0, 160) || undefined,
      financialPrivacy: text(raw.financialPrivacy) === "Private" ? "Private" : "Shared",
      permissions: normalizeFamilyPermissions(raw.permissions),
      billingResponsibility: {
        mode,
        ...(percentage !== undefined ? { percentage: Math.min(100, Math.max(0, percentage)) } : {}),
        ...(fixedWeeklyAmount !== undefined ? { fixedWeeklyAmount: Math.max(0, fixedWeeklyAmount) } : {}),
        ...(covers.length ? { covers } : {}),
      },
    };
  }).filter((entry): entry is FamilyAdultAccess => Boolean(entry));
}

export function familyAccessForEmail(recordValue: unknown, emailValue: string) {
  const record = object(recordValue);
  const email = emailValue.trim().toLowerCase();
  const explicit = safeFamilyAccess(record.familyAccess);

  if (explicit.length > 0) {
    return explicit.find((entry) => entry.status === "Active" && entry.email === email) ?? null;
  }

  const guardianEmail = text(record.guardianEmail).toLowerCase();
  if (!guardianEmail || guardianEmail !== email) return null;

  return {
    id: `legacy-${email.replace(/[^a-z0-9]/g, "-")}`,
    name: text(record.primaryGuardian) || email,
    email,
    relationship: "Primary Parent / Guardian",
    householdId: `legacy-${String(record.familyId ?? email)}`,
    householdName: text(record.familyName) || "Family Household",
    status: "Active",
    financialPrivacy: "Shared",
    permissions: { ...fullFamilyPermissions },
    billingResponsibility: { mode: "Shared" },
  } satisfies FamilyAdultAccess;
}

export function familyAccessSummary(access: FamilyAdultAccess) {
  const granted = familyPermissionKeys.filter((key) => access.permissions[key]);
  return {
    relationship: access.relationship,
    householdName: access.householdName,
    financialPrivacy: access.financialPrivacy,
    billingResponsibility: access.billingResponsibility,
    permissions: access.permissions,
    grantedCount: granted.length,
  };
}
