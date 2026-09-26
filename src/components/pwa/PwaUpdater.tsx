"use client";

import { useEffect } from "react";

const VERSION_KEY = "tcs-hub-active-deployment";

export default function PwaUpdater({ currentVersion }: { currentVersion: string }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => {
      void registration.update();
    }).catch(() => {
      // The website remains fully usable if service-worker registration is unavailable.
    });

    let cancelled = false;
    let reloading = false;

    async function checkVersion() {
      if (reloading) return;
      try {
        const response = await fetch("/api/app-version", {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!response.ok || cancelled) return;
        const payload = await response.json() as { version?: string };
        const serverVersion = payload.version?.trim();
        if (!serverVersion) return;

        // Compare the deployment baked into the currently running app shell
        // against production. This catches iOS/PWA restored snapshots that can
        // otherwise keep old JavaScript/CSS after a new deployment.
        if (currentVersion && currentVersion !== "development" && currentVersion !== serverVersion) {
          reloading = true;
          sessionStorage.setItem(VERSION_KEY, serverVersion);
          window.location.reload();
          return;
        }

        const active = sessionStorage.getItem(VERSION_KEY);
        if (active && active !== serverVersion) {
          reloading = true;
          sessionStorage.setItem(VERSION_KEY, serverVersion);
          window.location.reload();
          return;
        }

        sessionStorage.setItem(VERSION_KEY, serverVersion);
      } catch {
        // Do not interrupt staff workflows because an update check failed.
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === "visible") void checkVersion();
    };
    const handlePageShow = () => {
      void checkVersion();
    };

    void checkVersion();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pageshow", handlePageShow);
    const timer = window.setInterval(() => void checkVersion(), 60 * 1000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pageshow", handlePageShow);
      window.clearInterval(timer);
    };
  }, [currentVersion]);

  return null;
}
