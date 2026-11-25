"use client";
import {useEffect, useRef} from "react";
import type {ClockPunchReceipt} from "@/lib/clock-punch";

const shell = "fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4";
const card = "max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl";

export function ConfirmClockPunch({action, location, pin, onPin, busy, ready, error, onConfirm, onCancel, onCheckStatus}: {
  action: "clock_in" | "clock_out"; location: string; pin: string; onPin: (value: string) => void;
  busy: boolean; ready: boolean; error: string; onConfirm: () => void; onCancel: () => void; onCheckStatus: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, [action]);
  const label = action === "clock_out" ? "Clock Out" : "Clock In";
  return <div className={shell}>
    <section role="dialog" aria-modal="true" aria-labelledby="confirm-clock-heading" className={card}>
      <h2 id="confirm-clock-heading" className="text-2xl font-black text-slate-950">Finish {action === "clock_out" ? "clocking out" : "clocking in"}</h2>
      <p className="mt-2 font-bold text-slate-700">{location}</p>
      <p className="mt-3 rounded-xl bg-amber-50 p-3 font-bold text-amber-900">{action === "clock_out" ? "You are not clocked out yet." : "You are not clocked in yet."} Enter your PIN and tap Confirm {label}. Wait for the saved confirmation.</p>
      <form className="mt-4 space-y-4" onSubmit={event => {event.preventDefault(); if (ready && !busy) onConfirm();}}>
        <label className="block font-bold text-slate-700">Your Staff PIN
          <input ref={input} type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin}
            onChange={event => onPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-center text-lg tracking-[.22em]" />
        </label>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 font-bold text-red-900">Not saved or confirmed: {error}</p>}
        {error && <button type="button" disabled={busy} onClick={onCheckStatus} className="min-h-12 w-full rounded-xl border border-slate-300 p-3 font-bold text-slate-700">Check saved status before trying again</button>}
        <div className="flex gap-3">
          <button type="button" disabled={busy} onClick={onCancel} className="min-h-12 rounded-xl border border-slate-300 px-4 font-bold text-slate-700">Cancel</button>
          <button type="submit" disabled={!ready || busy} className="min-h-12 flex-1 rounded-xl bg-emerald-700 px-4 font-black text-white disabled:bg-slate-400">{busy ? "Saving — please wait…" : `Confirm ${label}`}</button>
        </div>
      </form>
    </section>
  </div>;
}

export function SavedClockPunch({receipt, onDone}: {receipt: ClockPunchReceipt; onDone: () => void}) {
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => {done.current?.focus();}, []);
  const label = receipt.event === "clock_out" ? "Clock-out saved" : receipt.event === "clock_in" ? "Clock-in saved" : "Clock action saved";
  const time = new Intl.DateTimeFormat("en-US", {timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit", second: "2-digit"}).format(new Date(receipt.occurredAt));
  return <div className={shell}>
    <section role="dialog" aria-modal="true" aria-labelledby="saved-clock-heading" className={card}>
      <h2 id="saved-clock-heading" className="text-2xl font-black text-emerald-800">{label}</h2>
      <p role="status" className="mt-3 text-lg font-bold text-slate-950">{receipt.targetStaffName} • {time} Pacific</p>
      <p className="mt-2 font-semibold text-slate-700">{receipt.location}</p>
      <p className="mt-3 text-sm text-slate-600">Receipt #{receipt.id}. Your actual time has been recorded.</p>
      {receipt.scheduleReview?.map(reason => <p key={reason} className="mt-2 text-sm font-bold text-amber-800">For leadership review: {reason}</p>)}
      {receipt.reviewWarning ? <p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 font-bold text-amber-900">{receipt.reviewWarning}</p>
        : receipt.needsLeadershipReview && <p className="mt-3 text-sm font-bold text-amber-800">Your time is saved. Additional hours or schedule differences have been sent for leadership review.</p>}
      <button ref={done} onClick={onDone} className="mt-5 min-h-12 w-full rounded-xl bg-emerald-700 p-3 font-black text-white">Done</button>
    </section>
  </div>;
}
