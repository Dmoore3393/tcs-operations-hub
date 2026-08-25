"use client";

import MainLayout from "@/components/layout/MainLayout";
import Link from "next/link";
import { PageIntro, PrimaryButton, SectionCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { initialChildren, type ChildRecord } from "@/lib/children";
import { starterChildSchedules, type ChildScheduleRecord } from "@/lib/child-schedules";
import { starterFiles, starterRoutes, starterShifts, starterTasks, starterVehicles, type FileRecord, type Shift, type TransportationRoute, type VehicleRecord, type WorkTask } from "@/lib/hub-data";
import { careLocations, starterLocationHours, type LocationHoursRecord } from "@/lib/location-config";
import { buildBriefingSnapshot, buildSmartAlerts } from "@/lib/operations-intelligence";
import { localIsoDate } from "@/lib/date-utils";
import { Bot, ClipboardCopy, LoaderCircle, Send, ShieldCheck, Sparkles, WandSparkles } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type Message = { id: number; role: "user" | "assistant"; content: string };
const suggestions = [
  "Review today’s most urgent schedule, ratio, and transportation issues.",
  "Draft the Friday family schedule reminder without sharing internal report information.",
  "Create a step-by-step plan to resolve today’s coverage warnings.",
  "Summarize what the closing team needs to verify before the end of the day.",
];

export default function AIDirectorPage() {
  const { session, profile } = useAuth();
  const { availableLocations, location } = useHubLocation();
  const [messages, setMessages] = useState<Message[]>([{ id: 1, role: "assistant", content: "Hi! I’m TCS AI Director. I can review the authorized operations snapshot, explain conflicts, draft messages, and organize next steps. I will not change official records without your approval." }]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [error, setError] = useState("");

  const [children] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const [schedules] = usePersistentState<ChildScheduleRecord[]>("tcs-child-schedules-v2", starterChildSchedules);
  const [tasks] = usePersistentState<WorkTask[]>("tcs-work-tasks", starterTasks);
  const [routes] = usePersistentState<TransportationRoute[]>("tcs-routes", starterRoutes);
  const [files] = usePersistentState<FileRecord[]>("tcs-files", starterFiles);
  const [shifts] = usePersistentState<Shift[]>("tcs-shifts", starterShifts);
  const [hours] = usePersistentState<LocationHoursRecord[]>("tcs-location-hours-v2", starterLocationHours);
  const [vehicles] = usePersistentState<VehicleRecord[]>("tcs-vehicles-v2", starterVehicles);

  const accessibleCareLocations = careLocations.filter((item) => availableLocations.includes(item) && (location === "All Locations" || item === location));
  const intelligence = useMemo(() => {
    const input = { date: localIsoDate(), accessibleLocations: accessibleCareLocations, children, schedules, shifts, routes, vehicles, hours, files, tasks };
    const alerts = buildSmartAlerts(input);
    return { snapshot: buildBriefingSnapshot(input, alerts), alerts };
  }, [accessibleCareLocations, children, files, hours, routes, schedules, shifts, tasks, vehicles]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = prompt.trim();
    if (!text || loading || !session?.access_token) return;
    const userMessage: Message = { id: Date.now(), role: "user", content: text };
    setMessages((current) => [...current, userMessage]);
    setPrompt("");
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ai/operations", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          prompt: text,
          snapshot: { ...intelligence.snapshot, activeLocation: location, alerts: intelligence.alerts.slice(0, 10) },
          history: [...messages, userMessage].slice(-8),
        }),
      });
      const payload = (await response.json()) as { answer?: string; connected?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "TCS AI could not complete the request.");
      setMessages((current) => [...current, { id: Date.now() + 1, role: "assistant", content: payload.answer || "No response was returned." }]);
      setConnected(Boolean(payload.connected));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "TCS AI could not complete the request.";
      setError(message);
      setMessages((current) => [...current, { id: Date.now() + 2, role: "assistant", content: `I could not finish that request: ${message}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function copyLatest() {
    const latest = [...messages].reverse().find((message) => message.role === "assistant");
    if (latest) await navigator.clipboard.writeText(latest.content);
  }

  return <MainLayout><div className="mx-auto max-w-[1400px] space-y-6">
    <PageIntro eyebrow="Live operations assistant" title="TCS AI Director" description="Ask questions about the authorized schedule, ratio, route, task, and file summary. TCS AI drafts and recommends; staff review and save official changes." actions={<><Link href="/print-studio" className="tcs-primary-button inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold"><Sparkles className="h-4 w-4" /> Printable Studio</Link><button onClick={() => void copyLatest()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700"><ClipboardCopy className="h-4 w-4" /> Copy Latest Reply</button></>} />

    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-400">Current scope</p><p className="mt-2 font-black text-slate-950">{location}</p><p className="mt-1 text-xs text-slate-500">Limited by {profile?.role} access</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-400">Smart alerts</p><p className="mt-2 text-2xl font-black text-slate-950">{intelligence.alerts.filter((item) => item.severity !== "success").length}</p><p className="mt-1 text-xs text-slate-500">From entered schedules and operations data</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-400">AI connection</p><div className="mt-2"><StatusBadge tone={connected === false ? "amber" : connected ? "green" : "purple"}>{connected === false ? "Local fallback" : connected ? "OpenAI connected" : "Ready to test"}</StatusBadge></div><p className="mt-2 text-xs text-slate-500">Requests are server-side and official records are not changed automatically.</p></div>
    </div>

    <div className="grid gap-6 xl:grid-cols-[.32fr_.68fr]">
      <SectionCard title="Try a Task" description="Choose one or type your own request."><div className="space-y-3">{suggestions.map((item) => <button key={item} onClick={() => setPrompt(item)} className="flex w-full items-start gap-3 rounded-2xl border border-slate-200 p-4 text-left hover:border-purple-300 hover:bg-purple-50/40"><WandSparkles className="mt-0.5 h-5 w-5 shrink-0 text-purple-600" /><span className="font-bold text-slate-800">{item}</span></button>)}<div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-2 font-black text-slate-900"><ShieldCheck className="h-4 w-4 text-emerald-700" /> Safe operating rules</div><p className="mt-2 text-sm leading-6 text-slate-600">The assistant uses a summarized, authorized snapshot, keeps opening/closing reports internal, avoids unnecessary child details, and asks staff to verify missing information.</p></div></div></SectionCard>

      <section className="flex min-h-[690px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700"><Bot className="h-5 w-5" /></div><div><h2 className="font-black text-slate-950">TCS AI Director</h2><p className="text-xs text-slate-500">Private employee workspace • Authorized scope only</p></div></div>
        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-5">{messages.map((message) => <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] whitespace-pre-line rounded-2xl px-4 py-3 text-sm leading-7 ${message.role === "user" ? "bg-[var(--theme-600)] text-[var(--theme-on-primary)]" : "border border-slate-200 bg-white text-slate-700 shadow-sm"}`}>{message.content}</div></div>)}{loading && <div className="flex justify-start"><div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 shadow-sm"><LoaderCircle className="h-4 w-4 animate-spin" /> Reviewing authorized operations…</div></div>}</div>
        {error && <div className="border-t border-red-200 bg-red-50 px-5 py-3 text-sm font-bold text-red-800">{error}</div>}
        <form onSubmit={(event) => void submit(event)} className="border-t border-slate-200 bg-white p-4"><div className="flex gap-3"><textarea className={`${inputClass} min-h-20 resize-none`} placeholder="Ask about today’s priorities, staffing conflicts, a message draft, a checklist, or a plan…" value={prompt} onChange={(event) => setPrompt(event.target.value)} /><PrimaryButton type="submit" disabled={loading || !prompt.trim()}><Send className="h-4 w-4" /><span className="hidden sm:inline">Send</span></PrimaryButton></div></form>
      </section>
    </div>
  </div></MainLayout>;
}
