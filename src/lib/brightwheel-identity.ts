/** Import identity decisions use only records already authorized for this staff member. */
export type ImportCandidate = { id: string; label: string; dateOfBirth: string; canUpdate: boolean };
export type ImportIdentity = { matchType: "new" | "update" | "review" | "duplicate"; existingRowId: string; candidates: ImportCandidate[]; allowNew: boolean; identityWarning: string; };
export type IdentitySource = { firstName: string; lastName: string; dateOfBirth: string; brightwheelId: string; studentId: string };
type Row = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
export const normalizedChildName = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function normalizedBirthDate(value: unknown) {
  const source = text(value);
  const iso = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  const us = source.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const parts = iso ? [iso[1], iso[2], iso[3]] : us ? [us[3], us[1], us[2]] : null;
  if (!parts) return "";
  const result = `${parts[0]}-${parts[1].padStart(2,"0")}-${parts[2].padStart(2,"0")}`;
  const parsed = new Date(`${result}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10) === result ? result : "";
}
export function importedEnrollmentStatus(value: string): "Active" | "Pending" | "Archived" | "Needs review" {
  const source = value.trim().toLowerCase();
  if (!source) return "Active"; // Older Brightwheel exports omit this column.
  if (/\b(inactive|withdrawn|withdraw|graduated|graduat|archived|archive|former|unenrolled|disenrolled)\b|not\s+(active|enrolled)/.test(source)) return "Archived";
  if (/\b(pending|prospect|waitlist|waitlisted|future|wait)\b/.test(source)) return "Pending";
  if (/\b(active|enrolled|current)\b/.test(source)) return "Active";
  return "Needs review";
}
export function childIdentity(row: Row) {
  const record = object(row.record_data), bw = object(record.brightwheel);
  return { id: text(row.id), firstName: text(row.first_name) || text(record.firstName), lastName: text(row.last_name) || text(record.lastName), dateOfBirth: normalizedBirthDate(row.date_of_birth) || normalizedBirthDate(record.dateOfBirth), brightwheelId: text(bw.id) || text(record.brightwheelId), studentId: text(bw.studentId), legacyId: text(row.legacy_id) };
}
export function resolveImportIdentity(source: IdentitySource, rows: Row[], selected = ""): ImportIdentity {
  const identities = rows.map(childIdentity);
  const fullName = (value: { firstName: string; lastName: string }) => `${normalizedChildName(value.firstName)}|${normalizedChildName(value.lastName)}`;
  const sameName = identities.filter(row => fullName(row) === fullName(source));
  const byBw = source.brightwheelId ? identities.filter(row => row.brightwheelId === source.brightwheelId || row.legacyId === `brightwheel:${source.brightwheelId}`) : [];
  const byStudent = source.studentId ? identities.filter(row => row.studentId === source.studentId) : [];
  const exact = sameName.filter(row => Boolean(source.dateOfBirth && row.dateOfBirth === source.dateOfBirth));
  const definite = byBw.length ? byBw : byStudent.length ? byStudent : exact;
  const base: ImportIdentity = { matchType: "new", existingRowId: "", candidates: [], allowNew: false, identityWarning: "" };
  const blocked = (warning: string): ImportIdentity => ({ ...base, matchType: "review", identityWarning: warning });
  if (definite.length > 1) return blocked("More than one existing profile matches. Review the Children Center before importing this child.");
  if (definite.length === 1) {
    const row = definite[0];
    if ((source.brightwheelId && row.brightwheelId && row.brightwheelId !== source.brightwheelId) || (source.dateOfBirth && row.dateOfBirth && row.dateOfBirth !== source.dateOfBirth) || fullName(row) !== fullName(source)) return blocked("The existing identifier, name or birthday conflicts. Correct the CSV or existing profile and refresh the preview.");
    if (selected && selected !== row.id) return blocked("This child already matches an existing profile. Refresh the preview.");
    return { ...base, matchType: "update", existingRowId: row.id };
  }
  if (!sameName.length) {
    if (selected && selected !== "new") return blocked("That existing profile is not a valid match. Refresh the preview.");
    return base;
  }
  const candidates = sameName.map(row => ({ id: row.id, label: `${row.firstName} ${row.lastName}`, dateOfBirth: row.dateOfBirth, canUpdate: (!row.dateOfBirth || row.dateOfBirth === source.dateOfBirth) && (!source.brightwheelId || !row.brightwheelId || source.brightwheelId === row.brightwheelId) }));
  if (selected === "new") return { ...base, allowNew: true, candidates };
  if (candidates.some(row => row.id === selected && row.canUpdate)) return { ...base, matchType: "update", existingRowId: selected, candidates, allowNew: true };
  return { ...base, matchType: "review", candidates, allowNew: true, identityWarning: "A child with this name already exists. Choose a compatible profile or confirm this is a separate child." };
}
export function repeatedImportRows(sources: IdentitySource[], targets: string[] = []) {
  const groups = new Map<string, number[]>();
  sources.forEach((source,index) => {
    const keys = [source.brightwheelId && `bw:${source.brightwheelId}`, source.studentId && `student:${source.studentId}`, source.firstName && source.lastName && source.dateOfBirth && `name:${normalizedChildName(source.firstName)}|${normalizedChildName(source.lastName)}|${source.dateOfBirth}`, targets[index] && `target:${targets[index]}`].filter(Boolean) as string[];
    for (const key of keys) groups.set(key,[...(groups.get(key) || []),index]);
  });
  return new Set([...groups.values()].filter(group=>group.length>1).flat());
}
export function importIdentityReady(row: { matchType: ImportIdentity["matchType"]; candidates: ImportCandidate[]; allowNew: boolean; blocked: boolean }, selected = "") {
  if (row.blocked || row.matchType === "duplicate") return false;
  if (row.matchType !== "review") return true;
  return (selected === "new" && row.allowNew) || row.candidates.some(candidate => candidate.id === selected && candidate.canUpdate);
}
