"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import {
  auditItemFor,
  auditSummary,
  childFileAuditDocuments,
  childFileAuditStatusFlags,
  createBlankChildFileAudit,
  expirationState,
  todayLocalIso,
  type ChildFileAudit,
  type ChildFileAuditItemStatus,
  type ChildFileAuditStatusFlag,
} from "@/lib/child-file-audits";
import type { ChildRecord } from "@/lib/children";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  FileCheck2,
  FileClock,
  FileWarning,
  History,
  LoaderCircle,
  Plus,
  Save,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type LiveLocation = {
  id: string;
  slug: string;
  name: string;
  fullName: string;
  capacity: number;
  programType: string;
};

type AuditEditor = {
  child: ChildRecord;
  audit: ChildFileAudit;
  isNew: boolean;
};

const sectionTones: Record<number, string> = {
  1: "border-red-200 bg-red-50/50",
  2: "border-orange-200 bg-orange-50/50",
  3: "border-amber-200 bg-amber-50/50",
  4: "border-rose-200 bg-rose-50/50",
  5: "border-red-200 bg-red-50/40",
  6: "border-stone-200 bg-stone-50/60",
};

function displayName(child: ChildRecord) {
  return `${child.firstName} ${child.lastName}`.trim();
}

function isInHomeLocation(location: LiveLocation) {
  return /family childcare/i.test(location.programType || "") &&
    !/transportation/i.test(location.programType || "");
}

