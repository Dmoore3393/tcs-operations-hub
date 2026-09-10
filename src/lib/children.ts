export type LicensingStatus = "Complete" | "Missing Documents";
export type EnrollmentStatus = "Active" | "Pending" | "Archived";
export type AttendanceStatus = "Present" | "Not Scheduled" | "Absent";
export type AgeGroup = "Infant" | "Toddler" | "Preschool" | "School Age";
export type MedicalConsentStatus = "On File" | "Missing" | "Needs Update";

export const fundingSources = [
  "Cash Pay",
  "CCRC Stage 1",
  "CCRC Stage 2",
  "CCCC",
  "DCFS",
  "Respite",
  "Crystal Stairs",
] as const;

export function normalizeFundingSource(value: string) {
  const source = value.trim();
  if (/^private pay$/i.test(source)) return "Cash Pay";
  return source;
}

export type ChildRecord = {
  id: number;
  firstName: string;
  lastName: string;
  age: string;
  dateOfBirth: string;
  ageGroup: AgeGroup;
  location: string;
  classroom: string;
  primaryGuardian: string;
  secondaryGuardian?: string;
  phone: string;
  familyId?: number;
  familyName?: string;
  guardianEmail?: string;
  subsidy: string;
  weeklySchedule: string;
  transportation: string;
  allergies: string;
  medicalNotes: string;
  licensingStatus: LicensingStatus;
  missingDocuments: string[];
  enrollmentStatus: EnrollmentStatus;
  attendanceToday: AttendanceStatus;
  medicalConsentStatus?: MedicalConsentStatus;
  medicalConsentSignedAt?: string;
  medicalConsentVerifiedAt?: string;
  medicalProvider?: string;
  medicalProviderPhone?: string;
  dentistProvider?: string;
  dentistPhone?: string;
  insuranceProvider?: string;
  insuranceMemberId?: string;
  emergencyContact1Name?: string;
  emergencyContact1Phone?: string;
  emergencyContact1Relationship?: string;
  emergencyContact2Name?: string;
  emergencyContact2Phone?: string;
  emergencyContact2Relationship?: string;
  transportRestraint?: string;
  emergencyInstructions?: string;
};

export type ChildFormState = {
  firstName: string;
  lastName: string;
  age: string;
  dateOfBirth: string;
  ageGroup: AgeGroup;
  location: string;
  classroom: string;
  primaryGuardian: string;
  secondaryGuardian: string;
  phone: string;
  familyName: string;
  guardianEmail: string;
  subsidy: string;
  weeklySchedule: string;
  transportation: string;
  allergies: string;
  medicalNotes: string;
  licensingStatus: LicensingStatus;
  missingDocuments: string;
  enrollmentStatus: EnrollmentStatus;
  attendanceToday: AttendanceStatus;
  medicalConsentStatus: MedicalConsentStatus;
  medicalConsentSignedAt: string;
  medicalConsentVerifiedAt: string;
  medicalProvider: string;
  medicalProviderPhone: string;
  dentistProvider: string;
  dentistPhone: string;
  insuranceProvider: string;
  insuranceMemberId: string;
  emergencyContact1Name: string;
  emergencyContact1Phone: string;
  emergencyContact1Relationship: string;
  emergencyContact2Name: string;
  emergencyContact2Phone: string;
  emergencyContact2Relationship: string;
  transportRestraint: string;
  emergencyInstructions: string;
};

export type ChildAgeProfile = {
  age: string;
  ageGroup: AgeGroup;
  classroom: string;
  monthsOld: number;
};

/**
 * Derives the child's current age, program age group, and default room from DOB.
 * TCS thresholds:
 * - Infant: birth through 17 months
 * - Toddler: 18 through 35 months
 * - Preschool: 36 through 56 months
 * - School Age: 57 months (4y9m) and older
 */
export function deriveChildAgeProfile(dateOfBirth: string, asOf = new Date()): ChildAgeProfile | null {
  if (!dateOfBirth) return null;
  const parts = dateOfBirth.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const [year, month, day] = parts;
  const birth = new Date(year, month - 1, day);
  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day ||
    birth > asOf
  ) return null;

  let monthsOld = (asOf.getFullYear() - year) * 12 + (asOf.getMonth() - (month - 1));
  if (asOf.getDate() < day) monthsOld -= 1;
  monthsOld = Math.max(0, monthsOld);

  const years = Math.floor(monthsOld / 12);
  const months = monthsOld % 12;
  const age = monthsOld < 24
    ? `${monthsOld} ${monthsOld === 1 ? "month" : "months"}`
    : months > 0
      ? `${years} yrs ${months} mos`
      : `${years} ${years === 1 ? "year" : "years"}`;

  const ageGroup: AgeGroup = monthsOld < 18
    ? "Infant"
    : monthsOld < 36
      ? "Toddler"
      : monthsOld < 57
        ? "Preschool"
        : "School Age";

  return {
    age,
    ageGroup,
    classroom: `${ageGroup} Room`,
    monthsOld,
  };
}

