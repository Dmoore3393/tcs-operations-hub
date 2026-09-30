"use client";

import { CelebrationBits, FunDoodles, GatorGuide } from "@/components/brand/HubJoy";
import SafeImage from "@/components/media/SafeImage";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import type { ChildRecord } from "@/lib/children";
import {
  Baby,
  Camera,
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type MediaItem = {
  id: string;
  kind: string;
  date: string;
  caption: string;
  mimeType: string;
  sizeBytes: number;
  visibleToFamily: boolean;
  consentVerified: boolean;
  uploadedBy: string;
  createdAt: string;
  url: string;
};

type ChildPayload = { children?: ChildRecord[]; error?: string };

function childName(child: ChildRecord) {
  return `${child.firstName} ${child.lastName}`.trim();
}
function today() {
  return new Date().toISOString().slice(0,10);
}

export default function ChildPhotosPage() {
  const { session } = useAuth();
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"Profile" | "Daily Photo">("Daily Photo");
  const [serviceDate, setServiceDate] = useState(today());
  const [caption, setCaption] = useState("");
  const [consentVerified, setConsentVerified] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedChild = children.find((child) => String(child.legacyId || child.id) === selectedChildId) ?? null;

  const filteredChildren = useMemo(() => children
    .filter((child) => child.enrollmentStatus !== "Archived")
    .filter((child) => !search || `${child.firstName} ${child.lastName} ${child.location}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => childName(a).localeCompare(childName(b))), [children, search]);

  const profile = media.find((item) => item.kind === "Profile") ?? null;
  const dailyPhotos = media.filter((item) => item.kind === "Daily Photo");

  const loadChildren = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const response = await fetch("/api/children", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json() as ChildPayload;
      if (!response.ok) throw new Error(payload.error || "Could not load children.");
      const next = payload.children ?? [];
      setChildren(next);
      setSelectedChildId((current) => current || String(next[0]?.legacyId || next[0]?.id || ""));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load children.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  const loadMedia = useCallback(async (childId: string) => {
    if (!session?.access_token || !childId) return;
    setLoadingMedia(true);
    try {
      const response = await fetch(`/api/child-media?childId=${encodeURIComponent(childId)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json() as { media?: MediaItem[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load child photos.");
      setMedia(payload.media ?? []);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load child photos.");
    } finally {
      setLoadingMedia(false);
    }
  }, [session?.access_token]);

  useEffect(() => { void loadChildren(); }, [loadChildren]);
  useEffect(() => { if (selectedChildId) void loadMedia(selectedChildId); }, [loadMedia, selectedChildId]);

  async function upload() {
    if (!session?.access_token || !selectedChild || !file) return;
    if (!consentVerified) {
      setError("Verify the child’s photo consent before uploading.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.set("childId", selectedChildId);
      form.set("kind", kind);
      form.set("serviceDate", serviceDate);
      form.set("caption", caption);
      form.set("consentVerified", "true");
      form.set("file", file);

      const response = await fetch("/api/child-media", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error || "Could not upload the photo.");
      setNotice(payload.message || "Photo uploaded.");
      setFile(null);
      setCaption("");
      setConsentVerified(false);
      const input = document.getElementById("child-photo-file") as HTMLInputElement | null;
      if (input) input.value = "";
      await loadMedia(selectedChildId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not upload the photo.");
    } finally {
      setSaving(false);
    }
  }

  async function removePhoto(id: string) {
    if (!session?.access_token) return;
    if (!window.confirm("Remove this photo?")) return;
    setDeletingId(id);
    setError("");
    try {
      const response = await fetch("/api/child-media", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error || "Could not remove the photo.");
      setNotice(payload.message || "Photo removed.");
      await loadMedia(selectedChildId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove the photo.");
    } finally {
      setDeletingId("");
    }
  }

  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-6">
    <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#5f3f72] via-[#2e6c47] to-[#173d29] p-6 text-white shadow-xl"><FunDoodles className="opacity-35" />
      <div className="relative z-10 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-violet-200">Family photo moments</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Child Photos</h1><p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/85">Add a profile picture and daily moments families can see in their secure Parent Portal. Each photo stays tied to one child’s authorized family access.</p></div>
        <GatorGuide size="lg" message={<>A quick photo can become a parent’s favorite part of the day. 📸💚</>} />
      </div>
    </section>

    {notice && <div className="tcs-soft-pop relative overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-black text-emerald-900"><CelebrationBits /><CheckCircle2 className="mr-2 inline h-4 w-4" />{notice}</div>}
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900">{error}</div>}

    <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4"><label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search children…" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm font-semibold outline-none focus:border-emerald-400" /></label></div>
        <div className="max-h-[720px] overflow-y-auto p-2">{loading ? <div className="grid min-h-48 place-items-center"><LoaderCircle className="h-6 w-6 animate-spin text-emerald-700" /></div> : filteredChildren.map((child) => {
          const id = String(child.legacyId || child.id);
          return <button key={id} onClick={() => setSelectedChildId(id)} className={`mb-1 w-full rounded-2xl border p-4 text-left transition ${selectedChildId === id ? "border-emerald-300 bg-emerald-50" : "border-transparent hover:bg-slate-50"}`}><strong className="text-sm text-slate-950">{childName(child)}</strong><p className="mt-1 text-xs font-semibold text-slate-500">{child.location} • {child.ageGroup}</p></button>;
        })}</div>
      </section>

      {!selectedChild ? <section className="grid min-h-[460px] place-items-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center"><div><Camera className="mx-auto h-10 w-10 text-emerald-700" /><h2 className="mt-3 text-xl font-black">Choose a child</h2><p className="mt-2 text-sm font-semibold text-slate-500">Then add their profile picture or daily photos.</p></div></section> : <div className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
            <div className="aspect-square overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-emerald-50 to-violet-50">
              <SafeImage src={profile?.url} alt={`${childName(selectedChild)} profile`} className="h-full w-full object-cover" fallback={<div className="grid h-full place-items-center text-emerald-700"><div className="text-center"><UserRound className="mx-auto h-12 w-12" /><p className="mt-2 text-xs font-black">No profile photo yet</p></div></div>} />
            </div>
            <div><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Photo file</p><h2 className="mt-1 text-2xl font-black">{childName(selectedChild)}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{selectedChild.location} • {selectedChild.ageGroup}</p>
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs font-semibold leading-5 text-blue-950"><ShieldCheck className="mr-1 inline h-4 w-4" />Photos are stored privately. Families only receive temporary secure photo links through their authorized Parent Portal.</div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3"><ImagePlus className="h-6 w-6 text-emerald-700" /><div><h2 className="text-xl font-black">Upload a photo</h2><p className="text-xs font-semibold text-slate-500">JPG, PNG, or WebP • up to 8 MB</p></div></div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">Photo type</span><select value={kind} onChange={(event) => setKind(event.target.value as "Profile" | "Daily Photo")} className={inputClass}><option>Daily Photo</option><option>Profile</option></select></label>
            <label><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">Date</span><input type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} className={inputClass} /></label>
          </div>

          <label className="mt-4 block"><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">Caption</span><input value={caption} onChange={(event) => setCaption(event.target.value.slice(0,500))} placeholder="Example: So proud of today's art project! 🎨" className={inputClass} /></label>

          <label className="mt-4 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-5 text-center"><Camera className="h-8 w-8 text-emerald-700" /><strong className="mt-2 text-sm text-slate-950">{file?.name || "Choose photo"}</strong><span className="mt-1 text-[10px] font-semibold text-slate-500">Tap or click to select an image</span><input id="child-photo-file" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>

          <label className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><input type="checkbox" checked={consentVerified} onChange={(event) => setConsentVerified(event.target.checked)} className="mt-1 h-4 w-4 accent-emerald-700" /><span><strong className="block text-sm text-amber-950">I verified this child’s photo consent is on file.</strong><span className="mt-1 block text-xs font-semibold leading-5 text-amber-900/80">Only upload photos that TCS is authorized to share with this child’s family.</span></span></label>

          <button disabled={saving || !file || !consentVerified} onClick={() => void upload()} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white disabled:opacity-40">{saving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}{saving ? "Uploading securely…" : kind === "Profile" ? "Set Profile Picture" : "Add Daily Photo"}</button>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">Family photo gallery</h2><p className="text-xs font-semibold text-slate-500">{dailyPhotos.length} daily photo{dailyPhotos.length === 1 ? "" : "s"}</p></div>{loadingMedia && <LoaderCircle className="h-5 w-5 animate-spin text-emerald-700" />}</div>
          {dailyPhotos.length ? <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{dailyPhotos.map((item) => <article key={item.id} className="tcs-joy-card overflow-hidden rounded-3xl border border-slate-200 bg-white"><div className="aspect-[4/3] bg-slate-100"><SafeImage src={item.url} alt={item.caption || "Child daily photo"} className="h-full w-full object-cover" fallback={<div className="grid h-full place-items-center text-slate-400"><Camera className="h-8 w-8" /></div>} /></div><div className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-wider text-emerald-700">{item.date}</p><p className="mt-1 text-xs font-semibold leading-5 text-slate-700">{item.caption || "A moment from today 💚"}</p></div><button disabled={deletingId === item.id} onClick={() => void removePhoto(item.id)} className="rounded-lg p-2 text-red-700 hover:bg-red-50">{deletingId === item.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button></div>{item.uploadedBy && <p className="mt-3 text-[9px] font-semibold text-slate-400">Added by {item.uploadedBy}</p>}</div></article>)}</div> : <div className="mt-5 rounded-3xl bg-slate-50 p-8 text-center"><Baby className="mx-auto h-9 w-9 text-emerald-700" /><h3 className="mt-2 font-black">No daily photos yet</h3><p className="mt-1 text-xs font-semibold text-slate-500">The first family photo will appear here.</p></div>}
        </section>
      </div>}
    </div>
  </div></MainLayout>;
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";
