"use client";

import { useState, useSyncExternalStore } from "react";
import { Camera } from "lucide-react";
import { isNativeDeviceAvailable, takeNativePhoto } from "@/lib/native-device";

function subscribe(callback: () => void) {
  window.addEventListener("tcs-native-ready", callback);
  return () => window.removeEventListener("tcs-native-ready", callback);
}

export default function NativePhotoButton({ onPhoto, onError }: { onPhoto: (file: File) => void; onError: (message: string) => void }) {
  const available = useSyncExternalStore(subscribe, isNativeDeviceAvailable, () => false);
  const [busy, setBusy] = useState(false);
  if (!available) return null;
  return <button type="button" disabled={busy} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-base font-bold text-white disabled:opacity-60" onClick={async () => {
    setBusy(true);
    try { onPhoto(await takeNativePhoto()); }
    catch (error) { onError(error instanceof Error ? error.message : "Could not open the camera."); }
    finally { setBusy(false); }
  }}><Camera aria-hidden="true" className="h-5 w-5" />{busy ? "Opening camera…" : "Take a photo"}</button>;
}