function formatDate(value: string) {
  if (!value) return "Not set";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function latestAudit(child: ChildRecord) {
  const audits = child.fileAudits ?? [];
  return [...audits].sort((a, b) => (b.auditDate || b.updatedAt).localeCompare(a.auditDate || a.updatedAt))[0] ?? null;
}

function dueState(audit: ChildFileAudit | null) {
  if (!audit?.nextAuditDue) return "missing" as const;
  const today = todayLocalIso();
  if (audit.nextAuditDue < today) return "overdue" as const;
  const soon = new Date(`${today}T12:00:00`);
  soon.setDate(soon.getDate() + 30);
  const soonIso = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, "0")}-${String(soon.getDate()).padStart(2, "0")}`;
  return audit.nextAuditDue <= soonIso ? "soon" as const : "current" as const;
}

export default function ChildFileAuditsPage() {
  const { session, profile, isEmployee } = useAuth();
  const { location: activeLocation } = useHubLocation();
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [locations, setLocations] = useState<LiveLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("All In-Home Locations");
  const [editor, setEditor] = useState<AuditEditor | null>(null);
  const [historyChild, setHistoryChild] = useState<ChildRecord | null>(null);

  const request = useCallback(async (method: "GET" | "POST", body?: Record<string, unknown>) => {
    if (!session?.access_token) throw new Error("Your staff session is not ready yet.");
    const response = await fetch("/api/children", {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const raw = await response.text();
    const payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "The child file audit request failed.");
    return payload;
  }, [session?.access_token]);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const payload = await request("GET");
      setChildren(Array.isArray(payload.children) ? payload.children as ChildRecord[] : []);
      setLocations(Array.isArray(payload.locations) ? payload.locations as LiveLocation[] : []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load child file audits.");
    } finally {
      setLoading(false);
    }
  }, [request, session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  const inHomeLocations = useMemo(() => locations.filter(isInHomeLocation), [locations]);
  const inHomeLocationNames = useMemo(() => new Set(inHomeLocations.flatMap((item) => [item.name, item.fullName])), [inHomeLocations]);

  const inHomeChildren = useMemo(() => children.filter((child) => {
    return [...inHomeLocationNames].some((name) =>
      child.location.toLowerCase().includes(name.toLowerCase()) ||
      name.toLowerCase().includes(child.location.toLowerCase()),
    );
  }), [children, inHomeLocationNames]);

  useEffect(() => {
    if (activeLocation === "All Locations") return;
    const match = inHomeLocations.find((item) =>
      item.name === activeLocation || item.fullName.includes(activeLocation) || activeLocation.includes(item.name),
    );
    if (match) setSiteFilter(match.fullName || match.name);
  }, [activeLocation, inHomeLocations]);

  useEffect(() => {
    if (loading || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const childId = Number(params.get("child"));
    if (!Number.isSafeInteger(childId) || childId <= 0) return;
    const child = inHomeChildren.find((item) => item.id === childId);
    if (child) openNewAudit(child);
    window.history.replaceState({}, "", window.location.pathname);
  }, [inHomeChildren, loading]);

  const filteredChildren = useMemo(() => {
    const query = search.trim().toLowerCase();
    return inHomeChildren
      .filter((child) => {
        const matchesSearch = !query || `${displayName(child)} ${child.primaryGuardian} ${child.location}`.toLowerCase().includes(query);
        const matchesSite = siteFilter === "All In-Home Locations" ||
          child.location.toLowerCase().includes(siteFilter.toLowerCase()) ||
          siteFilter.toLowerCase().includes(child.location.toLowerCase());
        return matchesSearch && matchesSite && child.enrollmentStatus !== "Archived";
      })
      .sort((a, b) => displayName(a).localeCompare(displayName(b)));
  }, [inHomeChildren, search, siteFilter]);

  const stats = useMemo(() => {
    let overdue = 0;
    let dueSoon = 0;
    let missing = 0;
    let expired = 0;
    for (const child of filteredChildren) {
      const audit = latestAudit(child);
      const due = dueState(audit);
      if (due === "overdue" || due === "missing") overdue += 1;
      if (due === "soon") dueSoon += 1;
      if (audit) {
        const summary = auditSummary(audit);
        if (summary.missingRequired.length) missing += 1;
        if (summary.expired.length) expired += 1;
      } else {
        missing += 1;
      }
    }
    return { overdue, dueSoon, missing, expired };
  }, [filteredChildren]);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4200);
  }

  function openNewAudit(child: ChildRecord) {
    const audit = createBlankChildFileAudit(profile?.full_name || "");
    setEditor({ child, audit, isNew: true });
  }

  function openExistingAudit(child: ChildRecord, audit: ChildFileAudit) {
    setEditor({
      child,
      audit: {
        ...audit,
        statusFlags: [...audit.statusFlags],
        items: audit.items.map((item) => ({ ...item })),
      },
      isNew: false,
    });
    setHistoryChild(null);
  }

  function patchAudit(patch: Partial<ChildFileAudit>) {
    setEditor((current) => current ? {
      ...current,
      audit: { ...current.audit, ...patch, updatedAt: new Date().toISOString() },
    } : current);
  }

  function updateItem(documentId: number, patch: Partial<ChildFileAudit["items"][number]>) {
    setEditor((current) => {
      if (!current) return current;
      const items = childFileAuditDocuments.map((document) => {
        const existing = auditItemFor(current.audit, document.id);
        if (document.id !== documentId) return existing;
        return { ...existing, ...patch };
      });
      return {
        ...current,
        audit: { ...current.audit, items, updatedAt: new Date().toISOString() },
      };
    });
  }

  function changeItemStatus(documentId: number, status: ChildFileAuditItemStatus) {
    const dateChecked = status === "Not Checked" ? "" : todayLocalIso();
    updateItem(documentId, { status, dateChecked });
  }

  function toggleFlag(flag: ChildFileAuditStatusFlag) {
    if (!editor) return;
    const next = editor.audit.statusFlags.includes(flag)
      ? editor.audit.statusFlags.filter((item) => item !== flag)
      : [...editor.audit.statusFlags, flag];
    patchAudit({ statusFlags: next });
  }

  async function saveAudit() {
    if (!editor) return;
    if (!editor.audit.auditDate) {
      setError("Enter the date this file was audited.");
      return;
    }
    if (!editor.audit.nextAuditDue) {
      setError("Enter the next audit due date before saving.");
      return;
    }
    if (editor.audit.nextAuditDue < editor.audit.auditDate) {
      setError("The next audit due date cannot be before the audit date.");
      return;
    }

    const summary = auditSummary(editor.audit);
    const expiredDocumentIds = new Set(editor.audit.items.filter((item) => expirationState(item.expirationDate) === "expired").map((item) => item.documentId));
    const requiredIds = new Set(childFileAuditDocuments.filter((document) => document.requirement === "Required").map((document) => document.id));
    const problemIds = new Set([
      ...summary.missingRequired.map((item) => item.documentId),
      ...[...expiredDocumentIds].filter((id) => requiredIds.has(id)),
    ]);
    const missingDocuments = childFileAuditDocuments.filter((document) => problemIds.has(document.id)).map((document) => document.name);

    const statusFlags: ChildFileAuditStatusFlag[] = editor.audit.statusFlags
      .filter((flag) => flag !== "File Complete" && flag !== "Missing Documents");
    if (missingDocuments.length === 0 && summary.checked === summary.total) statusFlags.push("File Complete");
    else statusFlags.push("Missing Documents");

    const audit: ChildFileAudit = {
      ...editor.audit,
      statusFlags,
      auditedBy: editor.audit.auditedBy || profile?.full_name || "",
      updatedAt: new Date().toISOString(),
    };

    const history = editor.child.fileAudits ?? [];
    const fileAudits = history.some((item) => item.id === audit.id)
      ? history.map((item) => item.id === audit.id ? audit : item)
      : [...history, audit];

    const child: ChildRecord = {
      ...editor.child,
      fileAudits,
      licensingStatus: missingDocuments.length ? "Missing Documents" : "Complete",
      missingDocuments,
    };

    setSaving(true);
    setError("");
    try {
      const payload = await request("POST", { action: "save", child });
      const saved = payload.child as ChildRecord;
      setChildren((current) => current.map((item) => item.id === saved.id ? saved : item));
      setEditor(null);
      flash(`${displayName(saved)}'s file audit was saved. Next audit: ${formatDate(audit.nextAuditDue)}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this file audit.");
    } finally {
      setSaving(false);
    }
  }

  if (isEmployee) {
    return <MainLayout><div className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-amber-700" /><h1 className="mt-3 text-2xl font-black text-amber-950">Child file audits are confidential</h1><p className="mt-2 text-sm font-semibold leading-6 text-amber-900">Only Owner/Admin and assigned Licensee accounts can complete or review in-home child file audits.</p></div></MainLayout>;
  }

  return <MainLayout>
    <div className="mx-auto max-w-[1600px] space-y-6 pb-12">
      <section className="overflow-hidden rounded-[30px] border border-orange-200 bg-gradient-to-br from-[#fff7ed] via-white to-[#fff1e6] p-6 shadow-xl sm:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[.18em] text-orange-700">In-Home Childcare • File Compliance</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Child File Audits</h1>
            <p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-slate-600">Use the approved 40-item in-home checklist for every child file. Each document records when it was checked, its expiration date when applicable, and the next date the entire child file must be audited.</p>
          </div>
          <div className="rounded-2xl border border-orange-200 bg-white/85 p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-wider text-orange-700">Audit rule in The Hub</p>
            <p className="mt-1 max-w-sm text-xs font-bold leading-5 text-slate-700">The next audit date is required before an audit can be saved. Expired documents and missing required forms are automatically flagged.</p>
          </div>
        </div>
      </section>

      {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-900">{notice}</div>}
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">{error}</div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Children in View" value={filteredChildren.length} icon={<ClipboardCheck />} tone="blue" />
        <Metric label="Audit Due / Not Set" value={stats.overdue} icon={<CalendarClock />} tone="red" />
        <Metric label="Due in 30 Days" value={stats.dueSoon} icon={<FileClock />} tone="amber" />
        <Metric label="Files Needing Attention" value={Math.max(stats.missing, stats.expired)} icon={<FileWarning />} tone="purple" />
      </section>

      <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-[minmax(0,1fr)_300px]">
        <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search child, parent, or site…" className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-orange-400" /></label>
        <label className="relative"><select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)} className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-3 pr-9 text-sm font-bold outline-none"><option>All In-Home Locations</option>{inHomeLocations.map((item) => <option key={item.id} value={item.fullName || item.name}>{item.fullName || item.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /></label>
      </section>

      {loading ? <div className="flex min-h-72 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-sm font-bold text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading in-home child files…</div> :
        filteredChildren.length === 0 ? <div className="grid min-h-72 place-items-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center"><div><FileCheck2 className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-3 text-xl font-black text-slate-800">No in-home child files match this view</h2><p className="mt-1 text-sm text-slate-500">Change the site filter or search.</p></div></div> :
        <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {filteredChildren.map((child) => {
            const audit = latestAudit(child);
            const summary = audit ? auditSummary(audit) : null;
            const due = dueState(audit);
            const attention = !audit || !summary?.complete || summary.expired.length > 0 || due === "overdue" || due === "missing";
            return <article key={child.id} className={`rounded-3xl border bg-white p-5 shadow-sm ${attention ? "border-amber-200" : "border-emerald-200"}`}>
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-[10px] font-black uppercase tracking-[.12em] text-slate-400">{child.location}</p><h2 className="mt-1 text-xl font-black text-slate-950">{displayName(child)}</h2><p className="mt-1 text-xs font-semibold text-slate-500">DOB {formatDate(child.dateOfBirth)} • {child.age}</p></div>
                <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${attention ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{attention ? "Needs Review" : "Current"}</span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Info label="Last Audit" value={audit ? formatDate(audit.auditDate) : "Never audited"} />
                <Info label="Next Audit" value={audit ? formatDate(audit.nextAuditDue) : "Not set"} />
                <Info label="Required Missing" value={summary ? String(summary.missingRequired.length) : "—"} />
                <Info label="Expired Items" value={summary ? String(summary.expired.length) : "—"} />
              </div>

              {audit && (due === "overdue" || due === "soon") && <div className={`mt-3 rounded-xl px-3 py-2 text-xs font-black ${due === "overdue" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>{due === "overdue" ? "Audit overdue" : "Audit due within 30 days"} • {formatDate(audit.nextAuditDue)}</div>}

              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => openNewAudit(child)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#9f2f20] px-3 py-2.5 text-xs font-black text-white"><Plus className="h-4 w-4" /> New Audit</button>
                <button onClick={() => setHistoryChild(child)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-slate-700"><History className="h-4 w-4" /> History ({child.fileAudits?.length ?? 0})</button>
                {audit && <button onClick={() => openExistingAudit(child, audit)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-slate-700">Open Latest</button>}
              </div>
            </article>;
          })}
        </section>}

      {editor && <AuditModal editor={editor} saving={saving} onClose={() => setEditor(null)} onPatch={patchAudit} onItem={updateItem} onStatus={changeItemStatus} onToggleFlag={toggleFlag} onSave={() => void saveAudit()} />}
      {historyChild && <HistoryModal child={historyChild} onClose={() => setHistoryChild(null)} onOpen={(audit) => openExistingAudit(historyChild, audit)} />}
    </div>
  </MainLayout>;
}

function AuditModal({
  editor,
  saving,
  onClose,
  onPatch,
  onItem,
  onStatus,
  onToggleFlag,
  onSave,
}: {
  editor: AuditEditor;
  saving: boolean;
  onClose: () => void;
  onPatch: (patch: Partial<ChildFileAudit>) => void;
  onItem: (documentId: number, patch: Partial<ChildFileAudit["items"][number]>) => void;
  onStatus: (documentId: number, status: ChildFileAuditItemStatus) => void;
  onToggleFlag: (flag: ChildFileAuditStatusFlag) => void;
  onSave: () => void;
}) {
  const { child, audit } = editor;
  const summary = auditSummary(audit);
  const sections = [1, 2, 3, 4, 5, 6] as const;

  return <div className="fixed inset-0 z-[10000] overflow-y-auto bg-slate-950/70 p-2 backdrop-blur-sm sm:p-4">
    <div className="mx-auto my-2 w-full max-w-[1500px] overflow-hidden rounded-[28px] bg-[#fffdf9] shadow-2xl sm:my-6">
      <header className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-red-200 bg-gradient-to-r from-[#8f241a] to-[#c94720] px-5 py-4 text-white sm:px-6">
        <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-orange-100">In-Home Child File Audit</p><h2 className="mt-1 text-2xl font-black">{displayName(child)}</h2><p className="mt-1 text-xs font-semibold text-white/80">{child.location} • DOB {formatDate(child.dateOfBirth)}</p></div>
        <button onClick={onClose} className="rounded-xl bg-white/10 p-2"><X className="h-5 w-5" /></button>
      </header>

      <div className="space-y-5 p-4 sm:p-6">
        <section className="grid gap-3 rounded-2xl border border-orange-200 bg-orange-50/50 p-4 md:grid-cols-2 xl:grid-cols-5">
          <DateField label="Date Enrolled" value={audit.dateEnrolled} onChange={(value) => onPatch({ dateEnrolled: value })} />
          <DateField label="File Audit Date" value={audit.auditDate} onChange={(value) => onPatch({ auditDate: value })} required />
          <DateField label="Next Audit Due" value={audit.nextAuditDue} onChange={(value) => onPatch({ nextAuditDue: value })} required />
          <TextField label="Audited By" value={audit.auditedBy} onChange={(value) => onPatch({ auditedBy: value })} />
          <TextField label="Teacher / Primary" value={audit.teacherPrimary} onChange={(value) => onPatch({ teacherPrimary: value })} />
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AuditMetric label="Items Checked" value={`${summary.checked}/${summary.total}`} good={summary.checked === summary.total} />
          <AuditMetric label="Required Missing" value={String(summary.missingRequired.length)} good={summary.missingRequired.length === 0} />
          <AuditMetric label="Expired" value={String(summary.expired.length)} good={summary.expired.length === 0} />
          <AuditMetric label="Expiring ≤30 Days" value={String(summary.expiringSoon.length)} good={summary.expiringSoon.length === 0} />
        </section>

        <div className="grid gap-5 2xl:grid-cols-2">
          {sections.map((section) => {
            const documents = childFileAuditDocuments.filter((document) => document.section === section);
            const heading = documents[0];
            return <section key={section} className={`overflow-hidden rounded-2xl border ${sectionTones[section]}`}>
              <header className="bg-gradient-to-r from-[#c52518] to-[#ed3b18] px-4 py-3 text-white"><p className="text-sm font-black uppercase">Section {section}: {heading.sectionTitle}</p>{heading.sectionSubtitle && <p className="text-[10px] font-bold uppercase text-white/80">({heading.sectionSubtitle})</p>}</header>
              <div className="overflow-x-auto">
                <table className="min-w-[780px] w-full text-left">
                  <thead className="bg-white/80 text-[9px] font-black uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Document / Requirement</th><th className="px-3 py-2">Required</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Date Checked</th><th className="px-3 py-2">Expiration Date</th><th className="px-3 py-2">Note</th></tr></thead>
                  <tbody className="divide-y divide-slate-200/80 bg-white/70">
                    {documents.map((document) => {
                      const item = auditItemFor(audit, document.id);
                      const exp = expirationState(item.expirationDate);
                      return <tr key={document.id} className={exp === "expired" ? "bg-red-50" : exp === "soon" ? "bg-amber-50" : ""}>
                        <td className="px-3 py-2 text-xs font-black text-slate-500">{document.id}</td>
                        <td className="px-3 py-2 text-xs font-bold text-slate-900">{document.name}</td>
                        <td className="px-3 py-2 text-[10px] font-semibold text-slate-600">{document.requirement}</td>
                        <td className="px-3 py-2"><select value={item.status} onChange={(event) => onStatus(document.id, event.target.value as ChildFileAuditItemStatus)} className={`rounded-lg border px-2 py-1.5 text-[10px] font-black ${item.status === "On File" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : item.status === "Missing" ? "border-red-200 bg-red-50 text-red-800" : item.status === "N/A" ? "border-slate-200 bg-slate-100 text-slate-600" : "border-amber-200 bg-amber-50 text-amber-800"}`}><option>Not Checked</option><option>On File</option><option>Missing</option><option>N/A</option></select></td>
                        <td className="px-3 py-2"><input type="date" value={item.dateChecked} onChange={(event) => onItem(document.id, { dateChecked: event.target.value })} className="w-[132px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold" /></td>
                        <td className="px-3 py-2"><input type="date" value={item.expirationDate} onChange={(event) => onItem(document.id, { expirationDate: event.target.value })} className={`w-[132px] rounded-lg border bg-white px-2 py-1.5 text-[10px] font-bold ${exp === "expired" ? "border-red-400 text-red-800" : exp === "soon" ? "border-amber-400 text-amber-800" : "border-slate-200"}`} />{exp !== "none" && <span className={`mt-1 block text-[8px] font-black uppercase ${exp === "expired" ? "text-red-700" : exp === "soon" ? "text-amber-700" : "text-emerald-700"}`}>{exp === "expired" ? "Expired" : exp === "soon" ? "Expires soon" : "Current"}</span>}</td>
                        <td className="px-3 py-2"><input value={item.note} maxLength={500} onChange={(event) => onItem(document.id, { note: event.target.value })} placeholder="Optional" className="w-40 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-semibold" /></td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </section>;
          })}
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">File Status — check all that apply</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{childFileAuditStatusFlags.map((flag) => <label key={flag} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={audit.statusFlags.includes(flag)} onChange={() => onToggleFlag(flag)} className="h-4 w-4 accent-red-700" /> {flag}</label>)}</div>
        </section>

        <label className="block rounded-2xl border border-slate-200 bg-white p-4"><span className="text-xs font-black uppercase tracking-wider text-slate-600">Notes / Follow-Up</span><textarea value={audit.notes} onChange={(event) => onPatch({ notes: event.target.value })} placeholder="Parent follow-up, replacement forms requested, expiration updates, licensing notes…" className="mt-2 min-h-28 w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold leading-6 outline-none focus:border-orange-400" /></label>
      </div>

      <footer className="sticky bottom-0 z-20 flex flex-col gap-3 border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="text-xs font-semibold text-slate-500"><strong className="text-slate-800">Next audit:</strong> {formatDate(audit.nextAuditDue)} • Required missing: {summary.missingRequired.length} • Expired: {summary.expired.length}</div>
        <div className="flex gap-2"><button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700">Cancel</button><button disabled={saving} onClick={onSave} className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-[#9f2f20] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Audit</button></div>
      </footer>
    </div>
  </div>;
}

function HistoryModal({ child, onClose, onOpen }: { child: ChildRecord; onClose: () => void; onOpen: (audit: ChildFileAudit) => void }) {
  const audits = [...(child.fileAudits ?? [])].sort((a, b) => (b.auditDate || b.updatedAt).localeCompare(a.auditDate || a.updatedAt));
  return <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
    <section className="w-full max-w-3xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4"><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Audit History</p><h2 className="mt-1 text-2xl font-black text-slate-950">{displayName(child)}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{child.location}</p></div><button onClick={onClose} className="rounded-xl border border-slate-200 p-2"><X className="h-5 w-5" /></button></header>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">
        {audits.length === 0 ? <div className="py-12 text-center"><History className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 font-black text-slate-700">No file audits saved yet.</p></div> : audits.map((audit) => {
          const summary = auditSummary(audit);
          return <button key={audit.id} onClick={() => onOpen(audit)} className="w-full rounded-2xl border border-slate-200 p-4 text-left transition hover:border-orange-300 hover:bg-orange-50/30"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-slate-950">{formatDate(audit.auditDate)}</strong><p className="mt-1 text-xs text-slate-500">Audited by {audit.auditedBy || "Not entered"} • Next audit {formatDate(audit.nextAuditDue)}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-black ${summary.missingRequired.length || summary.expired.length ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{summary.missingRequired.length || summary.expired.length ? "Follow-Up Needed" : "Complete"}</span></div><div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold text-slate-600"><span>{summary.checked}/{summary.total} checked</span><span>•</span><span>{summary.missingRequired.length} required missing</span><span>•</span><span>{summary.expired.length} expired</span></div></button>;
        })}
      </div>
    </section>
  </div>;
}

function Metric({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: "blue" | "red" | "amber" | "purple" }) {
  const styles = { blue: "bg-blue-100 text-blue-700", red: "bg-red-100 text-red-700", amber: "bg-amber-100 text-amber-800", purple: "bg-purple-100 text-purple-700" };
  return <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`grid h-11 w-11 place-items-center rounded-2xl ${styles[tone]}`}>{icon}</span><div><strong className="block text-2xl font-black text-slate-950">{value}</strong><small className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</small></div></div>;
}

function AuditMetric({ label, value, good }: { label: string; value: string; good: boolean }) {
  return <div className={`rounded-2xl border p-4 ${good ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}><strong className={`block text-2xl font-black ${good ? "text-emerald-900" : "text-amber-900"}`}>{value}</strong><span className="text-[10px] font-black uppercase tracking-wider text-slate-600">{label}</span></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><small className="block text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</small><strong className="mt-1 block text-xs text-slate-800">{value}</strong></div>;
}

function DateField({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}{required ? " *" : ""}</span><input type="date" required={required} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-orange-400" /></label>;
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-orange-400" /></label>;
}
