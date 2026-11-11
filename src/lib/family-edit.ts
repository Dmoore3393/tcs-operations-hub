import type { ChildRecord } from "@/lib/children";
import type { FamilyRecord } from "@/lib/hub-data";

export const familyChildIdentity = (child: ChildRecord) => child.legacyId || String(child.id);

/** Change only explicitly edited family fields; siblings keep individual care details. */
export function applyFamilyEdits(child: ChildRecord, original: FamilyRecord, edited: FamilyRecord): ChildRecord {
  if (original.id !== edited.id) throw new Error("The family identity changed. Reopen the family before saving.");
  const next: ChildRecord = { ...child, familyId: original.id };
  if (edited.familyName !== original.familyName) next.familyName = edited.familyName.trim();
  if (edited.primaryGuardian !== original.primaryGuardian) next.primaryGuardian = edited.primaryGuardian.trim();
  // Empty strings are explicit removals. Undefined would disappear during JSON serialization.
  if (edited.secondaryGuardian !== original.secondaryGuardian) next.secondaryGuardian = edited.secondaryGuardian.trim();
  if (edited.phone !== original.phone) next.phone = edited.phone.trim();
  if (edited.email !== original.email) next.guardianEmail = edited.email.trim();
  if (edited.subsidy !== original.subsidy) next.subsidy = edited.subsidy;
  if (edited.transportation !== original.transportation) {
    const notNeeded = /^(none|no transportation|not needed)$/i.test(edited.transportation.trim());
    next.transportation = notNeeded ? "No transportation" : edited.transportation.trim();
    next.noTransportationNeeded = notNeeded;
  }
  if (edited.status !== original.status) {
    next.enrollmentStatus = edited.status === "Inactive" ? "Archived" : edited.status === "Enrollment Pending" ? "Pending" : "Active";
  }
  return next;
}
