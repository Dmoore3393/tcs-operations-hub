"use client";

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowLeft,
  CheckCircle2,
  DoorOpen,
  KeyRound,
  LoaderCircle,
  LogIn,
  LogOut,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type KioskChild = {
  id: string;
  name: string;
  homeLocation: string;
  attendanceToday: string;
  attendanceDate: string;
  attendanceLocation: string;
  checkedInAt: string;
  checkedOutAt: string;
  attendancePinConfigured: boolean;
};

type KioskData = {
  location: {
    id: string;
    slug: string;
    name: string;
    fullName: string;
  };
  children: KioskChild[];
};

function todayPacific() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function timeLabel(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function ParentCheckInPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<KioskData | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const locationSlug = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("location")?.trim().toLowerCase() || "";
  }, []);

  const load = useCallback(async (activeSession: Session, slug: string) => {
    const response = await fetch(`/api/parent/attendance?location=${encodeURIComponent(slug)}`, {
      headers: { Authorization: `Bearer ${activeSession.access_token}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as KioskData & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Could not open family check-in.");
    setData(payload);
    setSelectedIds((current) => current.length ? current : payload.children.map((child) => child.id));
  }, []);

  useEffect(() => {
    if (!supabase || !isSupabaseConfigured) {
      setError("The secure Parent Portal connection is not configured.");
      setLoading(false);
      return;
    }

    const client = supabase;
    let active = true;

    void client.auth.getSession().then(async ({ data: sessionData }) => {
      if (!active) return;
      const next = sessionData.session;

      if (!next) {
        const returnTo = `/parent/check-in?location=${encodeURIComponent(locationSlug)}`;
        router.replace(`/parent-login?returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }

      setSession(next);
      try {
        await load(next, locationSlug);
        setError("");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not open family check-in.");
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [load, locationSlug, router]);

  function toggleChild(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function submit(action: "checkin" | "checkout") {
    if (!session || !data || !selectedIds.length) return;
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/parent/attendance", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          location: data.location.slug,
          action,
          pin,
          childIds: selectedIds,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        results?: Array<{ name: string; status: string }>;
      };
      if (!response.ok) throw new Error(payload.error || "Attendance could not be updated.");

      const names = payload.results?.map((item) => item.name).filter(Boolean).join(", ") || "Your child";
      setSuccess(
        action === "checkin"
          ? `${names} checked in at ${data.location.name}.`
          : `${names} checked out from ${data.location.name}.`,
      );
      setPin("");
      await load(session, data.location.slug);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Attendance could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#f5f1e8] p-4">
        <div className="text-center">
          <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-emerald-700" />
          <p className="mt-3 text-sm font-black text-slate-700">Opening family check-in…</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-[100dvh] bg-[#f5f1e8] p-4 sm:p-8">
        <section className="mx-auto mt-16 max-w-xl rounded-[28px] border border-red-200 bg-white p-7 text-center shadow-xl">
          <DoorOpen className="mx-auto h-10 w-10 text-red-700" />
          <h1 className="mt-3 text-2xl font-black text-slate-950">Family check-in needs attention</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{error || "This location QR could not be opened."}</p>
          <button onClick={() => router.push("/parent")} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Back to Parent Portal</button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#f5f1e8] pb-10 text-slate-950">
      <header className="bg-gradient-to-br from-[#173d29] via-[#245a39] to-[#10291e] px-4 pb-7 pt-[max(1rem,env(safe-area-inset-top))] text-white shadow-lg">
        <div className="mx-auto max-w-xl">
          <button onClick={() => router.push("/parent")} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-black">
            <ArrowLeft className="h-4 w-4" /> Parent Portal
          </button>
          <div className="mt-5 flex items-start gap-3">
            <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-white/10"><MapPin className="h-6 w-6" /></span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-200">TCS Family Check-In</p>
              <h1 className="mt-1 text-3xl font-black">{data.location.name}</h1>
              <p className="mt-1 text-sm font-semibold text-emerald-50/80">{data.location.fullName}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-xl space-y-4 p-4">
        {success && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-black text-emerald-900">
            <CheckCircle2 className="mr-1 inline h-5 w-5" /> {success}
          </div>
        )}
        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900">{error}</div>}

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-emerald-700" />
            <div>
              <h2 className="font-black">Choose the children with you today</h2>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">The QR code already selected {data.location.name}. Your child’s permanent enrollment location is not changed.</p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {data.children.map((child) => {
              const checked = selectedIds.includes(child.id);
              const today = child.attendanceDate === todayPacific();
              return (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => toggleChild(child.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition ${checked ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"}`}
                >
                  <div>
                    <strong className="text-sm text-slate-950">{child.name}</strong>
                    <p className="mt-1 text-[10px] font-semibold text-slate-500">
                      {today ? `${child.attendanceToday || "Not marked"} • ${child.attendanceLocation || child.homeLocation}` : `Home site: ${child.homeLocation}`}
                    </p>
                    {today && child.checkedInAt && <p className="mt-1 text-[10px] font-bold text-emerald-700">In {timeLabel(child.checkedInAt)}{child.checkedOutAt ? ` • Out ${timeLabel(child.checkedOutAt)}` : ""}</p>}
                  </div>
                  <span className={`grid h-6 w-6 flex-none place-items-center rounded-full border text-xs font-black ${checked ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-300 text-transparent"}`}>✓</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-[28px] border border-violet-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 flex-none text-violet-700" />
            <div>
              <h2 className="font-black">Family Attendance PIN</h2>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">Enter the 4–6 digit PIN you created in your Parent Portal.</p>
            </div>
          </div>

          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="4–6 digits"
            className="mt-4 w-full rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4 text-center text-2xl font-black tracking-[.35em] text-violet-950 outline-none focus:border-violet-500"
          />

          {!data.children.every((child) => child.attendancePinConfigured) && (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900">
              Your family PIN is not set for every linked child yet. Open the Parent Portal and set your Family Attendance PIN first.
            </p>
          )}
        </section>

        <section className="grid grid-cols-2 gap-3">
          <button
            disabled={saving || !selectedIds.length || !/^\d{4,6}$/.test(pin)}
            onClick={() => void submit("checkin")}
            className="inline-flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 text-sm font-black text-white shadow-lg disabled:opacity-40"
          >
            {saving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />} Check In
          </button>
          <button
            disabled={saving || !selectedIds.length || !/^\d{4,6}$/.test(pin)}
            onClick={() => void submit("checkout")}
            className="inline-flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 text-sm font-black text-white shadow-lg disabled:opacity-40"
          >
            {saving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />} Check Out
          </button>
        </section>

        <p className="px-2 text-center text-[10px] font-semibold leading-4 text-slate-500">
          Scanning a different TCS location QR automatically records that site for today only. It does not change the child’s enrolled home location.
        </p>
      </div>
    </main>
  );
}
