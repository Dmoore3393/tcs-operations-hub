"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import type { OperationsBriefingSnapshot } from "@/lib/operations-intelligence";
import { buildLocalBriefing } from "@/lib/operations-intelligence";
import { Bot, CheckCircle2, LoaderCircle, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

export default function MorningBriefing({ snapshot }: { snapshot: OperationsBriefingSnapshot }) {
  const { session, profile } = useAuth();
  const fallback = useMemo(() => buildLocalBriefing(snapshot), [snapshot]);
  const [answer, setAnswer] = useState("");
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshBriefing() {
    if (!session?.access_token) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ai/operations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: "briefing", snapshot }),
      });
      const payload = (await response.json()) as { answer?: string; connected?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "The morning briefing could not be refreshed.");
      setAnswer(payload.answer ?? "");
      setConnected(Boolean(payload.connected));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The morning briefing could not be refreshed.");
    } finally {
      setLoading(false);
    }
  }

  const hasIssues = snapshot.criticalAlerts > 0 || snapshot.warningAlerts > 0;

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="relative overflow-hidden p-5 sm:p-6" style={{ background: "linear-gradient(135deg, var(--theme-950), var(--theme-700))", color: "var(--theme-on-primary)" }}>
        <div className="absolute -right-12 -top-14 h-44 w-44 rounded-full bg-white/10" />
        <div className="absolute bottom-0 right-24 h-20 w-20 rotate-12 rounded-3xl bg-white/8" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] opacity-80"><Sparkles className="h-4 w-4" /> AI Morning Command Center</div>
            <h2 className="mt-3 text-2xl font-black sm:text-3xl">Good morning, {profile?.full_name?.split(" ")[0] || "TCS Team"}!</h2>
            {answer ? (
              <div className="mt-4 whitespace-pre-line text-sm font-semibold leading-7 opacity-95 sm:text-base">{answer}</div>
            ) : (
              <>
                <p className="mt-3 text-sm font-semibold leading-7 opacity-90 sm:text-base">{fallback.summary}</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {fallback.priorities.slice(0, 3).map((priority, index) => (
                    <div key={priority} className="rounded-2xl border border-white/15 bg-white/10 p-3 text-sm font-bold backdrop-blur">
                      <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-xs">{index + 1}</span>{priority}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="shrink-0">
            <button type="button" disabled={loading || !session?.access_token} onClick={() => void refreshBriefing()} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black shadow-lg transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60" style={{ color: "var(--theme-950)" }}>
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : answer ? <RefreshCw className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              {loading ? "Building briefing…" : answer ? "Refresh briefing" : "Ask TCS AI"}
            </button>
            {connected !== null && <p className="mt-2 text-center text-[11px] font-bold opacity-75">{connected ? "Live AI connected" : "Local smart summary"}</p>}
          </div>
        </div>
      </div>
      <div className="grid gap-px bg-slate-200 sm:grid-cols-4">
        <BriefStat label="Scheduled children" value={snapshot.scheduledChildren} />
        <BriefStat label="Scheduled staff" value={snapshot.scheduledStaff} />
        <BriefStat label="Critical alerts" value={snapshot.criticalAlerts} danger={snapshot.criticalAlerts > 0} />
        <BriefStat label="Warnings" value={snapshot.warningAlerts} warning={snapshot.warningAlerts > 0} />
      </div>
      {error && <div className="flex items-start gap-2 border-t border-red-200 bg-red-50 px-5 py-3 text-sm font-bold text-red-800"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {!error && !hasIssues && <div className="flex items-center gap-2 border-t border-emerald-100 bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> No major schedule or coverage conflicts were found in the information entered.</div>}
    </section>
  );
}

function BriefStat({ label, value, danger = false, warning = false }: { label: string; value: number; danger?: boolean; warning?: boolean }) {
  return <div className="bg-white px-5 py-4"><p className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</p><p className={`mt-1 text-2xl font-black ${danger ? "text-red-700" : warning ? "text-amber-700" : "text-slate-950"}`}>{value}</p></div>;
}
