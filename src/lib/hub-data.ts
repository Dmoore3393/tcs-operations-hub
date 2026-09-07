export const hubLocations = [
  { id: "halcom", name: "Moore Family Childcare", shortName: "Halcom", type: "Family Childcare", capacity: 14, enrolled: 0, present: 0, color: "emerald", hours: "Mon–Thu 6:00 AM–11:00 PM • Fri 6:00 AM–6:00 PM • Sat–Sun 6:00 AM–11:00 PM" },
  { id: "cathers", name: "Cathers Family Childcare", shortName: "21st Street", type: "Family Childcare", capacity: 14, enrolled: 0, present: 0, color: "slate", hours: "Mon–Sun 6:00 AM–11:00 PM" },
  { id: "division", name: "The School Age Center", shortName: "Division", type: "School Age Center", capacity: 17, enrolled: 0, present: 0, color: "red", hours: "Mon–Fri 6:00 AM–7:00 PM • Sat–Sun Closed" },
  { id: "cornejo-33rd", name: "Cornejo Family Childcare", shortName: "33rd Street", type: "Family Childcare", capacity: 14, enrolled: 0, present: 0, color: "amber", hours: "Mon–Sun 6:00 AM–11:00 PM" },
  { id: "tehachapi", name: "Tehachapi Transportation Hub", shortName: "Tehachapi", type: "Transportation / Care Hub", capacity: 14, enrolled: 0, present: 0, color: "blue", hours: "Mon–Fri 6:00 AM–7:00 PM • Sat–Sun Closed" },
  { id: "lara-42nd", name: "Lara Family Childcare", shortName: "42nd Street", type: "Family Childcare", capacity: 14, enrolled: 0, present: 0, color: "purple", hours: "Mon–Sun 6:00 AM–11:00 PM" },
] as const;

export type FamilyRecord = {
  id: number;
  familyName: string;
  primaryGuardian: string;
  secondaryGuardian: string;
  phone: string;
  email: string;
  children: string[];
  location: string;
  subsidy: "CCRC" | "DCFS" | "Private Pay" | "CCCC";
  balance: number;
  status: "Active" | "Enrollment Pending" | "Inactive";
  transportation: string;
};

/** Live family data belongs in Supabase, never source control. */
export const starterFamilies: FamilyRecord[] = [];

export type EmployeeRecord = {
  id: number;
  name: string;
  role: string;
  location: string;
  phone: string;
  schedule: string;
  status: "Working Today" | "Off Today" | "Training" | "On Leave";
  certifications: string[];
  fileStatus: "Complete" | "Needs Attention";
  transportation: boolean;
};

/** Live employee contact/schedule data belongs in Supabase, never source control. */
export const starterEmployees: EmployeeRecord[] = [];

export type Shift = {
  id: number;
  employee: string;
  role: string;
  location: string;
  day: string;
  start: string;
  end: string;
  assignment: string;
};

export const starterShifts: Shift[] = [];

export type SchoolRecord = {
  id: number;
  school: string;
  district: string;
  area: string;
  address: string;
  phone: string;
  startTime: string;
  dismissal: string;
  minimumDay: string;
  minimumDayName: string;
  status: "Active" | "Inactive";
  notes: string;
};

