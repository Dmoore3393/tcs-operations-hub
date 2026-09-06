import type { LocationKey } from "@/lib/location-config";

export type StoreLocation = Exclude<LocationKey, "All Locations">;
export type StoreCategory = "Snacks" | "School Supplies" | "Spirit Wear" | "Rewards" | "Essentials";

export type StoreProduct = {
  id: string;
  location: StoreLocation;
  name: string;
  category: StoreCategory;
  price: number;
  stock: number;
  active: boolean;
  emoji: string;
  notes: string;
};

export type GatorLedgerEntry = {
  id: string;
  childId: number;
  location: StoreLocation;
  amount: number;
  type: "Earned" | "Job Pay" | "Purchase" | "Adjustment";
  reason: string;
  staffName: string;
  createdAt: string;
  referenceId?: string;
};

export type StoreOrder = {
  id: string;
  childId: number;
  location: StoreLocation;
  items: Array<{ productId: string; name: string; quantity: number; price: number }>;
  total: number;
  staffName: string;
  createdAt: string;
};

export type StudentJob = {
  id: string;
  location: StoreLocation;
  title: string;
  pay: number;
  openings: number;
  responsibilities: string[];
  active: boolean;
};

export type JobApplicationStatus = "New" | "Reviewing" | "Approved" | "Assigned" | "Not Selected";

export type JobApplication = {
  id: string;
  childId: number;
  location: StoreLocation;
  jobId: string;
  secondChoiceJobId?: string;
  whyInterested: string;
  strengths: string;
  responsibilities: string;
  availability: string;
  agreed: boolean;
  status: JobApplicationStatus;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
};

export type JobAssignment = {
  id: string;
  childId: number;
  location: StoreLocation;
  jobId: string;
  applicationId?: string;
  payPerCompletion: number;
  active: boolean;
  assignedBy: string;
  assignedAt: string;
  completedCount: number;
  lastPaidAt?: string;
};

export const emptyStoreProducts: StoreProduct[] = [];
export const emptyGatorLedger: GatorLedgerEntry[] = [];
export const emptyStoreOrders: StoreOrder[] = [];
export const emptyStudentJobs: StudentJob[] = [];
export const emptyJobApplications: JobApplication[] = [];
export const emptyJobAssignments: JobAssignment[] = [];

export const STORE_STATE_KEYS = [
  "tcs-store-products-v1",
  "tcs-gator-ledger-v1",
  "tcs-store-orders-v1",
  "tcs-student-jobs-v1",
  "tcs-job-applications-v1",
  "tcs-job-assignments-v1",
] as const;
