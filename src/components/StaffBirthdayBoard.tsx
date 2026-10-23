"use client";

import Link from "next/link";
import { CakeSlice, LoaderCircle, PartyPopper, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { birthdayMonths, formatBirthday, type BirthdayEntry } from "@/lib/staff-contact";

export default function StaffBirthdayBoard() {
  const { session, isSystemOwner } = useAuth();
  const token = session?.access_token;
  const [birthdays, setBirthdays] = useState<BirthdayEntry[]>([]);
  const [month, setMonth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/employee-lounge/birthdays", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal });
      const payload = await response.json() as { month: number; birthdays: BirthdayEntry[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load birthdays.");
      if (signal?.aborted) return;
      setMonth(payload.month);
      setBirthdays(payload.birthdays);
    } catch (loadError) {
      if (!signal?.aborted) setError(loadError instanceof Error ? loadError.message : "Could not load birthdays.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const controller = new AbortController();
    const initial = window.setTimeout(() => { void load(controller.signal); }, 0);
    return () => { window.clearTimeout(initial); controller.abort(); };
  }, [load]);

  return <section className="rounded-3xl border border-[#e8dcc8] bg-white p-5 shadow-lg">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fff0c9] text-[#b77713]"><CakeSlice className="h-5 w-5" /></span><div><h2 className="text-lg font-black text-[#0b3153]">Birthdays This Month</h2><p className="text-xs font-semibold text-slate-500">{month ? `${birthdayMonths[month - 1]} celebrations` : "Celebrate our amazing team."}</p></div></div>
      <button type="button" disabled={loading} onClick={() => void load()} aria-label="Refresh birthdays" className="rounded-lg p-2 text-[#2f6b37] disabled:opacity-50"><RefreshCw className="h-4 w-4" /></button>
    </div>
    {loading ? <p role="status" className="mt-5 flex items-center gap-2 text-sm text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading birthdays…</p> : error ? <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : birthdays.length ? <ul className="mt-5 space-y-3">{birthdays.map((birthday) => <li key={birthday.id} className="flex items-center gap-3 rounded-2xl bg-[#fffaf1] p-4"><PartyPopper aria-hidden="true" className="h-6 w-6 shrink-0 text-[#b77713]" /><div><p className="text-sm font-black text-[#0b3153]">{birthday.name}</p><p className="mt-1 text-xs font-bold text-[#2f6b37]">{formatBirthday(birthday.month, birthday.day)}</p></div></li>)}</ul> : <div className="mt-5 rounded-2xl border border-dashed border-[#d8c49c] bg-[#fffaf1] p-5 text-center"><PartyPopper className="mx-auto h-9 w-9 text-[#d89a23]" /><p className="mt-3 text-sm font-black text-[#0b3153]">No team birthdays listed this month</p><p className="mt-1 text-sm leading-6 text-slate-600">An admin can add a missing birthday in Team Access.</p></div>}
    {isSystemOwner && <Link href="/team-access" className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#d89a23] px-4 py-3 text-sm font-black text-[#0b3153]">Manage Team Birthdays</Link>}
  </section>;
}