export const starterSchools: SchoolRecord[] = [
  { id: 1, school: "Amargosa Creek Middle School", district: "Lancaster School District", area: "Lancaster", address: "", phone: "", startTime: "", dismissal: "Varies", minimumDay: "Varies", minimumDayName: "Tuesday", status: "Active", notes: "Confirm bell schedule before route planning." },
  { id: 2, school: "Desert View Elementary School", district: "Lancaster School District", area: "Lancaster", address: "", phone: "", startTime: "", dismissal: "Varies", minimumDay: "Varies", minimumDayName: "Tuesday", status: "Active", notes: "" },
  { id: 3, school: "Fulton & Alsbury Academy", district: "Lancaster School District", area: "Lancaster", address: "", phone: "", startTime: "", dismissal: "Varies", minimumDay: "Varies", minimumDayName: "Tuesday", status: "Active", notes: "" },
  { id: 4, school: "Jack Northrop Elementary School", district: "Lancaster School District", area: "Lancaster", address: "", phone: "", startTime: "", dismissal: "Varies", minimumDay: "Varies", minimumDayName: "Tuesday", status: "Active", notes: "" },
  { id: 5, school: "Linda Verde Dual Language Immersion", district: "Lancaster School District", area: "Lancaster", address: "", phone: "", startTime: "", dismissal: "Varies", minimumDay: "Varies", minimumDayName: "Tuesday", status: "Active", notes: "" },
  { id: 6, school: "Mariposa Computer Science Magnet", district: "Lancaster School District", area: "Lancaster", address: "", phone: "", startTime: "", dismissal: "Varies", minimumDay: "Varies", minimumDayName: "Tuesday", status: "Active", notes: "" },
  { id: 7, school: "Miller Elementary School", district: "Lancaster School District", area: "Lancaster", address: "", phone: "", startTime: "", dismissal: "Varies", minimumDay: "Varies", minimumDayName: "Tuesday", status: "Active", notes: "" },
  { id: 8, school: "Monte Vista Elementary School", district: "Lancaster School District", area: "Lancaster", address: "", phone: "", startTime: "", dismissal: "Varies", minimumDay: "Varies", minimumDayName: "Tuesday", status: "Active", notes: "" },
  { id: 9, school: "Sierra Elementary School", district: "Lancaster School District", area: "Lancaster", address: "", phone: "", startTime: "", dismissal: "Varies", minimumDay: "Varies", minimumDayName: "Tuesday", status: "Active", notes: "" },
  { id: 10, school: "Sunnydale Elementary School", district: "Lancaster School District", area: "Lancaster", address: "", phone: "", startTime: "", dismissal: "Varies", minimumDay: "Varies", minimumDayName: "Tuesday", status: "Active", notes: "" },
  { id: 11, school: "West Wind Computer Science Magnet", district: "Lancaster School District", area: "Lancaster", address: "", phone: "", startTime: "", dismissal: "Varies", minimumDay: "Varies", minimumDayName: "Tuesday", status: "Active", notes: "" },
  { id: 12, school: "Valley View Elementary School", district: "Westside Union School District", area: "Quartz Hill", address: "", phone: "", startTime: "7:10 AM", dismissal: "1:50 PM", minimumDay: "12:50 PM", minimumDayName: "Minimum day", status: "Active", notes: "" },
  { id: 13, school: "Rosamond Elementary School", district: "Southern Kern Unified School District", area: "Rosamond", address: "", phone: "", startTime: "8:00 AM", dismissal: "1:55 PM", minimumDay: "12:40 PM", minimumDayName: "Minimum day", status: "Active", notes: "" },
  { id: 14, school: "Westpark Elementary School", district: "Southern Kern Unified School District", area: "Rosamond", address: "", phone: "", startTime: "7:30 AM", dismissal: "1:25 PM", minimumDay: "12:10 PM", minimumDayName: "Minimum day", status: "Active", notes: "" },
  { id: 15, school: "Tropico Middle School", district: "Southern Kern Unified School District", area: "Rosamond", address: "", phone: "", startTime: "8:45 AM", dismissal: "3:05 PM", minimumDay: "1:45 PM", minimumDayName: "Minimum day", status: "Active", notes: "" },
  { id: 16, school: "Golden Hills Elementary School", district: "Tehachapi Unified School District", area: "Tehachapi", address: "", phone: "", startTime: "8:50 AM", dismissal: "3:06 PM", minimumDay: "1:16 PM", minimumDayName: "Minimum day", status: "Active", notes: "" },
  { id: 17, school: "Jacobsen Middle School", district: "Tehachapi Unified School District", area: "Tehachapi", address: "", phone: "", startTime: "7:30 AM", dismissal: "2:20 PM", minimumDay: "11:50 AM", minimumDayName: "Minimum day", status: "Active", notes: "" },
  { id: 18, school: "Tompkins Elementary School", district: "Tehachapi Unified School District", area: "Tehachapi", address: "", phone: "", startTime: "9:00 AM", dismissal: "3:15 PM", minimumDay: "1:26 PM", minimumDayName: "Minimum day", status: "Active", notes: "" },
];

