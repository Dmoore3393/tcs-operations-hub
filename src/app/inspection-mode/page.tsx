"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { auditSummary, type ChildFileAudit } from "@/lib/child-file-audits";
import type { ChildRecord } from "@/lib/children";
import { emergencyCardReadiness } from "@/lib/emergency-cards";
import { defaultImmunizationProgram, immunizationStatus, normalizeImmunizationRecord } from "@/lib/immunization-tracker";
import { starterFiles, type FileRecord } from "@/lib/hub-data";
import { starterDigitalForms, type DigitalFormRecord } from "@/lib/admin-ops";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  FileHeart,
  FileWarning,
  HeartPulse,
  LoaderCircle,
  Printer,
  ShieldCheck,
  Syringe,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

function childName(child: ChildRecord) {
  return `${child.firstName} ${child.lastName}`.trim();
}

function latestAudit(child: ChildRecord): ChildFileAudit | null {
  const audits = Array.isArray(child.fileAudits) ? child.fileAudits : [];
  return [...audits].sort((a, b) =>
    (b.auditDate || b.updatedAt || "").localeCompare(a.auditDate || a.updatedAt || ""),
  )[0] ?? null;
}

function matchesLocation(value: string, selected: string) {
  if (selected === "All Locations") return true;
  return value.toLowerCase().includes(selected.toLowerCase()) || selected.toLowerCase().includes(value.toLowerCase());
}

