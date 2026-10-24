"use client";

import { useState, useSyncExternalStore } from "react";
import { isNativeDeviceAvailable } from "@/lib/native-device";
import { enableHubPushNotifications } from "@/lib/push-client";

function subscribe(callback: () => void) { window.addEventListener("tcs-native-ready", callback); return () => window.removeEventListener("tcs-native-ready", callback); }

export default function NativeAlertsButton({ accessToken }: { accessToken: string }) {
  const available = useSyncExternalStore(subscribe, isNativeDeviceAvailable, () => false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (!available) return null;
  return <section className="rounded-2xl border border-emerald-200 bg-white p-4 text-emerald-950"><p className="text-lg">Get iPhone alerts for authorized pickup, incident, and schedule updates. For urgent concerns, contact your childcare location directly.</p><button type="button" disabled={busy || !accessToken} className="mt-3 rounded-xl bg-emerald-800 px-4 py-3 font-bold text-white disabled:opacity-60" onClick={async () => {
    setBusy(true);
    try { const result = await enableHubPushNotifications(accessToken); setMessage(result.ok ? "iPhone alerts are enabled for this account." : result.reason); }
    catch { setMessage("We couldn’t enable alerts. Please try again."); }
    finally { setBusy(false); }
  }}>{busy ? "Enabling alerts…" : "Enable iPhone alerts"}</button>{message && <p role="status" className="mt-3">{message}</p>}</section>;
}
