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

export const initialChildren: ChildRecord[] = [
  {
    id: 1,
    firstName: "Bryson",
    lastName: "Brinkley",
    age: "2 years",
    dateOfBirth: "2024-03-14",
    ageGroup: "Toddler",
    location: locations[0],
    classroom: "Toddler Room",
    primaryGuardian: "Bernard Brinkley",
    phone: "(661) 555-0134",
    subsidy: "DCFS",
    weeklySchedule: "Mon–Fri • 6:00 AM–2:00 PM",
    transportation: "No transportation",
    allergies: "None reported",
    medicalNotes: "No current medical notes",
    licensingStatus: "Complete",
    missingDocuments: [],
    enrollmentStatus: "Active",
    attendanceToday: "Present",
  },
  {
    id: 2,
    firstName: "Scarlett",
    lastName: "Diaz",
    age: "4 years",
    dateOfBirth: "2022-05-06",
    ageGroup: "Preschool",
    location: locations[0],
    classroom: "Preschool Room",
    primaryGuardian: "Guadalupe Diaz",
    phone: "(661) 555-0171",
    subsidy: "CCRC",
    weeklySchedule: "Mon–Fri • 8:00 AM–3:30 PM",
    transportation: "No transportation",
    allergies: "Allergy information pending",
    medicalNotes: "Therapy services scheduled on site",
    licensingStatus: "Missing Documents",
    missingDocuments: ["Allergy Form"],
    enrollmentStatus: "Active",
    attendanceToday: "Present",
  },
  {
    id: 3,
    firstName: "Ezekiel",
    lastName: "Brinkley",
    age: "7 years",
    dateOfBirth: "2019-01-22",
    ageGroup: "School Age",
    location: locations[2],
    classroom: "School Age Room",
    primaryGuardian: "Bernard Brinkley",
    phone: "(661) 555-0134",
    subsidy: "DCFS",
    weeklySchedule: "Mon–Fri • 6:00 AM–2:00 PM",
    transportation: "School transportation",
    allergies: "None reported",
    medicalNotes: "No current medical notes",
    licensingStatus: "Complete",
    missingDocuments: [],
    enrollmentStatus: "Active",
    attendanceToday: "Present",
  },
  {
    id: 4,
    firstName: "Elias",
    lastName: "Brinkley",
    age: "6 years",
    dateOfBirth: "2020-04-17",
    ageGroup: "School Age",
    location: locations[2],
    classroom: "School Age Room",
    primaryGuardian: "Bernard Brinkley",
    phone: "(661) 555-0134",
    subsidy: "DCFS",
    weeklySchedule: "Mon–Fri • 6:00 AM–2:00 PM",
    transportation: "School transportation",
    allergies: "None reported",
    medicalNotes: "No current medical notes",
    licensingStatus: "Missing Documents",
    missingDocuments: ["LIC 627"],
    enrollmentStatus: "Active",
    attendanceToday: "Present",
  },
  {
    id: 5,
    firstName: "Daniel",
    lastName: "Moreno",
    age: "8 years",
    dateOfBirth: "2018-02-09",
    ageGroup: "School Age",
    location: locations[2],
    classroom: "School Age Room",
    primaryGuardian: "Amber Bock",
    phone: "(661) 555-0156",
    subsidy: "CCRC",
    weeklySchedule: "Mon–Fri • Varied schedule",
    transportation: "School pick-up",
    allergies: "None reported",
    medicalNotes: "No current medical notes",
    licensingStatus: "Complete",
    missingDocuments: [],
    enrollmentStatus: "Active",
    attendanceToday: "Not Scheduled",
  },
  {
    id: 6,
    firstName: "Silas",
    lastName: "Moreno",
    age: "6 years",
    dateOfBirth: "2020-06-11",
    ageGroup: "School Age",
    location: locations[2],
    classroom: "School Age Room",
    primaryGuardian: "Amber Bock",
    phone: "(661) 555-0156",
    subsidy: "CCRC",
    weeklySchedule: "Mon–Fri • Varied schedule",
    transportation: "School pick-up • Harness required",
    allergies: "Emergency medication on file",
    medicalNotes: "Individual safety plan on file",
    licensingStatus: "Complete",
    missingDocuments: [],
    enrollmentStatus: "Active",
    attendanceToday: "Not Scheduled",
  },
  {
    id: 7,
    firstName: "Israel",
    lastName: "Palomo",
    age: "8 years",
    dateOfBirth: "2018-07-02",
    ageGroup: "School Age",
    location: locations[2],
    classroom: "School Age Room",
    primaryGuardian: "Vanity Palomo",
    phone: "(661) 555-0182",
    subsidy: "CCRC",
    weeklySchedule: "Mon–Fri • 8:00 AM–9:00 PM",
    transportation: "Summer school pick-up",
    allergies: "None reported",
    medicalNotes: "No current medical notes",
    licensingStatus: "Complete",
    missingDocuments: [],
    enrollmentStatus: "Active",
    attendanceToday: "Absent",
  },
  {
    id: 8,
    firstName: "Chanel",
    lastName: "Palomo",
    age: "5 years",
    dateOfBirth: "2021-02-18",
    ageGroup: "School Age",
    location: locations[2],
    classroom: "School Age Room",
    primaryGuardian: "Vanity Palomo",
    phone: "(661) 555-0182",
    subsidy: "CCRC",
    weeklySchedule: "Mon–Fri • 8:00 AM–9:00 PM",
    transportation: "Summer school pick-up",
    allergies: "None reported",
    medicalNotes: "No current medical notes",
    licensingStatus: "Complete",
    missingDocuments: [],
    enrollmentStatus: "Active",
    attendanceToday: "Absent",
  },
  {
    id: 9,
    firstName: "Tiffany",
    lastName: "Palomo",
    age: "4 years",
    dateOfBirth: "2022-08-13",
    ageGroup: "Preschool",
    location: locations[0],
    classroom: "Preschool Room",
    primaryGuardian: "Vanity Palomo",
    phone: "(661) 555-0182",
    subsidy: "CCRC",
    weeklySchedule: "Mon–Fri • 8:00 AM–9:00 PM",
    transportation: "No transportation",
    allergies: "None reported",
    medicalNotes: "Toileting support noted",
    licensingStatus: "Missing Documents",
    missingDocuments: ["Updated Immunization Record"],
    enrollmentStatus: "Active",
    attendanceToday: "Absent",
  },
  {
    id: 10,
    firstName: "Alarik",
    lastName: "Rosales",
    age: "3 years",
    dateOfBirth: "2023-01-30",
    ageGroup: "Preschool",
    location: locations[0],
    classroom: "Preschool Room",
    primaryGuardian: "Ramiro Rosales",
    secondaryGuardian: "Katelyn Estrada",
    phone: "(661) 555-0197",
    subsidy: "Private Pay",
    weeklySchedule: "Mon–Fri • Varied schedule",
    transportation: "No transportation",
    allergies: "Lactose-free milk",
    medicalNotes: "Individual support information on file",
    licensingStatus: "Complete",
    missingDocuments: [],
    enrollmentStatus: "Active",
    attendanceToday: "Present",
  },
  {
    id: 11,
    firstName: "Kayla",
    lastName: "Shiina",
    age: "8 years",
    dateOfBirth: "2018-09-08",
    ageGroup: "School Age",
    location: locations[2],
    classroom: "School Age Room",
    primaryGuardian: "Metha Shiina",
    secondaryGuardian: "Kaelyn Shiina",
    phone: "(661) 555-0118",
    subsidy: "Private Pay",
    weeklySchedule: "Evenings and weekends",
    transportation: "Home pick-up and drop-off",
    allergies: "None reported",
    medicalNotes: "No current medical notes",
    licensingStatus: "Complete",
    missingDocuments: [],
    enrollmentStatus: "Active",
    attendanceToday: "Not Scheduled",
  },
  {
    id: 12,
    firstName: "Kendru",
    lastName: "Shiina",
    age: "3 years",
    dateOfBirth: "2023-04-21",
    ageGroup: "Preschool",
    location: locations[0],
    classroom: "Preschool Room",
    primaryGuardian: "Metha Shiina",
    secondaryGuardian: "Kaelyn Shiina",
    phone: "(661) 555-0118",
    subsidy: "Private Pay",
    weeklySchedule: "Evenings and weekends",
    transportation: "Home pick-up and drop-off",
    allergies: "None reported",
    medicalNotes: "No current medical notes",
    licensingStatus: "Missing Documents",
    missingDocuments: ["LIC 700 Update", "Medical Consent"],
    enrollmentStatus: "Pending",
    attendanceToday: "Not Scheduled",
  },
];

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