export default function InspectionModePage() {
  const { session } = useAuth();
  const { location } = useHubLocation();
  const [files] = usePersistentState<FileRecord[]>("tcs-files", starterFiles);
  const [forms] = usePersistentState<DigitalFormRecord[]>("tcs-digital-forms-v1", starterDigitalForms);
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const response = await fetch("/api/children", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json() as { children?: ChildRecord[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load inspection data.");
      setChildren(Array.isArray(payload.children) ? payload.children : []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load inspection data.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  const scopedChildren = useMemo(
    () => children.filter((child) => child.enrollmentStatus !== "Archived" && matchesLocation(child.location, location)),
    [children, location],
  );
  const scopedFiles = files.filter((file) => location === "All Locations" || file.location === location);
  const scopedForms = forms.filter((form) => location === "All Locations" || form.location === location);

  const rows = useMemo(() => scopedChildren.map((child) => {
    const audit = latestAudit(child);
    const auditState = audit ? auditSummary(audit) : null;
    const emergency = emergencyCardReadiness(child);
    const shotRecord = normalizeImmunizationRecord(
      child.immunizationRecord,
      defaultImmunizationProgram(child.ageGroup, child.location),
    );
    const shots = immunizationStatus(child.dateOfBirth, shotRecord);
    const fileReady = Boolean(auditState?.complete) && child.licensingStatus === "Complete" && child.missingDocuments.length === 0;
    const shotReady = ["Requirements Met", "Conditional", "Medical Exemption"].includes(shots);
    return { child, audit, auditState, emergency, shots, fileReady, shotReady };
  }), [scopedChildren]);

  const ready = rows.filter((row) => row.fileReady && row.emergency.ready && row.shotReady).length;
  const notReady = rows.length - ready;
  const openFiles = scopedFiles.filter((file) => file.status !== "Complete");
  const openForms = scopedForms.filter((form) => !["Signed", "Archived"].includes(form.status));

  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-6 print:max-w-none print:space-y-4">
    <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-xl print:border-0 print:p-0 print:shadow-none">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[.18em] text-emerald-700">Inspection-ready view</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Licensing Inspection Mode</h1>
          <p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-slate-600">A fast, read-only snapshot of the records most likely to need attention during a licensing review. Open the secured source record for full documentation.</p>
        </div>
        <button onClick={() => window.print()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white print:hidden"><Printer className="h-4 w-4" /> Print Inspection Snapshot</button>
      </div>
      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-900 print:border-slate-300 print:bg-white">This is a TCS readiness dashboard, not a substitute for original records requested by Community Care Licensing. Use the linked secured files to produce the source documents when requested.</div>
    </section>

    {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">{error}</div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 print:grid-cols-5">
      <Metric icon={<BadgeCheck className="h-5 w-5" />} label="Children Ready" value={ready} good />
      <Metric icon={<AlertTriangle className="h-5 w-5" />} label="Children Attention" value={notReady} good={notReady === 0} />
      <Metric icon={<FileWarning className="h-5 w-5" />} label="Open File Items" value={openFiles.length} good={openFiles.length === 0} />
      <Metric icon={<ClipboardCheck className="h-5 w-5" />} label="Open Form Workflows" value={openForms.length} good={openForms.length === 0} />
      <Metric icon={<ShieldCheck className="h-5 w-5" />} label="Location Scope" value={location === "All Locations" ? "All" : location} good />
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm print:shadow-none">
      <div className="border-b border-slate-200 px-5 py-4"><h2 className="text-xl font-black text-slate-950">Child record readiness</h2><p className="mt-1 text-xs font-semibold text-slate-500">File audit + emergency information + California immunization tracker.</p></div>
      {loading ? <div className="flex min-h-56 items-center justify-center gap-2 text-sm font-bold text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading inspection snapshot…</div> :
        rows.length === 0 ? <div className="p-8 text-center text-sm font-semibold text-slate-500">No active child records are visible in this location scope.</div> :
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><th className="px-4 py-3">Child</th><th className="px-4 py-3">File Audit</th><th className="px-4 py-3">Emergency</th><th className="px-4 py-3">Immunization</th><th className="px-4 py-3 print:hidden">Open</th></tr></thead><tbody>{rows.map(({ child, audit, emergency, shots, fileReady, shotReady }) => <tr key={child.id} className="border-b border-slate-100 align-top last:border-0"><td className="px-4 py-4"><p className="font-black text-slate-950">{childName(child)}</p><p className="mt-1 text-xs text-slate-500">{child.location}</p></td><td className="px-4 py-4"><State ok={fileReady} label={fileReady ? "Ready" : audit ? "Needs attention" : "No audit"} /><p className="mt-1 text-[10px] text-slate-500">{audit?.nextAuditDue ? `Next audit: ${audit.nextAuditDue}` : "Next audit not set"}</p></td><td className="px-4 py-4"><State ok={emergency.ready} label={emergency.ready ? "Emergency Ready" : "Needs attention"} />{!emergency.ready && <p className="mt-1 max-w-xs text-[10px] leading-4 text-red-700">{emergency.missing.slice(0, 3).join(" • ")}</p>}</td><td className="px-4 py-4"><State ok={shotReady} label={shots} /></td><td className="px-4 py-4 print:hidden"><div className="flex flex-wrap gap-2"><Link href={`/child-file-audits?child=${child.id}`} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-black">Audit</Link><Link href={`/emergency-cards?child=${child.id}`} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-black">Emergency</Link><Link href={`/immunization-tracker?child=${child.id}`} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-black">Shots</Link></div></td></tr>)}</tbody></table></div>}
    </section>

    <div className="grid gap-6 xl:grid-cols-2 print:grid-cols-2">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm print:shadow-none">
        <div className="flex items-center gap-3"><FileHeart className="h-5 w-5 text-red-700" /><div><h2 className="font-black text-slate-950">General files needing attention</h2><p className="text-xs text-slate-500">Child, staff, vehicle, or facility file items in the selected scope.</p></div></div>
        <div className="mt-4 space-y-2">{openFiles.length === 0 ? <p className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">No open general file items.</p> : openFiles.slice(0, 15).map((file) => <div key={file.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-slate-900">{file.person}</p><p className="mt-1 text-xs font-semibold text-slate-600">{file.document}</p><p className="mt-1 text-[10px] text-slate-500">{file.location} • {file.recordType}</p></div><span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-black text-amber-900">{file.status}</span></div></div>)}</div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm print:shadow-none">
        <div className="flex items-center gap-3"><ClipboardCheck className="h-5 w-5 text-blue-700" /><div><h2 className="font-black text-slate-950">Inspection shortcuts</h2><p className="text-xs text-slate-500">Open the secured source system when a record is requested.</p></div></div>
        <div className="mt-4 grid gap-2 print:hidden">
          <Shortcut href="/files" label="Encrypted Child / Staff / Facility Files" />
          <Shortcut href="/employees" label="Employee Records & Qualifications" />
          <Shortcut href="/child-file-audits" label="Child File Audit History" />
          <Shortcut href="/immunization-tracker" label="Immunization / Shot Records" />
          <Shortcut href="/emergency-cards" label="Emergency Information & Consent" />
          <Shortcut href="/ratios" label="Ratio & Coverage Records" />
          <Shortcut href="/audit-log" label="Immutable Audit History" />
        </div>
        <div className="hidden print:block"><p className="text-xs leading-5 text-slate-600">Source records remain in the secured Hub sections for Files, Employee Records, Child File Audits, Immunization Records, Emergency Cards, Ratios, and Audit History.</p></div>
      </section>
    </div>
  </div></MainLayout>;
}

function Metric({ icon, label, value, good }: { icon: React.ReactNode; label: string; value: number | string; good: boolean }) {
  return <div className={`rounded-2xl border p-4 ${good ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}><span className={good ? "text-emerald-700" : "text-red-700"}>{icon}</span><strong className="mt-2 block text-2xl font-black text-slate-950">{value}</strong><span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span></div>;
}
function State({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black ${ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}{label}</span>;
}
function Shortcut({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-800 transition hover:bg-slate-50">{label}<span>→</span></Link>;
}
