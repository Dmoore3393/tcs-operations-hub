"use client";

import { CelebrationBits, FunDoodles, GatorGuide } from "@/components/brand/HubJoy";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { addIsoDays, displayDate, mondayOfWeek } from "@/lib/family-care-calendar";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  MessageCircleHeart,
  Save,
  Search,
  Sparkles,
  Star,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Location = { id: string; name: string };
type Child = {
  rowId: string;
  id: string;
  locationId: string;
  firstName: string;
  lastName: string;
  ageGroup: string;
  photoConsentStatus: string;
};
type Checkin = {
  id: string;
  locationId: string;
  childRowId: string;
  childId: string;
  weekOf: string;
  title: string;
  message: string;
  highlights: string[];
  status: string;
  createdByName: string;
  updatedAt: string;
};
type Payload = {
  weekOf: string;
  weekEnd: string;
  locations: Location[];
  children: Child[];
  checkins: Checkin[];
};

const highlightOptions = ["Learning", "Friendship", "Independence", "Creativity", "Communication", "Kindness", "Movement", "Routine", "Proud Moment"];

function childName(child: Child) {
  return `${child.firstName} ${child.lastName}`.trim();
}

export default function WeeklyCheckinsPage() {
  const { session } = useAuth();
  const [weekOf, setWeekOf] = useState(() => mondayOfWeek(new Date().toISOString().slice(0, 10)));
  const [data, setData] = useState<Payload | null>(null);
  const [locationId, setLocationId] = useState("");
  const [selectedChildId, setSelectedChildId] = useState("");
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("This Week at TCS");
  const [message, setMessage] = useState("");
  const [highlights, setHighlights] = useState<string[]>([]);
  const [status, setStatus] = useState<"Draft" | "Published">("Published");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/weekly-checkins?weekOf=${weekOf}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json() as Payload & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load weekly check-ins.");
      setData(payload);
      setLocationId((current) => current || payload.locations[0]?.id || "");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load weekly check-ins.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, weekOf]);

  useEffect(() => { void load(); }, [load]);

  const children = useMemo(() => (data?.children ?? [])
    .filter((child) => !locationId || child.locationId === locationId)
    .filter((child) => !search || childName(child).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => childName(a).localeCompare(childName(b))), [data, locationId, search]);

  const selectedChild = data?.children.find((child) => child.id === selectedChildId) ?? null;
  const existing = data?.checkins.find((entry) => entry.childId === selectedChildId) ?? null;
  const publishedCount = data?.checkins.filter((entry) => entry.status === "Published").length ?? 0;
  const draftCount = data?.checkins.filter((entry) => entry.status === "Draft").length ?? 0;

  useEffect(() => {
    if (!selectedChildId) return;
    const checkin = data?.checkins.find((entry) => entry.childId === selectedChildId);
    setTitle(checkin?.title || "This Week at TCS");
    setMessage(checkin?.message || "");
    setHighlights(checkin?.highlights || []);
    setStatus(checkin?.status === "Draft" ? "Draft" : "Published");
    setNotice("");
    setError("");
  }, [data, selectedChildId]);

  function toggleHighlight(value: string) {
    setHighlights((current) => current.includes(value)
      ? current.filter((item) => item !== value)
      : current.length >= 4 ? current : [...current, value]);
  }

  function chooseChild(child: Child) {
    setSelectedChildId(child.id);
  }

  async function save() {
    if (!session?.access_token || !selectedChild) return;
    if (!message.trim()) {
      setError("Write a short weekly progress message before saving.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/weekly-checkins", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          childId: selectedChild.id,
          weekOf,
          title,
          message,
          highlights,
          status,
        }),
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save the weekly check-in.");
      setNotice(payload.message || "Weekly check-in saved.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the weekly check-in.");
    } finally {
      setSaving(false);
    }
  }

  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-6">
    <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#223558] via-[#2f6f49] to-[#173d29] p-6 text-white shadow-xl"><FunDoodles className="opacity-35" />
      <div className="relative z-10 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-sky-200">End-of-week family connection</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Weekly Child Check-Ins</h1><p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/85">Give each family a short, cute progress note about the week—something their child enjoyed, learned, practiced, or felt proud of.</p></div>
        <GatorGuide size="lg" message={<>Parents love the little details. Tell them what made their child shine this week. ⭐</>} />
      </div>
    </section>

    {notice && <div className="tcs-soft-pop relative overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-black text-emerald-900"><CelebrationBits /><CheckCircle2 className="mr-2 inline h-4 w-4" />{notice}</div>}
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900">{error}</div>}

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Week" value={displayDate(weekOf, { month: "short", day: "numeric" })} helper={`through ${displayDate(addIsoDays(weekOf, 6), { month: "short", day: "numeric" })}`} />
      <Stat label="Published" value={publishedCount} helper="Visible to families" />
      <Stat label="Drafts" value={draftCount} helper="Staff-only until published" />
      <Stat label="Children" value={data?.children.length ?? 0} helper="Accessible this week" />
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekOf(addIsoDays(weekOf, -7))} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200"><ChevronLeft className="h-4 w-4" /></button>
          <div className="min-w-52 text-center"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Check-in week</p><p className="font-black text-slate-950">{displayDate(weekOf, { month: "long", day: "numeric", year: "numeric" })} – {displayDate(addIsoDays(weekOf, 6), { month: "short", day: "numeric" })}</p></div>
          <button onClick={() => setWeekOf(addIsoDays(weekOf, 7))} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <select value={locationId} onChange={(event) => { setLocationId(event.target.value); setSelectedChildId(""); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold">{data?.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
      </div>
    </section>

    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4"><label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search children…" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm font-semibold outline-none focus:border-emerald-400" /></label></div>
        <div className="max-h-[700px] overflow-y-auto p-2">{loading ? <div className="grid min-h-48 place-items-center"><LoaderCircle className="h-6 w-6 animate-spin text-emerald-700" /></div> : children.map((child) => {
          const checkin = data?.checkins.find((entry) => entry.childId === child.id);
          return <button key={child.id} onClick={() => chooseChild(child)} className={`mb-1 w-full rounded-2xl border p-4 text-left transition ${selectedChildId === child.id ? "border-emerald-300 bg-emerald-50" : "border-transparent hover:bg-slate-50"}`}><div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-slate-950">{childName(child)}</strong><p className="mt-1 text-xs font-semibold text-slate-500">{child.ageGroup}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-black ${checkin?.status === "Published" ? "bg-emerald-100 text-emerald-800" : checkin ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-500"}`}>{checkin?.status || "Not started"}</span></div></button>;
        })}</div>
      </section>

      {!selectedChild ? <section className="grid min-h-[460px] place-items-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center"><div><MessageCircleHeart className="mx-auto h-10 w-10 text-emerald-700" /><h2 className="mt-3 text-xl font-black">Choose a child</h2><p className="mt-2 max-w-md text-sm font-semibold text-slate-500">Then write their end-of-week family note.</p></div></section> : <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">{existing ? "Update weekly check-in" : "New weekly check-in"}</p><h2 className="mt-1 text-2xl font-black">{childName(selectedChild)}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{displayDate(weekOf, { month: "long", day: "numeric" })} week</p></div><div className="flex gap-2"><button onClick={() => setStatus("Draft")} className={`rounded-xl px-3 py-2 text-xs font-black ${status === "Draft" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-500"}`}>Draft</button><button onClick={() => setStatus("Published")} className={`rounded-xl px-3 py-2 text-xs font-black ${status === "Published" ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-500"}`}>Publish to Family</button></div></div>

        <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-4"><div className="flex gap-3"><Sparkles className="mt-0.5 h-5 w-5 flex-none text-violet-700" /><div><h3 className="font-black text-violet-950">Keep it warm and specific</h3><p className="mt-1 text-xs font-semibold leading-5 text-violet-900/80">Example: “Ariella had such a great week! She was especially proud of finishing her reading activity and did a wonderful job taking turns with friends.”</p></div></div></div>

        <label className="mt-5 block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Card title</span><input value={title} onChange={(event) => setTitle(event.target.value.slice(0,160))} className={inputClass} /></label>
        <label className="mt-4 block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Family message</span><textarea value={message} onChange={(event) => setMessage(event.target.value.slice(0,4000))} placeholder={`What stood out about ${selectedChild.firstName}'s week?`} className={`${inputClass} min-h-40 resize-y`} /></label>

        <div className="mt-5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Highlights • choose up to 4</p><div className="mt-2 flex flex-wrap gap-2">{highlightOptions.map((item) => <button key={item} onClick={() => toggleHighlight(item)} className={`inline-flex items-center gap-1 rounded-full border px-3 py-2 text-xs font-black ${highlights.includes(item) ? "border-amber-300 bg-amber-100 text-amber-900" : "border-slate-200 bg-white text-slate-600"}`}><Star className="h-3.5 w-3.5" />{item}</button>)}</div></div>

        <div className="mt-6 rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-5"><p className="text-[9px] font-black uppercase tracking-wider text-emerald-700">Parent preview</p><h3 className="mt-1 text-xl font-black text-slate-950">{title || "This Week at TCS"}</h3><div className="mt-3 flex flex-wrap gap-1.5">{highlights.map((item) => <span key={item} className="rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-black text-amber-900">⭐ {item}</span>)}</div><p className="mt-4 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">{message || "Your weekly check-in message will appear here."}</p></div>

        <button disabled={saving || !message.trim()} onClick={() => void save()} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white disabled:opacity-40">{saving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : status === "Published" ? <Sparkles className="h-5 w-5" /> : <Save className="h-5 w-5" />}{saving ? "Saving…" : status === "Published" ? "Save & Publish to Family" : "Save Draft"}</button>
      </section>}
    </div>
  </div></MainLayout>;
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";
function Stat({ label, value, helper }: { label: string; value: string | number; helper: string }) {
  return <section className="tcs-joy-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p><strong className="mt-1 block text-2xl text-slate-950">{value}</strong><p className="mt-1 text-[10px] font-semibold text-slate-500">{helper}</p></section>;
}
