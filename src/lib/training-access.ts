import { normalizeLocation } from "@/lib/location-config";
import { isOwnerAccessRole, isLicenseeAccessRole } from "@/lib/team-access";
import type { TeamTraining } from "@/lib/team-store";

type TrainingStaff = { full_name?: string; email?: string; role: string; locations: string[]; is_active?: boolean };
const trainingAdminNames = new Set(["danielle moore", "jennifer thomason", "heather graham"]);

export function canManageTraining(profile: TrainingStaff) {
  return profile.is_active !== false && (isOwnerAccessRole(profile.role) || trainingAdminNames.has((profile.full_name || "").trim().toLowerCase()));
}

export function isTrainingAssigned(training: TeamTraining, profile: TrainingStaff) {
  if (!training.active || profile.is_active === false) return false;
  if (training.allStaff) return true;
  const locations = (training.locations ?? []).map(normalizeLocation);
  const ownLocations = (profile.locations ?? []).map(normalizeLocation);
  if (!isOwnerAccessRole(profile.role) && !ownLocations.includes("All Locations") && locations.length && !locations.some(item => ownLocations.includes(item))) return false;
  const leadership = canManageTraining(profile) || isLicenseeAccessRole(profile.role);
  if (leadership && (training.includeLeadership ?? true)) return true;
  const roles = training.roles ?? [], emails = training.assignedEmails ?? [];
  return (!roles.length && !emails.length) || roles.some(role => role.toLowerCase() === profile.role.toLowerCase()) || emails.some(email => email.toLowerCase() === (profile.email || "").toLowerCase());
}
