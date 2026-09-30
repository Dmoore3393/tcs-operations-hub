"use client";

import { CelebrationBits, FunDoodles, GatorGuide } from "@/components/brand/HubJoy";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  BellRing,
  CalendarDays,
  CheckCircle2,
  Heart,
  LoaderCircle,
  MessageCircleHeart,
  Pin,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Location = { id: string; name: string };
type Post = {
  id: string;
  locationId: string;
  category: string;
  title: string;
  message: string;
  emoji: string;
  startDate: string;
  endDate: string;
  isPinned: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
type Payload = { canManageAllLocations: boolean; locations: Location[]; posts: Post[] };

const categories = ["Reminder","Policy","Thank You","Closure","Schedule Notice","Fun Message"] as const;
const categoryEmoji: Record<string, string> = {
  Reminder: "🔔",
  Policy: "📘",
  "Thank You": "💚",
  Closure: "🔒",
  "Schedule Notice": "📅",
  "Fun Message": "✨",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function FamilyMattersPage() {
  const { session } = useAuth();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [locationId, setLocationId] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("Thank You");
  const [title, setTitle] = useState("A Little Thank You From TCS");
  const [message, setMessage] = useState("Thank you for staying connected with us. Your communication and support help us plan great care for your child each week.");
  const [emoji, setEmoji] = useState("💚");
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState("");
  const [isPinned, setIsPinned] = useState(false);

  const request = useCallback(async (method: "GET" | "POST" | "PATCH" | "DELETE", body?: Record<string, unknown>) => {
    if (!session?.access_token) throw new Error("Your staff session is not ready.");
    const response = await fetch("/api/family-matters", {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Family Matters request failed.");
    return payload;
  }, [session?.access_token]);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const payload = await request("GET") as unknown as Payload;
      setData(payload);
      if (!payload.canManageAllLocations && !locationId) setLocationId(payload.locations[0]?.id || "");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load Family Matters.");
    } finally {
      setLoading(false);
    }
  }, [locationId, request, session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  const activePosts = useMemo(() => data?.posts.filter((post) => post.isActive) ?? [], [data]);

  async function createPost() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = await request("POST", {
        locationId,
        category,
        title,
        message,
        emoji,
        startDate,
        endDate,
        isPinned,
      });
      setNotice(typeof payload.message === "string" ? payload.message : "Family Matters post scheduled.");
      setTitle("");
      setMessage("");
      setEmoji(categoryEmoji[category]);
      setEndDate("");
      setIsPinned(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create Family Matters post.");
    } finally {
      setSaving(false);
    }
  }

  async function updatePost(id: string, patch: Record<string, unknown>) {
    try {
      await request("PATCH", { id, ...patch });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update Family Matters post.");
    }
  }

  async function removePost(id: string) {
    if (!window.confirm("Remove this Family Matters post?")) return;
    try {
      await request("DELETE", { id });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove Family Matters post.");
    }
  }

  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-6">
    <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#173d29] via-[#397855] to-[#223558] p-6 text-white shadow-xl"><FunDoodles className="opacity-35" />
      <div className="relative z-10 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-200">Family connection</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Family Matters</h1><p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/85">Share policy reminders, schedule notes, closures, little thank-yous, and fun weekly messages so families feel connected to TCS—not just notified by us.</p></div>
        <GatorGuide size="lg" message={<>Small reminders can still feel warm. 💚</>} />
      </div>
    </section>

    {notice && <div className="tcs-soft-pop relative overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-black text-emerald-900"><CelebrationBits /><CheckCircle2 className="mr-2 inline h-4 w-4" />{notice}</div>}
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900">{error}</div>}

    <div className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3"><MessageCircleHeart className="h-6 w-6 text-emerald-700" /><div><h2 className="text-xl font-black">Create a Family Matters post</h2><p className="text-xs font-semibold text-slate-500">Schedule messages ahead so they appear automatically.</p></div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Category"><select value={category} onChange={(event) => { const value = event.target.value as (typeof categories)[number]; setCategory(value); setEmoji(categoryEmoji[value]); }} className={inputClass}>{categories.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Emoji / icon"><input value={emoji} onChange={(event) => setEmoji(event.target.value.slice(0, 20))} className={inputClass} /></Field>
          <Field label="Audience"><select value={locationId} onChange={(event) => setLocationId(event.target.value)} className={inputClass}>{data?.canManageAllLocations && <option value="">All TCS families</option>}{data?.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
          <Field label="Start date"><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={inputClass} /></Field>
          <Field label="End date (optional)"><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className={inputClass} /></Field>
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" checked={isPinned} onChange={(event) => setIsPinned(event.target.checked)} className="h-4 w-4 accent-emerald-700" /><span><strong className="block text-xs">Pin this message</strong><span className="text-[10px] text-slate-500">Keep it above regular posts.</span></span></label>
        </div>
        <Field label="Title"><input value={title} onChange={(event) => setTitle(event.target.value.slice(0,160))} className={inputClass} placeholder="This Week's Reminder" /></Field>
        <Field label="Message"><textarea value={message} onChange={(event) => setMessage(event.target.value.slice(0,4000))} className={`${inputClass} min-h-36 resize-y`} placeholder="Write a warm, clear message for families…" /></Field>
        <button disabled={saving || !title.trim() || !message.trim() || !startDate} onClick={() => void createPost()} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white disabled:opacity-40">{saving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}{saving ? "Scheduling…" : "Publish / Schedule Message"}</button>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">Family message board</h2><p className="text-xs font-semibold text-slate-500">{activePosts.length} active or upcoming message{activePosts.length === 1 ? "" : "s"}.</p></div>{loading && <LoaderCircle className="h-5 w-5 animate-spin text-emerald-700" />}</div>
        <div className="mt-5 space-y-3">{data?.posts.length ? data.posts.map((post) => {
          const location = data.locations.find((item) => item.id === post.locationId);
          return <article key={post.id} className={`tcs-joy-card rounded-2xl border p-4 ${post.isActive ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 opacity-65"}`}>
            <div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-xl">{post.emoji || categoryEmoji[post.category] || "💚"}</span><div><div className="flex flex-wrap items-center gap-2"><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">{post.category}</p>{post.isPinned && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[9px] font-black text-amber-900"><Pin className="h-3 w-3" />Pinned</span>}</div><h3 className="mt-1 font-black text-slate-950">{post.title}</h3><p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{post.message}</p></div></div><button onClick={() => void removePost(post.id)} className="rounded-lg p-2 text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[9px] font-black text-slate-500"><span className="rounded-full bg-slate-100 px-2 py-1">{location?.name || "All TCS Families"}</span><span className="rounded-full bg-slate-100 px-2 py-1"><CalendarDays className="mr-1 inline h-3 w-3" />{post.startDate}{post.endDate ? ` → ${post.endDate}` : ""}</span><button onClick={() => void updatePost(post.id, { isPinned: !post.isPinned })} className="rounded-full bg-slate-100 px-2 py-1">{post.isPinned ? "Unpin" : "Pin"}</button><button onClick={() => void updatePost(post.id, { isActive: !post.isActive })} className="rounded-full bg-slate-100 px-2 py-1">{post.isActive ? "Pause" : "Activate"}</button></div>
          </article>;
        }) : <div className="rounded-2xl bg-slate-50 p-8 text-center"><Heart className="mx-auto h-8 w-8 text-emerald-700" /><h3 className="mt-2 font-black">No Family Matters posts yet</h3><p className="mt-1 text-xs font-semibold text-slate-500">Your first thank-you or reminder will show here.</p></div>}</div>
      </section>
    </div>

    <section className="rounded-3xl border border-blue-200 bg-blue-50 p-5">
      <div className="flex gap-3"><BellRing className="mt-0.5 h-5 w-5 flex-none text-blue-700" /><div><h2 className="font-black text-blue-950">Starter ideas</h2><p className="mt-1 text-xs font-semibold leading-5 text-blue-900/80">Thursday/Friday schedule reminder • health policy reminder • upcoming closure • “thanks for a great week” • seasonal welcome • transportation reminder • appreciation note after a busy week.</p></div></div>
    </section>
  </div></MainLayout>;
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mt-4 block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span>{children}</label>;
}
