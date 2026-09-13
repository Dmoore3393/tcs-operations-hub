"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { PageIntro, SectionCard, StatCard, StatusBadge } from "@/components/hub/HubUI";
import { usePersistentState } from "@/hooks/usePersistentState";
import { auditSummary, type ChildFileAudit } from "@/lib/child-file-audits";
import type { ChildRecord } from "@/lib/children";
import { emergencyCardReadiness } from "@/lib/emergency-cards";
import { defaultImmunizationProgram, immunizationStatus, normalizeImmunizationRecord } from "@/lib/immunization-tracker";
import { starterFiles, type FileRecord } from "@/lib/hub-data";
import { starterDigitalForms, type DigitalFormRecord } from "@/lib/admin-ops";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bus,
  CheckCircle2,
  ClipboardCheck,
  FileClock,
  FileHeart,
  FileSignature,
  FolderOpen,
  HeartPulse,
  LoaderCircle,
  ShieldCheck,
  Syringe,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

function fileTone(status: FileRecord["status"]) {
  if (status === "Complete") return "green" as const;
  if (status === "Missing") return "red" as const;
  return "amber" as const;
}

function latestAudit(child: ChildRecord): ChildFileAudit | null {
  const audits = Array.isArray(child.fileAudits) ? child.fileAudits : [];
  return [...audits].sort((a, b) =>
    (b.auditDate || b.updatedAt || "").localeCompare(a.auditDate || a.updatedAt || ""),
  )[0] ?? null;
}

function childName(child: ChildRecord) {
  return `${child.firstName} ${child.lastName}`.trim();
}

function locationMatches(childLocation: string, selected: string) {
  if (selected === "All Locations") return true;
  return childLocation.toLowerCase().includes(selected.toLowerCase()) ||
    selected.toLowerCase().includes(childLocation.toLowerCase());
}

