"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
type Post = {
    id: string;
    from: string;
    message: string;
    created_by?: string;
};
type Block = {
    blocked_user_id: string;
    blocked_name: string;
};
type Report = {
    id: string;
    post_author: string;
    post_message: string;
    reason: string;
    status: string;
    created_at: string;
};
type Props = {
    selected: Post | null;
    onClose: () => void;
    onChanged: () => Promise<void>;
    apiRequest: (url: string, options?: RequestInit) => Promise<Record<string, unknown>>;
    userId?: string;
};
export default function LoungeSafety({ selected, onClose, onChanged, apiRequest, userId }: Props) {
    const [blocks, setBlocks] = useState<Block[]>([]);
    const [reports, setReports] = useState<Report[]>([]);
    const [owner, setOwner] = useState(false);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const load = useCallback(async () => {
        try {
            const p = await apiRequest("/api/employee-lounge/safety");
            setBlocks(p.blocks as Block[]);
            setReports(p.reports as Report[]);
            setOwner(p.isOwner === true);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Could not load safety settings.");
        }
    }, [apiRequest]);
    useEffect(() => { const initial = window.setTimeout(() => { void load(); }, 0); const interval = window.setInterval(() => { void load(); }, 30000); return () => { window.clearTimeout(initial); window.clearInterval(interval); }; }, [load]);
    async function act(body: Record<string, unknown>) {
        if (busy)
            return;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            await apiRequest("/api/employee-lounge/safety", { method: "POST", body: JSON.stringify(body) });
            await Promise.all([load(), onChanged()]);
            setReason("");
            onClose();
            setNotice(body.action === "report" ? "Report received. The post is hidden for you while TCS leadership reviews it." : body.action === "block" ? "Author blocked. Their Lounge posts are now hidden for you." : "Safety settings updated.");
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Could not save safety settings.");
        }
        finally {
            setBusy(false);
        }
    }
    return <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-lg">
 <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black text-[#0b3153]">Lounge Safety</h2><button type="button" disabled={busy} onClick={() => void load()} className="rounded-lg border px-3 py-2 text-sm font-bold">Refresh</button></div>
 <p className="mt-2 text-sm text-slate-600">Keep posts respectful and appropriate for work. No harassment, hate, threats, sexual content, or confidential child or family information. Report concerns here or <Link className="underline" href="/support">contact TCS support</Link>. Blocking hides an author’s Lounge posts for you.</p>
 {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
 {notice && <p role="status" className="mt-3 text-emerald-800">{notice}</p>}
 <h3 className="mt-4 font-bold">Blocked authors</h3>
 {!blocks.length && <p className="text-sm text-slate-500">No blocked authors.</p>}
 {blocks.map(b => <div key={b.blocked_user_id} className="mt-2 flex items-center justify-between gap-3"><span>{b.blocked_name}</span><button disabled={busy} className="rounded-lg border px-3 py-2 font-bold disabled:opacity-50" onClick={() => void act({ action: "unblock", userId: b.blocked_user_id })}>Unblock</button></div>)}
 {owner && <div className="mt-6"><h3 className="font-bold">Owner content review</h3><p className="text-sm text-slate-600">Check reports daily and address abusive content promptly, within 24 hours. Hide removes a reported post from the Lounge for everyone. Reviewed keeps it visible unless another report is marked Hidden.</p>
 {!reports.length && <p className="mt-2 text-sm">No content reports.</p>}
 {reports.map(r => <article className="mt-3 rounded-xl border p-4" key={r.id}><p className="text-xs font-bold">{r.status} · {new Date(r.created_at).toLocaleString()}</p><p className="mt-2 font-bold">{r.post_author}</p><p className="break-words">{r.post_message}</p><p className="mt-2 text-sm">Report: {r.reason}</p><div className="mt-3 flex flex-wrap gap-2"><button disabled={busy || r.status === "Hidden"} className="rounded-lg bg-red-700 px-3 py-2 font-bold text-white disabled:opacity-50" onClick={() => void act({ action: "resolve", id: r.id, status: "Hidden" })}>Hide Post</button><button disabled={busy || r.status === "Reviewed"} className="rounded-lg border px-3 py-2 font-bold disabled:opacity-50" onClick={() => void act({ action: "resolve", id: r.id, status: "Reviewed" })}>Mark Reviewed / Keep</button></div></article>)}
 </div>}
 {selected && <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4"><div role="dialog" aria-modal="true" aria-labelledby="lounge-report-title" className="w-full max-w-lg rounded-3xl bg-white p-6"><h2 id="lounge-report-title" className="text-xl font-bold">Report or block</h2><p className="mt-3 text-sm">Post by {selected.from}</p><p className="mt-2 max-h-32 overflow-auto break-words text-sm">{selected.message}</p><label className="mt-4 block text-sm font-bold" htmlFor="lounge-reason">Why are you reporting this post?</label><textarea id="lounge-reason" value={reason} onChange={e => setReason(e.target.value)} maxLength={1000} rows={3} className="mt-2 w-full rounded-xl border p-3" placeholder="Harassment, inappropriate content, privacy concern, or another issue"/>
 {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
 <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy || reason.trim().length < 3} onClick={() => void act({ action: "report", postId: selected.id, reason })} className="rounded-xl bg-red-700 px-4 py-3 font-bold text-white disabled:opacity-50">Submit Report</button>{selected.created_by && selected.created_by !== userId && <button disabled={busy} onClick={() => void act({ action: "block", postId: selected.id })} className="rounded-xl border px-4 py-3 font-bold disabled:opacity-50">Block Author</button>}<button disabled={busy} className="rounded-xl border px-4 py-3" onClick={() => { setReason(""); setError(""); onClose(); }}>Cancel</button></div></div></div>}
 </section>;
}
