"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { fundingSources, locations } from "@/lib/children";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  ShieldCheck,
  UploadCloud,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type PreviewRow = {
  rowKey: string;
  rowNumber: number;
  brightwheelId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  room: string;
  enrollmentStatus: string;
  primaryGuardian: string;
  guardianEmail: string;
  guardianPhone: string;
  detectedLocation: string;
  detectedFunding: string;
  selectedLocation: string;
  selectedFunding: string;
  matchType: "new" | "update";
  warnings: string[];
  ready: boolean;
  include: boolean;
};

type PreviewPayload = {
  rows: PreviewRow[];
  totals: {
    fileRows: number;
    activeRows: number;
    newRows: number;
    updateRows: number;
    needsAttention: number;
  };
  parentInvitationsEnabled: false;
  message: string;
};

type RowSetting = {
  include: boolean;
  location: string;
  funding: string;
};

export default function BrightwheelImportPage() {
  const { session } = useAuth();
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [defaultLocation, setDefaultLocation] = useState("");
  const [defaultFunding, setDefaultFunding] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [rowSettings, setRowSettings] = useState<Record<string, RowSetting>>({});
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ inserted: number; updated: number; skipped: number; message: string } | null>(null);

  const readyCount = useMemo(() => {
    if (!preview) return 0;
    return preview.rows.filter((row) => {
      const setting = rowSettings[row.rowKey];
      if (!setting?.include) return false;
      return Boolean(row.firstName && row.lastName && row.dateOfBirth && setting.location && setting.funding);
    }).length;
  }, [preview, rowSettings]);

  async function chooseFile(file: File | null) {
    setPreview(null);
    setRowSettings({});
    setResult(null);
    setError("");
    if (!file) {
      setFileName("");
      setCsvText("");
      return;
    }
    if (!/\.csv$/i.test(file.name)) {
      setError("Please choose the CSV file from Brightwheel's Export Roster tool.");
      return;
    }
    if (file.size > 5_000_000) {
      setError("That file is too large. Export only the student roster and try again.");
      return;
    }
    setFileName(file.name);
    setCsvText(await file.text());
  }

  async function callImport(mode: "preview" | "commit") {
    if (!session?.access_token) throw new Error("Your staff session is not ready yet.");
    if (!csvText) throw new Error("Choose your Brightwheel roster CSV first.");

    const overrides = Object.entries(rowSettings).map(([rowKey, setting]) => ({
      rowKey,
      include: setting.include,
      location: setting.location,
      funding: setting.funding,
    }));

    const response = await fetch("/api/children/brightwheel-import", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode,
        csvText,
        defaultLocation,
        defaultFunding,
        activeOnly,
        overrides,
      }),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "The Brightwheel roster import failed.");
    return payload;
  }

  async function previewRoster() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const payload = await callImport("preview") as unknown as PreviewPayload;
      setPreview(payload);
      setRowSettings(Object.fromEntries(payload.rows.map((row) => [
        row.rowKey,
        {
          include: row.include,
          location: row.selectedLocation,
          funding: row.selectedFunding,
        },
      ])));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not preview the Brightwheel roster.");
    } finally {
      setLoading(false);
    }
  }

  async function importRoster() {
    if (!preview) return;
    setCommitting(true);
    setError("");
    try {
      const payload = await callImport("commit");
      setResult({
        inserted: Number(payload.inserted) || 0,
        updated: Number(payload.updated) || 0,
        skipped: Number(payload.skipped) || 0,
        message: typeof payload.message === "string" ? payload.message : "Brightwheel import complete.",
      });
      setPreview(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not import the Brightwheel roster.");
    } finally {
      setCommitting(false);
    }
  }

  function updateRow(rowKey: string, update: Partial<RowSetting>) {
    setRowSettings((current) => ({
      ...current,
      [rowKey]: { ...current[rowKey], ...update },
    }));
  }

  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-5">
    <section className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-[#173d29] via-[#2f6f49] to-[#142e21] p-6 text-white shadow-xl">
      <div className="relative z-10 max-w-4xl">
        <p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-200">Children Center • Bulk setup</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">Import your Brightwheel roster</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-emerald-50/85">Bring your existing child and family contact information into The Hub instead of entering everyone one-by-one. The import previews duplicates first so children you already started can be updated instead of copied twice.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/children" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-emerald-950"><ArrowLeft className="h-4 w-4" /> Children Center</Link>
        </div>
      </div>
    </section>

    <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-emerald-700 text-white"><ShieldCheck className="h-5 w-5" /></span>
        <div>
          <h2 className="font-black text-emerald-950">Parent invitations are OFF for this import</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-emerald-900/80">Parent names, emails, and phone numbers can be copied into the child record, but this tool does <strong>not</strong> create Parent Portal access, send emails, send texts, or invite existing families. You can invite families later when TCS is ready.</p>
        </div>
      </div>
    </section>

    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div>}
    {result && <section className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3"><CheckCircle2 className="mt-1 h-7 w-7 text-emerald-700" /><div><h2 className="text-xl font-black text-slate-950">Brightwheel roster imported</h2><p className="mt-1 text-sm font-semibold text-slate-600">{result.message}</p></div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><ResultStat label="Children Added" value={result.inserted} /><ResultStat label="Existing Updated" value={result.updated} /><ResultStat label="Skipped" value={result.skipped} /></div>
      <Link href="/children" className="mt-5 inline-flex rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white">Return to Children Center</Link>
    </section>}

    {!result && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-6 lg:grid-cols-[1fr_.9fr]">
        <div>
          <div className="flex items-center gap-3"><FileSpreadsheet className="h-6 w-6 text-emerald-700" /><div><h2 className="text-xl font-black text-slate-950">1. Export your roster from Brightwheel</h2><p className="text-xs font-semibold text-slate-500">Use Brightwheel on the web: My School → Students → Export Roster.</p></div></div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs font-semibold leading-6 text-slate-700">
            Include as much as you have available, especially <strong>child first/last name, birth date, enrollment status, room/homeroom, parent contact information, allergies/medications, doctor information, emergency contact, and subsidy details.</strong> Exporting active students only will make the first import cleaner.
          </div>

          <label className="mt-5 flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-6 text-center transition hover:bg-emerald-50">
            <UploadCloud className="h-10 w-10 text-emerald-700" />
            <strong className="mt-3 text-sm text-slate-950">{fileName || "Choose Brightwheel roster CSV"}</strong>
            <span className="mt-1 text-xs font-semibold text-slate-500">CSV files up to 5 MB</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)} />
          </label>
        </div>

        <div>
          <h2 className="text-xl font-black text-slate-950">2. Import defaults</h2>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">The Hub will use Brightwheel room/subsidy information when it recognizes it. These defaults fill anything Brightwheel does not identify.</p>

          <div className="mt-5 space-y-4">
            <label className="block"><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">Default TCS Location</span><select value={defaultLocation} onChange={(event) => setDefaultLocation(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold"><option value="">No default — review each child</option>{locations.map((location) => <option key={location}>{location}</option>)}</select></label>
            <label className="block"><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">Default Funding Source</span><select value={defaultFunding} onChange={(event) => setDefaultFunding(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold"><option value="">No default — review each child</option>{fundingSources.map((source) => <option key={source}>{source}</option>)}</select></label>
            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4"><input type="checkbox" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} className="mt-1 h-4 w-4 accent-emerald-700" /><span><strong className="block text-sm text-slate-900">Import active students only</strong><span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">Recommended for your first Brightwheel import so old/withdrawn profiles do not come into The Hub.</span></span></label>
          </div>

          <button disabled={!csvText || loading} onClick={() => void previewRoster()} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white shadow-lg disabled:opacity-40">{loading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <UsersRound className="h-5 w-5" />}{loading ? "Reading roster…" : preview ? "Refresh Preview" : "Preview Brightwheel Import"}</button>
        </div>
      </div>
    </section>}

    {preview && !result && <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5">
        <h2 className="text-xl font-black text-slate-950">3. Review before anything is saved</h2>
        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">Existing children are matched by Brightwheel ID when available, then by exact child name + birth date. Adjust location or funding before importing.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <PreviewStat label="Rows in File" value={preview.totals.fileRows} />
          <PreviewStat label="Active to Review" value={preview.totals.activeRows} />
          <PreviewStat label="New Children" value={preview.totals.newRows} />
          <PreviewStat label="Will Update" value={preview.totals.updateRows} />
          <PreviewStat label="Need Attention" value={preview.totals.needsAttention} warn={preview.totals.needsAttention > 0} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Import</th><th className="px-4 py-3">Child</th><th className="px-4 py-3">DOB</th><th className="px-4 py-3">Parent / Guardian</th><th className="px-4 py-3">Brightwheel Room</th><th className="px-4 py-3">TCS Location</th><th className="px-4 py-3">Funding</th><th className="px-4 py-3">Match</th><th className="px-4 py-3">Review</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{preview.rows.map((row) => {
            const setting = rowSettings[row.rowKey] ?? { include: true, location: row.selectedLocation, funding: row.selectedFunding };
            const unresolved = !row.firstName || !row.lastName || !row.dateOfBirth || !setting.location || !setting.funding;
            return <tr key={row.rowKey} className={unresolved ? "bg-amber-50/40" : ""}>
              <td className="px-4 py-3"><input type="checkbox" checked={setting.include} onChange={(event) => updateRow(row.rowKey, { include: event.target.checked })} className="h-4 w-4 accent-emerald-700" /></td>
              <td className="px-4 py-3"><strong className="text-slate-950">{row.firstName || "Missing"} {row.lastName || "name"}</strong>{row.brightwheelId && <p className="mt-1 text-[9px] text-slate-400">BW {row.brightwheelId}</p>}</td>
              <td className="px-4 py-3 font-semibold">{row.dateOfBirth || <span className="text-amber-700">Missing</span>}</td>
              <td className="px-4 py-3"><strong className="text-slate-800">{row.primaryGuardian || "Not included"}</strong>{row.guardianEmail && <p className="mt-1 max-w-48 truncate text-[9px] text-slate-400">{row.guardianEmail}</p>}</td>
              <td className="px-4 py-3">{row.room || "—"}</td>
              <td className="px-4 py-3"><select value={setting.location} onChange={(event) => updateRow(row.rowKey, { location: event.target.value })} className="w-52 rounded-lg border border-slate-200 bg-white px-2 py-2 text-[10px] font-bold"><option value="">Choose location…</option>{locations.map((location) => <option key={location}>{location}</option>)}</select></td>
              <td className="px-4 py-3"><select value={setting.funding} onChange={(event) => updateRow(row.rowKey, { funding: event.target.value })} className="w-40 rounded-lg border border-slate-200 bg-white px-2 py-2 text-[10px] font-bold"><option value="">Choose funding…</option>{fundingSources.map((source) => <option key={source}>{source}</option>)}</select></td>
              <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${row.matchType === "update" ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"}`}>{row.matchType === "update" ? "Update existing" : "Add new"}</span></td>
              <td className="px-4 py-3">{unresolved ? <span className="font-black text-amber-800">Needs required info</span> : row.warnings.length ? <span className="font-semibold text-slate-500">{row.warnings.join(" • ")}</span> : <span className="font-black text-emerald-700">Ready</span>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-black text-slate-950">{readyCount} child record{readyCount === 1 ? "" : "s"} ready to import</p><p className="mt-1 text-xs font-semibold text-slate-500">Rows with missing DOB, TCS location, or funding will be skipped. Parent contact warnings do not block the import.</p></div>
        <button disabled={readyCount === 0 || committing} onClick={() => void importRoster()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#173d29] px-6 py-3 text-sm font-black text-white shadow-lg disabled:opacity-40">{committing ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}{committing ? "Importing securely…" : `Import ${readyCount} Children`}</button>
      </div>
    </section>}
  </div></MainLayout>;
}

function PreviewStat({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return <div className={`rounded-2xl border p-3 ${warn ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p><strong className={`mt-1 block text-2xl ${warn ? "text-amber-800" : "text-slate-950"}`}>{value}</strong></div>;
}

function ResultStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p><strong className="mt-1 block text-3xl text-slate-950">{value}</strong></div>;
}
