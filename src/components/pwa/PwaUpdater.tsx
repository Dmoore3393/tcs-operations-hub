"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";

const VERSION_KEY = "tcs-hub-active-deployment";

const CURRENT_GIT_SHA =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.trim() || "";
const CURRENT_DEPLOYMENT_URL =
  process.env.NEXT_PUBLIC_VERCEL_URL?.trim() || "";

export default function PwaUpdater() {
  const [availableVersion, setAvailableVersion] = useState("");
  const dismissedVersion = useRef("");
  useEffect(() => {
    // Packaged screens update through a new iOS build; reloading cannot install
    // newer web code. Keep the existing updater for the website and live shell.
    if (Capacitor.isNativePlatform()) return;
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => {
      void registration.update();
    }).catch(() => {
      // The website remains fully usable if service-worker registration is unavailable.
    });

    let cancelled = false;

    async function checkVersion() {
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
        if (cancelled) return;
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
          // A deployment must never discard an import preview or unsaved form.
          if (dismissedVersion.current !== serverVersion) setAvailableVersion(serverVersion);
          return;
        }

        sessionStorage.setItem(VERSION_KEY, serverVersion);
        setAvailableVersion("");
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

  if (!availableVersion) return null;
  return <aside role="status" className="fixed bottom-24 left-4 right-4 z-[100] mx-auto max-w-xl rounded-2xl border border-emerald-300 bg-white p-4 text-base text-slate-950 shadow-xl">
    <p className="font-bold">A Hub update is available</p>
    <p>Save your work or finish your import before reloading.</p>
    <div className="mt-3 flex gap-3">
      <button className="min-h-11 rounded-xl bg-emerald-800 px-4 font-bold text-white" onClick={() => { sessionStorage.setItem(VERSION_KEY, availableVersion); window.location.reload(); }}>Reload now</button>
      <button className="min-h-11 rounded-xl border border-slate-400 px-4 font-bold" onClick={() => { dismissedVersion.current = availableVersion; setAvailableVersion(""); }}>Later</button>
    </div>
  </aside>;
}
