"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import type { ChildRecord } from "@/lib/children";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  DoorOpen,
  LoaderCircle,
  KeyRound,
  LogIn,
  LogOut,
  Search,
  ShieldCheck,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

function childName(child: ChildRecord) {
  return `${child.firstName} ${child.lastName}`.trim();
}

function todayPacific() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function timeLabel(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function currentStatus(child: ChildRecord) {
  if (child.attendanceDate !== todayPacific()) return "Not Scheduled";
  return child.attendanceToday;
}

function statusClasses(status: string) {
  if (status === "Present") return "bg-emerald-100 text-emerald-800";
  if (status === "Checked Out") return "bg-blue-100 text-blue-800";
  if (status === "Absent") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-600";
}

export default function AttendancePage() {
  const { session, isSystemOwner, isLocationLicensee } = useAuth();
  const { location } = useHubLocation();
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [checkoutChild, setCheckoutChild] = useState<ChildRecord | null>(null);
  const [pickupPerson, setPickupPerson] = useState("");
  const [pickupNotes, setPickupNotes] = useState("");
  const [pickupPin, setPickupPin] = useState("");
  const [pinChild, setPinChild] = useState<ChildRecord | null>(null);
  const [newPickupPin, setNewPickupPin] = useState("");

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const response = await fetch("/api/children", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json() as { children?: ChildRecord[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load attendance.");
      setChildren(Array.isArray(payload.children) ? payload.children : []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load attendance.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return children
      .filter((child) => child.enrollmentStatus === "Active")
      .filter((child) => location === "All Locations" || child.location.toLowerCase().includes(location.toLowerCase()) || location.toLowerCase().includes(child.location.toLowerCase()))
      .filter((child) => !query || `${childName(child)} ${child.primaryGuardian} ${child.location}`.toLowerCase().includes(query))
      .sort((a, b) => childName(a).localeCompare(childName(b)));
  }, [children, location, search]);

  const counts = useMemo(() => {
    const result = { present: 0, checkedOut: 0, absent: 0, notScheduled: 0 };
    visible.forEach((child) => {
      const status = currentStatus(child);
      if (status === "Present") result.present += 1;
      else if (status === "Checked Out") result.checkedOut += 1;
      else if (status === "Absent") result.absent += 1;
      else result.notScheduled += 1;
    });
    return result;
  }, [visible]);

  async function act(child: ChildRecord, action: "checkin" | "absent" | "reset", extra: Record<string, unknown> = {}) {
    if (!session?.access_token) return;
    setSavingId(child.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ childId: child.id, action, ...extra }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Attendance update failed.");
      await load();
      setMessage(`${childName(child)} attendance updated.`);
      window.setTimeout(() => setMessage(""), 2600);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Attendance update failed.");
    } finally {
      setSavingId(null);
    }
  }

  async function checkout() {
    if (!checkoutChild || !session?.access_token) return;
    setSavingId(checkoutChild.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          childId: checkoutChild.id,
          action: "checkout",
          pickupPerson,
          pickupNotes,
          pickupPin,
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Check-out failed.");
      const name = childName(checkoutChild);
      setCheckoutChild(null);
      setPickupPerson("");
      setPickupNotes("");
      setPickupPin("");
      await load();
      setMessage(`${name} was checked out.`);
      window.setTimeout(() => setMessage(""), 2600);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Check-out failed.");
    } finally {
      setSavingId(null);
    }
  }

  function startCheckout(child: ChildRecord) {
    setCheckoutChild(child);
    setPickupPerson(child.primaryGuardian || "");
    setPickupNotes("");
    setPickupPin("");
    setError("");
  }

  async function savePickupPin(action: "set" | "clear") {
    if (!pinChild || !session?.access_token) return;
    setSavingId(pinChild.id);
    setError("");
    try {
      const response = await fetch("/api/attendance/pickup-pin", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          childId: pinChild.id,
          action,
          pin: action === "set" ? newPickupPin : "",
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Pickup PIN update failed.");
      const name = childName(pinChild);
      setPinChild(null);
      setNewPickupPin("");
      await load();
      setMessage(action === "set" ? `${name}'s pickup PIN was updated.` : `${name}'s pickup PIN was removed.`);
      window.setTimeout(() => setMessage(""), 2600);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Pickup PIN update failed.");
    } finally {
      setSavingId(null);
    }
  }

  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-6 pb-12">
    <section className="overflow-hidden rounded-[30px] bg-gradient-to-br from-[#173d29] via-[#245a39] to-[#10291e] p-6 text-white shadow-xl sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[.18em] text-emerald-200">Digital attendance + pickup control</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Check-In / Check-Out</h1><p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-emerald-50/80">Track who is physically in care, who was absent, and who picked each child up. Pickup is blocked for unlisted people; families can also use a secure pickup PIN as a second verification step.</p></div>
        <div className="rounded-2xl bg-white/10 p-4 backdrop-blur"><p className="text-[10px] font-black uppercase tracking-wider text-emerald-100">Today</p><p className="mt-1 text-xl font-black">{new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</p></div>
      </div>
    </section>

    {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-900">{message}</div>}
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">{error}</div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<UserCheck className="h-5 w-5" />} label="Present Now" value={counts.present} tone="green" />
      <Metric icon={<DoorOpen className="h-5 w-5" />} label="Checked Out" value={counts.checkedOut} tone="blue" />
      <Metric icon={<UserX className="h-5 w-5" />} label="Absent" value={counts.absent} tone="red" />
      <Metric icon={<Clock3 className="h-5 w-5" />} label="Not Marked" value={counts.notScheduled} tone="slate" />
    </section>

    <label className="relative block"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search child or guardian…" className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold shadow-sm outline-none focus:border-emerald-400" /></label>

    {loading ? <div className="flex min-h-72 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-sm font-bold text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading today’s attendance…</div> :
      <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {visible.map((child) => {
          const status = currentStatus(child);
          const loadingThis = savingId === child.id;
          return <article key={child.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{child.location}</p><h2 className="mt-1 text-xl font-black text-slate-950">{childName(child)}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{child.primaryGuardian || "Guardian not entered"}</p></div>
              <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${statusClasses(status)}`}>{status}</span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Info label="Checked In" value={child.attendanceDate === todayPacific() ? timeLabel(child.checkedInAt) : "—"} />
              <Info label="Checked Out" value={child.attendanceDate === todayPacific() ? timeLabel(child.checkedOutAt) : "—"} />
              <Info label="Pickup Person" value={child.attendanceDate === todayPacific() ? child.pickupPerson || "—" : "—"} />
              <Info label="Pickup Verification" value={child.attendanceDate === todayPacific() ? child.pickupVerification || "—" : "—"} />
              <Info label="Pickup PIN" value={child.pickupPinConfigured ? "Configured" : "Not Set"} />
              <Info label="PIN Updated" value={child.pickupPinUpdatedAt ? timeLabel(child.pickupPinUpdatedAt) : "—"} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {status !== "Present" && <button disabled={loadingThis} onClick={() => void act(child, "checkin")} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40"><LogIn className="h-4 w-4" /> Check In</button>}
              {status === "Present" && <button disabled={loadingThis} onClick={() => startCheckout(child)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40"><LogOut className="h-4 w-4" /> Check Out</button>}
              {status !== "Absent" && status !== "Present" && <button disabled={loadingThis} onClick={() => void act(child, "absent")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-800 disabled:opacity-40"><UserX className="h-4 w-4" /> Absent</button>}
              {(status === "Absent" || status === "Checked Out") && <button disabled={loadingThis} onClick={() => void act(child, "reset")} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 disabled:opacity-40">Reset</button>}
              {(isSystemOwner || isLocationLicensee) && <button disabled={loadingThis} onClick={() => { setPinChild(child); setNewPickupPin(""); setError(""); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-800 disabled:opacity-40"><KeyRound className="h-4 w-4" /> {child.pickupPinConfigured ? "Reset PIN" : "Set PIN"}</button>}
            </div>
          </article>;
        })}
      </section>}

    {pinChild && <div className="fixed inset-0 z-[10001] overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm">
      <section className="mx-auto my-12 w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 bg-gradient-to-r from-violet-800 to-[#245a39] px-5 py-4 text-white"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-violet-100">Pickup security</p><h2 className="mt-1 text-2xl font-black">{childName(pinChild)}</h2></div><button onClick={() => setPinChild(null)} className="rounded-xl bg-white/10 p-2"><X className="h-5 w-5" /></button></header>
        <div className="space-y-4 p-5">
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-xs font-semibold leading-5 text-violet-950"><KeyRound className="mr-1 inline h-4 w-4" />Create a 4–6 digit family pickup PIN. The Hub stores only a one-way protected digest and never shows the saved PIN back to staff.</div>
          <label><span className="mb-1 block text-xs font-black uppercase tracking-wider text-slate-500">New Pickup PIN</span><input inputMode="numeric" maxLength={6} value={newPickupPin} onChange={(event) => setNewPickupPin(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="4–6 digits" className="w-full rounded-xl border border-violet-200 px-3 py-3 text-center text-xl font-black tracking-[.35em]" /></label>
          {pinChild.pickupPinConfigured && <button onClick={() => void savePickupPin("clear")} className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-800">Remove Existing PIN</button>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 p-4"><button onClick={() => setPinChild(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700">Cancel</button><button disabled={!/^\d{4,6}$/.test(newPickupPin) || savingId === pinChild.id} onClick={() => void savePickupPin("set")} className="inline-flex min-w-32 items-center justify-center gap-2 rounded-xl bg-violet-800 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">{savingId === pinChild.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Save PIN</button></footer>
      </section>
    </div>}

    {checkoutChild && <div className="fixed inset-0 z-[10000] overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm">
      <section className="mx-auto my-8 w-full max-w-xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 bg-gradient-to-r from-[#194b7a] to-[#2568a3] px-5 py-4 text-white"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-blue-100">Pickup verification</p><h2 className="mt-1 text-2xl font-black">{childName(checkoutChild)}</h2></div><button onClick={() => setCheckoutChild(null)} className="rounded-xl bg-white/10 p-2"><X className="h-5 w-5" /></button></header>
        <div className="space-y-4 p-5">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4"><div className="flex items-start gap-3"><BadgeCheck className="mt-0.5 h-5 w-5 text-blue-700" /><div><p className="font-black text-blue-950">Authorized contacts currently in the child record</p><p className="mt-1 text-xs font-semibold leading-5 text-blue-900">{[checkoutChild.primaryGuardian, checkoutChild.secondaryGuardian, checkoutChild.emergencyContact1Name, checkoutChild.emergencyContact2Name].filter(Boolean).join(" • ") || "No authorized contacts are entered."}</p></div></div></div>
          <label><span className="mb-1 block text-xs font-black uppercase tracking-wider text-slate-500">Person picking up</span><input value={pickupPerson} onChange={(event) => setPickupPerson(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold" /></label>
          {checkoutChild.pickupPinConfigured && <label><span className="mb-1 block text-xs font-black uppercase tracking-wider text-slate-500">Family Pickup PIN</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={pickupPin} onChange={(event) => setPickupPin(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="4–6 digit PIN" className="w-full rounded-xl border border-violet-200 bg-violet-50 px-3 py-3 text-center text-lg font-black tracking-[.35em] text-violet-950" /><p className="mt-1 text-[10px] font-semibold text-slate-500">The PIN is never displayed after it is saved. Staff still verify the pickup person against the authorized-contact list.</p></label>}
          {(isSystemOwner || isLocationLicensee) && <label><span className="mb-1 block text-xs font-black uppercase tracking-wider text-slate-500">Override verification note</span><textarea value={pickupNotes} onChange={(event) => setPickupNotes(event.target.value)} placeholder="Required only if the pickup person is not listed in the child record. Describe how authorization was verified." className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold leading-6" /></label>}
          {!isSystemOwner && !isLocationLicensee && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900"><AlertTriangle className="mr-1 inline h-4 w-4" />If the person is not listed, pickup will be blocked until a site Licensee or Owner/Admin verifies the authorization.</div>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 p-4"><button onClick={() => setCheckoutChild(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700">Cancel</button><button disabled={!pickupPerson.trim() || savingId === checkoutChild.id} onClick={() => void checkout()} className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">{savingId === checkoutChild.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verify & Check Out</button></footer>
      </section>
    </div>}
  </div></MainLayout>;
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "green" | "blue" | "red" | "slate" }) {
  const styles = { green: "bg-emerald-100 text-emerald-800", blue: "bg-blue-100 text-blue-800", red: "bg-red-100 text-red-800", slate: "bg-slate-100 text-slate-700" };
  return <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`grid h-11 w-11 place-items-center rounded-2xl ${styles[tone]}`}>{icon}</span><div><strong className="block text-2xl font-black text-slate-950">{value}</strong><small className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</small></div></div>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><small className="block text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</small><strong className="mt-1 block truncate text-xs text-slate-800">{value}</strong></div>;
}
