/** Import recovery stays in this signed-in user's browser tab, never localStorage. */
const PREFIX = "tcs-brightwheel-review-v1:";
const MAX_AGE_MS = 8 * 60 * 60 * 1000;
export type ImportRowSetting = {
  include: boolean;
  location: string;
  funding: string;
  fundingLocation: string;
  fundingLocationChanged?: boolean;
  matchId: string;
};
export type ImportDraft = {
  fileName: string;
  csvText: string;
  defaultLocation: string;
  defaultFunding: string;
  activeOnly: boolean;
  rowSettings: Record<string, ImportRowSetting>;
};
const keyFor = (userId: string, organizationId: string) => `${PREFIX}${organizationId}:${userId}`;
export function readImportDraft(storage: Pick<Storage, "getItem" | "removeItem">, userId: string, organizationId: string, now = Date.now()): ImportDraft | null {
  const key = keyFor(userId, organizationId);
  try {
    const saved = JSON.parse(storage.getItem(key) || "null");
    if (!saved) return null;
    const draft = saved.draft;
    if (!Number.isFinite(saved.savedAt) || now - saved.savedAt > MAX_AGE_MS || saved.savedAt > now || !draft || typeof draft.csvText !== "string" || !draft.csvText || draft.csvText.length > 5_000_000) {
      storage.removeItem(key); return null;
    }
    const text = (value: unknown) => typeof value === "string" ? value : "";
    const rowSettings: Record<string, ImportRowSetting> = {};
    for (const [rowKey, value] of Object.entries(draft.rowSettings || {}).slice(0, 1000)) {
      if (!/^bw-row-\d+$/.test(rowKey) || !value || typeof value !== "object") continue;
      const row = value as Record<string, unknown>;
      if (typeof row.include !== "boolean") continue;
      rowSettings[rowKey] = { include: row.include, location: text(row.location), funding: text(row.funding), fundingLocation: text(row.fundingLocation), fundingLocationChanged: row.fundingLocationChanged === true, matchId: text(row.matchId) };
    }
    return {fileName:text(draft.fileName),csvText:draft.csvText,defaultLocation:text(draft.defaultLocation),defaultFunding:text(draft.defaultFunding),activeOnly:draft.activeOnly !== false,rowSettings};
  } catch { return null; }
}
export function saveImportDraft(storage: Pick<Storage, "setItem" | "removeItem">, userId: string, organizationId: string, draft: ImportDraft | null, now = Date.now()) {
  try {
    const key = keyFor(userId, organizationId);
    if (!draft?.csvText) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify({savedAt:now,draft}));
    return true;
  } catch { return false; }
}
export function clearImportDrafts(storage: Pick<Storage, "length" | "key" | "removeItem">) {
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index);
    if (key?.startsWith(PREFIX)) storage.removeItem(key);
  }
}
/** A refreshed preview must retain intentional exclusions and review choices. */
export function reconcileImportReview(rows: Array<{rowKey:string;include:boolean;selectedLocation:string;selectedFunding:string;selectedFundingLocation:string}>, current: Record<string, ImportRowSetting>) {
  return Object.fromEntries(rows.map(row => {
    const previous = current[row.rowKey];
    const defaults: ImportRowSetting = {include:row.include,location:row.selectedLocation,funding:row.selectedFunding,fundingLocation:row.selectedFundingLocation,matchId:""};
    return [row.rowKey, previous ? {...previous,include:row.include && previous.include,fundingLocation:previous.fundingLocationChanged ? previous.fundingLocation : row.selectedFundingLocation} : defaults];
  }));
}
