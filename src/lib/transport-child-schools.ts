import type { ChildRecord } from "./children";
import type { SchoolRecord } from "./hub-data";
import { normalizeLocation } from "./location-config";

export function transportCareLocation(value: string) {
  const key = normalizeLocation(value);
  return key === "All Locations" ? value : key;
}

export function transportChildKey(child: Pick<ChildRecord, "id" | "legacyId">) {
  return child.legacyId || (Number.isSafeInteger(child.id) && child.id > 0 ? String(child.id) : "");
}

export function childSchool(child: Pick<ChildRecord, "schoolAgeSupport">) {
  return child.schoolAgeSupport?.schoolName?.trim() || "";
}

/** School attendance is separate from the care age group used for ratios. */
export function schoolProfileApplies(child: Pick<ChildRecord, "ageGroup" | "schoolAgeSupport">) {
  const grade = child.schoolAgeSupport?.grade?.trim().toLowerCase() || "";
  return Boolean(childSchool(child)) || child.ageGroup === "School Age" ||
    /^(tk|transitional kindergarten|transitional kinder|k|kindergarten|[1-9]|1[0-2])$/.test(grade);
}

export function childSchoolLabel(child: Pick<ChildRecord, "ageGroup" | "schoolAgeSupport">) {
  if (childSchool(child)) return childSchool(child);
  if (schoolProfileApplies(child)) return "School not recorded";
  if (child.ageGroup === "Infant" || child.ageGroup === "Toddler") return "Not attending school";
  return "Not attending school / not recorded";
}

/** Preserve schools already saved on profiles even when the directory is incomplete. */
export function transportSchoolDirectory(schools: SchoolRecord[], children: ChildRecord[]): SchoolRecord[] {
  const names = new Set(schools.map(school => school.school.trim().toLowerCase()));
  const extras: SchoolRecord[] = [];
  for (const child of children) {
    const school = childSchool(child);
    if (!school || names.has(school.toLowerCase())) continue;
    names.add(school.toLowerCase());
    extras.push({ id: -extras.length - 1, school, area: "", district: "", address: "", phone: "", startTime: "", dismissal: "", minimumDay: "", minimumDayName: "", status: "Active", notes: "Saved on a child profile." });
  }
  return [...schools, ...extras];
}