export default function CompliancePage() {
  const { location } = useHubLocation();
  const { session } = useAuth();
  const [files] = usePersistentState<FileRecord[]>("tcs-files", starterFiles);
  const [forms] = usePersistentState<DigitalFormRecord[]>("tcs-digital-forms-v1", starterDigitalForms);
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadChildren = useCallback(async () => {
    if (!session?.access_token) return;
    setLoadingChildren(true);
    try {
      const response = await fetch("/api/children", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json() as { children?: ChildRecord[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load child compliance data.");
      setChildren(Array.isArray(payload.children) ? payload.children : []);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load child compliance data.");
    } finally {
      setLoadingChildren(false);
    }
  }, [session?.access_token]);

  useEffect(() => { void loadChildren(); }, [loadChildren]);

  const scopedFiles = files.filter((item) => location === "All Locations" || item.location === location);
  const scopedForms = forms.filter((item) => location === "All Locations" || item.location === location);
  const scopedChildren = useMemo(
    () => children.filter((child) => child.enrollmentStatus !== "Archived" && locationMatches(child.location, location)),
    [children, location],
  );

  const missing = scopedFiles.filter((item) => item.status === "Missing");
  const expiring = scopedFiles.filter((item) => item.status === "Expiring Soon");
  const signatures = scopedFiles.filter((item) => item.status === "Needs Signature");
  const openDigitalForms = scopedForms.filter((item) => !["Signed", "Archived"].includes(item.status));
  const complete = scopedFiles.filter((item) => item.status === "Complete").length;
  const total = scopedFiles.length;

  const childReadiness = useMemo(() => scopedChildren.map((child) => {
    const audit = latestAudit(child);
    const auditState = audit ? auditSummary(audit) : null;
    const emergency = emergencyCardReadiness(child);
    const immunizationRecord = normalizeImmunizationRecord(
      child.immunizationRecord,
      defaultImmunizationProgram(child.ageGroup, child.location),
    );
    const shots = immunizationStatus(child.dateOfBirth, immunizationRecord);
    const fileReady = Boolean(auditState?.complete) && child.licensingStatus === "Complete" && child.missingDocuments.length === 0;
    const shotReady = shots === "Requirements Met" || shots === "Medical Exemption" || shots === "Conditional";
    const readinessParts = [fileReady, emergency.ready, shotReady];
    return {
      child,
      audit,
      auditState,
      emergency,
      shots,
      fileReady,
      shotReady,
      score: Math.round((readinessParts.filter(Boolean).length / readinessParts.length) * 100),
    };
  }), [scopedChildren]);

  const childAttention = childReadiness.filter((item) =>
    !item.fileReady || !item.emergency.ready || !item.shotReady,
  );
  const emergencyAttention = childReadiness.filter((item) => !item.emergency.ready);
  const shotAttention = childReadiness.filter((item) => !item.shotReady);
  const auditAttention = childReadiness.filter((item) => !item.fileReady);

  const attention = [...missing, ...expiring, ...signatures].sort((a, b) => {
    const rank = (status: FileRecord["status"]) => status === "Missing" ? 0 : status === "Needs Signature" ? 1 : status === "Expiring Soon" ? 2 : 3;
    return rank(a.status) - rank(b.status) || a.person.localeCompare(b.person);
  });

  const siteScore = childReadiness.length
    ? Math.round(childReadiness.reduce((sum, item) => sum + item.score, 0) / childReadiness.length)
    : 100;

  return <MainLayout><div className="mx-auto max-w-[1550px] space-y-6">
    <PageIntro eyebrow="TCS compliance command center 2.0" title="Compliance Command Center" description="One operating view for child-file audits, emergency readiness, shot records, signatures, expirations, and secured compliance workflows across the locations you are authorized to manage." />

    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950"><strong>Confidential administrative area:</strong> child medical, immunization, file, and employee compliance information remains restricted by TCS role and location permissions.</div>
    {loadError && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">{loadError}</div>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      <StatCard label="Compliance Readiness" value={`${siteScore}%`} icon={<ShieldCheck className="h-5 w-5" />} tone={siteScore >= 90 ? "emerald" : siteScore >= 75 ? "amber" : "red"} />
      <StatCard label="Child Files" value={auditAttention.length} helper="Need audit/document attention" icon={<ClipboardCheck className="h-5 w-5" />} tone={auditAttention.length ? "amber" : "emerald"} />
      <StatCard label="Emergency Records" value={emergencyAttention.length} helper="Not Emergency Ready" icon={<HeartPulse className="h-5 w-5" />} tone={emergencyAttention.length ? "red" : "emerald"} />
      <StatCard label="Shot Records" value={shotAttention.length} helper="Need doses, record, or review" icon={<Syringe className="h-5 w-5" />} tone={shotAttention.length ? "amber" : "emerald"} />
      <StatCard label="File Expirations" value={expiring.length} icon={<FileClock className="h-5 w-5" />} tone={expiring.length ? "amber" : "emerald"} />
      <StatCard label="Open Signatures" value={signatures.length + openDigitalForms.length} icon={<FileSignature className="h-5 w-5" />} tone={signatures.length + openDigitalForms.length ? "amber" : "emerald"} />
    </section>

    <div className="grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
      <SectionCard title="Children needing compliance attention" description="Cross-checks file audits, emergency readiness, and California immunization tracking so problems do not stay hidden in separate screens.">
        {loadingChildren ? <div className="flex min-h-44 items-center justify-center gap-2 text-sm font-bold text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Checking child readiness…</div> :
          childAttention.length === 0 ? <div className="rounded-2xl bg-emerald-50 p-6 text-sm font-semibold text-emerald-900"><CheckCircle2 className="mr-2 inline h-5 w-5" />All visible active child records currently pass the Hub readiness checks.</div> :
          <div className="space-y-3">{childAttention.slice(0, 20).map(({ child, emergency, shots, fileReady, score }) => <div key={child.id} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-950">{childName(child)}</p><span className={`rounded-full px-2 py-1 text-[10px] font-black ${score === 100 ? "bg-emerald-100 text-emerald-800" : score >= 67 ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-800"}`}>{score}% ready</span></div><p className="mt-1 text-xs font-semibold text-slate-500">{child.location}</p></div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={fileReady ? "green" : "amber"}>{fileReady ? "File Ready" : "File Attention"}</StatusBadge>
                <StatusBadge tone={emergency.ready ? "green" : "red"}>{emergency.ready ? "Emergency Ready" : "Emergency Attention"}</StatusBadge>
                <StatusBadge tone={shots === "Requirements Met" ? "green" : shots === "Medical Exemption" || shots === "Conditional" ? "amber" : "red"}>{shots}</StatusBadge>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/child-file-audits?child=${child.id}`} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">File Audit</Link>
              <Link href={`/emergency-cards?child=${child.id}`} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">Emergency Card</Link>
              <Link href={`/immunization-tracker?child=${child.id}`} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">Shot Record</Link>
              <Link href={`/children?editChild=${child.id}`} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">Open Child File</Link>
            </div>
          </div>)}</div>}
      </SectionCard>

      <SectionCard title="Command Center tools" description="Move from the alert to the exact workflow that fixes it.">
        <div className="space-y-3">
          <Tool href="/inspection-mode" icon={<BadgeCheck className="h-5 w-5" />} title="Licensing Inspection Mode" helper="Inspection-ready snapshot and printable readiness report" />
          <Tool href="/child-file-audits" icon={<ClipboardCheck className="h-5 w-5" />} title="Child File Audits" helper="Audit history, expirations, next audit dates" />
          <Tool href="/immunization-tracker" icon={<Syringe className="h-5 w-5" />} title="Immunization Tracker" helper="California child-care and school shot requirements" />
          <Tool href="/emergency-cards" icon={<HeartPulse className="h-5 w-5" />} title="Emergency Cards" helper="Consent, contacts, medical alerts, route readiness" />
          <Tool href="/files" icon={<FolderOpen className="h-5 w-5" />} title="Encrypted Files" helper="Secure documents, expirations, signatures, facility and vehicle records" />
          <Tool href="/digital-forms" icon={<FileSignature className="h-5 w-5" />} title="Digital Forms" helper="Prepare, send, sign, correct, and verify forms" />
        </div>
      </SectionCard>
    </div>

    <div className="grid gap-6 xl:grid-cols-2">
      <SectionCard title="General file workflow attention" description="Existing child, staff, vehicle, and facility file issues.">
        {attention.length === 0 ? <div className="rounded-2xl bg-emerald-50 p-6 text-sm font-semibold text-emerald-900"><CheckCircle2 className="mr-2 inline h-5 w-5" />No file items are marked missing, expiring, or waiting for signature.</div> : <div className="space-y-3">{attention.slice(0, 12).map((item) => <div key={item.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-950">{item.person}</p><StatusBadge tone={fileTone(item.status)}>{item.status}</StatusBadge></div><p className="mt-1 text-sm font-semibold text-slate-700">{item.document}</p><p className="mt-1 text-xs text-slate-500">{item.recordType} • {item.location} • Due: {item.due || "Not entered"}</p></div><Link href="/files" className="inline-flex items-center gap-2 text-sm font-black text-emerald-700">Open Files <ArrowRight className="h-4 w-4" /></Link></div>)}</div>}
      </SectionCard>

      <SectionCard title="Readiness breakdown" description="What is currently preventing a clean compliance posture.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Breakdown icon={<Users className="h-5 w-5" />} label="Active children reviewed" value={scopedChildren.length} />
          <Breakdown icon={<ClipboardCheck className="h-5 w-5" />} label="Child files needing attention" value={auditAttention.length} />
          <Breakdown icon={<HeartPulse className="h-5 w-5" />} label="Emergency records not ready" value={emergencyAttention.length} />
          <Breakdown icon={<Syringe className="h-5 w-5" />} label="Shot records needing attention" value={shotAttention.length} />
          <Breakdown icon={<AlertTriangle className="h-5 w-5" />} label="Missing general file items" value={missing.length} />
          <Breakdown icon={<Bus className="h-5 w-5" />} label="Open digital form workflows" value={openDigitalForms.length} />
        </div>
        {total > 0 && <p className="mt-4 text-xs font-semibold text-slate-500">General file completion: {Math.round((complete / total) * 100)}% across the current location scope.</p>}
      </SectionCard>
    </div>
  </div></MainLayout>;
}

function Tool({ href, icon, title, helper }: { href: string; icon: React.ReactNode; title: string; helper: string }) {
  return <Link href={href} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4 transition hover:bg-slate-50"><div className="flex items-start gap-3"><span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-emerald-50 text-emerald-800">{icon}</span><div><p className="font-black text-slate-950">{title}</p><p className="mt-1 text-xs text-slate-500">{helper}</p></div></div><ArrowRight className="h-5 w-5 text-slate-400" /></Link>;
}

function Breakdown({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700">{icon}</span><div><strong className="block text-2xl font-black text-slate-950">{value}</strong><span className="text-xs font-bold text-slate-500">{label}</span></div></div>;
}
