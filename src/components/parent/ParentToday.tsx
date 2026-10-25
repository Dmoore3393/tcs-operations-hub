"use client";

import { ArrowRight, Bell, CalendarDays, FileSignature, Heart, Utensils } from "lucide-react";
import Link from "next/link";

type CareUpdate = { id: string; date: string; time: string; category: string; action: string; result: string };
function careTime(value: string) {
  if (!/^\d{1,2}:\d{2}$/.test(value)) return value;
  const [hours, minutes] = value.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}
export default function ParentToday({ firstName, today, entries, unread, forms, viewCare, viewMessages, viewForms, viewSchedule }: {
  firstName: string; today: string; entries: CareUpdate[]; unread: number; forms: number;
  viewCare: boolean; viewMessages: boolean; viewForms: boolean; viewSchedule: boolean;
}) {
  const todayEntries = entries.filter((entry) => entry.date === today).sort((a, b) => b.time.localeCompare(a.time));
  const meals = todayEntries.filter((entry) => entry.category === "Meal" || entry.category === "Bottle").length;
  const actions = [
    ...(viewMessages ? [{ href: "/parent/messages", title: unread ? `${unread} unread message${unread === 1 ? "" : "s"}` : "Messages with TCS", detail: unread ? "Open your family conversation" : "Ask a question or read a reply", icon: Bell, attention: unread > 0 }] : []),
    ...(viewForms ? [{ href: "/parent/forms", title: forms ? `${forms} family form${forms === 1 ? "" : "s"} waiting` : "Family forms", detail: forms ? "See what needs your attention" : "Review your family records", icon: FileSignature, attention: forms > 0 }] : []),
    ...(viewSchedule ? [{ href: "/parent/schedule", title: "Plan upcoming care", detail: "Submit and track your weekly schedule", icon: CalendarDays, attention: false }] : []),
  ];
  return <section className="space-y-4" aria-label="Your family today">
    <div className="grid gap-3 md:grid-cols-3">{actions.map(({ icon: Icon, ...action }) => <Link key={action.href} href={action.href} className={`flex min-h-32 items-start gap-3 rounded-2xl border p-5 shadow-sm ${action.attention ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-200 bg-white text-emerald-950"}`}><Icon className="mt-1 h-6 w-6 shrink-0" aria-hidden="true" /><div className="min-w-0 flex-1"><h2 className="text-lg font-black">{action.title}</h2><p className="mt-2 text-base leading-7">{action.detail}</p></div><ArrowRight className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" /></Link>)}</div>
    {viewCare && <div className="overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 bg-emerald-50 p-5"><div><p className="text-sm font-bold uppercase tracking-wider text-emerald-800">Shared care updates</p><h2 className="mt-1 text-2xl font-black text-slate-950">Today for {firstName}</h2></div><Link href="/parent/care" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2 font-bold text-white">Care & photos <ArrowRight className="h-5 w-5" aria-hidden="true" /></Link></div>
      <div className="p-5"><div className="mb-4 flex flex-wrap gap-3 text-base font-bold text-emerald-950"><span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2"><Heart className="h-5 w-5" aria-hidden="true" />{todayEntries.length} updates today</span><span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-2"><Utensils className="h-5 w-5" aria-hidden="true" />{meals} meal / bottle entries</span></div>
        {todayEntries.length ? <ol className="space-y-3">{todayEntries.slice(0, 3).map((entry) => <li key={entry.id} className="flex gap-4 rounded-2xl border border-slate-200 p-4"><span className="shrink-0 font-bold text-emerald-900">{careTime(entry.time)}</span><div className="min-w-0"><p className="break-words text-lg font-bold text-slate-950">{entry.category} · {entry.action}</p>{entry.result && <p className="mt-1 break-words text-lg leading-7 text-slate-700">{entry.result}</p>}</div></li>)}</ol> : <p className="text-lg leading-8 text-slate-700">No care updates have been shared for today yet. Recent care and photos are available in the Care tab.</p>}
      </div>
    </div>}
  </section>;
}
