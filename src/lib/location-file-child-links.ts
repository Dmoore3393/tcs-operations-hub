/** Compatible with the numeric screen ID returned by /api/children. This is a
 * navigation alias only; location-file writes continue to require the DB UUID. */
export function childScreenLinkId(legacyId: string, storedId: unknown): string {
  if (typeof storedId === "number" && Number.isFinite(storedId)) return String(storedId);
  const numeric = Number(legacyId);
  if (Number.isSafeInteger(numeric) && numeric > 0) return String(numeric);
  let hash = 2166136261;
  for (let index = 0; index < legacyId.length; index += 1) {
    hash ^= legacyId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return String(Math.abs(hash >>> 0) || 1);
}

type LinkedChild = { id: string; legacy_id?: string | null; ui_id?: string | null };
/** Resolve only within the caller's authorized results. Never match by name or
 * pick the first row when a historical numeric alias is ambiguous. */
export function resolveLocationFileChild<T extends LinkedChild>(children: readonly T[], requested: string): T | null {
  const key = requested.trim();
  if (!key) return null;
  const matches = children.filter(child => child.id === key || child.legacy_id === key || child.ui_id === key);
  return matches.length === 1 ? matches[0] : null;
}

/** Avoid conflicting background/text utility classes on primary actions. */
export const locationFilePrimaryButton = "min-h-11 rounded-xl border border-emerald-800 bg-emerald-800 px-4 py-2 font-bold text-white hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";
