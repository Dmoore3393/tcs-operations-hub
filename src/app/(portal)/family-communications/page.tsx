"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import type { FamilyMessage } from "@/lib/children";
import { newCommunicationId, communicationStamp } from "@/lib/communications";
import { hubRequest } from "@/lib/hub-request";
import { normalizeLocation } from "@/lib/location-config";
import { ArrowLeft, CheckCheck, LoaderCircle, Mail, RefreshCw, Search, Send } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Conversation = { id: string; firstName: string; lastName: string; primaryGuardian: string; location: string; guardianEmail: string; familyMessages: FamilyMessage[] };
const name = (child: Conversation) => `${child.firstName} ${child.lastName}`.trim();
const unread = (child: Conversation) => child.familyMessages.filter((message) => message.direction === "Family to TCS" && !message.readAt).length;
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 font-bold text-slate-800 disabled:opacity-50";
const input = "w-full min-h-12 rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-950 focus-visible:outline-2 focus-visible:outline-emerald-700";

export default function FamilyCommunicationsPage() {
  const { session, user, isSystemOwner, isLocationLicensee } = useAuth();
  const { location } = useHubLocation();
  const [children, setChildren] = useState<Conversation[]>([]);
  const [loadedUser, setLoadedUser] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestIds = useRef<Record<string, string>>({});
  const generation = useRef(0);
  const token = session?.access_token, userId = user?.id || "";
  const allowed = isSystemOwner || isLocationLicensee;
  const load = useCallback(async () => {
    if (!token || !allowed) return;
    const run = ++generation.current;
    setLoading(true);
    try {
      const payload = await hubRequest<{ children: Conversation[] }>("/api/family-communications", token);
      if (run !== generation.current) return;
      setChildren(payload.children); setLoadedUser(userId); setError("");
    } catch (reason) { if (run === generation.current) setError(reason instanceof Error ? reason.message : "Could not load family conversations."); }
    finally { if (run === generation.current) setLoading(false); }
  }, [token, allowed, userId]);
  useEffect(() => { const requests = generation; const initial = window.setTimeout(() => { void load(); }, 0); return () => { window.clearTimeout(initial); requests.current++; }; }, [load]);
  const accessible = useMemo(() => loadedUser === userId ? children : [], [loadedUser, userId, children]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return accessible.filter((child) => (location === "All Locations" || normalizeLocation(child.location) === location)
      && (filter !== "unread" || unread(child) > 0)
      && (filter !== "reply" || child.familyMessages.at(-1)?.direction === "Family to TCS")
      && (!query || [name(child), child.primaryGuardian, child.guardianEmail, ...child.familyMessages.flatMap((message) => [message.subject, message.body])].join(" ").toLowerCase().includes(query)))
      .sort((a, b) => unread(b) - unread(a) || (Date.parse(b.familyMessages.at(-1)?.createdAt || "") || 0) - (Date.parse(a.familyMessages.at(-1)?.createdAt || "") || 0) || name(a).localeCompare(name(b)));
  }, [accessible, location, filter, search]);
  const scope = accessible.filter((child) => location === "All Locations" || normalizeLocation(child.location) === location);
  const selected = accessible.find((child) => child.id === selectedId && (location === "All Locations" || normalizeLocation(child.location) === location));
  const draft = drafts[selectedId] || { subject: "", body: "" };
  function setDraft(key: "subject" | "body", value: string) {
    setDrafts((current) => ({ ...current, [selectedId]: { ...(current[selectedId] || { subject: "", body: "" }), [key]: value } }));
    delete requestIds.current[selectedId];
  }
  async function send(action: "send" | "read") {
    if (!selected || !token || saving) return;
    if (action === "send" && (!draft.subject.trim() || !draft.body.trim())) return;
    const childId = selected.id;
    const payload = action === "send" ? { id: requestIds.current[childId] ||= newCommunicationId(), ...draft } : { ids: selected.familyMessages.filter((message) => message.direction === "Family to TCS" && !message.readAt).map((message) => message.id) };
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await hubRequest<{ messages: FamilyMessage[] }>("/api/family-communications", token, { method: "POST", body: JSON.stringify({ action, childId, ...payload }) });
      setChildren((current) => current.map((child) => child.id === childId ? { ...child, familyMessages: result.messages } : child));
      if (action === "send") { setDrafts((current) => ({ ...current, [childId]: { subject: "", body: "" } })); delete requestIds.current[childId]; }
      setNotice(action === "send" ? "Message sent to the family’s secure Parent Portal." : "The family messages were marked read.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save. Your draft is still here; try again."); }
    finally { setSaving(false); }
  }
  if (!allowed) return <MainLayout><p className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-lg text-amber-950">Family messages are available to Owner/Admin and assigned Licensees.</p></MainLayout>;

  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-5 pb-10">
    <section className="rounded-[30px] bg-gradient-to-br from-emerald-900 to-[#163c29] p-6 text-white"><Link href="/communications" className="inline-flex min-h-11 items-center gap-2 font-bold text-emerald-100"><ArrowLeft className="h-5 w-5" aria-hidden="true" /> Communications</Link><h1 className="mt-3 text-3xl font-black">TCS Family Messages</h1><p className="mt-3 max-w-3xl text-lg leading-7 text-emerald-50">Find unread replies, pick up a conversation and keep each family’s details in their secure thread.</p></section>
    <div className="flex flex-wrap items-center gap-3"><p className="mr-auto text-lg font-bold text-emerald-950">{scope.reduce((sum, child) => sum + unread(child), 0)} unread family replies</p><button className={button} onClick={() => void load()} disabled={loading || saving}><RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />Refresh</button></div>
    <section aria-label="Family communication overview" className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-emerald-200 bg-white p-4"><p className="text-base font-semibold text-slate-700">Guardian emails entered</p><strong className="mt-2 block text-2xl text-emerald-950">{scope.filter((child) => child.guardianEmail).length}</strong></div><div className="rounded-2xl border border-emerald-200 bg-white p-4"><p className="text-base font-semibold text-slate-700">Messages stored</p><strong className="mt-2 block text-2xl text-emerald-950">{scope.reduce((sum, child) => sum + child.familyMessages.length, 0)}</strong></div></section>
    {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">{notice}</p>}
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-950"><p>{error}</p><button className={`${button} mt-3`} onClick={() => void load()}>Try again</button></div>}
    <div className="grid min-w-0 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <section aria-label="Family inbox" className={`${selected ? "hidden lg:block" : ""} min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm`}>
        <label className="relative block"><span className="sr-only">Search family conversations</span><Search className="pointer-events-none absolute left-3 top-4 h-5 w-5 text-slate-600" aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search families or messages" className={`${input} pl-11`} /></label>
        <div className="my-3 flex flex-wrap gap-2">{[["all", "All"], ["unread", "Unread"], ["reply", "Awaiting TCS reply"]].map(([key, label]) => <button key={key} aria-pressed={filter === key} className={`${button} !px-3 ${filter === key ? "!border-emerald-700 !bg-emerald-50 !text-emerald-950" : ""}`} onClick={() => setFilter(key)}>{label}</button>)}</div>
        {loading && !accessible.length ? <p role="status" className="flex items-center gap-2 p-4 text-slate-700"><LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />Loading conversations…</p> : <div className="max-h-[750px] space-y-2 overflow-y-auto">{visible.map((child) => <button key={child.id} onClick={() => { setSelectedId(child.id); setNotice(""); }} aria-current={selectedId === child.id ? "true" : undefined} className={`w-full rounded-2xl border p-4 text-left ${selectedId === child.id ? "border-emerald-700 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"}`}><div className="flex items-start justify-between gap-2"><h2 className="text-lg font-black text-slate-950">{name(child)}</h2>{unread(child) > 0 && <span className="shrink-0 rounded-full bg-emerald-800 px-2 py-1 text-sm font-bold text-white">{unread(child)} unread</span>}</div><p className="mt-1 break-words text-base text-slate-700">{child.primaryGuardian || "Family"} · {child.location}</p><p className="mt-3 line-clamp-2 break-words text-base text-slate-700">{child.familyMessages.at(-1)?.body || "Start a secure family conversation."}</p></button>)}{!visible.length && <p className="p-5 text-lg text-slate-700">{search || filter !== "all" ? "No conversations match this view." : "No active families are available at this location."}</p>}</div>}
      </section>
      <section aria-label="Family conversation" className={`${selected ? "" : "hidden lg:block"} min-w-0 rounded-3xl border border-slate-200 bg-white shadow-sm`}>
        {selected ? <><header className="border-b border-slate-200 p-5"><button className={`${button} mb-4 lg:hidden`} onClick={() => setSelectedId("")}><ArrowLeft className="h-5 w-5" aria-hidden="true" />Inbox</button><h2 className="text-2xl font-black text-slate-950">{name(selected)}</h2><p className="mt-2 text-base leading-6 text-slate-700">{selected.primaryGuardian || "Family"} · {selected.location}</p><p className="mt-2 break-words text-base text-slate-700">{selected.guardianEmail || "Guardian email missing"}</p>{!selected.guardianEmail && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-base leading-7 text-amber-950">Check <Link href="/family-access" className="font-bold underline">Family Access & Privacy</Link> before relying on Parent Portal delivery; a guardian email is missing.</p>}{unread(selected) > 0 && <button className={`${button} mt-3`} disabled={saving} onClick={() => void send("read")}><CheckCheck className="h-5 w-5" aria-hidden="true" />Mark family messages read</button>}</header>
          <div className="max-h-[580px] space-y-4 overflow-y-auto p-5">{selected.familyMessages.length ? selected.familyMessages.map((message) => <article key={message.id} className={`rounded-2xl border p-4 ${message.direction === "TCS to Family" ? "ml-5 border-emerald-200 bg-emerald-50" : "mr-5 border-slate-200 bg-slate-50"}`}><p className="text-sm font-bold text-emerald-900">{message.direction}</p><h3 className="mt-2 break-words text-lg font-black text-slate-950">{message.subject || "Message"}</h3><p className="mt-2 whitespace-pre-wrap break-words text-lg leading-8 text-slate-800">{message.body}</p><p className="mt-3 text-sm leading-6 text-slate-600">{message.createdBy} · {communicationStamp(message.createdAt)}{message.readAt ? ` · Read ${communicationStamp(message.readAt)}` : ""}</p></article>) : <p className="text-lg text-slate-700">No messages yet. Send a welcome or answer a family question below.</p>}</div>
          <form className="space-y-4 border-t border-slate-200 p-5" onSubmit={(event) => { event.preventDefault(); void send("send"); }}><h3 className="text-lg font-black text-slate-950">Message this family</h3><label className="block font-bold text-slate-900">Subject<input required maxLength={160} className={`${input} mt-2`} value={draft.subject} onChange={(event) => setDraft("subject", event.target.value)} disabled={saving} /></label><label className="block font-bold text-slate-900">Message<textarea required maxLength={5000} className={`${input} mt-2 min-h-32`} value={draft.body} onChange={(event) => setDraft("body", event.target.value)} disabled={saving} /></label><p className="text-base leading-6 text-slate-700">This stays in the authorized family’s Parent Portal. Use direct contact for emergencies.</p><button disabled={saving || !draft.subject.trim() || !draft.body.trim()} className={`${button} !border-emerald-800 !bg-emerald-800 !text-white`}><Send className="h-5 w-5" aria-hidden="true" />{saving ? "Sending…" : "Send family message"}</button></form>
        </> : <div className="grid min-h-96 place-items-center p-8 text-center"><div><Mail className="mx-auto h-12 w-12 text-emerald-800" aria-hidden="true" /><h2 className="mt-4 text-xl font-black text-slate-950">Choose a family conversation</h2><p className="mt-3 max-w-md text-lg leading-7 text-slate-700">Unread replies appear first. Use “Awaiting TCS reply” to find threads where the family sent the latest message.</p></div></div>}
      </section>
    </div>
  </div></MainLayout>;
}
