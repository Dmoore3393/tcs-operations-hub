"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { Modal, PageIntro, PrimaryButton, SecondaryButton, SectionCard, StatCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { usePersistentState } from "@/hooks/usePersistentState";
import { starterDigitalForms, type DigitalFormRecord, type DigitalFormStatus, type SignatureMethod } from "@/lib/admin-ops";
import { CheckCircle2, FileSignature, Plus, Search, Send, TriangleAlert } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

const blank: DigitalFormRecord = {
  id: 0,
  location: "Division",
  subjectType: "Child",
  subjectName: "",
  formName: "",
  signerName: "",
  status: "Draft",
  signatureMethod: "Not Signed",
  requestedAt: "",
  dueDate: "",
  signedAt: "",
  verifiedBy: "",
  notes: "",
};

function tone(status: DigitalFormStatus) {
  if (status === "Signed") return "green" as const;
  if (status === "Needs Correction") return "red" as const;
  if (status === "Sent" || status === "Ready to Send") return "blue" as const;
  if (status === "Archived") return "slate" as const;
  return "amber" as const;
}

function overdue(record: DigitalFormRecord) {
  if (!record.dueDate || record.status === "Signed" || record.status === "Archived") return false;
  const due = new Date(`${record.dueDate}T12:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

export default function DigitalFormsPage() {
  const { location } = useHubLocation();
  const [forms, setForms] = usePersistentState<DigitalFormRecord[]>("tcs-digital-forms-v1", starterDigitalForms);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<DigitalFormStatus | "All Statuses">("All Statuses");
  const [editing, setEditing] = useState<DigitalFormRecord | null>(null);

  const scoped = forms.filter((item) => location === "All Locations" || item.location === location);
  const visible = useMemo(() => scoped.filter((item) => status === "All Statuses" || item.status === status)
    .filter((item) => {
      const query = search.trim().toLowerCase();
      return !query || [item.subjectName, item.formName, item.signerName, item.subjectType].join(" ").toLowerCase().includes(query);
    })
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999")), [scoped, search, status]);

  function open(record?: DigitalFormRecord) {
    setEditing(record ? { ...record } : { ...blank, id: Date.now(), location: location === "All Locations" ? "Division" : location, requestedAt: new Date().toISOString().slice(0, 10) });
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const next = editing.status === "Signed" && !editing.signedAt ? { ...editing, signedAt: new Date().toISOString().slice(0, 16) } : editing;
    setForms((current) => current.some((item) => item.id === next.id) ? current.map((item) => item.id === next.id ? next : item) : [...current, next]);
    setEditing(null);
  }

  const unsigned = scoped.filter((item) => !["Signed", "Archived"].includes(item.status)).length;
  const late = scoped.filter(overdue).length;
  const signed = scoped.filter((item) => item.status === "Signed").length;

  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-6">
    <PageIntro eyebrow="Signature workflow" title="Digital Forms & Signatures" description="Track forms that need to be prepared, sent, signed, corrected, and verified. This keeps signatures visible without mixing them into daily-care screens." actions={<PrimaryButton onClick={() => open()}><Plus className="h-4 w-4" /> New Form Request</PrimaryButton>} />

    <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm leading-6 text-violet-950"><strong>Current signature mode:</strong> track in-person signatures, uploaded signed copies, and staff acknowledgments. Direct parent-portal e-signing will stay disabled until the future parent portal is built and approved.</div>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Open Signature Items" value={unsigned} icon={<FileSignature className="h-5 w-5" />} tone="purple" />
      <StatCard label="Ready / Sent" value={scoped.filter((item) => ["Ready to Send", "Sent"].includes(item.status)).length} icon={<Send className="h-5 w-5" />} tone="blue" />
      <StatCard label="Overdue" value={late} icon={<TriangleAlert className="h-5 w-5" />} tone={late ? "red" : "emerald"} />
      <StatCard label="Signed" value={signed} icon={<CheckCircle2 className="h-5 w-5" />} tone="emerald" />
    </section>

    <SectionCard><div className="grid gap-3 lg:grid-cols-[1fr_240px]"><label className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search person, form, or signer…" /></label><select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as DigitalFormStatus | "All Statuses")}><option>All Statuses</option><option>Draft</option><option>Ready to Send</option><option>Sent</option><option>Signed</option><option>Needs Correction</option><option>Archived</option></select></div></SectionCard>

    <SectionCard title="Signature queue" description="Owner/Admin sees all permitted locations; a Location Licensee sees only their assigned location records.">
      {visible.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No forms match this filter.</div> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500"><th className="px-3 py-3">Subject</th><th className="px-3 py-3">Form</th><th className="px-3 py-3">Signer</th><th className="px-3 py-3">Due</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Signature</th><th className="px-3 py-3"></th></tr></thead><tbody>{visible.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-0"><td className="px-3 py-4"><p className="font-black text-slate-950">{item.subjectName || "Name needed"}</p><p className="mt-1 text-xs text-slate-500">{item.subjectType} • {item.location}</p></td><td className="px-3 py-4 font-semibold text-slate-800">{item.formName || "Form name needed"}</td><td className="px-3 py-4 text-slate-700">{item.signerName || "Not entered"}</td><td className={`px-3 py-4 font-semibold ${overdue(item) ? "text-red-700" : "text-slate-700"}`}>{item.dueDate || "—"}{overdue(item) ? " • OVERDUE" : ""}</td><td className="px-3 py-4"><StatusBadge tone={tone(item.status)}>{item.status}</StatusBadge></td><td className="px-3 py-4 text-xs font-semibold text-slate-600">{item.signatureMethod}</td><td className="px-3 py-4"><SecondaryButton onClick={() => open(item)}>Review</SecondaryButton></td></tr>)}</tbody></table></div>}
    </SectionCard>

    {editing && <Modal title={forms.some((item) => item.id === editing.id) ? "Review Form" : "New Form Request"} description="This records signature workflow status; it does not send a legal e-signature request outside the Hub." onClose={() => setEditing(null)} footer={<><SecondaryButton onClick={() => setEditing(null)}>Cancel</SecondaryButton><PrimaryButton onClick={() => document.getElementById("form-workflow-save")?.click()}>Save</PrimaryButton></>}>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label="Location"><select className={inputClass} value={editing.location} onChange={(event) => setEditing({ ...editing, location: event.target.value })}><option>Halcom</option><option>21st Street</option><option>Division</option><option>33rd Street</option><option>42nd Street</option><option>Tehachapi</option></select></Field>
        <Field label="Subject type"><select className={inputClass} value={editing.subjectType} onChange={(event) => setEditing({ ...editing, subjectType: event.target.value as DigitalFormRecord["subjectType"] })}><option>Child</option><option>Employee</option><option>Family</option><option>Transportation</option></select></Field>
        <Field label="Subject name"><input required className={inputClass} value={editing.subjectName} onChange={(event) => setEditing({ ...editing, subjectName: event.target.value })} /></Field>
        <Field label="Form name"><input required className={inputClass} value={editing.formName} onChange={(event) => setEditing({ ...editing, formName: event.target.value })} /></Field>
        <Field label="Signer name"><input className={inputClass} value={editing.signerName} onChange={(event) => setEditing({ ...editing, signerName: event.target.value })} /></Field>
        <Field label="Status"><select className={inputClass} value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value as DigitalFormStatus })}><option>Draft</option><option>Ready to Send</option><option>Sent</option><option>Signed</option><option>Needs Correction</option><option>Archived</option></select></Field>
        <Field label="Signature method"><select className={inputClass} value={editing.signatureMethod} onChange={(event) => setEditing({ ...editing, signatureMethod: event.target.value as SignatureMethod })}><option>Not Signed</option><option>In Person</option><option>Uploaded Signed Copy</option><option>Staff Acknowledgment</option><option disabled>Parent Portal (Future)</option></select></Field>
        <Field label="Requested"><input type="date" className={inputClass} value={editing.requestedAt} onChange={(event) => setEditing({ ...editing, requestedAt: event.target.value })} /></Field>
        <Field label="Due"><input type="date" className={inputClass} value={editing.dueDate} onChange={(event) => setEditing({ ...editing, dueDate: event.target.value })} /></Field>
        <Field label="Signed date / time"><input type="datetime-local" className={inputClass} value={editing.signedAt} onChange={(event) => setEditing({ ...editing, signedAt: event.target.value })} /></Field>
        <Field label="Verified by"><input className={inputClass} value={editing.verifiedBy} onChange={(event) => setEditing({ ...editing, verifiedBy: event.target.value })} /></Field>
        <Field label="Notes" wide><textarea className={`${inputClass} min-h-24`} value={editing.notes} onChange={(event) => setEditing({ ...editing, notes: event.target.value })} /></Field>
        <button id="form-workflow-save" type="submit" className="hidden">Save</button>
      </form>
    </Modal>}
  </div></MainLayout>;
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-sm font-bold text-slate-700">{label}</span>{children}</label>;
}
