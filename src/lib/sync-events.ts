export type HubSyncState = "idle" | "loading" | "saving" | "saved" | "error" | "conflict";

export type HubSyncDetail = {
  state: HubSyncState;
  message?: string;
  key?: string;
};

export const HUB_SYNC_EVENT = "tcs-hub-sync";

export function announceHubSync(detail: HubSyncDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<HubSyncDetail>(HUB_SYNC_EVENT, { detail }));
}
