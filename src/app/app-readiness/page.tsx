"use client";

import MainLayout from "@/components/layout/MainLayout";
import { PageIntro, SectionCard, StatCard, StatusBadge } from "@/components/hub/HubUI";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  PackageCheck,
  ShieldCheck,
  Smartphone,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type CheckStatus = "pass" | "warning" | "manual";
type ReadinessCheck = {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  action?: string;
};
type ReadinessPayload = {
  generatedAt: string;
  release: string;
  summary: {
    automatedChecks: number;
    passing: number;
    warnings: number;
    manualChecks: number;
    activeStaff: number;
    owners: number;
    licensees: number;
    employees: number;
    approvedLanes: number;
    linkedLanes: number;
    encryptedDocumentCount: number;
  };
  checks: ReadinessCheck[];
  unlinkedLanes: Array<{
    id: string;
    fullName: string;
    preferredName: string | null;
    jobTitle: string;
    laneGroup: string;
  }>;
  roleAccounts: Array<{
    userId: string;
    fullName: string;
    role: string;
    accepted: boolean;
  }>;
};

function tone(status: CheckStatus) {
  if (status === "pass") return "green" as const;
  if (status === "warning") return "amber" as const;
  return "blue" as const;
}

function icon(status: CheckStatus) {
  if (status === "pass") return <CheckCircle2 className="h-5 w-5" />;
  if (status === "warning") return <AlertTriangle className="h-5 w-5" />;
  return <CircleDashed className="h-5 w-5" />;
}

