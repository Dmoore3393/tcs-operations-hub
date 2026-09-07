import type { LocationKey } from "@/lib/location-config";

export type TeamStoreLocation = Exclude<LocationKey, "All Locations">;
export type TeamRewardCategory = "Gift Cards" | "Team Gear" | "Self-Care" | "Office Essentials" | "Recognition";
export type TeamTrainingStatus = "Submitted" | "Verified" | "Rejected";

export type TeamReward = {
  id: string;
  location: TeamStoreLocation;
  name: string;
  category: TeamRewardCategory;
  xpCost: number;
  stock: number;
  active: boolean;
  emoji: string;
  imageUrl?: string;
  notes: string;
};

export type TeamRewardOrder = {
  id: string;
  userId: string;
  staffEmail: string;
  staffName: string;
  location: TeamStoreLocation;
  items: Array<{ rewardId: string; name: string; quantity: number; xpCost: number }>;
  totalXp: number;
  status: "Requested" | "Ready" | "Fulfilled" | "Cancelled";
  createdAt: string;
  fulfilledAt?: string;
  fulfilledBy?: string;
};

export type TeamXpLedgerEntry = {
  id: string;
  userId: string;
  staffEmail: string;
  staffName: string;
  location?: TeamStoreLocation;
  amount: number;
  type: "Training XP" | "On-Time Bonus" | "Late Training XP" | "Reward Redemption" | "Adjustment";
  reason: string;
  createdAt: string;
  referenceId?: string;
};

export type TeamTraining = {
  id: string;
  title: string;
  provider: string;
  externalUrl: string;
  description: string;
  instructions: string;
  locations: TeamStoreLocation[];
  roles: string[];
  assignedEmails: string[];
  dueDate: string;
  recurring: boolean;
  renewalMonths?: number;
  requiresProof: boolean;
  verificationRequired: boolean;
  baseXp: number;
  onTimeBonusXp: number;
  lateXp: number;
  active: boolean;
  createdBy: string;
  createdAt: string;
};

export type TeamTrainingCompletion = {
  id: string;
  trainingId: string;
  userId: string;
  staffEmail: string;
  staffName: string;
  location?: TeamStoreLocation;
  status: TeamTrainingStatus;
  completedAt: string;
  proofName?: string;
  proofUrl?: string;
  note?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  xpAwarded: number;
};

export const emptyTeamRewards: TeamReward[] = [];
export const emptyTeamRewardOrders: TeamRewardOrder[] = [];
export const emptyTeamXpLedger: TeamXpLedgerEntry[] = [];
export const emptyTeamTrainings: TeamTraining[] = [];
export const emptyTeamTrainingCompletions: TeamTrainingCompletion[] = [];

export const TEAM_STORE_STATE_KEYS = [
  "tcs-team-rewards-v1",
  "tcs-team-reward-orders-v1",
  "tcs-team-xp-ledger-v1",
  "tcs-team-trainings-v1",
  "tcs-team-training-completions-v1",
] as const;
