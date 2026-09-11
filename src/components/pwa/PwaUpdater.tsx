"use client";

import { useEffect } from "react";

const VERSION_KEY = "tcs-hub-active-deployment";

export default function PwaUpdater() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => {
      void registration.update();
    }).catch(() => {
      // The website remains fully usable if service-worker registration is unavailable.
    });

    let cancelled = false;

    async function checkVersion() {
      try {
        const response = await fetch("/api/app-version", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const payload = await response.json() as { version?: string };
        const version = payload.version?.trim();
        if (!version) return;

        const active = sessionStorage.getItem(VERSION_KEY);
        if (!active) {
          sessionStorage.setItem(VERSION_KEY, version);
          return;
        }

        if (active !== version) {
          sessionStorage.setItem(VERSION_KEY, version);
          window.location.reload();
        }
      } catch {
        // Do not interrupt staff workflows because an update check failed.
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === "visible") void checkVersion();
    };

    void checkVersion();
    document.addEventListener("visibilitychange", handleVisibility);
    const timer = window.setInterval(() => void checkVersion(), 5 * 60 * 1000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
