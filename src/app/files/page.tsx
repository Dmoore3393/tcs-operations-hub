"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { DemoNotice, Modal, PageIntro, PrimaryButton, SecondaryButton, SectionCard, StatCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { type FileRecord, starterFiles } from "@/lib/hub-data";
import { initialChildren, type ChildRecord } from "@/lib/children";
import { childAttendsLocation, starterChildSchedules, type ChildScheduleRecord } from "@/lib/child-schedules";
import { normalizeLocation, type LocationKey } from "@/lib/location-config";
import { usePersistentState } from "@/hooks/usePersistentState";
import { CheckCircle2, Download, FileCheck2, FileLock2, FileWarning, LoaderCircle, Plus, Search, ShieldCheck, Signature, Trash2, Upload } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

const blankFile: FileRecord = { id: 0, person: "", recordType: "Child", location: "Halcom", document: "", status: "Missing", due: "Now" };

const documentTypes = [
  "LIC 700 / Emergency Information",
  "Medical Consent / Medical Card",
  "Incident / Injury Report",
  "Timesheet / Subsidy Record",
  "CACFP / Meal Record",
  "Other Child Form",
];

type EncryptedDocument = {
  id: string;
  location_id: string;
  child_id: string | null;
  document_type: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  encryption_algorithm: string;
  encryption_version: number;
  retention_until: string;
  legal_hold: boolean;
  status: string;
  created_at: string;
  locations: { name?: string; full_name?: string } | null;
  children: { first_name?: string; last_name?: string } | null;
};

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilesPage() {
  const { session, isSystemOwner, isLocationLicensee } = useAuth();
  const { location: activeLocation, availableLocations } = useHubLocation();
  const [files, setFiles] = usePersistentState<FileRecord[]>("tcs-files", starterFiles);
  const [children] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const [childSchedules] = usePersistentState<ChildScheduleRecord[]>("tcs-child-schedules-v2", starterChildSchedules);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Open Items");
  const [editing, setEditing] = useState<FileRecord | null>(null);
  const [documents, setDocuments] = useState<EncryptedDocument[]>([]);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultMessage, setVaultMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadLocation, setUploadLocation] = useState<Exclude<LocationKey, "All Locations">>(activeLocation === "All Locations" ? "Halcom" : activeLocation);
  const [uploadChildId, setUploadChildId] = useState("");
  const [uploadType, setUploadType] = useState(documentTypes[0]);
  const [anchorDate, setAnchorDate] = useState(new Date().toISOString().slice(0, 10));
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const canUseVault = isSystemOwner || isLocationLicensee;

  const filtered = useMemo(() => files.filter((file) => {
    const matches = [file.person, file.document, file.location, file.recordType].join(" ").toLowerCase().includes(search.toLowerCase());
    const statusMatches = status === "All Statuses" || (status === "Open Items" ? file.status !== "Complete" : file.status === status);
    const locationMatches = activeLocation === "All Locations" || file.location === activeLocation;
    return matches && statusMatches && locationMatches;
  }), [activeLocation, files, search, status]);

  const uploadChildren = useMemo(() => {
    const location = normalizeLocation(uploadLocation) as Exclude<LocationKey, "All Locations">;
    return children.filter((child) => {
      const schedule = childSchedules.find((record) => record.childId === child.id);
      return childAttendsLocation(child, schedule, location);
    });
  }, [childSchedules, children, uploadLocation]);

  const loadDocuments = useCallback(async () => {
    if (!session?.access_token || !canUseVault) return;
    setVaultLoading(true);
    setVaultMessage("");
    try {
      const response = await fetch("/api/documents", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await response.json() as { documents?: EncryptedDocument[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load encrypted documents.");
      setDocuments(payload.documents ?? []);
    } catch (error) {
      setVaultMessage(error instanceof Error ? error.message : "Could not load encrypted documents.");
    } finally {
      setVaultLoading(false);
    }
  }, [canUseVault, session]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadDocuments(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDocuments]);

  useEffect(() => {
    if (activeLocation === "All Locations" || !availableLocations.includes(activeLocation)) return;
    const timer = window.setTimeout(() => setUploadLocation(activeLocation as Exclude<LocationKey, "All Locations">), 0);
    return () => window.clearTimeout(timer);
  }, [activeLocation, availableLocations]);

  function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setFiles((current) => current.some((item) => item.id === editing.id) ? current.map((item) => item.id === editing.id ? editing : item) : [...current, editing]);
    setEditing(null);
  }

  function markComplete(id: number) {
    setFiles((current) => current.map((file) => file.id === id ? { ...file, status: "Complete" } : file));
  }

  async function uploadEncryptedDocument(event: FormEvent) {
    event.preventDefault();
    if (!session?.access_token || !uploadFile) return;
    setUploading(true);
    setVaultMessage("");
    try {
      const form = new FormData();
      form.set("file", uploadFile);
      form.set("location", uploadLocation);
      form.set("documentType", uploadType);
      form.set("childLegacyId", uploadChildId);
      form.set("anchorDate", anchorDate);
      const response = await fetch("/api/documents", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Upload failed.");
      setUploadFile(null);
      setUploadChildId("");
      const fileInput = document.getElementById("encrypted-file") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
      setVaultMessage("Encrypted document uploaded and retention date applied.");
      await loadDocuments();
    } catch (error) {
      setVaultMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function downloadDocument(document: EncryptedDocument) {
    if (!session?.access_token) return;
    setVaultMessage("");
    try {
      const response = await fetch(`/api/documents/${document.id}/download`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error || "Download failed.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = document.original_filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setVaultMessage(error instanceof Error ? error.message : "Download failed.");
    }
  }

  async function deleteDocument(document: EncryptedDocument) {
    if (!session?.access_token || !window.confirm(`Delete ${document.original_filename}? Retention and legal-hold rules will be checked first.`)) return;
    setVaultMessage("");
    try {
      const response = await fetch(`/api/documents/${document.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Deletion failed.");
      setVaultMessage("Document securely deleted after retention validation.");
      await loadDocuments();
    } catch (error) {
      setVaultMessage(error instanceof Error ? error.message : "Deletion failed.");
    }
  }

  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-6">
    <PageIntro eyebrow="Licensing and compliance" title="Files" description="Track missing forms and use the encrypted private vault for uploaded forms and medical cards." actions={<PrimaryButton onClick={() => setEditing({ ...blankFile, id: Date.now(), location: activeLocation === "All Locations" ? (availableLocations.find((item) => item !== "All Locations") ?? "Halcom") : activeLocation })}><Plus className="h-4 w-4" /> Add File Item</PrimaryButton>} />
    <DemoNotice />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Open File Items" value={files.filter((file) => file.status !== "Complete").length} icon={<FileWarning className="h-5 w-5" />} tone="amber" />
      <StatCard label="Missing" value={files.filter((file) => file.status === "Missing").length} icon={<FileWarning className="h-5 w-5" />} tone="red" />
      <StatCard label="Needs Signature" value={files.filter((file) => file.status === "Needs Signature").length} icon={<Signature className="h-5 w-5" />} tone="purple" />
      <StatCard label="Encrypted Documents" value={documents.length} icon={<FileLock2 className="h-5 w-5" />} tone="emerald" />
    </section>

    {canUseVault && <SectionCard title="Encrypted Document Vault" description="Files are encrypted with AES-256-GCM before private storage. Direct browser access is blocked, and every download is audited.">
      <div className="mb-5 grid gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 lg:grid-cols-3">
        <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>Location restricted:</strong> Licensees see only their assigned location.</span></p>
        <p className="flex items-start gap-2"><FileLock2 className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>Encrypted:</strong> Files are ciphertext in the private bucket.</span></p>
        <p className="flex items-start gap-2"><FileCheck2 className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>Retention protected:</strong> Early deletion and legal-hold deletion are blocked.</span></p>
      </div>
      <form onSubmit={uploadEncryptedDocument} className="grid gap-4 rounded-2xl border border-slate-200 p-4 lg:grid-cols-2 xl:grid-cols-5">
        <Field label="Location"><select className={inputClass} value={uploadLocation} onChange={(event) => { setUploadLocation(event.target.value as Exclude<LocationKey, "All Locations">); setUploadChildId(""); }}>{availableLocations.filter((item) => item !== "All Locations").map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Child (optional)"><select className={inputClass} value={uploadChildId} onChange={(event) => setUploadChildId(event.target.value)}><option value="">General location document</option>{uploadChildren.map((child) => <option key={child.id} value={String(child.id)}>{child.firstName} {child.lastName}</option>)}</select></Field>
        <Field label="Document type"><select className={inputClass} value={uploadType} onChange={(event) => setUploadType(event.target.value)}>{documentTypes.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Retention anchor date"><input type="date" className={inputClass} value={anchorDate} onChange={(event) => setAnchorDate(event.target.value)} /></Field>
        <Field label="PDF or image"><input id="encrypted-file" required type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic,image/heif" className={inputClass} onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} /></Field>
        <div className="xl:col-span-5 flex flex-wrap items-center gap-3"><PrimaryButton type="submit" disabled={!uploadFile || uploading}>{uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Encrypt & Upload</PrimaryButton><p className="text-xs font-semibold text-slate-500">Maximum 15 MB. The retention anchor should be the child exit, incident, or service-period date when known.</p></div>
      </form>
      {vaultMessage && <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">{vaultMessage}</p>}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[1050px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400"><th className="pb-3">Document</th><th className="pb-3">Location / Child</th><th className="pb-3">Encryption</th><th className="pb-3">Retention</th><th className="pb-3">Uploaded</th><th className="pb-3 text-right">Actions</th></tr></thead><tbody>
          {vaultLoading && <tr><td colSpan={6} className="py-8 text-center font-bold text-slate-500"><LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading encrypted documents…</td></tr>}
          {!vaultLoading && documents.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-slate-500">No encrypted documents uploaded yet.</td></tr>}
          {documents.map((document) => <tr key={document.id} className="border-b border-slate-100 last:border-0"><td className="py-4"><p className="font-black text-slate-950">{document.original_filename}</p><p className="mt-1 text-xs text-slate-500">{document.document_type} • {formatBytes(document.size_bytes)}</p></td><td className="py-4"><p className="font-bold text-slate-800">{document.locations?.name ?? "Location"}</p><p className="text-xs text-slate-500">{document.children ? `${document.children.first_name ?? ""} ${document.children.last_name ?? ""}`.trim() : "General location file"}</p></td><td className="py-4"><StatusBadge tone="green">{document.encryption_algorithm}</StatusBadge><p className="mt-1 text-xs text-slate-500">Version {document.encryption_version}</p></td><td className="py-4"><p className="font-bold text-slate-800">Until {document.retention_until}</p><p className="text-xs text-slate-500">{document.legal_hold ? "Legal hold active" : "No legal hold"}</p></td><td className="py-4 text-slate-600">{new Date(document.created_at).toLocaleString()}</td><td className="py-4"><div className="flex justify-end gap-2"><SecondaryButton onClick={() => void downloadDocument(document)}><Download className="h-4 w-4" /> Download</SecondaryButton>{isSystemOwner && <button onClick={() => void deleteDocument(document)} className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-800"><Trash2 className="h-4 w-4" /> Delete</button>}</div></td></tr>)}
        </tbody></table>
      </div>
    </SectionCard>}

    <SectionCard><div className="flex flex-col gap-3 lg:flex-row"><label className="relative flex-1"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-10`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search person, document, location, or record type…" /></label><select className={`${inputClass} lg:w-56`} value={status} onChange={(e) => setStatus(e.target.value)}><option>Open Items</option><option>All Statuses</option><option>Missing</option><option>Needs Signature</option><option>Expiring Soon</option><option>Complete</option></select></div></SectionCard>
    <SectionCard title="Compliance Tracker" description={`${filtered.length} records shown`}>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400"><th className="pb-3">Person / Record</th><th className="pb-3">Document</th><th className="pb-3">Location</th><th className="pb-3">Due</th><th className="pb-3">Status</th><th className="pb-3 text-right">Actions</th></tr></thead><tbody>{filtered.map((file) => <tr key={file.id} className="border-b border-slate-100 last:border-0"><td className="py-4"><p className="font-black text-slate-950">{file.person}</p><p className="mt-1 text-xs text-slate-500">{file.recordType} record</p></td><td className="py-4 font-bold text-slate-800">{file.document}</td><td className="py-4 text-slate-600">{file.location}</td><td className="py-4 font-semibold text-slate-700">{file.due}</td><td className="py-4"><StatusBadge tone={file.status === "Complete" ? "green" : file.status === "Missing" ? "red" : file.status === "Needs Signature" ? "purple" : "amber"}>{file.status}</StatusBadge></td><td className="py-4"><div className="flex justify-end gap-2">{file.status !== "Complete" && <button onClick={() => markComplete(file.id)} className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800 hover:bg-emerald-100"><CheckCircle2 className="h-4 w-4" /> Complete</button>}<SecondaryButton onClick={() => setEditing({ ...file })}>Edit</SecondaryButton></div></td></tr>)}</tbody></table></div>
    </SectionCard>

    {editing && <Modal title={files.some((file) => file.id === editing.id) ? "Edit File Item" : "Add File Item"} description="Use one item for each missing, expiring, or signature-required document." onClose={() => setEditing(null)} footer={<><SecondaryButton onClick={() => setEditing(null)}>Cancel</SecondaryButton><PrimaryButton onClick={() => document.getElementById("file-save")?.click()}>Save Item</PrimaryButton></>}>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2"><Field label="Person or record"><input required className={inputClass} value={editing.person} onChange={(e) => setEditing({ ...editing, person: e.target.value })} /></Field><Field label="Record type"><select className={inputClass} value={editing.recordType} onChange={(e) => setEditing({ ...editing, recordType: e.target.value as FileRecord["recordType"] })}><option>Child</option><option>Employee</option><option>Facility</option><option>Vehicle</option></select></Field><Field label="Document" wide><input required className={inputClass} value={editing.document} onChange={(e) => setEditing({ ...editing, document: e.target.value })} /></Field><Field label="Location"><select className={inputClass} value={editing.location} onChange={(e) => setEditing({ ...editing, location: e.target.value })}>{availableLocations.filter((item) => item !== "All Locations").map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Due"><input className={inputClass} value={editing.due} onChange={(e) => setEditing({ ...editing, due: e.target.value })} /></Field><Field label="Status"><select className={inputClass} value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as FileRecord["status"] })}><option>Missing</option><option>Needs Signature</option><option>Expiring Soon</option><option>Complete</option></select></Field><button id="file-save" type="submit" className="hidden">Save</button></form>
    </Modal>}
  </div></MainLayout>;
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-sm font-bold text-slate-700">{label}</span>{children}</label>;
}
