export type HubSyncState = "idle" | "loading" | "saving" | "saved" | "error" | "conflict";

export type HubSyncDetail = {
  state: HubSyncState;
  message?: string;
  key?: string;
  operation?: "load" | "write";
};

export const HUB_SYNC_EVENT = "tcs-hub-sync";

export function announceHubSync(detail: HubSyncDetail) {
  if (typeof window === "undefined") return;
  if(detail.key) observed.set(detail.key,detail.state);
  if(detail.state==="saved" && detail.operation) lastSuccess=new Date().toISOString();
  window.dispatchEvent(new CustomEvent<HubSyncDetail>(HUB_SYNC_EVENT, { detail }));
}

let syncOwner="";
let lastSuccess="";
const observed=new Map<string,HubSyncState>();
export function setSyncEvidenceOwner(id:string){if(id!==syncOwner){syncOwner=id;lastSuccess="";observed.clear();}}
export function readSyncEvidence(){return{lastSuccess,pending:[...observed.values()].filter(s=>s==="loading"||s==="saving").length,errors:[...observed.values()].filter(s=>s==="error"||s==="conflict").length};}
