"use client";

import { canAccessRoute, useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { useLocalDateTime } from "@/hooks/useLocalDateTime";
import type { WorkTask } from "@/lib/hub-data";
import type { HandoffItem, ShiftReport } from "@/lib/employee-care";
import { buildFollowThrough } from "@/lib/follow-through";
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardCheck, MessageSquareText, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import CommunicationGlance from "@/components/dashboard/CommunicationGlance";

export default function NeedsAttention({ tasks, familyReplies = 0, taskState }: { tasks: WorkTask[]; familyReplies?: number; taskState?: { loading: boolean; error: string; retry: () => void } }) {
  const { profile, isEmployee } = useAuth();
  const { location } = useHubLocation();
  const now = useLocalDateTime();
  const [mine, setMine] = useState(isEmployee);
  const [handoffs, , , handoffState] = usePersistentState<HandoffItem[]>("tcs-shift-handoffs-v1", []);
  const [reports, , , reportState] = usePersistentState<ShiftReport[]>("tcs-shift-reports-v1", []);
  const canHandoff = canAccessRoute(profile, "/shift-reports");
  const items = buildFollowThrough({ tasks, handoffs: canHandoff ? handoffs : [], reports: canHandoff ? reports : [], location, staffName: profile?.full_name || "", mine, canReview: !isEmployee, now: now?.getTime() || 0 });
  const error = (canHandoff && (handoffState.error || reportState.error)) || taskState?.error;
  return <section className="overflow-hidden rounded-[28px] border border-emerald-200 bg-white shadow-sm" aria-labelledby="attention-title">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50 p-5"><div><p className="text-sm font-bold uppercase tracking-wider text-emerald-800">Follow-through</p><h2 id="attention-title" className="mt-1 text-2xl font-black text-slate-950">Needs attention</h2><p className="mt-2 text-base text-slate-700">Deadlines, pickup notes and reports for {location === "All Locations" ? "your accessible locations" : location}.</p></div><Link href="/communications" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2 font-bold text-white"><MessageSquareText className="h-5 w-5" aria-hidden="true" />Open communications</Link></header>
    <div className="p-5"><div className="mb-5 grid gap-3 lg:grid-cols-2"><CommunicationGlance />{canAccessRoute(profile, "/family-communications") && <Link href="/family-communications" className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-violet-950"><MessageSquareText className="mt-1 h-6 w-6 shrink-0" aria-hidden="true" /><div><h3 className="text-lg font-black">Family inbox</h3><p className="mt-2 text-base leading-7">{familyReplies} unread family replies · Open secure conversations</p></div></Link>}</div><div className="mb-4 flex flex-wrap gap-2"><button className={`min-h-11 rounded-xl border px-4 py-2 font-bold ${mine ? "border-emerald-700 bg-emerald-50 text-emerald-950" : "border-slate-300 text-slate-700"}`} aria-pressed={mine} onClick={() => setMine(true)}>My tasks + team handoffs</button><button className={`min-h-11 rounded-xl border px-4 py-2 font-bold ${!mine ? "border-emerald-700 bg-emerald-50 text-emerald-950" : "border-slate-300 text-slate-700"}`} aria-pressed={!mine} onClick={() => setMine(false)}>Location follow-up</button></div>
      {error && <div role="alert" className="mb-4 rounded-xl bg-amber-50 p-4 text-amber-950"><p>Some follow-up information could not load. {error}</p><button className="mt-2 inline-flex min-h-11 items-center gap-2 font-bold underline" onClick={() => { handoffState.retry(); reportState.retry(); taskState?.retry(); }}><RefreshCw className="h-5 w-5" aria-hidden="true" />Try again</button></div>}
      <div className="grid gap-3 lg:grid-cols-2">{items.slice(0, 6).map((item) => <Link key={item.id} href={item.href} className={`flex min-w-0 items-start gap-3 rounded-2xl border p-4 hover:bg-slate-50 ${item.priority < 2 ? "border-red-200 bg-red-50/40" : "border-slate-200"}`}>
        {item.priority < 2 ? <AlertCircle className="mt-1 h-5 w-5 shrink-0 text-red-800" aria-hidden="true" /> : <ClipboardCheck className="mt-1 h-5 w-5 shrink-0 text-emerald-800" aria-hidden="true" />}<div className="min-w-0 flex-1"><p className="break-words text-lg font-bold text-slate-950">{item.title}</p><p className="mt-2 text-base leading-6 text-slate-700">{item.overdue && <strong className="text-red-800">Overdue · </strong>}{item.detail}</p></div><ArrowRight className="mt-1 h-5 w-5 shrink-0 text-slate-600" aria-hidden="true" />
      </Link>)}</div>
      {!items.length && <p className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-lg leading-7 text-emerald-950"><CheckCircle2 className="mt-1 h-6 w-6 shrink-0" aria-hidden="true" />{(canHandoff && (handoffState.loading || reportState.loading)) || taskState?.loading ? "Checking follow-up…" : "No open items in this view. Your other tools are still available below."}</p>}
      {items.length > 6 && <p className="mt-4 text-base font-semibold text-slate-700">Showing the first 6 of {items.length} open items. Open Work Plans or Shift Handoffs to see the full list.</p>}
    </div>
  </section>;
}