export function applyChildAgeProfile<T extends Pick<ChildRecord, "dateOfBirth" | "age" | "ageGroup" | "classroom">>(child: T): T {
  const profile = deriveChildAgeProfile(child.dateOfBirth);
  return profile ? { ...child, age: profile.age, ageGroup: profile.ageGroup, classroom: profile.classroom } : child;
}

export const locations = [
  "Moore Family Childcare • Halcom",
  "Cathers Family Childcare • 21st Street",
  "The School Age Center • Division",
  "Cornejo Family Childcare • 33rd Street",
  "Lara Family Childcare • 42nd Street",
  "Tehachapi Transportation Hub",
] as const;

/**
 * Production child records must never be hard-coded in source control.
 * The live Children page hydrates from the location-scoped Supabase `children`
 * table. Keep this array empty so a fresh database can never be seeded with
 * names, DOBs, guardian information, medical notes, or other child data from
 * the application bundle.
 */
export const initialChildren: ChildRecord[] = [];

export const emptyForm: ChildFormState = {
  firstName: "",
  lastName: "",
  age: "",
  dateOfBirth: "",
  ageGroup: "Infant",
  location: locations[0],
  classroom: "Infant Room",
  primaryGuardian: "",
  secondaryGuardian: "",
  phone: "",
  familyName: "",
  guardianEmail: "",
  subsidy: "",
  weeklySchedule: "",
  transportation: "No transportation",
  allergies: "None reported",
  medicalNotes: "No current medical notes",
  licensingStatus: "Complete",
  missingDocuments: "",
  enrollmentStatus: "Active",
  attendanceToday: "Not Scheduled",
  medicalConsentStatus: "Missing",
  medicalConsentSignedAt: "",
  medicalConsentVerifiedAt: "",
  medicalProvider: "",
  medicalProviderPhone: "",
  dentistProvider: "",
  dentistPhone: "",
  insuranceProvider: "",
  insuranceMemberId: "",
  emergencyContact1Name: "",
  emergencyContact1Phone: "",
  emergencyContact1Relationship: "",
  emergencyContact2Name: "",
  emergencyContact2Phone: "",
  emergencyContact2Relationship: "",
  transportRestraint: "",
  emergencyInstructions: "",
};

export type ChildDatabaseRow = {
  id: number;
  first_name: string;
  last_name: string;
  display_age: string;
  date_of_birth: string | null;
  age_group: AgeGroup;
  location: string;
  classroom: string;
  primary_guardian: string;
  secondary_guardian: string | null;
  phone: string;
  subsidy: string;
  weekly_schedule: string;
  transportation: string;
  allergies: string;
  medical_notes: string;
  licensing_status: LicensingStatus;
  missing_documents: string[];
  enrollment_status: EnrollmentStatus;
  attendance_today: AttendanceStatus;
  created_at?: string;
  updated_at?: string;
};

export type ChildDatabasePayload = Omit<
  ChildDatabaseRow,
  "id" | "created_at" | "updated_at"
>;

export function databaseRowToChild(row: ChildDatabaseRow): ChildRecord {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    age: row.display_age,
    dateOfBirth: row.date_of_birth ?? "",
    ageGroup: row.age_group,
    location: row.location,
    classroom: row.classroom,
    primaryGuardian: row.primary_guardian,
    secondaryGuardian: row.secondary_guardian ?? undefined,
    phone: row.phone,
    subsidy: row.subsidy,
    weeklySchedule: row.weekly_schedule,
    transportation: row.transportation,
    allergies: row.allergies,
    medicalNotes: row.medical_notes,
    licensingStatus: row.licensing_status,
    missingDocuments: row.missing_documents ?? [],
    enrollmentStatus: row.enrollment_status,
    attendanceToday: row.attendance_today,
  };
}

export function childToDatabasePayload(child: ChildRecord): ChildDatabasePayload {
  return {
    first_name: child.firstName,
    last_name: child.lastName,
    display_age: child.age,
    date_of_birth: child.dateOfBirth || null,
    age_group: child.ageGroup,
    location: child.location,
    classroom: child.classroom,
    primary_guardian: child.primaryGuardian,
    secondary_guardian: child.secondaryGuardian ?? null,
    phone: child.phone,
    subsidy: child.subsidy,
    weekly_schedule: child.weeklySchedule,
    transportation: child.transportation,
    allergies: child.allergies,
    medical_notes: child.medicalNotes,
    licensing_status: child.licensingStatus,
    missing_documents: child.missingDocuments,
    enrollment_status: child.enrollmentStatus,
    attendance_today: child.attendanceToday,
  };
}
