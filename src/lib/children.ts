export type LicensingStatus = "Complete" | "Missing Documents";
export type EnrollmentStatus = "Active" | "Pending" | "Archived";
export type AttendanceStatus = "Present" | "Not Scheduled" | "Absent";
export type AgeGroup = "Infant" | "Toddler" | "Preschool" | "School Age";

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
};

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
  subsidy: "Private Pay",
  weeklySchedule: "",
  transportation: "No transportation",
  allergies: "None reported",
  medicalNotes: "No current medical notes",
  licensingStatus: "Complete",
  missingDocuments: "",
  enrollmentStatus: "Active",
  attendanceToday: "Not Scheduled",
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
