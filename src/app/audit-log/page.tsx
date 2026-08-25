"use client";

import MainLayout from "@/components/layout/MainLayout";
import { PageIntro, PrimaryButton, SectionCard, StatCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { recordAuditEvent } from "@/lib/audit";
import { supabase } from "@/lib/supabase/client";
import { Download, FileClock, Filter, LockKeyhole, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type AuditEntry = {
  id: number;
  organization_id: string;
  location_id: string | null;
  actor_user_id: string | null;
  action: "CREATE" | "UPDATE" | "REVIEW" | "EXPORT" | "DELETE";
  table_name: string;
  row_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
};

type NamedRecord = { id?: string; user_id?: string; name?: string; full_name?: string; email?: string };

const actionTones: Record<AuditEntry["action"], "green" | "blue" | "purple" | "amber" | "red"> = {
  CREATE: "green",
  UPDATE: "blue",
  REVIEW: "purple",
  EXPORT: "amber",
  DELETE: "red",
};

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [locationNames, setLocationNames] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<"All" | AuditEntry["action"]>("All");
  const [tableName, setTableName] = useState("All");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [auditResult, staffResult, locationResult] = await Promise.all([
      supabase.from("audit_log").select("*").order("occurred_at", { ascending: false }).limit(1000),
      supabase.from("staff_access").select("user_id,full_name,email"),
      supabase.from("locations").select("id,name"),
    ]);

    if (auditResult.error) {
      setMessage(`Could not load audit history: ${auditResult.error.message}`);
      setLoading(false);
      return;
    }

    setEntries((auditResult.data ?? []) as AuditEntry[]);
    setStaffNames(Object.fromEntries(((staffResult.data ?? []) as NamedRecord[]).map((item) => [item.user_id, item.full_name || item.email || "Staff"])));
    setLocationNames(Object.fromEntries(((locationResult.data ?? []) as NamedRecord[]).map((item) => [item.id, item.name || "Location"])));
    setMessage("");
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const tables = useMemo(() => ["All", ...Array.from(new Set(entries.map((entry) => entry.table_name))).sort()], [entries]);
  const visible = useMemo(() => entries.filter((entry) => {
    const actionMatch = action === "All" || entry.action === action;
    const tableMatch = tableName === "All" || entry.table_name === tableName;
    const actor = entry.actor_user_id ? staffNames[entry.actor_user_id] ?? entry.actor_user_id : "System / server";
    const location = entry.location_id ? locationNames[entry.location_id] ?? entry.location_id : "Company-wide";
    const searchMatch = `${entry.action} ${entry.table_name} ${actor} ${location} ${JSON.stringify(entry.metadata)}`.toLowerCase().includes(search.toLowerCase());
    return actionMatch && tableMatch && searchMatch;
  }), [action, entries, locationNames, search, staffNames, tableName]);

  async function exportAuditLog() {
    await recordAuditEvent({ action: "EXPORT", tableName: "audit_log", metadata: { filters: { action, tableName, search }, exportedRows: visible.length } });
    const blob = new Blob([JSON.stringify(visible, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tcs-audit-log-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Audit export downloaded and the export itself was recorded.");
    void load();
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1500px] space-y-6">
        <PageIntro eyebrow="Owner/Admin oversight" title="Immutable Audit Log" description="Review create, update, review, export, and deletion activity. Audit entries cannot be edited or deleted through the Hub." actions={<div className="flex flex-wrap gap-2"><PrimaryButton onClick={() => void exportAuditLog()}><Download className="h-4 w-4" /> Export Audit</PrimaryButton><button onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700"><RefreshCw className="h-4 w-4" /> Refresh</button></div>} />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Audit Entries" value={entries.length} icon={<FileClock className="h-5 w-5" />} />
          <StatCard label="Reviews" value={entries.filter((entry) => entry.action === "REVIEW").length} icon={<ShieldCheck className="h-5 w-5" />} tone="purple" />
          <StatCard label="Exports" value={entries.filter((entry) => entry.action === "EXPORT").length} icon={<Download className="h-5 w-5" />} tone="amber" />
          <StatCard label="Deletions" value={entries.filter((entry) => entry.action === "DELETE").length} icon={<LockKeyhole className="h-5 w-5" />} tone="red" />
        </section>

        <SectionCard title="Audit Filters" description="The database enforces immutability; this page is read-only.">
          <div className="grid gap-3 md:grid-cols-[1fr_220px_280px]">
            <label className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search action, table, staff, location, or metadata…" /></label>
            <label className="relative"><Filter className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><select className={`${inputClass} pl-10`} value={action} onChange={(event) => setAction(event.target.value as typeof action)}><option>All</option><option>CREATE</option><option>UPDATE</option><option>REVIEW</option><option>EXPORT</option><option>DELETE</option></select></label>
            <select className={inputClass} value={tableName} onChange={(event) => setTableName(event.target.value)}>{tables.map((item) => <option key={item}>{item}</option>)}</select>
          </div>
          {message && <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{message}</p>}
        </SectionCard>

        <SectionCard title="Recorded Activity" description={`${visible.length} matching entries • newest first`}>
          {loading ? <div className="py-12 text-center font-bold text-slate-500">Loading immutable history…</div> : (
            <div className="space-y-3">
              {visible.map((entry) => {
                const actor = entry.actor_user_id ? staffNames[entry.actor_user_id] ?? entry.actor_user_id : "System / secure server";
                const location = entry.location_id ? locationNames[entry.location_id] ?? entry.location_id : "Company-wide";
                return (
                  <details key={entry.id} className="group rounded-2xl border border-slate-200 bg-white p-4 open:border-slate-300">
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-wrap items-center gap-2"><StatusBadge tone={actionTones[entry.action]}>{entry.action}</StatusBadge><p className="font-black text-slate-950">{entry.table_name}</p><span className="text-xs font-bold text-slate-500">{location}</span></div>
                        <div className="text-sm text-slate-600 lg:text-right"><p className="font-bold">{actor}</p><p className="text-xs">{new Date(entry.occurred_at).toLocaleString()}</p></div>
                      </div>
                    </summary>
                    <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 xl:grid-cols-3">
                      <AuditJson title="Previous values" value={entry.old_data} />
                      <AuditJson title="New values" value={entry.new_data} />
                      <AuditJson title="Event metadata" value={{ rowId: entry.row_id, ...entry.metadata }} />
                    </div>
                  </details>
                );
              })}
              {!visible.length && <div className="rounded-2xl bg-slate-50 p-10 text-center text-sm text-slate-500">No audit entries match these filters.</div>}
            </div>
          )}
        </SectionCard>
      </div>
    </MainLayout>
  );
}

function AuditJson({ title, value }: { title: string; value: unknown }) {
  return <div><p className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">{title}</p><pre className="max-h-80 overflow-auto rounded-xl bg-slate-950 p-3 text-xs leading-5 text-slate-100">{JSON.stringify(value ?? null, null, 2)}</pre></div>;
}
