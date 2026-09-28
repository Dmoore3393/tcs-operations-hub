"use client";

import { useEffect } from "react";

const VERSION_KEY = "tcs-hub-active-deployment";
const RELOAD_GUARD_KEY = "tcs-hub-reload-guard";

const CURRENT_GIT_SHA =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.trim() || "";
const CURRENT_DEPLOYMENT_URL =
  process.env.NEXT_PUBLIC_VERCEL_URL?.trim() || "";

export default function PwaUpdater() {
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

        const payload = await response.json() as {
          version?: string;
          gitSha?: string;
          deploymentUrl?: string;
        };

        const serverGitSha = payload.gitSha?.trim() || "";
        const serverDeploymentUrl = payload.deploymentUrl?.trim() || "";
        const serverVersion =
          serverGitSha ||
          serverDeploymentUrl ||
          payload.version?.trim() ||
          "";

        if (!serverVersion) return;

        // Compare like-for-like values only. A Git SHA must never be compared
        // with a deployment URL, because that creates a permanent reload loop.
        const currentVersion =
          (serverGitSha && CURRENT_GIT_SHA ? CURRENT_GIT_SHA : "") ||
          (serverDeploymentUrl && CURRENT_DEPLOYMENT_URL ? CURRENT_DEPLOYMENT_URL : "");

        const activeVersion = sessionStorage.getItem(VERSION_KEY);
        const shouldRefresh =
          Boolean(currentVersion && currentVersion !== serverVersion) ||
          Boolean(activeVersion && activeVersion !== serverVersion);

        if (shouldRefresh) {
          // iOS/PWA snapshots can occasionally restore old JavaScript even
          // after a hard reload. Reload at most once for each server version,
          // then allow the app to continue instead of trapping staff on the
          // loading screen forever.
          const guardedVersion = sessionStorage.getItem(RELOAD_GUARD_KEY);
          sessionStorage.setItem(VERSION_KEY, serverVersion);

          if (guardedVersion === serverVersion) {
            return;
          }

          reloading = true;
          sessionStorage.setItem(RELOAD_GUARD_KEY, serverVersion);
          window.location.reload();
          return;
        }

        sessionStorage.setItem(VERSION_KEY, serverVersion);
        sessionStorage.removeItem(RELOAD_GUARD_KEY);
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
  }, []);

  return null;
}
