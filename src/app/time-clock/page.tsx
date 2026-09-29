"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { locationFromSlug } from "@/lib/location-config";
import {
  Coffee,
  History,
  KeyRound,
  LoaderCircle,
  LogIn,
  LogOut,
  Play,
  ScanLine,
  ShieldCheck,
  TimerReset,
  UserCog,
  Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type ClockEventType = "clock_in" | "clock_out" | "break_start" | "break_end";
type ClockSource = "Location QR" | "Maintenance Manual" | "Admin Override" | "Active Shift" | "Legacy";

type ClockEvent = {
  id: string;
  actorUserId: string;
  performedByUserId: string;
  performedByName: string;
  staffName: string;
  role: string;
  location: string;
  event: ClockEventType;
  source: ClockSource;
  occurredAt: string;
};

type AdminClockStaff = {
  userId: string;
  fullName: string;
  role: string;
  locations: string[];
  isMaintenance: boolean;
};

type Payload = {
  events: ClockEvent[];
  currentUserId: string;
  today: string;
  myClockAccess: {
    pinConfigured: boolean;
    pinUpdatedAt: string;
    isMaintenance: boolean;
    manualAllowed: boolean;
  };
  adminClockStaff: AdminClockStaff[];
  clockPolicy: {
    enforce_schedule_clocking: boolean;
    early_clock_in_window_minutes: number;
    late_clock_out_window_minutes: number;
    flag_scheduled_hours_overage: boolean;
  };
  myPublishedShifts: Array<{
    id: string;
    location_id: string;
    location: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    position_label: string | null;
  }>;
  myApprovedExceptions: Array<{
    id: string;
    location_id: string;
    shift_id: string | null;
    work_date: string;
    approval_scope: "General" | "Maintenance";
    approved_start_time: string | null;
    approved_end_time: string | null;
    reason: string;
    status: "Approved";
  }>;
};

const labels: Record<ClockEventType, string> = {
  clock_in: "Clocked In",
  clock_out: "Clocked Out",
  break_start: "Break Started",
  break_end: "Break Ended",
};

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function durationMinutes(events: ClockEvent[]) {
  const sorted = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  let workingFrom: number | null = null;
  let breakFrom: number | null = null;
  let total = 0;
  let breaks = 0;

  for (const event of sorted) {
    const stamp = new Date(event.occurredAt).getTime();
    if (!Number.isFinite(stamp)) continue;
    if (event.event === "clock_in") workingFrom = stamp;
    if (event.event === "break_start" && workingFrom !== null) breakFrom = stamp;
    if (event.event === "break_end" && breakFrom !== null) {
      breaks += Math.max(0, stamp - breakFrom);
      breakFrom = null;
    }
    if (event.event === "clock_out" && workingFrom !== null) {
      if (breakFrom !== null) {
        breaks += Math.max(0, stamp - breakFrom);
        breakFrom = null;
      }
      total += Math.max(0, stamp - workingFrom);
      workingFrom = null;
    }
  }

  if (workingFrom !== null) total += Math.max(0, Date.now() - workingFrom);
  if (breakFrom !== null) breaks += Math.max(0, Date.now() - breakFrom);
  return Math.max(0, Math.round((total - breaks) / 60000));
}

function hoursLabel(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function stateFromEvents(events: ClockEvent[]) {
  const last = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).at(-1)?.event ?? "";
  return !last || last === "clock_out" ? "Off Clock" : last === "break_start" ? "On Break" : "Working";
}

export default function TimeClockPage() {
  const router = useRouter();
  const { session, user, isSystemOwner, isLocationLicensee } = useAuth();
  const { location, availableLocations } = useHubLocation();

  const firstLocation = location === "All Locations"
    ? (availableLocations.find((item) => item !== "All Locations") || "Halcom")
    : location;

  const [payload, setPayload] = useState<Payload | null>(null);
  const [workLocation, setWorkLocation] = useState(firstLocation);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [qrAction, setQrAction] = useState<"clock_in" | "clock_out" | "">("");
  const [qrReady, setQrReady] = useState(false);
  const [clockPin, setClockPin] = useState("");
  const [newClockPin, setNewClockPin] = useState("");

  const [maintenanceLocation, setMaintenanceLocation] = useState(firstLocation);
  const [adminTargetUserId, setAdminTargetUserId] = useState("");
  const [adminLocation, setAdminLocation] = useState(firstLocation);
  const [adminPin, setAdminPin] = useState("");
  const [adminSaving, setAdminSaving] = useState(false);
  const [resettingPin, setResettingPin] = useState(false);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const response = await fetch("/api/time-clock?days=14", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const result = await response.json() as Payload & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load time clock.");
      setPayload(result);
      setAdminTargetUserId((current) => current || result.adminClockStaff[0]?.userId || "");
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load time clock.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("qr") !== "1") return;

    const scannedLocation = locationFromSlug(params.get("qrLocation") || "");
    const scannedAction = params.get("qrAction") === "clock_out" ? "clock_out" : "clock_in";

    if (!scannedLocation) {
      setError("That scanned TCS location could not be recognized.");
      router.replace("/time-clock");
      return;
    }

    setWorkLocation(scannedLocation);
    setQrAction(scannedAction);
    setQrReady(true);
    setClockPin("");
    setNotice(`Location QR scanned: ${scannedLocation}. Enter your staff PIN to confirm ${scannedAction === "clock_out" ? "Clock Out" : "Clock In"}.`);
  }, [router]);

  const mine = useMemo(
    () => payload?.events.filter((event) => event.actorUserId === user?.id) ?? [],
    [payload, user?.id],
  );

  const todayMine = useMemo(
    () => mine.filter((event) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(event.occurredAt)) === payload?.today,
    ),
    [mine, payload?.today],
  );

  const state = stateFromEvents(todayMine);
  const todayMinutes = durationMinutes(todayMine);
  const latestMine = todayMine.at(-1);

  useEffect(() => {
    if (qrReady || !latestMine || latestMine.event === "clock_out") return;
    if (latestMine.location && latestMine.location !== "Maintenance / Offsite") {
      setWorkLocation(latestMine.location as typeof workLocation);
    }
  }, [latestMine, qrReady]);

  const selectedShift = payload?.myPublishedShifts.find((shift) => shift.location === workLocation);
  const selectedException = payload?.myApprovedExceptions.find(
    (item) => item.location_id === selectedShift?.location_id || (!selectedShift && item.work_date === payload?.today),
  );

  async function act(
    event: ClockEventType,
    source: ClockSource,
    options: {
      location?: string;
      pin?: string;
      targetUserId?: string;
    } = {},
  ) {
    if (!session?.access_token) return;
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/time-clock", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event,
          location: options.location ?? workLocation,
          clientTimestamp: new Date().toISOString(),
          source,
          pin: options.pin ?? "",
          targetUserId: options.targetUserId,
        }),
      });

      const result = await response.json() as {
        error?: string;
        needsLeadershipReview?: boolean;
        targetStaffName?: string;
      };

      if (!response.ok) throw new Error(result.error || "Time clock update failed.");

      await load();
      setClockPin("");

      if (source === "Location QR") {
        setQrReady(false);
        setQrAction("");
        router.replace("/time-clock");
      }

      const baseNotice = source === "Admin Override" && result.targetStaffName
        ? `${result.targetStaffName}: ${labels[event]} • Admin action`
        : `${labels[event]} • ${source}`;

      setNotice(result.needsLeadershipReview ? `${baseNotice} • sent to leadership review` : baseNotice);
      window.setTimeout(() => setNotice(""), 3000);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Time clock update failed.");
    } finally {
      setSaving(false);
    }
  }

  async function saveClockPin() {
    if (!session?.access_token || !/^\d{4,6}$/.test(newClockPin)) return;
    setSavingPin(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/time-clock/pin", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "set", pin: newClockPin }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save your staff clock PIN.");

      setNewClockPin("");
      await load();
      setNotice("Your personal staff clock PIN is ready.");
      window.setTimeout(() => setNotice(""), 3000);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your staff clock PIN.");
    } finally {
      setSavingPin(false);
    }
  }

  const teamToday = useMemo(() => {
    if (!payload) return [];

    const map = new Map<string, ClockEvent[]>();
    payload.events
      .filter((event) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Los_Angeles",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(event.occurredAt)) === payload.today,
      )
      .forEach((event) => {
        map.set(event.actorUserId, [...(map.get(event.actorUserId) ?? []), event]);
      });

    return [...map.values()]
      .map((events) => {
        const sorted = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
        const latest = sorted.at(-1)!;
        return {
          userId: latest.actorUserId,
          name: latest.staffName,
          role: latest.role,
          location: latest.location,
          last: latest.event,
          source: latest.source,
          performedByName: latest.performedByName,
          minutes: durationMinutes(sorted),
          state: stateFromEvents(sorted),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [payload]);

  const adminTarget = payload?.adminClockStaff.find((item) => item.userId === adminTargetUserId) ?? null;
  const adminTargetToday = teamToday.find((item) => item.userId === adminTargetUserId);
  const adminTargetState = adminTargetToday?.state ?? "Off Clock";

  useEffect(() => {
    if (adminTarget?.isMaintenance && adminLocation === "Maintenance / Offsite") return;
    if (adminLocation === "Maintenance / Offsite" && !adminTarget?.isMaintenance) {
      setAdminLocation(firstLocation);
    }
  }, [adminLocation, adminTarget?.isMaintenance, firstLocation]);

  async function adminClock(event: "clock_in" | "clock_out") {
    if (!adminTargetUserId || !session?.access_token) return;
    setAdminSaving(true);
    setError("");

    try {
      await act(event, "Admin Override", {
        location: adminLocation,
        pin: adminPin,
        targetUserId: adminTargetUserId,
      });
      setAdminPin("");
    } finally {
      setAdminSaving(false);
    }
  }

  async function resetStaffPin() {
    if (!session?.access_token || !adminTargetUserId) return;
    setResettingPin(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/time-clock/pin", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "admin_reset",
          targetUserId: adminTargetUserId,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not reset that staff PIN.");

      setNotice(`${adminTarget?.fullName || "Staff"} must set a new personal clock PIN before their next clock-in/out.`);
      window.setTimeout(() => setNotice(""), 3800);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Could not reset that staff PIN.");
    } finally {
      setResettingPin(false);
    }
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1350px] space-y-6 pb-12">
        <section className="overflow-hidden rounded-[30px] bg-gradient-to-br from-[#111827] via-[#173d29] to-[#245a39] p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[.18em] text-emerald-200">Staff time & attendance</p>
              <h1 className="mt-2 text-3xl font-black sm:text-4xl">The Hub Time Clock</h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-emerald-50/80">
                Regular staff clock in and out with the posted TCS location QR plus their personal staff PIN. Maintenance may use the protected manual option when work happens away from a posted QR.
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-100">Current Status</p>
              <p className="mt-1 text-2xl font-black">{state}</p>
              <p className="mt-1 text-xs text-emerald-100">{hoursLabel(todayMinutes)} worked today</p>
            </div>
          </div>
        </section>

        {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-900">{notice}</div>}
        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">{error}</div>}

        {payload && (
          <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[.14em] text-emerald-800">TCS scheduled-hours rule</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">
                  Clock in no more than {payload.clockPolicy.early_clock_in_window_minutes} minutes early.
                </h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
                  The normal clock-out window ends {payload.clockPolicy.late_clock_out_window_minutes} minutes after the published shift. Actual worked time is preserved; exceptions and overages can still be sent to leadership review.
                </p>
              </div>
              <div className="rounded-2xl border border-white bg-white/80 p-4 text-right">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Today • {latestMine?.location || workLocation}</p>
                <p className="mt-1 text-lg font-black text-slate-950">
                  {selectedShift ? `${selectedShift.start_time.slice(0, 5)}–${selectedShift.end_time.slice(0, 5)}` : "No published shift selected"}
                </p>
                {selectedException && <p className="mt-1 text-xs font-black text-amber-700">Approved exception on file</p>}
              </div>
            </div>
          </section>
        )}

        <section className="rounded-3xl border border-violet-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-violet-700" />
                <h2 className="font-black text-slate-950">My Staff Clock PIN</h2>
              </div>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
                This PIN belongs only to your signed-in staff account. The Hub never lets one employee choose another employee and clock them in with a PIN.
              </p>
            </div>
            <span className={`w-fit rounded-full px-3 py-1.5 text-[10px] font-black ${payload?.myClockAccess.pinConfigured ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
              {payload?.myClockAccess.pinConfigured ? "PIN Ready" : "PIN Required"}
            </span>
          </div>

          <div className="mt-4 flex max-w-md gap-2">
            <input
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={newClockPin}
              onChange={(event) => setNewClockPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Choose 4–6 digits"
              className="min-w-0 flex-1 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-center text-base font-black tracking-[.25em] outline-none focus:border-violet-500"
            />
            <button
              disabled={!/^\d{4,6}$/.test(newClockPin) || savingPin}
              onClick={() => void saveClockPin()}
              className="rounded-xl bg-violet-700 px-4 py-3 text-xs font-black text-white disabled:opacity-40"
            >
              {savingPin ? "Saving…" : payload?.myClockAccess.pinConfigured ? "Change PIN" : "Set PIN"}
            </button>
          </div>

          <p className="mt-3 text-[10px] font-semibold leading-4 text-slate-500">
            Your actual PIN is not displayed or stored as readable text. If you forget it, an Owner/Admin can reset it and you create a new one.
          </p>
        </section>

        <section className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ScanLine className="h-5 w-5 text-emerald-700" />
                <h2 className="font-black text-slate-950">Location QR Time Clock</h2>
              </div>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
                Scan the same QR posted for family attendance. Regular staff must use the QR plus their personal staff PIN for Clock In and Clock Out.
              </p>
            </div>

            {!payload?.myClockAccess.pinConfigured ? (
              <div className="rounded-xl bg-amber-100 px-4 py-3 text-xs font-black text-amber-900">Set your Staff Clock PIN first.</div>
            ) : state === "Off Clock" ? (
              <button onClick={() => router.push("/time-clock/scan?action=clock_in")} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white shadow-sm">
                <ScanLine className="h-5 w-5" /> Scan to Clock In
              </button>
            ) : state === "Working" ? (
              <button onClick={() => router.push("/time-clock/scan?action=clock_out")} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white shadow-sm">
                <ScanLine className="h-5 w-5" /> Scan to Clock Out
              </button>
            ) : (
              <div className="rounded-xl bg-amber-100 px-4 py-3 text-xs font-black text-amber-900">End your break before clocking out.</div>
            )}
          </div>

          {qrReady && qrAction && (
            <div className="mt-4 rounded-2xl border border-emerald-300 bg-white p-4">
              <div className="grid gap-4 lg:grid-cols-[1fr_220px_auto] lg:items-end">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">QR location confirmed</p>
                  <p className="mt-1 text-xl font-black text-slate-950">{workLocation}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">No payroll event has been recorded yet.</p>
                </div>

                <label>
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Your Staff PIN</span>
                  <input
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={6}
                    value={clockPin}
                    onChange={(event) => setClockPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="4–6 digits"
                    className="w-full rounded-xl border border-slate-200 px-3 py-3 text-center text-base font-black tracking-[.22em]"
                  />
                </label>

                <div className="flex gap-2">
                  <button onClick={() => { setQrReady(false); setQrAction(""); setClockPin(""); router.replace("/time-clock"); }} className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-black text-slate-700">
                    Cancel
                  </button>
                  <button
                    disabled={saving || !/^\d{4,6}$/.test(clockPin) || (qrAction === "clock_in" ? state !== "Off Clock" : state !== "Working")}
                    onClick={() => void act(qrAction, "Location QR", { pin: clockPin, location: workLocation })}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white disabled:bg-slate-300"
                  >
                    {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    Confirm {qrAction === "clock_out" ? "Clock Out" : "Clock In"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {payload?.myClockAccess.manualAllowed && (
          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <Wrench className="mt-0.5 h-5 w-5 flex-none text-amber-800" />
              <div>
                <h2 className="font-black text-slate-950">Maintenance Manual Clock</h2>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                  This exception is only available to staff assigned to the Maintenance Department when work is happening somewhere without a posted TCS QR.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_220px_auto] lg:items-end">
              <label>
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Work location</span>
                <select value={maintenanceLocation} onChange={(event) => setMaintenanceLocation(event.target.value)} className="w-full rounded-xl border border-amber-200 bg-white px-3 py-3 text-sm font-bold">
                  {availableLocations.filter((item) => item !== "All Locations").map((item) => <option key={item}>{item}</option>)}
                  <option>Maintenance / Offsite</option>
                </select>
              </label>

              <label>
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Your Staff PIN</span>
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  value={clockPin}
                  onChange={(event) => setClockPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="4–6 digits"
                  className="w-full rounded-xl border border-amber-200 bg-white px-3 py-3 text-center text-base font-black tracking-[.22em]"
                />
              </label>

              <div className="flex gap-2">
                <button
                  disabled={saving || state !== "Off Clock" || !/^\d{4,6}$/.test(clockPin)}
                  onClick={() => void act("clock_in", "Maintenance Manual", { location: maintenanceLocation, pin: clockPin })}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 py-3 text-xs font-black text-white disabled:opacity-40"
                >
                  <LogIn className="h-4 w-4" /> Clock In
                </button>
                <button
                  disabled={saving || state !== "Working" || !/^\d{4,6}$/.test(clockPin)}
                  onClick={() => void act("clock_out", "Maintenance Manual", { location: maintenanceLocation, pin: clockPin })}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-black text-white disabled:opacity-40"
                >
                  <LogOut className="h-4 w-4" /> Clock Out
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-black text-slate-950">Break controls</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Breaks stay attached to your active shift and do not require scanning the QR again.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={saving || state !== "Working"}
                onClick={() => void act("break_start", "Active Shift")}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-sm font-black text-white disabled:bg-slate-300"
              >
                <Coffee className="h-5 w-5" /> Start Break
              </button>
              <button
                disabled={saving || state !== "On Break"}
                onClick={() => void act("break_end", "Active Shift")}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white disabled:bg-slate-300"
              >
                <Play className="h-5 w-5" /> End Break
              </button>
            </div>
          </div>
        </section>

        {isSystemOwner && payload && (
          <section className="rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <UserCog className="mt-0.5 h-5 w-5 flex-none text-blue-700" />
              <div>
                <h2 className="font-black text-slate-950">Owner/Admin Staff Clock Override</h2>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                  Only Owner/Admin accounts can clock another employee in or out. The audit records the employee and the admin who performed the action separately.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-4">
              <label>
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Staff member</span>
                <select value={adminTargetUserId} onChange={(event) => setAdminTargetUserId(event.target.value)} className="w-full rounded-xl border border-blue-200 bg-white px-3 py-3 text-sm font-bold">
                  {payload.adminClockStaff.map((item) => <option key={item.userId} value={item.userId}>{item.fullName}</option>)}
                </select>
              </label>

              <label>
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Clock location</span>
                <select value={adminLocation} onChange={(event) => setAdminLocation(event.target.value)} className="w-full rounded-xl border border-blue-200 bg-white px-3 py-3 text-sm font-bold">
                  {availableLocations.filter((item) => item !== "All Locations").map((item) => <option key={item}>{item}</option>)}
                  {adminTarget?.isMaintenance && <option>Maintenance / Offsite</option>}
                </select>
              </label>

              <label>
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Your Admin PIN</span>
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  value={adminPin}
                  onChange={(event) => setAdminPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="4–6 digits"
                  className="w-full rounded-xl border border-blue-200 bg-white px-3 py-3 text-center text-base font-black tracking-[.22em]"
                />
              </label>

              <div className="flex items-end gap-2">
                <button
                  disabled={adminSaving || !adminTargetUserId || !/^\d{4,6}$/.test(adminPin) || adminTargetState !== "Off Clock"}
                  onClick={() => void adminClock("clock_in")}
                  className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 py-3 text-xs font-black text-white disabled:opacity-40"
                >
                  <LogIn className="h-4 w-4" /> Clock In
                </button>
                <button
                  disabled={adminSaving || !adminTargetUserId || !/^\d{4,6}$/.test(adminPin) || adminTargetState !== "Working"}
                  onClick={() => void adminClock("clock_out")}
                  className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-3 text-xs font-black text-white disabled:opacity-40"
                >
                  <LogOut className="h-4 w-4" /> Clock Out
                </button>
              </div>
            </div>

            {adminTarget && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-white p-4">
                <div>
                  <p className="text-xs font-black text-slate-950">{adminTarget.fullName}</p>
                  <p className="mt-1 text-[10px] font-semibold text-slate-500">Current status: {adminTargetState}{adminTargetToday?.location ? ` • ${adminTargetToday.location}` : ""}</p>
                </div>
                <button
                  disabled={resettingPin}
                  onClick={() => void resetStaffPin()}
                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 disabled:opacity-40"
                >
                  {resettingPin ? "Resetting…" : "Reset Staff PIN"}
                </button>
              </div>
            )}
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <History className="h-5 w-5 text-emerald-700" />
              <div>
                <h2 className="font-black text-slate-950">My recent clock history</h2>
                <p className="text-xs text-slate-500">Last 14 days</p>
              </div>
            </div>

            {loading ? (
              <div className="flex min-h-40 items-center justify-center"><LoaderCircle className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : (
              <div className="mt-4 space-y-2">
                {mine.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No clock events recorded yet.</p>
                ) : (
                  [...mine].reverse().slice(0, 20).map((event) => (
                    <div key={event.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                      <div>
                        <strong className="text-xs text-slate-900">{labels[event.event]}</strong>
                        <p className="mt-1 text-[10px] text-slate-500">{event.location} • {dateLabel(event.occurredAt)} • {event.source}</p>
                        {event.source === "Admin Override" && event.performedByUserId !== event.actorUserId && (
                          <p className="mt-1 text-[10px] font-bold text-blue-700">Admin action by {event.performedByName}</p>
                        )}
                      </div>
                      <span className="text-xs font-black text-slate-700">{timeLabel(event.occurredAt)}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>

          {(isSystemOwner || isLocationLicensee) && (
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-black text-slate-950">Today’s team clock status</h2>
                  <p className="text-xs text-slate-500">Visible staff within your authorized scope.</p>
                </div>
                <ShieldCheck className="h-5 w-5 text-blue-700" />
              </div>

              <div className="mt-4 space-y-2">
                {teamToday.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No team clock activity today.</p>
                ) : (
                  teamToday.map((item) => (
                    <div key={item.userId} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-slate-200 p-3">
                      <div>
                        <strong className="text-sm text-slate-900">{item.name}</strong>
                        <p className="mt-1 text-[10px] text-slate-500">{item.location} • {item.role} • {item.source}</p>
                        {item.source === "Admin Override" && <p className="mt-1 text-[10px] font-bold text-blue-700">Admin action by {item.performedByName}</p>}
                      </div>
                      <div className="text-right">
                        <span className={`rounded-full px-2 py-1 text-[9px] font-black ${item.state === "Working" ? "bg-emerald-100 text-emerald-800" : item.state === "On Break" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"}`}>{item.state}</span>
                        <p className="mt-1 text-[10px] font-bold text-slate-500">{hoursLabel(item.minutes)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
        </div>

        {isSystemOwner && (
          <div className="text-right">
            <a href="/payroll-ops" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white">
              <TimerReset className="h-4 w-4" /> Open Payroll Hours Dashboard
            </a>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
