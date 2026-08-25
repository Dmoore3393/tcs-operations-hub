export const hubLocations = [
  { id: "halcom", name: "Moore Family Childcare", shortName: "Halcom", type: "Family Childcare", capacity: 14, enrolled: 12, present: 10, color: "emerald", hours: "Mon–Thu 6:00 AM–11:00 PM • Fri 6:00 AM–6:00 PM • Sat–Sun 6:00 AM–11:00 PM" },
  { id: "cathers", name: "Cathers Family Childcare", shortName: "21st Street", type: "Family Childcare", capacity: 14, enrolled: 8, present: 6, color: "slate", hours: "Mon–Sun 6:00 AM–11:00 PM" },
  { id: "division", name: "The School Age Center", shortName: "Division", type: "School Age Center", capacity: 17, enrolled: 15, present: 12, color: "red", hours: "Mon–Fri 6:00 AM–7:00 PM • Sat–Sun Closed" },
  { id: "cornejo-33rd", name: "Cornejo Family Childcare", shortName: "33rd Street", type: "Family Childcare", capacity: 14, enrolled: 6, present: 5, color: "amber", hours: "Mon–Sun 6:00 AM–11:00 PM" },
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

export const starterFamilies: FamilyRecord[] = [
  { id: 1, familyName: "Brinkley Family", primaryGuardian: "Bernard Brinkley", secondaryGuardian: "", phone: "(661) 555-0134", email: "bernard@example.com", children: ["Ezekiel", "Elias", "Bryson"], location: "Halcom + Division", subsidy: "DCFS", balance: 0, status: "Active", transportation: "School transportation" },
  { id: 2, familyName: "Palomo Family", primaryGuardian: "Vanity Palomo", secondaryGuardian: "", phone: "(661) 555-0182", email: "vanity@example.com", children: ["Israel", "Chanel", "Tiffany"], location: "Halcom + Division", subsidy: "CCRC", balance: 10, status: "Active", transportation: "School pick-up" },
  { id: 3, familyName: "Moreno Family", primaryGuardian: "Amber Bock", secondaryGuardian: "", phone: "(661) 555-0156", email: "amber@example.com", children: ["Daniel", "Silas"], location: "Division", subsidy: "CCRC", balance: 0, status: "Active", transportation: "School pick-up • safety plan" },
  { id: 4, familyName: "Shiina Family", primaryGuardian: "Metha Shiina", secondaryGuardian: "Kaelyn Shiina", phone: "(661) 555-0118", email: "shiina@example.com", children: ["Kayla", "Keira", "Kendru"], location: "Halcom + Division", subsidy: "Private Pay", balance: 0, status: "Active", transportation: "Home pick-up and drop-off" },
  { id: 5, familyName: "Diaz Family", primaryGuardian: "Guadalupe Diaz", secondaryGuardian: "", phone: "(661) 555-0171", email: "guadalupe@example.com", children: ["Scarlett"], location: "Halcom", subsidy: "CCRC", balance: 0, status: "Active", transportation: "None" },
  { id: 6, familyName: "Rosales Family", primaryGuardian: "Ramiro Rosales", secondaryGuardian: "Katelyn Estrada", phone: "(661) 555-0197", email: "rosales@example.com", children: ["Alarik"], location: "Halcom", subsidy: "Private Pay", balance: 150, status: "Enrollment Pending", transportation: "None" },
];

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

export const starterEmployees: EmployeeRecord[] = [
  { id: 1, name: "Danielle Moore", role: "Owner / Director", location: "Halcom + All Sites", phone: "(760) 382-5742", schedule: "Mon–Thu 6 AM–11 PM • Fri 6 AM–6 PM", status: "Working Today", certifications: ["Director Qualified", "CPR/First Aid", "Mandated Reporter"], fileStatus: "Complete", transportation: false },
  { id: 2, name: "Latrice", role: "Licensee", location: "Halcom", phone: "(661) 555-0102", schedule: "Variable weekday coverage", status: "Working Today", certifications: ["CPR/First Aid", "Mandated Reporter"], fileStatus: "Complete", transportation: false },
  { id: 3, name: "Akeyla", role: "Transportation / Teacher", location: "All Sites", phone: "(661) 555-0103", schedule: "Tue, Thu, Fri transport • Weekend closer", status: "Off Today", certifications: ["CPR/First Aid", "Driver Approved"], fileStatus: "Needs Attention", transportation: true },
  { id: 4, name: "Evangeline", role: "Teacher", location: "33rd Street + Halcom", phone: "(661) 555-0104", schedule: "Mon–Thu 33rd Street • Fri Halcom 10 AM–6 PM", status: "Working Today", certifications: ["CPR/First Aid"], fileStatus: "Complete", transportation: false },
  { id: 5, name: "Jordan", role: "Teacher in Training", location: "Halcom", phone: "(661) 555-0105", schedule: "Monday and Thursday", status: "Training", certifications: ["Mandated Reporter"], fileStatus: "Needs Attention", transportation: false },
  { id: 6, name: "Jackie", role: "Teacher", location: "Halcom", phone: "(661) 555-0106", schedule: "Monday floor support", status: "Off Today", certifications: ["CPR/First Aid"], fileStatus: "Complete", transportation: false },
  { id: 7, name: "Emily", role: "Weekend Opener", location: "Halcom", phone: "(661) 555-0107", schedule: "Saturday opener", status: "Off Today", certifications: ["CPR/First Aid"], fileStatus: "Complete", transportation: false },
  { id: 8, name: "Valeria", role: "Weekend Teacher", location: "Halcom", phone: "(661) 555-0108", schedule: "Saturday closer • Sunday opener", status: "Off Today", certifications: ["CPR/First Aid"], fileStatus: "Complete", transportation: false },
];

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

export const starterShifts: Shift[] = [
  { id: 1, employee: "Danielle", role: "Director", location: "Halcom", day: "Monday", start: "6:00 AM", end: "11:00 PM", assignment: "School Age Room + Office" },
  { id: 2, employee: "Latrice", role: "Licensee", location: "Halcom", day: "Monday", start: "8:00 AM", end: "5:00 PM", assignment: "Infants / Toddlers" },
  { id: 3, employee: "Jackie", role: "Teacher", location: "Halcom", day: "Monday", start: "9:00 AM", end: "3:00 PM", assignment: "Floor + Kitchen" },
  { id: 4, employee: "Danielle", role: "Director", location: "Halcom", day: "Tuesday", start: "6:00 AM", end: "11:00 PM", assignment: "School Age Room + Office" },
  { id: 5, employee: "Akeyla", role: "Driver", location: "Transportation", day: "Tuesday", start: "1:00 PM", end: "9:00 PM", assignment: "School routes" },
  { id: 6, employee: "Latrice", role: "Licensee", location: "Halcom", day: "Tuesday", start: "8:00 AM", end: "6:00 PM", assignment: "Infants / Preschool" },
  { id: 7, employee: "Danielle", role: "Director", location: "Halcom", day: "Wednesday", start: "6:00 AM", end: "11:00 PM", assignment: "School Age Room + Office" },
  { id: 8, employee: "Latrice", role: "Licensee", location: "Halcom", day: "Wednesday", start: "8:00 AM", end: "6:00 PM", assignment: "Infants / Preschool" },
  { id: 9, employee: "Danielle", role: "Director", location: "Halcom", day: "Thursday", start: "6:00 AM", end: "11:00 PM", assignment: "School Age Room + Office" },
  { id: 10, employee: "Jordan", role: "Training", location: "Halcom", day: "Thursday", start: "4:00 PM", end: "9:00 PM", assignment: "Floor training" },
  { id: 11, employee: "Akeyla", role: "Driver", location: "Transportation", day: "Thursday", start: "1:00 PM", end: "9:00 PM", assignment: "School routes" },
  { id: 12, employee: "Danielle", role: "Director", location: "Halcom", day: "Friday", start: "6:00 AM", end: "10:00 AM", assignment: "Opening + Office" },
  { id: 13, employee: "Evangeline", role: "Teacher", location: "Halcom", day: "Friday", start: "10:00 AM", end: "6:00 PM", assignment: "Floor lead" },
  { id: 14, employee: "Akeyla", role: "Driver / Teacher", location: "Transportation", day: "Friday", start: "1:00 PM", end: "9:00 PM", assignment: "Routes + floor support" },
  { id: 15, employee: "Latrice", role: "Licensee", location: "Halcom", day: "Saturday", start: "6:00 AM", end: "11:00 PM", assignment: "All groups" },
  { id: 16, employee: "Latrice", role: "Licensee", location: "Halcom", day: "Sunday", start: "6:00 AM", end: "11:00 PM", assignment: "All groups" },
];

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
  { id: 1, name: "Ford Flex 1", makeModel: "Ford Flex", type: "SUV", passengerCapacity: 6, plate: "", assignedLocation: "All Sites", primaryDriver: "Akeyla", status: "Ready", registrationDue: "", insuranceDue: "", notes: "Primary route vehicle. Verify passenger capacity and plate information." },
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

export const starterRoutes: TransportationRoute[] = [
  { id: 1, location: "Division", child: "Kayla Shiina", school: "Home Transportation", area: "Lancaster", driver: "Akeyla", vehicle: "Ford Flex 1", pickup: "4:00 PM", dropoff: "8:00 PM", days: "Tue, Thu, Fri", status: "Confirmed", notes: "Home pick-up and drop-off" },
  { id: 2, location: "Division", child: "Keira Shiina", school: "Home Transportation", area: "Lancaster", driver: "Akeyla", vehicle: "Ford Flex 1", pickup: "4:00 PM", dropoff: "8:00 PM", days: "Tue, Thu, Fri", status: "Needs Review", notes: "Confirm if riding this week" },
  { id: 3, location: "Division", child: "Ezekiel Brinkley", school: "Fulton & Alsbury Academy", area: "Lancaster", driver: "TBD", vehicle: "Ford Flex 2", pickup: "2:15 PM", dropoff: "—", days: "Mon–Fri", status: "Needs Review", notes: "School-year route pending" },
  { id: 4, location: "Division", child: "Elias Brinkley", school: "Fulton & Alsbury Academy", area: "Lancaster", driver: "TBD", vehicle: "Ford Flex 2", pickup: "2:15 PM", dropoff: "—", days: "Mon–Fri", status: "Needs Review", notes: "School-year route pending" },
  { id: 5, location: "Division", child: "Israel Palomo", school: "Summer School", area: "Lancaster", driver: "—", vehicle: "", pickup: "4:00 PM", dropoff: "—", days: "Mon–Fri", status: "Not Riding", notes: "Summer school route ended" },
];

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
  { id: 1, title: "Complete children’s weekly timesheets", owner: "Danielle", category: "Admin", due: "Monday", priority: "High", completed: false, initials: "", location: "All Sites" },
  { id: 2, title: "Review missing child licensing documents", owner: "Latrice", category: "Licensing", due: "Tuesday", priority: "Urgent", completed: false, initials: "", location: "Halcom" },
  { id: 3, title: "Audit scheduled advertisements", owner: "Danielle", category: "Marketing", due: "Monday", priority: "Normal", completed: true, initials: "DM", completedAt: "7/27/2026", location: "All Sites" },
  { id: 4, title: "Teach staff-file organization process", owner: "Latrice", category: "Admin", due: "Wednesday", priority: "High", completed: false, initials: "", location: "Halcom" },
  { id: 5, title: "Confirm school transportation routes", owner: "Akeyla", category: "Transportation", due: "Thursday", priority: "Urgent", completed: false, initials: "", location: "All Sites" },
  { id: 6, title: "Build next week’s staff schedule and ratios", owner: "Danielle", category: "Admin", due: "Friday", priority: "High", completed: false, initials: "", location: "All Sites" },
  { id: 7, title: "Send schedule reminder to families by 6 PM", owner: "Danielle", category: "Enrollment", due: "Friday", priority: "Urgent", completed: false, initials: "", location: "All Sites" },
  { id: 8, title: "Kitchen deep-clean checklist", owner: "Jackie", category: "Cleaning", due: "Monday", priority: "Normal", completed: false, initials: "", location: "Halcom" },
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

export const starterFiles: FileRecord[] = [
  { id: 1, person: "Scarlett Diaz", recordType: "Child", location: "Halcom", document: "Allergy Form", status: "Missing", due: "Now" },
  { id: 2, person: "Elias Brinkley", recordType: "Child", location: "Division", document: "LIC 627 Consent", status: "Needs Signature", due: "Aug 5" },
  { id: 3, person: "Tiffany Palomo", recordType: "Child", location: "Halcom", document: "Immunization Record", status: "Expiring Soon", due: "Aug 13" },
  { id: 4, person: "Kendru Shiina", recordType: "Child", location: "Halcom", document: "LIC 700 Update", status: "Missing", due: "Now" },
  { id: 5, person: "Kendru Shiina", recordType: "Child", location: "Halcom", document: "Medical Consent", status: "Needs Signature", due: "Now" },
  { id: 6, person: "Akeyla", recordType: "Employee", location: "Division", document: "Driver Record Review", status: "Expiring Soon", due: "Aug 20" },
  { id: 7, person: "Jordan", recordType: "Employee", location: "Halcom", document: "CPR/First Aid", status: "Missing", due: "Before solo coverage" },
  { id: 8, person: "Ford Flex 1", recordType: "Vehicle", location: "Division", document: "Emergency Binder Review", status: "Needs Signature", due: "Friday" },
];


