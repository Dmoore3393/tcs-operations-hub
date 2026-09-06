"use client";

import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { PrimaryButton, SecondaryButton, SectionCard, StatCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { initialChildren, type ChildRecord } from "@/lib/children";
import { childAttendsLocation, starterChildSchedules, type ChildScheduleRecord } from "@/lib/child-schedules";
import { normalizeLocation, type LocationKey } from "@/lib/location-config";
import { usePersistentState } from "@/hooks/usePersistentState";
import { CheckCircle2, ClipboardCopy, ExternalLink, FileCheck2, FileSignature, LoaderCircle, ShieldCheck, Upload, UserRoundCheck } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

const DOCUMENT_TYPE = "Transportation Consent 2026-2027";

type EncryptedDocument = {
  id: string;
  document_type: string;
  original_filename: string;
  created_at: string;
  retention_until: string;
  status: string;
  children: { first_name?: string; last_name?: string } | null;
  locations: { name?: string; full_name?: string } | null;
};

function childName(child: ChildRecord) {
  return `${child.firstName} ${child.lastName}`;
}

export default function TransportationConsentsPage() {
  const { session, isSystemOwner, isLocationLicensee } = useAuth();
  const { location: activeLocation, availableLocations } = useHubLocation();
  const [children] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const [childSchedules] = usePersistentState<ChildScheduleRecord[]>("tcs-child-schedules-v2", starterChildSchedules);
  const [location, setLocation] = useState<Exclude<LocationKey, "All Locations">>(activeLocation === "All Locations" ? "Division" : activeLocation);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [documents, setDocuments] = useState<EncryptedDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const canManage = isSystemOwner || isLocationLicensee;

  const eligibleChildren = useMemo(() => children.filter((child) => {
    const schedule = childSchedules.find((item) => item.childId === child.id);
    return childAttendsLocation(child, schedule, location);
  }).sort((a, b) => childName(a).localeCompare(childName(b))), [childSchedules, children, location]);

  const consentDocuments = useMemo(() => documents.filter((document) => document.document_type === DOCUMENT_TYPE && document.status !== "Deleted"), [documents]);

  const loadDocuments = useCallback(async () => {
    if (!session?.access_token || !canManage) return;
    setLoading(true);
    try {
      const response = await fetch("/api/documents", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await response.json() as { documents?: EncryptedDocument[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load consent records.");
      setDocuments(payload.documents ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load consent records.");
    } finally {
      setLoading(false);
    }
  }, [canManage, session]);

  useEffect(() => { void loadDocuments(); }, [loadDocuments]);

  useEffect(() => {
    if (activeLocation !== "All Locations" && availableLocations.includes(activeLocation)) setLocation(activeLocation as Exclude<LocationKey, "All Locations">);
  }, [activeLocation, availableLocations]);

  useEffect(() => {
    if (!eligibleChildren.some((child) => String(child.id) === selectedChildId)) setSelectedChildId(eligibleChildren[0] ? String(eligibleChildren[0].id) : "");
  }, [eligibleChildren, selectedChildId]);

  const selectedChild = eligibleChildren.find((child) => String(child.id) === selectedChildId);

  function hasConsent(child: ChildRecord) {
    const name = childName(child).toLowerCase();
    return consentDocuments.some((document) => `${document.children?.first_name ?? ""} ${document.children?.last_name ?? ""}`.trim().toLowerCase() === name);
  }

  async function createSigningLink() {
    if (!session?.access_token || !selectedChild) return;
    setLinkLoading(true);
    setMessage("");
    setGeneratedLink("");
    try {
      const response = await fetch("/api/transportation-consents/link", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ childLegacyId: selectedChild.id, location }),
      });
      const payload = await response.json() as { path?: string; error?: string };
      if (!response.ok || !payload.path) throw new Error(payload.error || "Could not create the parent signing link.");
      setGeneratedLink(`${window.location.origin}${payload.path}`);
      setMessage(`Digital consent link ready for ${childName(selectedChild)}. It expires in 7 days.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the parent signing link.");
    } finally {
      setLinkLoading(false);
    }
  }

  async function copyLink() {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink);
    setMessage("Parent signing link copied. You can paste it into a text message or Brightwheel message.");
  }

  async function uploadExisting(event: FormEvent) {
    event.preventDefault();
    if (!session?.access_token || !selectedChild || !uploadFile) return;
    setUploading(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", uploadFile);
      form.set("location", location);
      form.set("documentType", DOCUMENT_TYPE);
      form.set("childLegacyId", String(selectedChild.id));
      form.set("anchorDate", new Date().toISOString().slice(0, 10));
      const response = await fetch("/api/documents", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: form });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Upload failed.");
      setUploadFile(null);
      const input = document.getElementById("existing-transport-consent") as HTMLInputElement | null;
      if (input) input.value = "";
      setMessage(`Signed transportation consent uploaded securely for ${childName(selectedChild)}.`);
      await loadDocuments();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function download(document: EncryptedDocument) {
    if (!session?.access_token) return;
    const response = await fetch(`/api/documents/${document.id}/download`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    if (!response.ok) {
      const payload = await response.json() as { error?: string };
      setMessage(payload.error || "Could not open the signed consent.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = document.original_filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!canManage) return <MainLayout><div className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-amber-50 p-8"><h1 className="text-2xl font-black text-amber-950">Transportation Consent Forms</h1><p className="mt-3 font-semibold text-amber-900">Consent records and signed-file uploads are restricted to Owners and Location Licensees.</p></div></MainLayout>;

  const signedCount = eligibleChildren.filter(hasConsent).length;

  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-6 pb-12">
    <section className="overflow-hidden rounded-[2rem] border border-blue-100 bg-gradient-to-br from-[#eef7ff] via-white to-[#fff4bf] p-6 shadow-[0_18px_55px_rgba(19,76,145,.14)] sm:p-9">
      <p className="text-xs font-black uppercase tracking-[.2em] text-[#1769d2]">The School Shuttle • 2026–2027</p>
      <div className="mt-2 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-4xl font-black tracking-tight text-[#102a56] sm:text-5xl">Transportation Consent Forms</h1><p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-slate-600">Send a secure mobile-friendly form for a parent to sign digitally, or upload a consent form that is already signed. Completed records are stored in the encrypted child document vault.</p></div><Link href="/transportation-v2" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-black text-[#1769d2]">Back to School Shuttle</Link></div>
    </section>

    <div className="grid gap-4 sm:grid-cols-3"><StatCard label="Children at Location" value={eligibleChildren.length} icon={<UserRoundCheck className="h-5 w-5" />} tone="blue" /><StatCard label="Consent on File" value={signedCount} icon={<FileCheck2 className="h-5 w-5" />} tone="emerald" /><StatCard label="Still Needed" value={Math.max(eligibleChildren.length - signedCount, 0)} icon={<FileSignature className="h-5 w-5" />} tone="amber" /></div>

    <SectionCard title="Choose child" description="Create a parent signing link or attach an existing signed form to the correct child record.">
      <div className="grid gap-4 md:grid-cols-2"><label><span className="mb-1.5 block text-sm font-bold text-slate-700">Location</span><select className={inputClass} value={location} onChange={(event) => { setLocation(normalizeLocation(event.target.value) as Exclude<LocationKey, "All Locations">); setGeneratedLink(""); }}>{availableLocations.filter((item) => item !== "All Locations").map((item) => <option key={item}>{item}</option>)}</select></label><label><span className="mb-1.5 block text-sm font-bold text-slate-700">Child</span><select className={inputClass} value={selectedChildId} onChange={(event) => { setSelectedChildId(event.target.value); setGeneratedLink(""); }}><option value="">Choose child</option>{eligibleChildren.map((child) => <option key={child.id} value={child.id}>{childName(child)}{hasConsent(child) ? " • Consent on file" : " • Needs consent"}</option>)}</select></label></div>
    </SectionCard>

    <section className="grid gap-5 xl:grid-cols-2">
      <SectionCard title="Digital Parent Signature" description="The parent opens a secure link, completes the 2026–2027 packet, initials the required policies, and draws their signature on their phone.">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold leading-6 text-blue-950"><ShieldCheck className="mr-2 inline h-4 w-4" />The link is child-specific and expires after 7 days. The signed submission is encrypted and attached to that child.</div>
        <div className="mt-4 flex flex-wrap gap-3"><PrimaryButton onClick={() => void createSigningLink()} disabled={!selectedChild || linkLoading}>{linkLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />} Create Parent Signing Link</PrimaryButton>{generatedLink && <><SecondaryButton onClick={() => void copyLink()}><ClipboardCopy className="h-4 w-4" /> Copy Link</SecondaryButton><a href={generatedLink} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700"><ExternalLink className="h-4 w-4" /> Open Form</a></>}</div>
        {generatedLink && <div className="mt-4 break-all rounded-xl bg-slate-950 px-4 py-3 text-xs font-semibold text-white">{generatedLink}</div>}
      </SectionCard>

      <SectionCard title="Upload Existing Signed Form" description="Use this for the paper/PDF consent forms parents have already signed.">
        <form onSubmit={uploadExisting} className="space-y-4"><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-950"><CheckCircle2 className="mr-2 inline h-4 w-4" />The uploaded PDF or image is encrypted and stored under the selected child as Transportation Consent 2026–2027.</div><label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-700">Signed PDF or image</span><input id="existing-transport-consent" required type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic,image/heif" className={inputClass} onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} /></label><PrimaryButton type="submit" disabled={!selectedChild || !uploadFile || uploading}>{uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Encrypt & Upload Signed Form</PrimaryButton></form>
      </SectionCard>
    </section>

    {message && <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-bold text-slate-700 shadow-sm">{message}</div>}

    <SectionCard title="2026–2027 Consent Status" description="This list updates from the encrypted document vault.">
      {loading ? <div className="py-8 text-center font-bold text-slate-500"><LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading consent records…</div> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{eligibleChildren.map((child) => { const name = childName(child); const record = consentDocuments.find((document) => `${document.children?.first_name ?? ""} ${document.children?.last_name ?? ""}`.trim().toLowerCase() === name.toLowerCase()); return <div key={child.id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-950">{name}</p><p className="mt-1 text-xs font-semibold text-slate-500">{location}</p></div><StatusBadge tone={record ? "green" : "amber"}>{record ? "Consent on File" : "Needs Consent"}</StatusBadge></div>{record && <div className="mt-3"><p className="text-xs font-semibold text-slate-500">Received {new Date(record.created_at).toLocaleDateString()}</p><button onClick={() => void download(record)} className="mt-2 text-sm font-black text-[#1769d2] hover:underline">Download signed record</button></div>}</div>; })}{eligibleChildren.length === 0 && <p className="text-sm text-slate-500">No children are assigned to this location.</p>}</div>}
    </SectionCard>
  </div></MainLayout>;
}
