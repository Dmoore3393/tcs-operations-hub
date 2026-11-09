"use client";

import { LogIn, LogOut } from "lucide-react";

type Props = {
  locations: string[];
  location: string;
  onLocationChange: (location: string) => void;
  pin: string;
  onPinChange: (pin: string) => void;
  pinConfigured: boolean;
  state: "Off Clock" | "Working" | "On Break";
  busy: boolean;
  onClock: (event: "clock_in" | "clock_out") => void;
};

export default function FlexibleClockPanel(props: Props) {
  const { locations, location, onLocationChange, pin, onPinChange, pinConfigured, state, busy, onClock } = props;
  const ready = !busy && pinConfigured && /^\d{4,6}$/.test(pin);
  const choices = [...new Set([...locations.filter((item) => item !== "All Locations"), "Administration / Offsite", location])];

  return (
    <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wider text-emerald-800">Flexible hours enabled</p>
      <h2 className="mt-1 text-xl font-black text-slate-950">My Flexible Time Clock</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
        Clock in and out whenever you work, including unscheduled hours. Use your personal PIN; a published shift or QR scan is not required. Your actual hours are recorded.
      </p>
      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_220px_auto] lg:items-end">
        <label>
          <span className="mb-1 block text-sm font-black text-slate-600">Work location</span>
          <select value={location} disabled={busy || state !== "Off Clock"} onChange={(event) => onLocationChange(event.target.value)} className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-3 text-sm font-bold disabled:opacity-70">
            {choices.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-black text-slate-600">Your Staff PIN</span>
          <input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin}
            onChange={(event) => onPinChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="4–6 digits" className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-3 text-center text-base font-black tracking-[.22em]" />
        </label>
        <div className="flex gap-2">
          <button disabled={!ready || state !== "Off Clock"} onClick={() => onClock("clock_in")} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white disabled:opacity-40">
            <LogIn className="h-4 w-4" /> Clock In
          </button>
          <button disabled={!ready || state !== "Working"} onClick={() => onClock("clock_out")} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:opacity-40">
            <LogOut className="h-4 w-4" /> Clock Out
          </button>
        </div>
      </div>
      {!pinConfigured && <p className="mt-3 text-sm font-bold text-amber-800">Set up your staff clock PIN below before your first clock-in.</p>}
      {state === "On Break" && <p className="mt-3 text-sm font-bold text-slate-700">End your break below before clocking out.</p>}
    </section>
  );
}
