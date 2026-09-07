import type { ChildRecord } from "@/lib/children";
import type { FamilyRecord } from "@/lib/hub-data";

function digits(value = "") {
  return value.replace(/\D/g, "");
}

function shortLocationName(location: string) {
  if (/halcom/i.test(location)) return "Halcom";
  if (/21st/i.test(location)) return "21st Street";
  if (/division|school age center/i.test(location)) return "Division";
  if (/33rd|cornejo/i.test(location)) return "33rd Street";
  if (/42nd|lara/i.test(location)) return "42nd Street";
  if (/tehachapi/i.test(location)) return "Tehachapi";
  return location;
}

export function familyKeyForChild(child: ChildRecord) {
  if (child.familyId) return `family-id:${child.familyId}`;
  const phone = digits(child.phone);
  if (phone) return `phone:${phone}`;
  const guardian = child.primaryGuardian.trim().toLowerCase();
  if (guardian) return `guardian:${guardian}`;
  return `child:${child.id}`;
}

export function deriveFamiliesFromChildren(children: ChildRecord[]): FamilyRecord[] {
  const groups = new Map<string, ChildRecord[]>();
  children.forEach((child) => {
    const key = familyKeyForChild(child);
    groups.set(key, [...(groups.get(key) ?? []), child]);
  });

  return [...groups.entries()].map(([key, group], index) => {
    const primary = group[0];
    const locations = [...new Set(group.map((child) => shortLocationName(child.location)).filter(Boolean))];
    const transportation = group
      .map((child) => child.transportation)
      .find((value) => value && !/^(none|no transportation)$/i.test(value)) || "None";
    const statuses = new Set(group.map((child) => child.enrollmentStatus));
    const status: FamilyRecord["status"] = statuses.has("Active")
      ? "Active"
      : statuses.has("Pending")
        ? "Enrollment Pending"
        : "Inactive";
    const subsidyValue = primary.subsidy;
    const subsidy: FamilyRecord["subsidy"] = subsidyValue === "CCRC" || subsidyValue === "DCFS" || subsidyValue === "CCCC"
      ? subsidyValue
      : "Private Pay";

    return {
      id: primary.familyId ?? Math.abs([...key].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261)) || index + 1,
      familyName: primary.familyName?.trim() || `${primary.lastName || "Family"} Family`,
      primaryGuardian: primary.primaryGuardian,
      secondaryGuardian: primary.secondaryGuardian ?? "",
      phone: primary.phone,
      email: primary.guardianEmail ?? "",
      children: group.map((child) => `${child.firstName} ${child.lastName}`.trim()).sort(),
      location: locations.join(" + "),
      subsidy,
      balance: 0,
      status,
      transportation,
    };
  }).sort((a, b) => a.familyName.localeCompare(b.familyName));
}

export function familyChildren(children: ChildRecord[], family: FamilyRecord) {
  return children.filter((child) => {
    if (child.familyId && child.familyId === family.id) return true;
    const phone = digits(child.phone);
    if (phone && phone === digits(family.phone)) return true;
    return Boolean(child.primaryGuardian.trim()) && child.primaryGuardian.trim().toLowerCase() === family.primaryGuardian.trim().toLowerCase();
  });
}
