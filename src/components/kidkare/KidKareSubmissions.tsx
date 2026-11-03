"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ClipboardCheck, ImagePlus } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { inputClass, Modal } from "@/components/hub/HubUI";
import { normalizeLocation } from "@/lib/location-config";
import { hubRequest } from "@/lib/hub-request";
import { withRequestTimeout } from "@/lib/request-timeout";
import { KIDKARE_CLAIM_DOCUMENT, KIDKARE_SCREENSHOT_LIMIT, KIDKARE_SCREENSHOT_TYPES, kidKareProgress, kidKareToday, weekdaysInMonth, type KidKareDay, type KidKareDayStatus, type KidKareProof, type KidKareSubmissionData } from "@/lib/kidkare-submissions";

const button = "min-h-11 rounded-xl border border-emerald-800 px-4 py-2 text-base font-bold text-emerald-950 disabled:opacity-50";
const formatDay = (day: string) => new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
const formatTime = (time: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" }).format(new Date(time));

async function screenshotFile(file: File) {
  if (!KIDKARE_SCREENSHOT_TYPES.includes(file.type)) throw new Error("Choose a PNG, JPEG, HEIC, or HEIF screenshot.");
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("Choose a screenshot smaller than 20 MB.");
  if (file.size <= KIDKARE_SCREENSHOT_LIMIT) return file;
  // Large phone screenshots are resized locally before upload; no external service receives them.
  const image = await createImageBitmap(file).catch(() => { throw new Error("Save this screenshot as a PNG or JPEG under 4 MB and try again."); });
  try {
    const scale = Math.min(1, 2800 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This screenshot could not be prepared. Try a smaller image.");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob || blob.size > KIDKARE_SCREENSHOT_LIMIT) throw new Error("Choose a screenshot under 4 MB.");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally { image.close(); }
}

export default function KidKareSubmissions() {
  const { location } = useHubLocation();
  const [month, setMonth] = useState(() => kidKareToday().slice(0, 7));
  return <section id="kidkare-submissions" className="scroll-mt-24 space-y-5 rounded-3xl border border-emerald-200 bg-white p-5 text-base shadow-sm sm:p-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h2 className="flex items-center gap-2 text-2xl font-black text-emerald-950"><ClipboardCheck aria-hidden="true" className="h-7 w-7" />Daily submissions & monthly claims</h2><p className="mt-2 text-slate-700">A separate record for each in-home location. Mark work after you submit it in KidKare.</p></div>
      <label className="font-bold text-slate-800">Claim month<input type="month" className={`${inputClass} mt-1 min-h-11 text-base`} value={month} min="2000-01" max={kidKareToday().slice(0, 7)} onChange={event => { if (event.target.value) setMonth(event.target.value); }} /></label>
    </div>
    <SubmissionMonth key={`${month}:${location}`} month={month} hubLocation={location} />
  </section>;
}

function SubmissionMonth({ month, hubLocation }: { month: string; hubLocation: string }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [data, setData] = useState<KidKareSubmissionData | null>(null);
  const [homeId, setHomeId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [preview, setPreview] = useState<{ url: string; filename: string; mime: string } | null>(null);
  const requests = useRef({ value: 0 });
  const load = useCallback(async () => {
    if (!token) return;
    const generation = ++requests.current.value;
    try {
      const result = await hubRequest<KidKareSubmissionData>(`/api/kidkare/submissions?month=${month}`, token);
      if (generation !== requests.current.value) return;
      setData(result); setLoadError("");
    } catch (reason) { if (generation === requests.current.value) setLoadError(reason instanceof Error ? reason.message : "Could not load KidKare submissions."); }
  }, [token, month]);
  useEffect(() => {
    const sequence = requests.current;
    const timer = window.setTimeout(() => void load(), 0);
    return () => { sequence.value++; window.clearTimeout(timer); };
  }, [load]);
  useEffect(() => { const url = preview?.url; return () => { if (url) URL.revokeObjectURL(url); }; }, [preview]);

  const homes = data?.homes ?? [];
  const home = homes.find(item => item.id === homeId)
    ?? homes.find(item => normalizeLocation(item.full_name) === hubLocation)
    ?? homes.find(item => item.is_active) ?? homes[0];
  const today = data?.today ?? kidKareToday();
  const pastMonth = month < today.slice(0, 7);
  const canEdit = Boolean(token && data && home && (home.is_active || pastMonth) && !loadError);
  const days = data?.days.filter(day => day.location_id === home?.id) ?? [];
  const proofs = data?.proofs.filter(proof => proof.location_id === home?.id) ?? [];
  const dates = weekdaysInMonth(month);

  function chooseHome(id: string) { setHomeId(id); setFile(null); setFileInputKey(key => key + 1); setNotice(""); setError(""); }
  async function markDay(date: string, status: KidKareDayStatus) {
    if (!canEdit || !home || !token || busy) return;
    setBusy(date); setError(""); setNotice("");
    try {
      const result = await hubRequest<{ day: KidKareDay }>("/api/kidkare/submissions", token, { method: "POST", body: JSON.stringify({ locationId: home.id, date, status, expectedRevision: days.find(day => day.service_date === date)?.revision ?? 0 }) });
      setData(current => current ? { ...current, days: [...current.days.filter(day => day.id !== result.day.id), result.day] } : current);
      setNotice("Daily status saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save. Try again."); await load(); }
    finally { setBusy(""); }
  }
  async function upload() {
    if (!canEdit || !home || !token || !file || busy) return;
    setBusy("upload"); setError(""); setNotice("");
    try {
      const prepared = await screenshotFile(file);
      const form = new FormData(); form.set("file", prepared); form.set("location", home.full_name); form.set("documentType", KIDKARE_CLAIM_DOCUMENT); form.set("claimMonth", month);
      await withRequestTimeout(async signal => {
        const response = await fetch("/api/documents", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form, signal });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.document?.id) throw new Error(result.error || "The screenshot could not be saved. Try again.");
      }, 45000);
      setFile(null); setFileInputKey(key => key + 1); setNotice("Claim screenshot saved for this home and month."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Upload failed. Your daily checklist is still saved."); }
    finally { setBusy(""); }
  }
  async function openProof(proof: KidKareProof) {
    if (!token || busy) return;
    setBusy(proof.id); setError("");
    try {
      const blob = await withRequestTimeout(async signal => {
        const response = await fetch(`/api/documents/${proof.id}/download`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal });
        if (!response.ok) throw new Error("The screenshot could not be opened. Please try again.");
        return response.blob();
      }, 30000);
      setPreview({ url: URL.createObjectURL(blob), filename: proof.original_filename, mime: blob.type });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not open the screenshot."); }
    finally { setBusy(""); }
  }

  if (loadError && !data) return <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-900"><p>{loadError}</p><button className={`${button} mt-3`} onClick={() => void load()}>Try again</button></div>;
  if (!data) return <p role="status">Loading KidKare submissions…</p>;
  if (!homes.length) return <p>No in-home locations are available to this account.</p>;
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{homes.filter(item => item.is_active).map(item => {
      const progress = kidKareProgress(data.days.filter(day => day.location_id === item.id), month, today);
      const hasProof = data.proofs.some(proof => proof.location_id === item.id);
      return <button key={item.id} disabled={Boolean(busy)} aria-pressed={home?.id === item.id} onClick={() => chooseHome(item.id)} className={`rounded-2xl border-2 p-4 text-left disabled:opacity-50 ${home?.id === item.id ? "border-emerald-800 bg-emerald-50" : "border-slate-200 bg-white"}`}>
        <span className="block text-lg font-black text-emerald-950">{item.full_name}</span>
        <span className="mt-2 block text-slate-800">{progress.submitted} <span>submitted</span> · {progress.closed} <span>closed / no care</span></span>
        <span className={`block font-bold ${progress.unmarked ? "text-amber-900" : "text-emerald-900"}`}>{progress.unmarked} <span>weekdays not marked</span></span>
        <span className={`mt-2 block font-bold ${hasProof ? "text-emerald-900" : pastMonth ? "text-amber-900" : "text-slate-700"}`}>{hasProof ? "Claim screenshot saved" : pastMonth ? "Claim screenshot needed" : "Claim screenshot due at month-end"}</span>
      </button>;
    })}</div>
    <label className="block max-w-xl font-bold text-slate-800">In-home location<select className={`${inputClass} mt-1 min-h-11 text-base`} value={home?.id ?? ""} disabled={Boolean(busy)} onChange={event => chooseHome(event.target.value)}>{homes.map(item => <option key={item.id} value={item.id}>{item.full_name}{item.is_active ? "" : " (Closed — history)"}</option>)}</select></label>
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 font-bold text-emerald-950">{notice}</p>}
    {(error || loadError) && <div role="alert" className="rounded-xl bg-red-50 p-3 text-red-900"><p>{error || loadError}</p>{loadError && <button className={`${button} mt-2`} onClick={() => void load()}>Try again</button>}</div>}
    {!home?.is_active && <p className="rounded-xl bg-slate-100 p-3 text-slate-800">This home is closed. Past months remain available for records and claim screenshots.</p>}
    <div className="space-y-3"><h3 className="text-xl font-black text-emerald-950">Monday–Friday checklist</h3><p className="text-slate-700">Check Submitted after completing KidKare for that date. Use Closed / no care when no submission is needed.</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{dates.map(date => {
        const row = days.find(day => day.service_date === date); const future = date > today;
        return <article key={date} className={`rounded-2xl border p-3 ${row?.status === "Submitted" ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
          <h4 className="font-black text-slate-950">{formatDay(date)}</h4>
          {future ? <p className="mt-3 text-slate-700">Upcoming</p> : <>
            <label className="mt-2 flex min-h-11 items-center gap-2 font-bold text-emerald-950"><input aria-label={`Submitted for ${date}`} type="checkbox" className="h-6 w-6 accent-emerald-800" checked={row?.status === "Submitted"} disabled={!canEdit || Boolean(busy)} onChange={event => void markDay(date, event.target.checked ? "Submitted" : "Not submitted")} />Submitted</label>
            <button className="min-h-11 text-left text-base font-semibold text-slate-800 underline disabled:opacity-50" disabled={!canEdit || Boolean(busy)} onClick={() => void markDay(date, row?.status === "Closed / no care" ? "Not submitted" : "Closed / no care")}>{row?.status === "Closed / no care" ? "Closed / no care — undo" : "Closed / no care"}</button>
            {row && <p className="mt-2 text-sm leading-5 text-slate-700"><span translate="no">{row.updated_by_name}</span><br />{formatTime(row.updated_at)}</p>}
            {busy === date && <p role="status">Saving…</p>}
          </>}
        </article>;
      })}</div>
    </div>
    <section className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <h3 className="flex items-center gap-2 text-xl font-black text-emerald-950"><ImagePlus aria-hidden="true" className="h-6 w-6" />Monthly claim confirmation</h3>
      <p className="text-slate-800">After sending this home’s monthly claim in KidKare, upload a screenshot of the sent confirmation. Choose the month the claim covers above.</p>
      <p className="font-bold text-emerald-950">{home?.full_name} · {month}</p>
      {!proofs.length && <p className="font-bold text-amber-900">{pastMonth ? "Claim screenshot needed" : "No claim screenshot saved yet"}</p>}
      <div className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 font-bold text-slate-800">Claim screenshot<input key={fileInputKey} type="file" accept="image/png,image/jpeg,image/heic,image/heif" className="mt-2 block min-h-11 w-full text-base file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-white file:px-3 file:font-bold file:text-emerald-950" disabled={!canEdit || Boolean(busy)} onChange={event => { setFile(event.target.files?.[0] ?? null); setError(""); }} /></label><button className={`${button} bg-emerald-800 text-white`} disabled={!canEdit || !file || Boolean(busy)} onClick={() => void upload()}>{busy === "upload" ? "Uploading…" : "Upload claim screenshot"}</button></div>
      <p className="text-sm text-slate-700">PNG, JPEG, HEIC or HEIF. Large screenshots are resized on your device when supported. You can add more than one screenshot.</p>
      {proofs.map(proof => <div key={proof.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white p-3"><div><p className="flex items-center gap-2 font-bold text-emerald-950"><CheckCircle2 aria-hidden="true" className="h-5 w-5" />Claim screenshot saved</p><p className="break-all text-slate-800" translate="no">{proof.original_filename}</p><p className="text-sm text-slate-700">{formatTime(proof.created_at)}</p></div><button className={button} disabled={Boolean(busy)} onClick={() => void openProof(proof)}>{busy === proof.id ? "Opening…" : "View screenshot"}</button></div>)}
    </section>
    {preview && <Modal title="KidKare claim screenshot" description={`${home?.full_name} · ${month}`} onClose={() => setPreview(null)}><div className="space-y-3">{/image\/(png|jpeg)/.test(preview.mime) ? <Image unoptimized src={preview.url} width={1200} height={1600} alt="Uploaded KidKare claim confirmation" className="max-h-[65vh] w-full object-contain" /> : <p>Download this HEIC screenshot to open it on your device.</p>}<a href={preview.url} download={preview.filename} className={`${button} inline-flex items-center`}>Download screenshot</a></div></Modal>}
  </div>;
}
