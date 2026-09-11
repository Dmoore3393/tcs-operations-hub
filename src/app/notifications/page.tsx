"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { enableHubPushNotifications, isStandaloneHubApp } from "@/lib/push-client";
import {
  defaultNotificationPreferences,
  type HubNotification,
  type HubNotificationCategory,
  type HubNotificationPreferences,
} from "@/lib/notifications";
import {
  AlertTriangle,
  Bell,
  BellRing,
  Bus,
  CalendarDays,
  CheckCheck,
  HeartPulse,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Smartphone,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Payload = {
  notifications: HubNotification[];
  preferences: HubNotificationPreferences;
  unreadCount: number;
};

type RegisteredDevice = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string;
  expirationTime: number | null;
};

const filters: Array<{ key: "all" | HubNotificationCategory; label: string }> = [
  { key: "all", label: "All" },
  { key: "transportation", label: "Transportation" },
  { key: "emergency", label: "Emergency" },
  { key: "tour", label: "Tour Board" },
  { key: "schedule", label: "Schedule" },
];

function categoryIcon(category: HubNotificationCategory) {
  if (category === "transportation") return <Bus className="h-5 w-5" />;
  if (category === "emergency") return <HeartPulse className="h-5 w-5" />;
  if (category === "tour") return <MessageSquareText className="h-5 w-5" />;
  if (category === "schedule") return <CalendarDays className="h-5 w-5" />;
  return <Bell className="h-5 w-5" />;
}

function formatStamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function NotificationsPage() {
  const { session } = useAuth();
  const [items, setItems] = useState<HubNotification[]>([]);
  const [preferences, setPreferences] = useState<HubNotificationPreferences>(defaultNotificationPreferences);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<"all" | HubNotificationCategory>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [pushMessage, setPushMessage] = useState("");
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const response = await fetch("/api/notifications", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = await response.json() as Payload;
      setItems(payload.notifications ?? []);
      setPreferences(payload.preferences ?? defaultNotificationPreferences);
      setUnreadCount(payload.unreadCount ?? 0);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  const loadDevices = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const response = await fetch("/api/notifications/subscription", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = await response.json() as { devices?: RegisteredDevice[] };
      setDevices(Array.isArray(payload.devices) ? payload.devices : []);
    } catch {
      // Device management should not interrupt Notification Center.
    }
  }, [session?.access_token]);

  useEffect(() => { void load(); void loadDevices(); }, [load, loadDevices]);
  useEffect(() => {
    if (typeof window !== "undefined") setPermission("Notification" in window ? Notification.permission : "unsupported");
  }, []);

  const visible = useMemo(
    () => filter === "all" ? items : items.filter((item) => item.category === filter),
    [filter, items],
  );

  async function patch(body: Record<string, unknown>) {
    if (!session?.access_token) return null;
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    return await response.json() as Payload;
  }

  async function markAll() {
    setSaving("read");
    const payload = await patch({ markAllRead: true });
    if (payload) {
      setItems(payload.notifications);
      setUnreadCount(payload.unreadCount);
    }
    setSaving("");
  }

  async function markOne(item: HubNotification) {
    if (item.readAt) return;
    const payload = await patch({ readIds: [item.id] });
    if (payload) {
      setItems(payload.notifications);
      setUnreadCount(payload.unreadCount);
    }
  }

  async function updatePreference(key: keyof HubNotificationPreferences, value: boolean | string) {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    setSaving(key);
    const payload = await patch({ preferences: next });
    if (payload) setPreferences(payload.preferences);
    setSaving("");
  }

  async function enableSystemAlerts() {
    if (!session?.access_token) return;
    setPushMessage("");
    const result = await enableHubPushNotifications(session.access_token);
    setPermission(result.permission === "unsupported" ? "unsupported" : result.permission);
    setPushMessage(result.ok ? "Background notifications are registered on this device." : result.reason);
    if (result.ok) {
      const registration = await navigator.serviceWorker?.ready;
      await registration?.showNotification("The Hub notifications are on", {
        body: "Important TCS updates can now reach this device even when The Hub is not open.",
        icon: "/app-icon-192.png",
        badge: "/app-icon-192.png",
        tag: "tcs-notifications-enabled",
        data: { href: "/notifications" },
      });
    }
  }

  async function testBackgroundPush() {
    if (!session?.access_token) return;
    setSaving("push-test");
    setPushMessage("");
    try {
      const response = await fetch("/api/notifications/push-test", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = await response.json() as { ok?: boolean; delivered?: number; error?: string };
      if (!response.ok || !payload.ok) {
        setPushMessage(payload.error || "The test notification could not be delivered.");
      } else {
        setPushMessage(`Test push sent to ${payload.delivered || 0} registered device${payload.delivered === 1 ? "" : "s"}.`);
      }
    } catch {
      setPushMessage("The test notification could not be delivered.");
    } finally {
      setSaving("");
    }
  }

  async function removeDevice(device: RegisteredDevice) {
    if (!session?.access_token) return;
    setSaving(`device-${device.id}`);
    setPushMessage("");
    try {
      const response = await fetch("/api/notifications/subscription", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ deviceId: device.id }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not remove this device.");
      setPushMessage("The device was removed from background notifications.");
      await loadDevices();
    } catch (error) {
      setPushMessage(error instanceof Error ? error.message : "Could not remove this device.");
    } finally {
      setSaving("");
    }
  }

  return <MainLayout>
    <div className="mx-auto max-w-[1320px] space-y-6 pb-12">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-gradient-to-br from-slate-950 via-[#173c2a] to-[#225d3b] p-6 text-white shadow-2xl sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[.18em] text-emerald-200">The Hub App</p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">Notification Center</h1>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-emerald-50/80">Transportation, emergency cards, Tour Board, and staff schedule updates in one place. Lock-screen alerts stay intentionally general so private child and family details remain inside The Hub.</p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-4 backdrop-blur">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10"><BellRing className="h-6 w-6" /></span>
            <div><strong className="block text-2xl">{unreadCount}</strong><small className="font-bold text-emerald-100">Unread notifications</small></div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap gap-2">
              {filters.map((item) => <button key={item.key} onClick={() => setFilter(item.key)} className={`rounded-xl px-3 py-2 text-xs font-black transition ${filter === item.key ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{item.label}</button>)}
            </div>
            <div className="flex gap-2">
              <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600"><RefreshCw className="h-4 w-4" /> Refresh</button>
              <button disabled={!unreadCount || saving === "read"} onClick={() => void markAll()} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:opacity-40">{saving === "read" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />} Mark all read</button>
            </div>
          </div>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {loading ? <div className="flex min-h-60 items-center justify-center gap-2 text-sm font-bold text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading notifications…</div> :
              visible.length === 0 ? <div className="grid min-h-60 place-items-center p-8 text-center"><div><Bell className="mx-auto h-9 w-9 text-slate-300" /><h2 className="mt-3 text-lg font-black text-slate-800">Nothing here right now</h2><p className="mt-1 text-sm text-slate-500">New Hub alerts will show up automatically.</p></div></div> :
              <div className="divide-y divide-slate-100">{visible.map((item) => <Link key={item.id} href={item.href} onClick={() => void markOne(item)} className={`flex gap-4 p-4 transition hover:bg-slate-50 sm:p-5 ${item.readAt ? "bg-white" : "bg-blue-50/40"}`}>
                <span className={`grid h-11 w-11 flex-none place-items-center rounded-2xl ${item.category === "emergency" ? "bg-red-100 text-red-700" : item.category === "transportation" ? "bg-blue-100 text-blue-700" : item.category === "tour" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>{categoryIcon(item.category)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-black text-slate-950">{item.title}</h3><span className="text-[10px] font-bold text-slate-400">{formatStamp(item.createdAt)}</span></div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{item.body}</p>
                  <div className="mt-2 flex flex-wrap gap-2">{item.location && item.location !== "All Locations" && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{item.location}</span>}{!item.readAt && <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-black text-blue-700">Unread</span>}</div>
                </div>
              </Link>)}</div>}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-700"><Smartphone className="h-5 w-5" /></span><div><h2 className="font-black text-slate-950">Device Alerts</h2><p className="text-xs text-slate-500">{permission === "granted" ? "Allowed on this device" : permission === "denied" ? "Blocked on this device" : permission === "unsupported" ? "Not supported here" : "Permission not requested"}</p></div></div>
            {permission === "default" && <button onClick={() => void enableSystemAlerts()} className="mt-4 w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white">Enable Device Alerts</button>}
            {permission === "granted" && <button disabled={saving === "push-test"} onClick={() => void testBackgroundPush()} className="mt-4 w-full rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800 disabled:opacity-50">{saving === "push-test" ? "Sending Test…" : "Send Test Background Alert"}</button>}
            {pushMessage && <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-700">{pushMessage}</div>}
            {permission === "denied" && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900">Notifications were blocked in the device/browser settings. Change the permission there to turn them back on.</div>}
            {!isStandaloneHubApp() && <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-900">On iPhone, install The Hub to the Home Screen before enabling notification permission.</div>}

            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between"><div><h3 className="text-xs font-black text-slate-900">Registered devices</h3><p className="mt-0.5 text-[10px] text-slate-500">Remove an old or lost phone here.</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{devices.length}</span></div>
              <div className="mt-3 space-y-2">
                {devices.length === 0 ? <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">No background-push devices registered yet.</p> : devices.map((device) => <div key={device.id} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3"><Smartphone className="mt-0.5 h-4 w-4 flex-none text-slate-500" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-slate-800">{device.userAgent || "Registered device"}</p><p className="mt-1 text-[10px] text-slate-500">Last seen {formatStamp(device.lastSeenAt)} • Added {formatStamp(device.createdAt)}</p></div><button disabled={saving === `device-${device.id}`} onClick={() => void removeDevice(device)} className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-700 disabled:opacity-40" title="Remove device"><Trash2 className="h-4 w-4" /></button></div>)}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-black text-slate-950">What should notify me?</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">These settings follow your staff account across devices.</p>
            <div className="mt-4 space-y-2">
              <PreferenceRow label="All Hub notifications" helper="Master notification switch" checked={preferences.enabled} disabled={saving === "enabled"} onChange={(value) => void updatePreference("enabled", value)} />
              <PreferenceRow label="Transportation" helper="Route and transportation changes" checked={preferences.transportation} disabled={!preferences.enabled || saving === "transportation"} onChange={(value) => void updatePreference("transportation", value)} />
              <PreferenceRow label="Emergency Cards" helper="Emergency records needing attention" checked={preferences.emergency} disabled={!preferences.enabled || saving === "emergency"} onChange={(value) => void updatePreference("emergency", value)} />
              <PreferenceRow label="Tour Board" helper="Lead and follow-up activity" checked={preferences.tour} disabled={!preferences.enabled || saving === "tour"} onChange={(value) => void updatePreference("tour", value)} />
              <PreferenceRow label="Staff Schedule" helper="Shift additions and changes" checked={preferences.schedule} disabled={!preferences.enabled || saving === "schedule"} onChange={(value) => void updatePreference("schedule", value)} />
              <PreferenceRow label="Quiet hours" helper="Pause non-urgent lock-screen alerts during your selected hours" checked={preferences.quietHoursEnabled} disabled={!preferences.enabled || saving === "quietHoursEnabled"} onChange={(value) => void updatePreference("quietHoursEnabled", value)} />
              {preferences.quietHoursEnabled && <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3"><label><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Start</span><input type="time" value={preferences.quietHoursStart} onChange={(event) => void updatePreference("quietHoursStart", event.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold" /></label><label><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">End</span><input type="time" value={preferences.quietHoursEnd} onChange={(event) => void updatePreference("quietHoursEnd", event.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold" /></label><p className="col-span-2 text-[10px] leading-4 text-slate-500">Emergency alerts marked urgent still come through quiet hours. Times use TCS Pacific time.</p></div>}
            </div>
          </section>

          <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-950">
            <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 flex-none" /><div><h2 className="font-black">Privacy-first alerts</h2><p className="mt-1 text-xs font-semibold leading-5">Phone notifications do not display diagnoses, allergies, insurance numbers, or other child medical details. Staff must open the secured Hub record to see private information.</p></div></div>
          </section>
        </aside>
      </section>
    </div>
  </MainLayout>;
}

function PreferenceRow({ label, helper, checked, disabled, onChange }: { label: string; helper: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <label className={`flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-3 ${disabled ? "opacity-55" : ""}`}><span><strong className="block text-xs text-slate-900">{label}</strong><small className="mt-0.5 block text-[10px] text-slate-500">{helper}</small></span><input type="checkbox" className="h-5 w-5 accent-emerald-700" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /></label>;
}
