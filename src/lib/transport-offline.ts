export type OfflineTransportPatch = {
  runDate?: string;
  runStatus?: string;
  pickedUpAt?: string;
  arrivedAt?: string;
  checkedInAt?: string;
  droppedOffAt?: string;
};

export type OfflineTransportAction = {
  id: string;
  routeId: string;
  patch: OfflineTransportPatch;
  queuedAt: string;
};

const KEY = "tcs-transport-offline-actions-v1";
const MAX_ACTIONS = 80;

function safeStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readOfflineTransportActions(): OfflineTransportAction[] {
  const storage = safeStorage();
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is OfflineTransportAction => Boolean(item) && typeof item === "object" && typeof item.routeId === "string" && typeof item.patch === "object")
      .slice(-MAX_ACTIONS);
  } catch {
    return [];
  }
}

export function queueOfflineTransportAction(routeId: string | number, patch: OfflineTransportPatch) {
  const storage = safeStorage();
  if (!storage) return;
  const safePatch: OfflineTransportPatch = {};
  if (typeof patch.runDate === "string") safePatch.runDate = patch.runDate;
  if (typeof patch.runStatus === "string") safePatch.runStatus = patch.runStatus;
  if (typeof patch.pickedUpAt === "string") safePatch.pickedUpAt = patch.pickedUpAt;
  if (typeof patch.arrivedAt === "string") safePatch.arrivedAt = patch.arrivedAt;
  if (typeof patch.checkedInAt === "string") safePatch.checkedInAt = patch.checkedInAt;
  if (typeof patch.droppedOffAt === "string") safePatch.droppedOffAt = patch.droppedOffAt;

  const current = readOfflineTransportActions();
  const action: OfflineTransportAction = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    routeId: String(routeId),
    patch: safePatch,
    queuedAt: new Date().toISOString(),
  };
  storage.setItem(KEY, JSON.stringify([...current, action].slice(-MAX_ACTIONS)));
}

export function clearOfflineTransportActions() {
  safeStorage()?.removeItem(KEY);
}
