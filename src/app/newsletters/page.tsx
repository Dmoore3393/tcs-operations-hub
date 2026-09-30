"use client";

import { CelebrationBits, FunDoodles, GatorGuide } from "@/components/brand/HubJoy";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  BookOpenText,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Newspaper,
  PauseCircle,
  PlayCircle,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Location = { id: string; name: string };
type Newsletter = {
  id: string;
  locationId: string;
  month: string;
  title: string;
  summary: string;
  mimeType: string;
  sizeBytes: number;
  isPublished: boolean;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  url: string;
};
type Payload = {
  canManageAllLocations: boolean;
  locations: Location[];
  newsletters: Newsletter[];
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function monthLabel(value: string) {
  if (!value) return "No month";
  const date = new Date(`${value.slice(0, 7)}-01T12:00:00`);
  return date.toLocaleDateString([], { month: "long", year: "numeric" });
}

function bytesLabel(value: number) {
  if (!value) return "0 KB";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default function NewslettersPage() {
  const { session } = useAuth();
  const [data, setData] = useState<Payload | null>(null);
  const [month, setMonth] = useState(currentMonth());
  const [locationId, setLocationId] = useState("");
  const [title, setTitle] = useState("TCS Family Newsletter");
  const [summary, setSummary] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const response = await fetch("/api/newsletters", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json() as Payload & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load newsletters.");
      setData(payload);
      if (!payload.canManageAllLocations && !locationId) setLocationId(payload.locations[0]?.id || "");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load newsletters.");
    } finally {
      setLoading(false);
    }
  }, [locationId, session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  const publishedCount = useMemo(() => data?.newsletters.filter((item) => item.isPublished).length ?? 0, [data]);

  async function upload() {
    if (!session?.access_token || !file) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.set("month", month);
      form.set("locationId", locationId);
      form.set("title", title);
      form.set("summary", summary);
      form.set("file", file);

      const response = await fetch("/api/newsletters", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error || "Could not publish newsletter.");
      setNotice(payload.message || "Newsletter published.");
      setFile(null);
      setSummary("");
      const input = document.getElementById("newsletter-file") as HTMLInputElement | null;
      if (input) input.value = "";
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not publish newsletter.");
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    if (!session?.access_token) return;
    setWorkingId(id);
    setError("");
    try {
      const response = await fetch("/api/newsletters", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, ...body }),
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error || "Could not update newsletter.");
      setNotice(payload.message || "Newsletter updated.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update newsletter.");
    } finally {
      setWorkingId("");
    }
  }

  async function remove(id: string) {
    if (!session?.access_token || !window.confirm("Remove this newsletter from The Hub?")) return;
    setWorkingId(id);
    setError("");
    try {
      const response = await fetch("/api/newsletters", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error || "Could not remove newsletter.");
      setNotice(payload.message || "Newsletter removed.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove newsletter.");
    } finally {
      setWorkingId("");
    }
  }

  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-6">
    <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#223558] via-[#2f6f49] to-[#173d29] p-6 text-white shadow-xl">
      <FunDoodles className="opacity-35" />
      <div className="relative z-10 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-sky-200">Family communication library</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Monthly Newsletters</h1><p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/85">Upload a monthly newsletter whenever TCS has one. Publish it to all families or just one location, and parents can open it anytime from their secure Parent Portal.</p></div>
        <GatorGuide size="lg" message={<>A cute newsletter gives families one more reason to check The Hub. 📰💚</>} />
      </div>
    </section>

    {notice && <div className="tcs-soft-pop relative overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-black text-emerald-900"><CelebrationBits /><CheckCircle2 className="mr-2 inline h-4 w-4" />{notice}</div>}
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900">{error}</div>}

    <section className="grid gap-4 sm:grid-cols-3">
      <Stat label="Published" value={publishedCount} helper="Currently visible to families" />
      <Stat label="Total Newsletters" value={data?.newsletters.length ?? 0} helper="Published + paused" />
      <Stat label="Current Month" value={monthLabel(`${month}-01`)} helper="Upload month selected" />
    </section>

    <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3"><UploadCloud className="mt-1 h-6 w-6 text-emerald-700" /><div><h2 className="text-xl font-black">Upload newsletter</h2><p className="text-xs font-semibold text-slate-500">PDF, JPG, PNG, or WebP • up to 15 MB</p></div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Newsletter month"><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className={inputClass} /></Field>
          <Field label="Audience"><select value={locationId} onChange={(event) => setLocationId(event.target.value)} className={inputClass}>{data?.canManageAllLocations && <option value="">All TCS families</option>}{data?.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
        </div>
        <Field label="Title"><input value={title} onChange={(event) => setTitle(event.target.value.slice(0,180))} className={inputClass} placeholder="October Family Newsletter" /></Field>
        <Field label="Short description (optional)"><textarea value={summary} onChange={(event) => setSummary(event.target.value.slice(0,1200))} className={`${inputClass} min-h-24 resize-y`} placeholder="A quick note about what families will find inside…" /></Field>
        <label className="mt-4 flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-6 text-center">
          {file?.type === "application/pdf" ? <FileText className="h-10 w-10 text-emerald-700" /> : <ImageIcon className="h-10 w-10 text-emerald-700" />}
          <strong className="mt-3 text-sm text-slate-950">{file?.name || "Choose newsletter file"}</strong>
          <span className="mt-1 text-xs font-semibold text-slate-500">{file ? bytesLabel(file.size) : "PDF or image file"}</span>
          <input id="newsletter-file" type="file" accept=".pdf,application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
        <button disabled={saving || !file || !month || !title.trim()} onClick={() => void upload()} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white disabled:opacity-40">{saving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Newspaper className="h-5 w-5" />}{saving ? "Publishing…" : "Publish Newsletter"}</button>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">Newsletter library</h2><p className="text-xs font-semibold text-slate-500">Pause a newsletter anytime without deleting it.</p></div>{loading && <LoaderCircle className="h-5 w-5 animate-spin text-emerald-700" />}</div>
        <div className="mt-5 space-y-3">{data?.newsletters.length ? data.newsletters.map((item) => {
          const location = data.locations.find((entry) => entry.id === item.locationId);
          return <article key={item.id} className="tcs-joy-card rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-3"><span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-sky-50 text-sky-700">{item.mimeType === "application/pdf" ? <FileText className="h-5 w-5" /> : <BookOpenText className="h-5 w-5" />}</span><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-wider text-sky-700">{monthLabel(item.month)} • {location?.name || "All TCS Families"}</p><h3 className="mt-1 truncate font-black text-slate-950">{item.title}</h3>{item.summary && <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{item.summary}</p>}<p className="mt-2 text-[9px] font-semibold text-slate-400">{bytesLabel(item.sizeBytes)}{item.createdByName ? ` • Added by ${item.createdByName}` : ""}</p></div></div>
              <div className="flex flex-wrap gap-2">{item.url && <a href={item.url} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-950 px-3 py-2 text-[10px] font-black text-white">Open</a>}<button disabled={workingId === item.id} onClick={() => void patch(item.id, { isPublished: !item.isPublished })} className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-black ${item.isPublished ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{item.isPublished ? <PauseCircle className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}{item.isPublished ? "Pause" : "Publish"}</button><button disabled={workingId === item.id} onClick={() => void remove(item.id)} className="rounded-xl bg-red-50 p-2 text-red-700"><Trash2 className="h-4 w-4" /></button></div>
            </div>
            <div className="mt-3"><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${item.isPublished ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{item.isPublished ? "Visible to Families" : "Paused"}</span></div>
          </article>;
        }) : <div className="rounded-3xl bg-slate-50 p-8 text-center"><Newspaper className="mx-auto h-9 w-9 text-emerald-700" /><h3 className="mt-2 font-black">No newsletters uploaded yet</h3><p className="mt-1 text-xs font-semibold text-slate-500">Your first monthly family newsletter will appear here.</p></div>}</div>
      </section>
    </div>
  </div></MainLayout>;
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mt-4 block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span>{children}</label>;
}
function Stat({ label, value, helper }: { label: string; value: string | number; helper: string }) {
  return <section className="tcs-joy-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p><strong className="mt-1 block text-2xl text-slate-950">{value}</strong><p className="mt-1 text-[10px] font-semibold text-slate-500">{helper}</p></section>;
}
