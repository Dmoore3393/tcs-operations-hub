import type { ChildRecord, MedicalConsentStatus } from "@/lib/children";

export type EmergencyCardReadiness = {
  ready: boolean;
  status: "Ready" | "Needs Attention";
  missing: string[];
  consentStatus: MedicalConsentStatus;
};

function present(value?: string) {
  return Boolean(value?.trim());
}

export function childDisplayName(child: ChildRecord) {
  return `${child.firstName} ${child.lastName}`.trim();
}

export function emergencyCardReadiness(child: ChildRecord): EmergencyCardReadiness {
  const missing: string[] = [];
  const consentStatus = child.medicalConsentStatus ?? "Missing";

  if (consentStatus !== "On File") missing.push("Emergency medical consent");
  if (!present(child.medicalConsentSignedAt)) missing.push("Consent signed date");
  if (!present(child.medicalConsentVerifiedAt)) missing.push("Consent verification date");
  if (!present(child.phone)) missing.push("Parent / guardian phone");
  if (!present(child.emergencyContact1Name)) missing.push("Emergency contact");
  if (!present(child.emergencyContact1Phone)) missing.push("Emergency contact phone");
  if (!present(child.medicalProvider)) missing.push("Medical provider");
  if (!present(child.medicalProviderPhone)) missing.push("Medical provider phone");
  if (!present(child.allergies)) missing.push("Allergy status");

  return {
    ready: missing.length === 0,
    status: missing.length === 0 ? "Ready" : "Needs Attention",
    missing,
    consentStatus,
  };
}

export function hasCriticalMedicalAlert(child: ChildRecord) {
  const allergies = (child.allergies || "").trim().toLowerCase();
  const notes = (child.emergencyInstructions || child.medicalNotes || "").trim().toLowerCase();
  return Boolean(
    (allergies && !["none", "none reported", "n/a", "no known allergies"].includes(allergies)) ||
    (notes && !["none", "none reported", "n/a", "no current medical notes"].includes(notes)),
  );
}

export function normalizedPersonName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
