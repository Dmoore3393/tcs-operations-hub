"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import {
  auditItemFor,
  documentsForTemplate,
  templateForChildLocation,
  type ChildFileAudit,
  type ChildFileAuditDocument,
} from "@/lib/child-file-audits";
import type { ChildRecord } from "@/lib/children";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileSignature,
  LoaderCircle,
  Search,
  Sparkles,
  UserPlus,
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

function applicableDocuments(child: ChildRecord) {
  const template = templateForChildLocation(child.location);
  const base = documentsForTemplate(template);
  const transport = child.transportation && child.transportation !== "No transportation";
  const infant = child.ageGroup === "Infant";
  const medical = !/^none reported$/i.test(child.allergies || "") || !/^no current medical notes$/i.test(child.medicalNotes || "");

  return base.filter((document) => {
    if (document.requirement === "Required" || document.requirement === "For Internal Use") return true;
    const name = document.name.toLowerCase();
    if (name.includes("transport")) return Boolean(transport);
    if (name.includes("infant sleeping")) return infant;
    if (name.includes("allergy") || name.includes("medication") || name.includes("physician") || name.includes("special diet") || name.includes("care plan")) return medical;
    return false;
  });
}

export default function EnrollmentReadinessPage() {
  const { session } = useAuth();
  const { location } = useHubLocation();
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
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
      if (!response.ok) throw new Error(payload.error || "Could not load enrollment records.");
      setChildren(Array.isArray(payload.children) ? payload.children : []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load enrollment records.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return children
      .filter((child) => child.enrollmentStatus !== "Archived")
      .filter((child) => matchesLocation(child.location, location))
      .filter((child) => !query || `${childName(child)} ${child.primaryGuardian} ${child.location}`.toLowerCase().includes(query))
      .map((child) => {
        const audit = latestAudit(child);
        const packet = applicableDocuments(child);
        const complete = audit ? packet.filter((doc) => auditItemFor(audit, doc.id).status === "On File") : [];
        const missing = audit ? packet.filter((doc) => auditItemFor(audit, doc.id).status !== "On File") : packet;
        return { child, audit, packet, complete, missing };
      })
      .sort((a, b) => b.missing.length - a.missing.length || childName(a.child).localeCompare(childName(b.child)));
  }, [children, location, search]);

  const completeCount = rows.filter((row) => row.missing.length === 0).length;
  const incompleteCount = rows.length - completeCount;

  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-6 pb-12">
    <section className="overflow-hidden rounded-[30px] bg-gradient-to-br from-[#5f2d7a] via-[#7b3f98] to-[#3f2452] p-6 text-white shadow-xl sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[.18em] text-purple-200">Smart enrollment packet</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Enrollment Readiness</h1><p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-purple-50/80">The Hub builds the expected packet from the child’s program, age, transportation use, and currently documented medical needs—then compares it with the latest file audit.</p></div>
        <Link href="/enrollment-pipeline" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-purple-950"><UserPlus className="h-4 w-4" /> Open Tour Board</Link>
      </div>
    </section>

    {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">{error}</div>}

    <section className="grid gap-3 sm:grid-cols-3">
      <Metric label="Records Reviewed" value={rows.length} tone="purple" />
      <Metric label="Packet Ready" value={completeCount} tone="green" />
      <Metric label="Needs Documents" value={incompleteCount} tone={incompleteCount ? "amber" : "green"} />
    </section>

    <label className="relative block"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search child or guardian…" className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold shadow-sm" /></label>

    {loading ? <div className="flex min-h-72 items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white text-sm font-bold text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Building enrollment packets…</div> :
      <section className="grid gap-4 xl:grid-cols-2">
        {rows.map(({ child, audit, packet, missing }) => <article key={child.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{templateForChildLocation(child.location)} • {child.location}</p><h2 className="mt-1 text-xl font-black text-slate-950">{childName(child)}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{child.ageGroup} • {child.transportation && child.transportation !== "No transportation" ? "Transportation" : "No transportation"}</p></div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${missing.length ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{missing.length ? `${missing.length} needed` : "Packet Ready"}</span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Info label="Expected Packet" value={String(packet.length)} />
            <Info label="On File" value={String(packet.length - missing.length)} />
            <Info label="Missing / Review" value={String(missing.length)} />
          </div>

          {!audit ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold leading-5 text-red-900"><AlertTriangle className="mr-1 inline h-4 w-4" />No child file audit has been saved yet, so the packet cannot be confirmed complete.</div> :
            missing.length === 0 ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-900"><CheckCircle2 className="mr-1 inline h-4 w-4" />All currently applicable packet items are marked On File.</div> :
            <div className="mt-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Needs attention</p><div className="mt-2 flex flex-wrap gap-2">{missing.slice(0, 8).map((doc) => <span key={doc.id} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] font-black text-amber-900">{doc.name}</span>)}{missing.length > 8 && <span className="rounded-full bg-slate-100 px-2.5 py-1.5 text-[10px] font-black text-slate-600">+{missing.length - 8} more</span>}</div></div>}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/child-file-audits?child=${child.id}`} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white"><ClipboardList className="h-4 w-4" /> Open Audit</Link>
            <Link href="/digital-forms" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700"><FileSignature className="h-4 w-4" /> Digital Forms</Link>
          </div>
        </article>)}
      </section>}

    <div className="rounded-2xl border border-purple-200 bg-purple-50 px-4 py-3 text-xs font-semibold leading-5 text-purple-950"><Sparkles className="mr-1 inline h-4 w-4" />This packet generator only marks documents applicable when The Hub has enough information to do so. Licensees can still mark additional “If Applicable” items during the formal child file audit.</div>
  </div></MainLayout>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "purple" | "green" | "amber" }) {
  const styles = { purple: "bg-purple-100 text-purple-800", green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-900" };
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`inline-flex rounded-xl px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${styles[tone]}`}>{label}</span><strong className="mt-2 block text-3xl font-black text-slate-950">{value}</strong></div>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3 text-center"><span className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</span><strong className="mt-1 block text-lg font-black text-slate-900">{value}</strong></div>;
}