export default function AppReadinessPage() {
  const { session } = useAuth();
  const [payload, setPayload] = useState<ReadinessPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const response = await fetch("/api/app-readiness", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({})) as ReadinessPayload & { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not run the app-readiness audit.");
      setPayload(body);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not run the app-readiness audit.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  const launchState = useMemo(() => {
    if (!payload) return { label: "Checking", detail: "Running launch-readiness checks." };
    if (payload.summary.warnings === 0) return { label: "Ready for device QA", detail: "Automated launch checks are clear. Finish the manual real-device test before native packaging." };
    return { label: "Finish launch items", detail: `${payload.summary.warnings} automated item${payload.summary.warnings === 1 ? "" : "s"} still need attention before v1 freeze.` };
  }, [payload]);

  return <MainLayout><div className="mx-auto max-w-[1550px] space-y-6 pb-12">
    <PageIntro
      eyebrow="v1 freeze • security • mobile launch"
      title="App Readiness Command Center"
      description="One final gate before The Hub is packaged as a native mobile app. This page checks the live production foundation and keeps the remaining human/device steps visible."
      actions={<button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-60">{loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />} Run Audit</button>}
    />

    <section className="overflow-hidden rounded-[30px] bg-gradient-to-br from-[#102419] via-[#174d34] to-[#0f172a] p-6 text-white shadow-xl">
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[.17em] text-emerald-200">The Hub v1 launch gate</p>
          <h2 className="mt-2 text-3xl font-black">{launchState.label}</h2>
          <p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-white/75">{launchState.detail}</p>
          {payload && <p className="mt-3 text-xs font-semibold text-white/55">Release: {payload.release.slice(0, 12)} • Audit: {new Date(payload.generatedAt).toLocaleString()}</p>}
        </div>
        <div className="rounded-2xl bg-white/10 p-4 text-right"><p className="text-[10px] font-black uppercase tracking-wider text-white/65">Automated checks</p><p className="mt-1 text-3xl font-black">{payload ? `${payload.summary.passing}/${payload.summary.automatedChecks}` : "—"}</p></div>
      </div>
    </section>

    {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">{error}</div>}

    {loading && !payload ? <div className="flex min-h-72 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-sm font-black text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Running production readiness checks…</div> : payload && <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Passing" value={payload.summary.passing} icon={<CheckCircle2 className="h-5 w-5" />} tone="emerald" />
        <StatCard label="Warnings" value={payload.summary.warnings} icon={<AlertTriangle className="h-5 w-5" />} tone={payload.summary.warnings ? "amber" : "emerald"} />
        <StatCard label="Manual Checks" value={payload.summary.manualChecks} icon={<Smartphone className="h-5 w-5" />} tone="blue" />
        <StatCard label="Linked Lanes" value={`${payload.summary.linkedLanes}/${payload.summary.approvedLanes}`} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Encrypted Files" value={payload.summary.encryptedDocumentCount} icon={<LockKeyhole className="h-5 w-5" />} tone="purple" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
        <SectionCard title="Launch Checks" description="Green is verified automatically. Amber needs configuration or an account. Blue is a real-world/manual step that code cannot honestly mark complete for you.">
          <div className="space-y-3">{payload.checks.map((item) => <article key={item.key} className={`rounded-2xl border p-4 ${item.status === "pass" ? "border-emerald-200 bg-emerald-50" : item.status === "warning" ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50"}`}>
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-xl ${item.status === "pass" ? "bg-emerald-100 text-emerald-800" : item.status === "warning" ? "bg-amber-100 text-amber-900" : "bg-blue-100 text-blue-800"}`}>{icon(item.status)}</span>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-950">{item.label}</h3><StatusBadge tone={tone(item.status)}>{item.status === "pass" ? "Verified" : item.status === "warning" ? "Needs Attention" : "Manual"}</StatusBadge></div><p className="mt-1 text-sm font-semibold leading-6 text-slate-700">{item.detail}</p>{item.action && <p className="mt-2 text-xs font-black leading-5 text-slate-600">Next: {item.action}</p>}</div>
            </div>
          </article>)}</div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Role Test Coverage" description="The native-app freeze needs all three software access levels tested, regardless of the person’s TCS lane.">
            <div className="space-y-3">{["Owner / Admin","Location Licensee","Employee"].map((role) => {
              const accounts = payload.roleAccounts.filter((item) => item.role === role);
              const accepted = accounts.filter((item) => item.accepted);
              return <div key={role} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><p className="font-black text-slate-950">{role}</p><StatusBadge tone={accepted.length ? "green" : "amber"}>{accepted.length ? "Available" : "Needed"}</StatusBadge></div>{accounts.length ? <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{accounts.map((item) => `${item.fullName}${item.accepted ? "" : " • setup pending"}`).join(" • ")}</p> : <p className="mt-2 text-xs font-semibold text-slate-500">No active account in this access level yet.</p>}</div>;
            })}</div>
          </SectionCard>

          <SectionCard title="Launch User Gaps" description="Lane records can exist before someone needs a login. These only become launch blockers for people who should use v1 on day one.">
            <div className="space-y-2">{payload.unlinkedLanes.slice(0, 12).map((lane) => <div key={lane.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-sm font-black text-slate-900">{lane.fullName}</p><p className="mt-1 text-xs font-semibold text-slate-500">{lane.jobTitle} • {lane.laneGroup}</p></div>)}{!payload.unlinkedLanes.length && <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900">Every lane is linked to a Hub account.</div>}{payload.unlinkedLanes.length > 12 && <p className="text-xs font-semibold text-slate-500">+ {payload.unlinkedLanes.length - 12} more unlinked lane records</p>}</div>
            <div className="mt-4 flex flex-wrap gap-2"><Link href="/team-access" className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">Team Access</Link><Link href="/organization" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">TCS Lanes</Link></div>
          </SectionCard>
        </div>
      </div>

      <SectionCard title="Real-Device Smoke Test" description="Do this once after the regular Employee test account is accepted. This is the final v1 freeze check before native packaging.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["1. Identity", "Sign in, confirm the correct TCS lane/title, assigned location(s), and that another location’s records are not exposed."],
            ["2. Daily Work", "Open published schedule, clock in/out inside the 4-minute window, take/end a break, and verify actual punches."],
            ["3. Requests & Alerts", "Submit time off, test a blocked date, receive a Hub notification, and open it from the phone."],
            ["4. Security", "Open only permitted files/tools, sign out, reopen the installed app, and verify the session is protected."],
          ].map(([title, detail]) => <div key={title} className="rounded-2xl border border-slate-200 p-4"><p className="font-black text-slate-950">{title}</p><p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{detail}</p></div>)}
        </div>
      </SectionCard>

      <SectionCard title="What v1 Freeze Means" description="Once the manual device checks pass, we stop changing the foundation and package the same production Hub for iPhone and Android.">
        <div className="grid gap-4 md:grid-cols-3">
          <LaunchItem icon={<ShieldCheck className="h-5 w-5" />} title="Security frozen" text="Role/location boundaries, encrypted documents, session behavior, and server-only operations are verified." />
          <LaunchItem icon={<PackageCheck className="h-5 w-5" />} title="Workflow frozen" text="Schedules, Time Clock, time off, staffing, performance, lanes, files, and notifications work as the v1 baseline." />
          <LaunchItem icon={<Smartphone className="h-5 w-5" />} title="Native packaging next" text="After freeze, the mobile shell adds native distribution and notifications without creating a second backend." />
        </div>
      </SectionCard>
    </>}
  </div></MainLayout>;
}

function LaunchItem({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-800">{icon}</div><p className="mt-3 font-black text-slate-950">{title}</p><p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{text}</p></div>;
}