export type VehicleRecord = {
  id: number;
  name: string;
  makeModel: string;
  type: string;
  passengerCapacity: number;
  plate: string;
  assignedLocation: string;
  primaryDriver: string;
  status: "Ready" | "Needs Attention" | "Out of Service";
  registrationDue: string;
  insuranceDue: string;
  notes: string;
};

export const starterVehicles: VehicleRecord[] = [
  { id: 1, name: "Ford Flex 1", makeModel: "Ford Flex", type: "SUV", passengerCapacity: 6, plate: "", assignedLocation: "All Sites", primaryDriver: "", status: "Ready", registrationDue: "", insuranceDue: "", notes: "Primary route vehicle. Verify passenger capacity and plate information." },
  { id: 2, name: "Ford Flex 2", makeModel: "Ford Flex", type: "SUV", passengerCapacity: 6, plate: "", assignedLocation: "All Sites", primaryDriver: "", status: "Ready", registrationDue: "", insuranceDue: "", notes: "Verify passenger capacity and plate information." },
  { id: 3, name: "Ford Flex 3", makeModel: "Ford Flex", type: "SUV", passengerCapacity: 6, plate: "", assignedLocation: "All Sites", primaryDriver: "", status: "Needs Attention", registrationDue: "", insuranceDue: "", notes: "Complete vehicle details and readiness review." },
  { id: 4, name: "Passenger Van", makeModel: "Van", type: "Passenger Van", passengerCapacity: 12, plate: "", assignedLocation: "All Sites", primaryDriver: "", status: "Ready", registrationDue: "", insuranceDue: "", notes: "Verify exact make, model, passenger capacity, and plate information." },
];

export type TransportationRoute = {
  id: number;
  location: string;
  child: string;
  school: string;
  area: string;
  driver: string;
  vehicle: string;
  pickup: string;
  dropoff: string;
  days: string;
  status: "Confirmed" | "Needs Review" | "Not Riding";
  notes: string;
};

/** Live transportation routes may contain child names and stay in Supabase. */
export const starterRoutes: TransportationRoute[] = [];

export type WorkTask = {
  id: number;
  title: string;
  owner: string;
  category: "Admin" | "Licensing" | "Cleaning" | "Enrollment" | "Transportation" | "Marketing";
  due: string;
  priority: "Urgent" | "High" | "Normal";
  completed: boolean;
  initials: string;
  completedAt?: string;
  location: string;
};

export const starterTasks: WorkTask[] = [
  { id: 1, title: "Complete children’s weekly timesheets", owner: "Operations", category: "Admin", due: "Monday", priority: "High", completed: false, initials: "", location: "All Sites" },
  { id: 2, title: "Review missing child licensing documents", owner: "Licensee", category: "Licensing", due: "Tuesday", priority: "Urgent", completed: false, initials: "", location: "Assigned Site" },
  { id: 3, title: "Audit scheduled advertisements", owner: "Operations", category: "Marketing", due: "Monday", priority: "Normal", completed: false, initials: "", location: "All Sites" },
  { id: 4, title: "Teach staff-file organization process", owner: "Licensee", category: "Admin", due: "Wednesday", priority: "High", completed: false, initials: "", location: "Assigned Site" },
  { id: 5, title: "Confirm school transportation routes", owner: "Transportation", category: "Transportation", due: "Thursday", priority: "Urgent", completed: false, initials: "", location: "All Sites" },
  { id: 6, title: "Build next week’s staff schedule and ratios", owner: "Operations", category: "Admin", due: "Friday", priority: "High", completed: false, initials: "", location: "All Sites" },
  { id: 7, title: "Send schedule reminder to families by 6 PM", owner: "Operations", category: "Enrollment", due: "Friday", priority: "Urgent", completed: false, initials: "", location: "All Sites" },
  { id: 8, title: "Kitchen deep-clean checklist", owner: "Assigned Staff", category: "Cleaning", due: "Monday", priority: "Normal", completed: false, initials: "", location: "Assigned Site" },
];

export type FileRecord = {
  id: number;
  person: string;
  recordType: "Child" | "Employee" | "Facility" | "Vehicle";
  location: string;
  document: string;
  status: "Complete" | "Missing" | "Expiring Soon" | "Needs Signature";
  due: string;
};

/** File tracking records may identify children/staff and stay in Supabase. */
export const starterFiles: FileRecord[] = [];
