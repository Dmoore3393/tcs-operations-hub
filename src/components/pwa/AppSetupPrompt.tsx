"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { enableHubPushNotifications, isStandaloneHubApp } from "@/lib/push-client";
import { BellRing, CheckCircle2, Download, MapPin, Smartphone, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const STORAGE_KEY = "tcs-hub-app-setup-v1";

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function AppSetupPrompt() {
  const { session, profile } = useAuth();
  const { location } = useHubLocation();
  const [open, setOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const completed = window.localStorage.getItem(STORAGE_KEY) === "complete";
    const standalone = isStandaloneHubApp();
    setInstalled(standalone);
    setPermission("Notification" in window ? Notification.permission : "unsupported");

    const mobile = window.matchMedia("(max-width: 900px)").matches;
    if (!completed && mobile) {
      const timer = window.setTimeout(() => setOpen(true), 900);
      return () => window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    function capture(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);

  const stepsComplete = useMemo(
    () => installed && permission === "granted" && Boolean(profile) && Boolean(location),
    [installed, location, permission, profile],
  );

  useEffect(() => {
    if (stepsComplete && typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "complete");
    }
  }, [stepsComplete]);

  async function install() {
    setMessage("");
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstalled(true);
        setMessage("The Hub was added to this device.");
      }
      return;
    }
    if (isIos()) {
      setMessage("On iPhone/iPad: tap Share, choose Add to Home Screen, then open The Hub from the new icon.");
      return;
    }
    setMessage("Use your browser menu and choose Install app or Add to Home screen.");
  }

  async function enableAlerts() {
    if (!session?.access_token) return;
    setMessage("");
    const result = await enableHubPushNotifications(session.access_token);
    setPermission(result.permission === "unsupported" ? "unsupported" : result.permission);
    setMessage(result.ok ? "Background notifications are registered on this device." : result.reason);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-end bg-slate-950/45 p-3 backdrop-blur-sm sm:items-center sm:justify-center">
      <section className="w-full max-w-xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 bg-gradient-to-br from-[#214d31] to-[#102c20] px-5 py-5 text-white">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-200">The Hub App Setup</p>
            <h2 className="mt-1 text-2xl font-black">Set up this device</h2>
            <p className="mt-1 text-xs font-semibold leading-5 text-emerald-50/80">One quick setup gives this phone app-style navigation, background alerts, and the correct TCS access.</p>
          </div>
          <button onClick={() => setOpen(false)} className="rounded-xl bg-white/10 p-2"><X className="h-5 w-5" /></button>
        </header>

        <div className="space-y-3 p-5">
          <SetupStep
            icon={<Download className="h-5 w-5" />}
            title="Install The Hub"
            helper={installed ? "Installed as an app on this device." : "Add The Hub to the Home Screen for the best mobile experience."}
            complete={installed}
            action={!installed ? <button onClick={() => void install()} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">Install</button> : null}
          />
          <SetupStep
            icon={<BellRing className="h-5 w-5" />}
            title="Enable background alerts"
            helper={permission === "granted" ? "Device notifications are allowed." : "Transportation, emergency, Tour Board, and schedule alerts can reach this phone."}
            complete={permission === "granted"}
            action={permission !== "granted" && permission !== "unsupported" ? <button onClick={() => void enableAlerts()} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white">Enable</button> : null}
          />
          <SetupStep
            icon={<MapPin className="h-5 w-5" />}
            title="Confirm work access"
            helper={profile ? `${profile.role} • ${location}` : "Loading your role and assigned location…"}
            complete={Boolean(profile && location)}
          />
          <SetupStep
            icon={<Smartphone className="h-5 w-5" />}
            title="Ready for daily use"
            helper="Use the bottom app bar for Home, Transportation, Emergency, Alerts, and More."
            complete={stepsComplete}
          />

          {message && <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-900">{message}</div>}

          <div className="flex items-center justify-between gap-3 pt-1">
            <button onClick={() => { window.localStorage.setItem(STORAGE_KEY, "complete"); setOpen(false); }} className="text-xs font-black text-slate-500">Not now</button>
            <button onClick={() => setOpen(false)} className="rounded-xl bg-[#214d31] px-4 py-2.5 text-sm font-black text-white">{stepsComplete ? "Setup Complete" : "Continue in The Hub"}</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function SetupStep({ icon, title, helper, complete, action }: { icon: React.ReactNode; title: string; helper: string; complete: boolean; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3">
      <span className={`grid h-11 w-11 flex-none place-items-center rounded-2xl ${complete ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{complete ? <CheckCircle2 className="h-5 w-5" /> : icon}</span>
      <div className="min-w-0 flex-1"><strong className="block text-sm text-slate-950">{title}</strong><p className="mt-0.5 text-[11px] leading-4 text-slate-500">{helper}</p></div>
      {action}
    </div>
  );
}
