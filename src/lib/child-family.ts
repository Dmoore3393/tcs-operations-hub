import type { ChildFormState, ChildRecord } from "@/lib/children";
import type { FamilyRecord } from "@/lib/hub-data";

export type ChildFamilyMode = "keep" | "existing" | "new";

/** The selected child's form, never a sibling's family summary, owns its contacts. */
export function childFamilyFields(form: ChildFormState, mode: ChildFamilyMode, current: ChildRecord | null, selected: FamilyRecord | undefined, makeId: () => number) {
  if (mode === "keep" && !current?.id) throw new Error("Choose a family for the new child.");
  if (mode === "existing" && !selected) throw new Error("Choose a family to link or create a separate family.");
  const familyId = mode === "existing" ? selected!.id : mode === "keep" ? current?.familyId : makeId();
  if (familyId !== undefined && (!Number.isSafeInteger(familyId) || familyId <= 0)) throw new Error("Reopen the child record to verify its family link.");
  return {
    familyId,
    familyName: form.familyName.trim() || `${form.lastName.trim()} Family`,
    primaryGuardian: form.primaryGuardian.trim(),
    secondaryGuardian: form.secondaryGuardian.trim(),
    secondaryGuardianPhone: form.secondaryGuardianPhone.trim(),
    secondaryGuardianEmail: form.secondaryGuardianEmail.trim(),
    phone: form.phone.trim(),
    guardianEmail: form.guardianEmail.trim(),
    subsidy: form.subsidy,
  };
}

export function newChildFamilyId(taken: readonly number[]) {
  const used = new Set(taken);
  for (let attempt = 0; attempt < 20; attempt++) {
    const values = crypto.getRandomValues(new Uint32Array(2));
    const id = (values[0] & 0x1fffff) * 4294967296 + values[1];
    if (id > 0 && !used.has(id)) return id;
  }
  throw new Error("Could not prepare a separate family. Try again.");
}

const contactText = (value?: string) => (value || "").trim().toLowerCase().replace(/\s+/g, " ");
export function familyContactsDiffer(members: ChildRecord[]) {
  return new Set(members.map(child => JSON.stringify([
    child.primaryGuardian, child.secondaryGuardian, child.phone, child.guardianEmail,
    child.secondaryGuardianPhone, child.secondaryGuardianEmail,
  ].map(contactText)))).size > 1;
}

export function assertFamilyContactEditScope(members: ChildRecord[], original: FamilyRecord, edited: FamilyRecord) {
  const changed = (["primaryGuardian", "secondaryGuardian", "phone", "email"] as const).some(key => edited[key] !== original[key]);
  if (changed && familyContactsDiffer(members)) throw new Error("These children have different parent contacts. Use Edit this child's parents to correct only the intended child.");
}
