"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import type { HubNotification } from "@/lib/notifications";
import { Bell, BellRing, CheckCheck, Smartphone, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type NotificationPayload = {
  notifications: HubNotification[];
  unreadCount: number;
};

function timeAgo(value: string) {
  const stamp = new Date(value).getTime();
  if (!Number.isFinite(stamp)) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - stamp) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isStandaloneApp() {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || Boolean(nav.standalone);
}

export default function NotificationBell() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<HubNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const initialized = useRef(false);
  const knownIds = useRef(new Set<string>());

  const recent = useMemo(() => notifications.slice(0, 6), [notifications]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPermission("Notification" in window ? Notification.permission : "unsupported");
  }, []);

  useEffect(() => {
    if (!session?.access_token) return;
    let active = true;

    async function load() {
      try {
        const response = await fetch("/api/notifications", {
          headers: { Authorization: `Bearer ${session!.access_token}` },
          cache: "no-store",
        });
        if (!response.ok || !active) return;
        const payload = await response.json() as NotificationPayload;
        const next = Array.isArray(payload.notifications) ? payload.notifications : [];
        setNotifications(next);
        setUnreadCount(Number(payload.unreadCount || 0));

        if (!initialized.current) {
          next.forEach((item) => knownIds.current.add(item.id));
          initialized.current = true;
          return;
        }

        const newUnread = next.filter((item) => !item.readAt && !knownIds.current.has(item.id));
        next.forEach((item) => knownIds.current.add(item.id));

        if (newUnread.length && "Notification" in window && Notification.permission === "granted") {
          const registration = await navigator.serviceWorker?.ready;
          const newest = newUnread[0];
          if (registration) {
            await registration.showNotification(newest.title, {
              body: newest.body,
              icon: "/app-icon-192.png",
              badge: "/app-icon-192.png",
              tag: newest.eventKey || newest.id,
              data: { href: newest.href },
            });
          }
        }
      } catch {
        // Notification polling should never interrupt Hub workflows.
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 60000);
    const visibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", visibility);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", visibility);
    };
  }, [session?.access_token]);

  async function markRead(item: HubNotification) {
    if (!session?.access_token || item.readAt) return;
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ readIds: [item.id] }),
      });
      if (!response.ok) return;
      const payload = await response.json() as NotificationPayload;
      setNotifications(payload.notifications ?? []);
      setUnreadCount(payload.unreadCount ?? 0);
    } catch {
      // Keep navigation usable if the read receipt cannot save.
    }
  }

  async function markAllRead() {
    if (!session?.access_token) return;
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ markAllRead: true }),
      });
      if (!response.ok) return;
      const payload = await response.json() as NotificationPayload;
      setNotifications(payload.notifications ?? []);
      setUnreadCount(payload.unreadCount ?? 0);
    } catch {
      // No-op.
    }
  }

  async function enableAlerts() {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      const registration = await navigator.serviceWorker?.ready;
      await registration?.showNotification("The Hub notifications are on", {
        body: "Transportation, emergency, Tour Board, and schedule alerts can now appear while The Hub is running.",
        icon: "/app-icon-192.png",
        badge: "/app-icon-192.png",
        tag: "tcs-notifications-enabled",
        data: { href: "/notifications" },
      });
    }
  }

  return <div className="relative">
    <button
      type="button"
      onClick={() => setOpen((value) => !value)}
      className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
      aria-label="Notifications"
    >
      {unreadCount > 0 ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
      {unreadCount > 0 && <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
    </button>

    {open && <div className="absolute right-0 top-14 z-[80] w-[min(92vw,390px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div><p className="text-sm font-black text-slate-950">Notifications</p><p className="text-[11px] font-semibold text-slate-500">{unreadCount} unread</p></div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && <button onClick={() => void markAllRead()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-50" title="Mark all read"><CheckCheck className="h-4 w-4" /></button>}
          <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-50"><X className="h-4 w-4" /></button>
        </div>
      </div>

      {permission === "default" && <div className="border-b border-amber-100 bg-amber-50 px-4 py-3">
        <button onClick={() => void enableAlerts()} className="flex w-full items-center gap-3 text-left">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-amber-100 text-amber-800"><Smartphone className="h-4 w-4" /></span>
          <span><strong className="block text-xs text-amber-950">Enable phone alerts</strong><small className="mt-0.5 block text-[10px] leading-4 text-amber-800">{isStandaloneApp() ? "Allow The Hub to show system notifications." : "For iPhone, add The Hub to your Home Screen first, then enable alerts from the app."}</small></span>
        </button>
      </div>}

      <div className="max-h-[390px] overflow-y-auto">
        {recent.length === 0 ? <div className="px-5 py-10 text-center"><Bell className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-sm font-black text-slate-700">No notifications yet</p><p className="mt-1 text-xs text-slate-500">Important Hub updates will appear here.</p></div> :
          recent.map((item) => <Link
            key={item.id}
            href={item.href}
            onClick={() => { void markRead(item); setOpen(false); }}
            className={`block border-b border-slate-100 px-4 py-3 transition hover:bg-slate-50 ${item.readAt ? "bg-white" : "bg-blue-50/45"}`}
          >
            <div className="flex items-start gap-3">
              <span className={`mt-1 h-2.5 w-2.5 flex-none rounded-full ${item.severity === "urgent" ? "bg-red-500" : item.severity === "attention" ? "bg-amber-500" : "bg-blue-500"}`} />
              <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><strong className="text-xs text-slate-900">{item.title}</strong><span className="flex-none text-[9px] font-semibold text-slate-400">{timeAgo(item.createdAt)}</span></div><p className="mt-1 text-[11px] leading-4 text-slate-600">{item.body}</p>{item.location && item.location !== "All Locations" && <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-600">{item.location}</span>}</div>
            </div>
          </Link>)}
      </div>

      <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-slate-100 bg-slate-50 px-4 py-3 text-center text-xs font-black text-slate-700">Open Notification Center</Link>
    </div>}
  </div>;
}
