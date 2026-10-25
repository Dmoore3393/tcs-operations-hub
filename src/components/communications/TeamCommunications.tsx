"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { newCommunicationId, communicationStamp, latestThreadTime, threadIsUnread, threadNeedsAcknowledgment, visibleTeamThreads, type TeamCommunicationsPayload } from "@/lib/communications";
import { normalizeLocation } from "@/lib/location-config";
import { hubRequest } from "@/lib/hub-request";
import { ArrowLeft, CheckCheck, ChevronRight, LoaderCircle, Lock, MessageSquareText, Pin, Plus, RefreshCw, Search, Send, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50";
const input = "w-full min-h-12 rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";
const empty: TeamCommunicationsPayload = { threads: [], locations: [], canManage: false, canPostAll: false, hasMore: false, nextBefore: null };

export default function TeamCommunications() {
  const { session, user } = useAuth();
  const { location } = useHubLocation();
  const [data, setData] = useState(empty);
  const [loadedUser, setLoadedUser] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [compose, setCompose] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("");
  const [pinned, setPinned] = useState(false);
  const [requiresAck, setRequiresAck] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const requestId = useRef<Record<string, string>>({});
  const generation = useRef(0);
  const dataOwner = useRef("");
  const composeSection = useRef<HTMLElement>(null);
  useEffect(() => { if (compose) { composeSection.current?.scrollIntoView({ block: "start" }); composeSection.current?.querySelector("input")?.focus(); } }, [compose]);
  const token = session?.access_token;
  const userId = user?.id || "";

  const load = useCallback(async (before = "", quiet = false) => {
    if (!token || !userId) return;
    const run = ++generation.current;
    if (!quiet) setLoading(true);
    try {
      const result = await hubRequest<TeamCommunicationsPayload>(`/api/team-communications${before ? `?before=${encodeURIComponent(before)}` : ""}`, token);
      if (run !== generation.current) return;
      const sameUser = dataOwner.current === userId;
      dataOwner.current = userId;
      setData((current) => (before || quiet) && sameUser ? { ...result, hasMore: before ? result.hasMore : current.hasMore, nextBefore: before ? result.nextBefore : current.nextBefore, threads: [...result.threads, ...current.threads.filter((thread) => !result.threads.some((fresh) => fresh.id === thread.id))] } : result);
      setLoadedUser(userId);
      setError("");
    } catch (reason) {
      if (run === generation.current) setError(reason instanceof Error ? reason.message : "Could not refresh team conversations.");
    } finally { if (run === generation.current) setLoading(false); }
  }, [token, userId]);

  useEffect(() => {
    const requests = generation;
    const initial = window.setTimeout(() => { void load(); }, 0);
    const focus = () => { if (document.visibilityState === "visible") void load("", true); };
    window.addEventListener("focus", focus);
    const refresh = window.setInterval(focus, 30000);
    return () => { window.clearTimeout(initial); window.clearInterval(refresh); requests.current++; window.removeEventListener("focus", focus); };
  }, [load]);

  const current = loadedUser === userId ? data : empty;
  const locationId = location === "All Locations" ? "" : current.locations.find((item) => normalizeLocation(item.slug) === location)?.id || "";
  const threads = useMemo(() => visibleTeamThreads(current.threads, query, filter, userId, locationId), [current.threads, query, filter, userId, locationId]);
  const selected = current.threads.find((thread) => thread.id === selectedId && (!locationId || !thread.location_id || thread.location_id === locationId));
  const unread = current.threads.filter((thread) => threadIsUnread(thread, userId)).length;
  const needsAck = current.threads.filter((thread) => threadNeedsAcknowledgment(thread, userId)).length;

  async function mutate(action: string, payload: Record<string, unknown>, method = "PATCH") {
    if (!token || busy) return false;
    setBusy(action); setError(""); setNotice("");
    try {
      await hubRequest("/api/team-communications", token, { method, body: JSON.stringify({ action, ...payload }) });
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save. Your message is still here; please try again."); return false; }
    finally { setBusy(""); }
  }
  async function openThread(id: string) {
    setSelectedId(id); setNotice("");
    const thread = current.threads.find((item) => item.id === id);
    if (!thread || !threadIsUnread(thread, userId)) return;
    if (await mutate("read", { threadId: id, seenAt: new Date(latestThreadTime(thread)).toISOString() })) await load("", true);
  }
  async function publish() {
    const id = requestId.current.post ||= newCommunicationId();
    if (await mutate("post", { id, title, body, locationId: audience || null, pinned, requiresAck }, "POST")) {
      delete requestId.current.post; setTitle(""); setBody(""); setCompose(false); setPinned(false); setRequiresAck(false);
      setNotice("Your team message was posted."); await load("", true); setSelectedId(id);
    }
  }
  async function reply() {
    if (!selected || !drafts[selected.id]?.trim()) return;
    const threadId = selected.id;
    const id = requestId.current[threadId] ||= newCommunicationId();
    if (await mutate("reply", { id, threadId, body: drafts[threadId] }, "POST")) {
      delete requestId.current[threadId]; setDrafts((current) => ({ ...current, [threadId]: "" }));
      setNotice("Your reply was sent."); await load("", true);
    }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <div className="mr-auto flex flex-wrap gap-2 text-base font-bold text-emerald-950"><span className="rounded-full bg-emerald-100 px-3 py-2">{unread} unread</span><span className="rounded-full bg-amber-100 px-3 py-2">{needsAck} need your acknowledgment</span></div>
      <button className={button} onClick={() => void load()} disabled={loading || Boolean(busy)} aria-label="Refresh team conversations"><RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh</button>
      <button className={`${button} !border-emerald-800 !bg-emerald-800 !text-white`} onClick={() => { setCompose(true); setAudience(locationId || (current.canPostAll ? "" : current.locations[0]?.id || "")); }} disabled={loadedUser !== userId}><Plus className="h-5 w-5" aria-hidden="true" /> New message</button>
    </div>
    {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-semibold text-emerald-950">{notice}</p>}
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-950"><p>{error}</p><button className={`${button} mt-3`} onClick={() => void load()}>Try again</button></div>}
    <div className="grid min-w-0 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <section className={`${selected ? "hidden lg:block" : ""} min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm`} aria-label="Team inbox">
        <label className="relative block"><span className="sr-only">Search team conversations</span><Search className="pointer-events-none absolute left-3 top-4 h-5 w-5 text-slate-600" aria-hidden="true" /><input className={`${input} pl-11`} placeholder="Search messages and replies" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="my-3 flex flex-wrap gap-2" aria-label="Filter conversations">{[["all", "All"], ["unread", "Unread"], ["acknowledge", "Needs me"], ["pinned", "Pinned"]].map(([key, label]) => <button key={key} aria-pressed={filter === key} className={`${button} !px-3 ${filter === key ? "!border-emerald-800 !bg-emerald-50 !text-emerald-950" : ""}`} onClick={() => setFilter(key)}>{label}</button>)}</div>
        {loading && !current.threads.length ? <p role="status" className="flex items-center gap-2 p-4 text-slate-700"><LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />Loading conversations…</p> : threads.length ? <div className="max-h-[720px] space-y-2 overflow-y-auto">{threads.map((thread) => <button key={thread.id} onClick={() => void openThread(thread.id)} aria-current={selectedId === thread.id ? "true" : undefined} className={`w-full rounded-2xl border p-4 text-left ${selectedId === thread.id ? "border-emerald-700 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"}`}>
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">{thread.pinned && <Pin className="h-4 w-4" aria-label="Pinned" />}{threadIsUnread(thread, userId) && <span className="rounded-full bg-emerald-800 px-2 py-1 text-white">Unread</span>}{threadNeedsAcknowledgment(thread, userId) && <span className="text-amber-900">Please acknowledge</span>}</div>
          <h3 className="mt-2 break-words text-lg font-black text-slate-950">{thread.title}</h3><p className="mt-1 line-clamp-2 break-words text-base leading-6 text-slate-700">{thread.replies.at(-1)?.body || thread.body}</p><p className="mt-2 text-sm font-semibold text-slate-600">{thread.location_id ? current.locations.find((item) => item.id === thread.location_id)?.name || "Your location" : "All TCS locations"} · {thread.replies.length} replies</p>
        </button>)}</div> : <div className="p-5 text-slate-700"><MessageSquareText className="mb-3 h-8 w-8 text-emerald-700" aria-hidden="true" /><p className="font-bold">{query || filter !== "all" ? "No conversations match this view." : "Your team conversations start here."}</p><p className="mt-2 leading-6">Post a question or shift update for your location. Leadership can pin announcements and request acknowledgment.</p></div>}
        {current.hasMore && <button className={`${button} mt-4 w-full`} disabled={loading} onClick={() => void load(current.nextBefore || "")}>Load older conversations <ChevronRight className="h-5 w-5" aria-hidden="true" /></button>}
      </section>
      <section className={`${selected ? "" : "hidden lg:block"} min-w-0 rounded-3xl border border-slate-200 bg-white shadow-sm`} aria-label="Selected conversation">
        {selected ? <>
          <header className="border-b border-slate-200 p-5"><button className={`${button} mb-4 lg:hidden`} onClick={() => setSelectedId("")}><ArrowLeft className="h-5 w-5" aria-hidden="true" /> Inbox</button><p className="flex items-center gap-2 text-sm font-bold text-emerald-800"><Lock className="h-4 w-4" aria-hidden="true" /> Staff conversation</p><h2 className="mt-2 break-words text-2xl font-black text-slate-950">{selected.title}</h2><p className="mt-2 text-base text-slate-700">{selected.author_name} · {communicationStamp(selected.created_at)}</p>
            <p className="mt-4 whitespace-pre-wrap break-words text-lg leading-8 text-slate-900">{selected.body}</p>
            <div className="mt-4 flex flex-wrap gap-2">{selected.requires_ack && <button className={`${button} !border-emerald-700 !text-emerald-900`} disabled={Boolean(busy) || !threadNeedsAcknowledgment(selected, userId)} onClick={async () => { if (await mutate("acknowledge", { threadId: selected.id, seenAt: new Date(latestThreadTime(selected)).toISOString() })) { setNotice("Your acknowledgment was recorded."); await load("", true); } }}><CheckCheck className="h-5 w-5" aria-hidden="true" />{threadNeedsAcknowledgment(selected, userId) ? "I have read and understood" : "Acknowledged"}</button>}
              {current.canManage && <button className={button} disabled={Boolean(busy)} onClick={async () => { if (await mutate("pin", { threadId: selected.id, pinned: !selected.pinned })) await load("", true); }}><Pin className="h-5 w-5" aria-hidden="true" />{selected.pinned ? "Unpin" : "Pin message"}</button>}</div>
            {current.canManage && (current.canPostAll || selected.location_id) && selected.requires_ack && <details className="mt-4 rounded-xl bg-emerald-50 p-3 text-emerald-950"><summary className="min-h-11 cursor-pointer font-bold">Acknowledged by {selected.receipts.filter((receipt) => receipt.acknowledged_at).length} staff</summary><ul className="space-y-2">{selected.receipts.filter((receipt) => receipt.acknowledged_at).map((receipt) => <li key={receipt.user_id}>{receipt.staff_name} · {communicationStamp(receipt.acknowledged_at!)}</li>)}</ul></details>}
          </header>
          <div className="max-h-[540px] space-y-4 overflow-y-auto p-5" aria-label="Conversation replies">{selected.replies.length ? selected.replies.map((reply) => <article key={reply.id} className={`rounded-2xl p-4 ${reply.author_id === userId ? "ml-5 bg-emerald-50" : "mr-5 bg-slate-50"}`}><p className="font-bold text-slate-950">{reply.author_name}</p><p className="mt-2 whitespace-pre-wrap break-words text-lg leading-7 text-slate-800">{reply.body}</p><p className="mt-2 text-sm text-slate-600">{communicationStamp(reply.created_at)}</p></article>) : <p className="text-slate-600">No replies yet. Keep this conversation together by replying below.</p>}</div>
          <form className="border-t border-slate-200 p-5" onSubmit={(event) => { event.preventDefault(); void reply(); }}><label className="block font-bold text-slate-900" htmlFor="team-reply">Reply to this conversation</label><textarea id="team-reply" disabled={Boolean(busy)} maxLength={5000} className={`${input} mt-2 min-h-28`} value={drafts[selected.id] || ""} onChange={(event) => { setDrafts((current) => ({ ...current, [selected.id]: event.target.value })); delete requestId.current[selected.id]; }} /><p className="mt-2 text-sm text-slate-600">Your draft stays here if sending fails. Urgent safety matters require direct contact.</p><button className={`${button} mt-3 !border-emerald-800 !bg-emerald-800 !text-white`} disabled={Boolean(busy) || !drafts[selected.id]?.trim()}><Send className="h-5 w-5" aria-hidden="true" />{busy === "reply" ? "Sending…" : "Send reply"}</button></form>
        </> : <div className="grid min-h-96 place-items-center p-8 text-center"><div><MessageSquareText className="mx-auto h-12 w-12 text-emerald-700" aria-hidden="true" /><h2 className="mt-4 text-xl font-black text-slate-950">A clear place for team conversations</h2><p className="mt-2 max-w-md text-lg leading-7 text-slate-700">Open a message to see its replies and acknowledgments together.</p></div></div>}
      </section>
    </div>
    {compose && <section ref={composeSection} className="rounded-3xl border-2 border-emerald-700 bg-white p-5 shadow-sm" aria-labelledby="compose-title"><div className="flex items-center justify-between gap-3"><h2 id="compose-title" className="text-2xl font-black text-slate-950">New team message</h2><button className={button} onClick={() => setCompose(false)} disabled={Boolean(busy)} aria-label="Close new message"><X className="h-5 w-5" aria-hidden="true" /></button></div><form className="mt-4 grid gap-4" onSubmit={(event) => { event.preventDefault(); void publish(); }}>
      <label className="font-bold text-slate-900">Audience<select className={`${input} mt-2`} value={audience} disabled={Boolean(busy)} onChange={(event) => setAudience(event.target.value)} required={!current.canPostAll}>{current.canPostAll && <option value="">All TCS locations</option>}{current.locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="font-bold text-slate-900">Title<input required disabled={Boolean(busy)} maxLength={160} className={`${input} mt-2`} value={title} onChange={(event) => { setTitle(event.target.value); delete requestId.current.post; }} /></label>
      <label className="font-bold text-slate-900">Message<textarea required disabled={Boolean(busy)} maxLength={5000} className={`${input} mt-2 min-h-36`} value={body} onChange={(event) => { setBody(event.target.value); delete requestId.current.post; }} /></label>
      {current.canManage && <div className="flex flex-wrap gap-4"><label className="flex min-h-11 items-center gap-3 font-semibold"><input type="checkbox" className="h-5 w-5" disabled={Boolean(busy)} checked={pinned} onChange={(event) => setPinned(event.target.checked)} />Pin announcement</label><label className="flex min-h-11 items-center gap-3 font-semibold"><input type="checkbox" className="h-5 w-5" disabled={Boolean(busy)} checked={requiresAck} onChange={(event) => setRequiresAck(event.target.checked)} />Ask staff to acknowledge</label></div>}
      <p className="text-base leading-6 text-slate-700">Only staff with access to this audience can see this message and its replies. Families receive messages through Family Communications.</p><div><button className={`${button} !border-emerald-800 !bg-emerald-800 !text-white`} disabled={Boolean(busy) || !title.trim() || !body.trim() || (!current.canPostAll && !audience)}><Send className="h-5 w-5" aria-hidden="true" />{busy === "post" ? "Posting…" : "Post team message"}</button></div>
    </form></section>}
  </div>;
}
