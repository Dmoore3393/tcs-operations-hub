"use client";

import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { PageIntro, SectionCard, StatCard, StatusBadge } from "@/components/hub/HubUI";
import { usePersistentState } from "@/hooks/usePersistentState";
import { starterFiles, type FileRecord } from "@/lib/hub-data";
import { starterDigitalForms, type DigitalFormRecord } from "@/lib/admin-ops";
import { AlertTriangle, ArrowRight, CheckCircle2, FileClock, FileSignature, FolderOpen, ShieldCheck } from "lucide-react";

function fileTone(status: FileRecord["status"]) {
  if (status === "Complete") return "green" as const;
  if (status === "Missing") return "red" as const;
  return "amber" as const;
}

export default function CompliancePage() {
  const { location } = useHubLocation();
  const [files] = usePersistentState<FileRecord[]>("tcs-files", starterFiles);
  const [forms] = usePersistentState<DigitalFormRecord[]>("tcs-digital-forms-v1", starterDigitalForms);

  const scopedFiles = files.filter((item) => location === "All Locations" || item.location === location);
  const scopedForms = forms.filter((item) => location === "All Locations" || item.location === location);
  const missing = scopedFiles.filter((item) => item.status === "Missing");
  const expiring = scopedFiles.filter((item) => item.status === "Expiring Soon");
  const signatures = scopedFiles.filter((item) => item.status === "Needs Signature");
  const openDigitalForms = scopedForms.filter((item) => !["Signed", "Archived"].includes(item.status));
  const complete = scopedFiles.filter((item) => item.status === "Complete").length;
  const total = scopedFiles.length;

  const attention = [...missing, ...expiring, ...signatures].sort((a, b) => {
    const rank = (status: FileRecord["status"]) => status === "Missing" ? 0 : status === "Needs Signature" ? 1 : status === "Expiring Soon" ? 2 : 3;
    return rank(a.status) - rank(b.status) || a.person.localeCompare(b.person);
  });

  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-6">
    <PageIntro eyebrow="Owner / Licensee compliance control" title="Compliance Center" description="One place to see missing files, upcoming expirations, signature needs, and open form workflows for the locations you are authorized to manage." />

    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950"><strong>Confidential administrative area:</strong> child files and employee files are available to Owner/Admin and Location Licensees for authorized locations. Standard Employees cannot open this section.</div>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard label="Missing" value={missing.length} icon={<AlertTriangle className="h-5 w-5" />} tone={missing.length ? "red" : "emerald"} />
      <StatCard label="Expiring Soon" value={expiring.length} icon={<FileClock className="h-5 w-5" />} tone={expiring.length ? "amber" : "emerald"} />
      <StatCard label="Needs Signature" value={signatures.length} icon={<FileSignature className="h-5 w-5" />} tone={signatures.length ? "amber" : "emerald"} />
      <StatCard label="Open Form Workflows" value={openDigitalForms.length} icon={<FolderOpen className="h-5 w-5" />} tone={openDigitalForms.length ? "blue" : "emerald"} />
      <StatCard label="File Completion" value={total ? `${Math.round((complete / total) * 100)}%` : "—"} icon={<ShieldCheck className="h-5 w-5" />} tone="emerald" />
    </section>

    <div className="grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
      <SectionCard title="Needs attention" description="Highest-priority file issues across the selected location scope.">
        {attention.length === 0 ? <div className="rounded-2xl bg-emerald-50 p-6 text-sm font-semibold text-emerald-900"><CheckCircle2 className="mr-2 inline h-5 w-5" />No file issues are currently marked missing, expiring, or waiting for signature.</div> : <div className="space-y-3">{attention.map((item) => <div key={item.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-950">{item.person}</p><StatusBadge tone={fileTone(item.status)}>{item.status}</StatusBadge></div><p className="mt-1 text-sm font-semibold text-slate-700">{item.document}</p><p className="mt-1 text-xs text-slate-500">{item.recordType} • {item.location} • Due: {item.due || "Not entered"}</p></div><Link href="/files" className="inline-flex items-center gap-2 text-sm font-black text-emerald-700">Open Files <ArrowRight className="h-4 w-4" /></Link></div>)}</div>}
      </SectionCard>

      <SectionCard title="Quick compliance tools" description="Jump directly to the administrative workflow you need.">
        <div className="space-y-3">
          <Link href="/files" className="flex items-center justify-between rounded-2xl border border-slate-200 p-4 transition hover:bg-slate-50"><div><p className="font-black text-slate-950">Child & Employee Files</p><p className="mt-1 text-xs text-slate-500">Documents, expirations, signatures, facility and vehicle files</p></div><ArrowRight className="h-5 w-5 text-slate-400" /></Link>
          <Link href="/digital-forms" className="flex items-center justify-between rounded-2xl border border-slate-200 p-4 transition hover:bg-slate-50"><div><p className="font-black text-slate-950">Digital Forms</p><p className="mt-1 text-xs text-slate-500">Prepare, send, sign, correct, and verify forms</p></div><ArrowRight className="h-5 w-5 text-slate-400" /></Link>
          <Link href="/employees" className="flex items-center justify-between rounded-2xl border border-slate-200 p-4 transition hover:bg-slate-50"><div><p className="font-black text-slate-950">Employee Records</p><p className="mt-1 text-xs text-slate-500">Qualifications, assignments, and employee file status</p></div><ArrowRight className="h-5 w-5 text-slate-400" /></Link>
        </div>
      </SectionCard>
    </div>
  </div></MainLayout>;
}
