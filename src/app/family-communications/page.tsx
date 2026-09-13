"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import type { ChildRecord, FamilyMessage } from "@/lib/children";
import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  Mail,
  MessageSquareText,
  Search,
  Send,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

function childName(child: ChildRecord) {
  return `${child.firstName} ${child.lastName}`.trim();
}

function matchesLocation(value: string, selected: string) {
  if (selected === "All Locations") return true;
  return value.toLowerCase().includes(selected.toLowerCase()) || selected.toLowerCase().includes(value.toLowerCase());
}

function formatStamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function FamilyCommunicationsPage() {
  const { session, profile, isEmployee } = useAuth();
  const { location } = useHubLocation();
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ChildRecord | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const response = await fetch("/api/children", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json() as { children?: ChildRecord[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load family communication records.");
      setChildren(Array.isArray(payload.children) ? payload.children : []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load family communication records.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return children
      .filter((child) => child.enrollmentStatus !== "Archived" && matchesLocation(child.location, location))
      .filter((child) => !query || `${childName(child)} ${child.primaryGuardian} ${child.guardianEmail || ""}`.toLowerCase().includes(query))
      .sort((a, b) => {
        const aUnread = (a.familyMessages ?? []).filter((message) => message.direction === "Family to TCS" && !message.readAt).length;
        const bUnread = (b.familyMessages ?? []).filter((message) => message.direction === "Family to TCS" && !message.readAt).length;
        return bUnread - aUnread || childName(a).localeCompare(childName(b));
      });
  }, [children, location, search]);

  const unread = visible.reduce((sum, child) => sum + (child.familyMessages ?? []).filter((message) => message.direction === "Family to TCS" && !message.readAt).length, 0);
  const portalReady = visible.filter((child) => Boolean(child.guardianEmail)).length;
  const messageCount = visible.reduce((sum, child) => sum + (child.familyMessages?.length ?? 0), 0);

  async function saveChild(child: ChildRecord) {
    if (!session?.access_token) throw new Error("Your staff session is not ready.");
    const response = await fetch("/api/children", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "save", child }),
    });
    const payload = await response.json() as { child?: ChildRecord; error?: string };
    if (!response.ok || !payload.child) throw new Error(payload.error || "Could not save family communication.");
    return payload.child;
  }

  async function openThread(child: ChildRecord) {
    setSelected(child);
    setSubject("");
    setBody("");
    setError("");

    const unreadMessages = (child.familyMessages ?? []).filter((message) => message.direction === "Family to TCS" && !message.readAt);
    if (!unreadMessages.length) return;

    const now = new Date().toISOString();
    const updated: ChildRecord = {
      ...child,
      familyMessages: (child.familyMessages ?? []).map((message) =>
        message.direction === "Family to TCS" && !message.readAt ? { ...message, readAt: now } : message,
      ),
    };

    setSaving(true);
    try {
      const saved = await saveChild(updated);
      setChildren((current) => current.map((item) => item.id === saved.id ? saved : item));
      setSelected(saved);
    } catch {
      // Opening the thread should remain available if the read receipt cannot save.
    } finally {
      setSaving(false);
    }
  }

  async function sendMessage() {
    if (!selected || !subject.trim() || !body.trim()) return;
    setSaving(true);
    setError("");
    try {
      const message: FamilyMessage = {
        id: `family-message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        direction: "TCS to Family",
        subject: subject.trim(),
        body: body.trim(),
        createdAt: new Date().toISOString(),
        createdBy: profile?.full_name || profile?.email || "TCS Staff",
        readAt: "",
      };
      const saved = await saveChild({
        ...selected,
        familyMessages: [...(selected.familyMessages ?? []), message],
      });
      setChildren((current) => current.map((item) => item.id === saved.id ? saved : item));
      setSelected(saved);
      setSubject("");
      setBody("");
      setNotice("Message added to the family’s Parent Portal thread.");
      window.setTimeout(() => setNotice(""), 3000);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not send family message.");
    } finally {
      setSaving(false);
    }
  }

  if (isEmployee) {
    return <MainLayout><div className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center"><Mail className="mx-auto h-10 w-10 text-amber-700" /><h1 className="mt-3 text-2xl font-black text-amber-950">Family Communication is restricted</h1><p className="mt-2 text-sm font-semibold leading-6 text-amber-900">Family portal messaging is limited to Owner/Admin and assigned Licensee accounts.</p></div></MainLayout>;
  }

  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-6 pb-12">
    <section className="overflow-hidden rounded-[30px] bg-gradient-to-br from-[#442856] via-[#704174] to-[#245a39] p-6 text-white shadow-xl sm:p-8">
      <div><p className="text-xs font-black uppercase tracking-[.18em] text-purple-200">Family Communication Center</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">TCS Family Messages</h1><p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-purple-50/80">Keep family messages attached to the secured child record and show them only in the verified guardian’s Parent Portal. This is separate from lock-screen notifications so private family details stay inside The Hub.</p></div>
    </section>

    {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-900">{notice}</div>}
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">{error}</div>}

    <section className="grid gap-3 sm:grid-cols-3">
      <Metric label="Unread Family Replies" value={unread} tone={unread ? "purple" : "green"} />
      <Metric label="Portal-Ready Emails" value={portalReady} tone="green" />
      <Metric label="Messages Stored" value={messageCount} tone="blue" />
    </section>

    <label className="relative block"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search child, guardian, or email…" className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold shadow-sm" /></label>

    {loading ? <div className="flex min-h-72 items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white text-sm font-bold text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading family communication records…</div> :
      <section className="grid gap-4 xl:grid-cols-2">{visible.map((child) => {
        const messages = child.familyMessages ?? [];
        const childUnread = messages.filter((message) => message.direction === "Family to TCS" && !message.readAt).length;
        const last = messages.at(-1);
        return <article key={child.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{child.location}</p><h2 className="mt-1 text-xl font-black text-slate-950">{childName(child)}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{child.primaryGuardian || "Guardian not entered"} • {child.guardianEmail || "Guardian email missing"}</p></div>{childUnread > 0 && <span className="rounded-full bg-purple-100 px-2.5 py-1 text-[10px] font-black text-purple-800">{childUnread} unread</span>}</div>
          {last ? <div className="mt-4 rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{last.direction}</p><p className="mt-1 text-sm font-black text-slate-900">{last.subject || "Message"}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{last.body}</p></div> : <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-500">No family messages yet.</p>}
          {!child.guardianEmail && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900"><AlertTriangle className="mr-1 inline h-4 w-4" />Add the guardian email to the child record before relying on Parent Portal messaging.</div>}
          <button onClick={() => void openThread(child)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#704174] px-4 py-3 text-sm font-black text-white"><MessageSquareText className="h-4 w-4" /> Open Conversation</button>
        </article>;
      })}</section>}

    {selected && <div className="fixed inset-0 z-[10000] overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm">
      <section className="mx-auto my-6 w-full max-w-3xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 bg-gradient-to-r from-[#442856] to-[#245a39] px-5 py-4 text-white"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-purple-100">Family thread</p><h2 className="mt-1 text-2xl font-black">{childName(selected)}</h2><p className="mt-1 text-xs text-white/75">{selected.primaryGuardian} • {selected.guardianEmail || "No guardian email"}</p></div><button onClick={() => setSelected(null)} className="rounded-xl bg-white/10 p-2"><X className="h-5 w-5" /></button></header>
        <div className="max-h-[46vh] space-y-3 overflow-y-auto bg-slate-50 p-4 sm:p-5">
          {(selected.familyMessages ?? []).length === 0 ? <div className="rounded-2xl bg-white p-6 text-center text-sm font-semibold text-slate-500">Start the conversation below.</div> : (selected.familyMessages ?? []).map((message) => <div key={message.id} className={`flex ${message.direction === "TCS to Family" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl p-4 ${message.direction === "TCS to Family" ? "bg-[#245a39] text-white" : "border border-slate-200 bg-white text-slate-900"}`}><div className="flex flex-wrap items-center gap-2"><span className="text-[9px] font-black uppercase tracking-wider opacity-70">{message.direction}</span><span className="text-[9px] font-bold opacity-60">{formatStamp(message.createdAt)}</span></div><p className="mt-1 text-sm font-black">{message.subject || "Message"}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 opacity-90">{message.body}</p><p className="mt-2 text-[9px] font-semibold opacity-60">{message.createdBy}</p></div></div>)}
        </div>
        <div className="space-y-3 border-t border-slate-200 p-4 sm:p-5">
          <label><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Subject</span><input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold" /></label>
          <label><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Message</span><textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} className="min-h-28 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold leading-6" /></label>
          <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-semibold text-slate-500">{selected.guardianEmail ? "This message will appear in the verified guardian’s Parent Portal." : "Guardian email is missing; add it before expecting Parent Portal delivery."}</p><button disabled={saving || !subject.trim() || !body.trim()} onClick={() => void sendMessage()} className="inline-flex min-w-28 items-center justify-center gap-2 rounded-xl bg-[#704174] px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send</button></div>
        </div>
      </section>
    </div>}
  </div></MainLayout>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "green" | "purple" | "blue" }) {
  const styles = { green: "bg-emerald-100 text-emerald-800", purple: "bg-purple-100 text-purple-800", blue: "bg-blue-100 text-blue-800" };
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`inline-flex rounded-xl px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${styles[tone]}`}>{label}</span><strong className="mt-2 block text-3xl font-black text-slate-950">{value}</strong></div>;
}
