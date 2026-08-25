"use client";

import type { SmartAlert } from "@/lib/operations-intelligence";
import { ArrowRight, Bot, CheckCircle2, CircleAlert, Info, ShieldAlert, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const visual = {
  critical: { icon: ShieldAlert, className: "border-red-200 bg-red-50 text-red-800", badge: "bg-red-100 text-red-800" },
  warning: { icon: CircleAlert, className: "border-amber-200 bg-amber-50 text-amber-900", badge: "bg-amber-100 text-amber-900" },
  info: { icon: Info, className: "border-blue-200 bg-blue-50 text-blue-900", badge: "bg-blue-100 text-blue-900" },
  success: { icon: CheckCircle2, className: "border-emerald-200 bg-emerald-50 text-emerald-900", badge: "bg-emerald-100 text-emerald-900" },
};

export default function SmartAlertsPanel({ alerts }: { alerts: SmartAlert[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? alerts : alerts.slice(0, 5);
  const issueCount = alerts.filter((alert) => alert.severity !== "success").length;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--theme-700)]"><Sparkles className="h-4 w-4" /> Smart conflict detector</div>
          <h2 className="mt-2 text-xl font-black text-slate-950">Schedule, ratio & route alerts</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">The Hub checks entered care times, operating hours, staff coverage, location capacity, route details, and vehicle limits.</p>
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700"><Bot className="h-3.5 w-3.5" /> {issueCount} item{issueCount === 1 ? "" : "s"} found</div>
      </div>

      <div className="mt-5 space-y-3">
        {!alerts.length && <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800"><CheckCircle2 className="h-5 w-5" /></div><div><p className="font-black">No conflicts found in your accessible tools</p><p className="mt-1 text-sm leading-6 text-emerald-800">The Hub did not find a schedule, ratio, route, file, or work-plan issue that this account is authorized to review.</p></div></div>}
        {visible.map((alert) => {
          const config = visual[alert.severity];
          const Icon = config.icon;
          return (
            <div key={alert.id} className={`rounded-2xl border p-4 ${config.className}`}>
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${config.badge}`}><Icon className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-black">{alert.title}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${config.badge}`}>{alert.category}</span></div>
                  <p className="mt-1 text-sm leading-6 opacity-85">{alert.detail}</p>
                  <p className="mt-1 text-xs font-bold opacity-65">{alert.location}</p>
                </div>
                <Link href={alert.href} className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-white/80 px-3 py-2 text-xs font-black shadow-sm transition hover:-translate-y-0.5">{alert.actionLabel}<ArrowRight className="h-3.5 w-3.5" /></Link>
              </div>
            </div>
          );
        })}
      </div>
      {alerts.length > 5 && <button type="button" onClick={() => setExpanded((current) => !current)} className="mt-4 text-sm font-black text-[var(--theme-700)]">{expanded ? "Show fewer alerts" : `Show all ${alerts.length} alerts`}</button>}
    </section>
  );
}
