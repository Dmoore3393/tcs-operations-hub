"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import type { ChildRecord } from "@/lib/children";
import {
  createBlankImmunizationRecord,
  defaultImmunizationProgram,
  immunizationRequirements,
  immunizationStatus,
  nextThirtyDayReview,
  normalizeImmunizationRecord,
  type ImmunizationRecord,
  type ImmunizationEntryStatus,
} from "@/lib/immunization-tracker";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  FileHeart,
  LoaderCircle,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Syringe,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type LiveLocation = {
  id: string;
  name: string;
  fullName: string;
  programType: string;
};

type EditorState = {
  child: ChildRecord;
  record: ImmunizationRecord;
};

const vaccineFields = [
  { key: "polioDates", label: "Polio" },
  { key: "dtapDates", label: "DTaP / DTP / Td" },
  { key: "tdapDates", label: "Tdap" },
  { key: "hepBDates", label: "Hepatitis B" },
  { key: "hibDates", label: "Hib" },
  { key: "mmrDates", label: "MMR" },
  { key: "varicellaDates", label: "Varicella" },
] as const;

type VaccineFieldKey = (typeof vaccineFields)[number]["key"];

function childName(child: ChildRecord) {
  return `${child.firstName} ${child.lastName}`.trim();
}

function formatDate(value: string) {
  if (!value) return "Not set";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function statusStyle(status: ImmunizationEntryStatus) {
  if (status === "Requirements Met") return "bg-emerald-100 text-emerald-800";
  if (status === "Needs Doses / Record") return "bg-red-100 text-red-800";
  if (status === "Conditional") return "bg-amber-100 text-amber-900";
  if (status === "Medical Exemption") return "bg-purple-100 text-purple-800";
  return "bg-slate-100 text-slate-700";
}

export default function ImmunizationTrackerPage() {
  const { session, profile, isEmployee } = useAuth();
  const { location: activeLocation } = useHubLocation();
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [locations, setLocations] = useState<LiveLocation[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("All Locations");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const request = useCallback(async (method: "GET" | "POST", body?: Record<string, unknown>) => {
    if (!session?.access_token) throw new Error("Your staff session is not ready.");
    const response = await fetch("/api/children", {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const raw = await response.text();
    const payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "The immunization request failed.");
    return payload;
  }, [session?.access_token]);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const payload = await request("GET");
      setChildren(Array.isArray(payload.children) ? payload.children as ChildRecord[] : []);
      setLocations(Array.isArray(payload.locations) ? payload.locations as LiveLocation[] : []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load immunization records.");
    } finally {
      setLoading(false);
    }
  }, [request, session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (activeLocation !== "All Locations") setSiteFilter(activeLocation);
  }, [activeLocation]);

  useEffect(() => {
    if (loading || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const childId = Number(params.get("child"));
    if (!Number.isSafeInteger(childId) || childId <= 0) return;
    const child = children.find((item) => item.id === childId);
    if (child) openEditor(child);
    window.history.replaceState({}, "", window.location.pathname);
  }, [children, loading]);

  const activeChildren = useMemo(
    () => children.filter((child) => child.enrollmentStatus !== "Archived"),
    [children],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return activeChildren.filter((child) => {
      const matchesSearch = !query || `${childName(child)} ${child.primaryGuardian} ${child.location}`.toLowerCase().includes(query);
      const matchesLocation = siteFilter === "All Locations" ||
        child.location.toLowerCase().includes(siteFilter.toLowerCase()) ||
        siteFilter.toLowerCase().includes(child.location.toLowerCase());
      return matchesSearch && matchesLocation;
    });
  }, [activeChildren, search, siteFilter]);

  const summary = useMemo(() => {
    let met = 0;
    let needs = 0;
    let conditional = 0;
    let exemptions = 0;
    for (const child of filtered) {
      const defaultProgram = defaultImmunizationProgram(child.ageGroup, child.location);
      const record = normalizeImmunizationRecord(child.immunizationRecord, defaultProgram);
      const status = immunizationStatus(child.dateOfBirth, record);
      if (status === "Requirements Met") met += 1;
      else if (status === "Conditional") conditional += 1;
      else if (status === "Medical Exemption") exemptions += 1;
      else needs += 1;
    }
    return { met, needs, conditional, exemptions };
  }, [filtered]);

  function openEditor(child: ChildRecord) {
    const program = defaultImmunizationProgram(child.ageGroup, child.location);
    const record = child.immunizationRecord
      ? normalizeImmunizationRecord(child.immunizationRecord, program)
      : createBlankImmunizationRecord(program);
    setEditor({ child, record });
    setError("");
  }

  function patchRecord(patch: Partial<ImmunizationRecord>) {
    setEditor((current) => current ? {
      ...current,
      record: { ...current.record, ...patch, updatedAt: new Date().toISOString() },
    } : current);
  }

  function changeProgram(program: ImmunizationRecord["program"]) {
    patchRecord({
      program,
      schoolCheckpoint: program === "TK/K-12" ? editor?.record.schoolCheckpoint ?? "TK/K-12 Admission / Transfer" : "TK/K-12 Admission / Transfer",
      grade: program === "TK/K-12" ? editor?.record.grade ?? "" : "",
    });
  }

  function setConditional(value: boolean) {
    if (!editor) return;
    patchRecord({
      conditionalAdmission: value,
      conditionalReviewDue: value && !editor.record.conditionalReviewDue && editor.record.program === "TK/K-12"
        ? nextThirtyDayReview()
        : value ? editor.record.conditionalReviewDue : "",
    });
  }

  function addDose(key: VaccineFieldKey, value: string) {
    if (!editor || !value) return;
    const next = [...new Set([...(editor.record[key] as string[]), value])].sort();
    patchRecord({ [key]: next } as Partial<ImmunizationRecord>);
  }

  function removeDose(key: VaccineFieldKey, value: string) {
    if (!editor) return;
    patchRecord({ [key]: (editor.record[key] as string[]).filter((item) => item !== value) } as Partial<ImmunizationRecord>);
  }

  async function saveRecord() {
    if (!editor) return;
    if (!editor.child.dateOfBirth) {
      setError("Enter the child's date of birth before evaluating California immunization requirements.");
      return;
    }
    if (editor.record.medicalExemptionType === "Temporary" && !editor.record.medicalExemptionExpiresAt) {
      setError("Enter the expiration date for the temporary medical exemption.");
      return;
    }
    if (editor.record.conditionalAdmission && !editor.record.conditionalReviewDue) {
      setError("Enter the next conditional follow-up date.");
      return;
    }

    const child: ChildRecord = {
      ...editor.child,
      immunizationRecord: {
        ...editor.record,
        verifiedBy: editor.record.verifiedBy || profile?.full_name || "",
        updatedAt: new Date().toISOString(),
      },
    };

    setSaving(true);
    setError("");
    try {
      const payload = await request("POST", { action: "save", child });
      const saved = payload.child as ChildRecord;
      setChildren((current) => current.map((item) => item.id === saved.id ? saved : item));
      setEditor(null);
      setNotice(`${childName(saved)}'s immunization tracker was saved.`);
      window.setTimeout(() => setNotice(""), 4200);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the immunization tracker.");
    } finally {
      setSaving(false);
    }
  }

  if (isEmployee) {
    return <MainLayout><div className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-amber-700" /><h1 className="mt-3 text-2xl font-black text-amber-950">Immunization records are confidential</h1><p className="mt-2 text-sm font-semibold leading-6 text-amber-900">The California immunization tracker is limited to Owner/Admin and assigned Licensee accounts.</p></div></MainLayout>;
  }

  return <MainLayout>
    <div className="mx-auto max-w-[1500px] space-y-6 pb-12">
      <section className="overflow-hidden rounded-[30px] border border-blue-200 bg-gradient-to-br from-[#eef8ff] via-white to-[#f0fff6] p-6 shadow-xl sm:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[.18em] text-blue-700">California Child Care + School Tracking</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Immunization / Shot Record Tracker</h1>
            <p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-slate-600">Track vaccine dates from the child’s verified record and compare them with California CDPH child-care age checkpoints or TK/K–12 entry requirements. The Hub also tracks conditional follow-up and CAIR-ME medical exemption dates.</p>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-white/90 p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">Important</p>
            <p className="mt-1 max-w-sm text-xs font-bold leading-5 text-slate-700">Use dates from an official immunization record. This tracker supports staff review; it does not replace CAIR, SCRL, the Blue Card, or an official medical exemption.</p>
          </div>
        </div>
      </section>

      {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-900">{notice}</div>}
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">{error}</div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Requirements Met" value={summary.met} tone="green" />
        <Metric label="Needs Doses / Record" value={summary.needs} tone="red" />
        <Metric label="Conditional Follow-Up" value={summary.conditional} tone="amber" />
        <Metric label="Medical Exemption" value={summary.exemptions} tone="purple" />
      </section>

      <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-[minmax(0,1fr)_300px]">
        <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search child, guardian, or site…" className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-blue-400" /></label>
        <select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none"><option>All Locations</option>{locations.map((item) => <option key={item.id} value={item.fullName || item.name}>{item.fullName || item.name}</option>)}</select>
      </section>

      {loading ? <div className="flex min-h-72 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-sm font-bold text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading immunization records…</div> :
        filtered.length === 0 ? <div className="grid min-h-72 place-items-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center"><div><Syringe className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-3 text-xl font-black text-slate-800">No child records match this view</h2></div></div> :
        <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((child) => {
            const defaultProgram = defaultImmunizationProgram(child.ageGroup, child.location);
            const record = normalizeImmunizationRecord(child.immunizationRecord, defaultProgram);
            const status = immunizationStatus(child.dateOfBirth, record);
            const requirements = immunizationRequirements(child.dateOfBirth, record);
            const missing = requirements.filter((item) => !item.met);
            return <article key={child.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{child.location}</p><h2 className="mt-1 text-xl font-black text-slate-950">{childName(child)}</h2><p className="mt-1 text-xs font-semibold text-slate-500">DOB {formatDate(child.dateOfBirth)} • {record.program}</p></div>
                <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${statusStyle(status)}`}>{status}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Info label="Record Verified" value={record.verifiedAt ? formatDate(record.verifiedAt) : "Not verified"} />
                <Info label="Missing Requirements" value={String(missing.length)} />
                <Info label="Conditional Review" value={record.conditionalAdmission ? formatDate(record.conditionalReviewDue) : "Not conditional"} />
                <Info label="Medical Exemption" value={record.medicalExemptionType} />
              </div>
              <button onClick={() => openEditor(child)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#245a39] px-4 py-3 text-sm font-black text-white"><FileHeart className="h-4 w-4" /> Open Shot Record</button>
            </article>;
          })}
        </section>}

      {editor && <ImmunizationModal editor={editor} saving={saving} onClose={() => setEditor(null)} onPatch={patchRecord} onProgram={changeProgram} onConditional={setConditional} onAddDose={addDose} onRemoveDose={removeDose} onSave={() => void saveRecord()} />}
    </div>
  </MainLayout>;
}

function ImmunizationModal({
  editor,
  saving,
  onClose,
  onPatch,
  onProgram,
  onConditional,
  onAddDose,
  onRemoveDose,
  onSave,
}: {
  editor: EditorState;
  saving: boolean;
  onClose: () => void;
  onPatch: (patch: Partial<ImmunizationRecord>) => void;
  onProgram: (program: ImmunizationRecord["program"]) => void;
  onConditional: (value: boolean) => void;
  onAddDose: (key: VaccineFieldKey, value: string) => void;
  onRemoveDose: (key: VaccineFieldKey, value: string) => void;
  onSave: () => void;
}) {
  const { child, record } = editor;
  const requirements = immunizationRequirements(child.dateOfBirth, record);
  const status = immunizationStatus(child.dateOfBirth, record);

  return <div className="fixed inset-0 z-[10000] overflow-y-auto bg-slate-950/70 p-2 backdrop-blur-sm sm:p-4">
    <section className="mx-auto my-2 w-full max-w-6xl overflow-hidden rounded-[28px] bg-white shadow-2xl sm:my-6">
      <header className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-blue-200 bg-gradient-to-r from-[#153f2a] to-[#2e6c47] px-5 py-4 text-white">
        <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-100">California Immunization Tracker</p><h2 className="mt-1 text-2xl font-black">{childName(child)}</h2><p className="mt-1 text-xs font-semibold text-white/80">{child.location} • DOB {formatDate(child.dateOfBirth)}</p></div>
        <button onClick={onClose} className="rounded-xl bg-white/10 p-2"><X className="h-5 w-5" /></button>
      </header>

      <div className="space-y-5 p-4 sm:p-6">
        <section className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Requirement Set"><select value={record.program} onChange={(event) => onProgram(event.target.value as ImmunizationRecord["program"])} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold"><option>Child Care / Pre-K</option><option>TK/K-12</option></select></Field>
          {record.program === "TK/K-12" && <Field label="School Checkpoint"><select value={record.schoolCheckpoint} onChange={(event) => onPatch({ schoolCheckpoint: event.target.value as ImmunizationRecord["schoolCheckpoint"] })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold"><option>TK/K-12 Admission / Transfer</option><option>7th Grade Advancement</option></select></Field>}
          {record.program === "TK/K-12" && <Field label="Grade"><input value={record.grade} onChange={(event) => onPatch({ grade: event.target.value })} placeholder="K, 1, 7…" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold" /></Field>}
          <Field label="Current Tracker Status"><div className={`rounded-xl px-3 py-2.5 text-sm font-black ${statusStyle(status)}`}>{status}</div></Field>
        </section>

        <section className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
          <h3 className="font-black text-slate-950">Verified Record</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <Field label="Record Source"><input value={record.recordSource} onChange={(event) => onPatch({ recordSource: event.target.value })} placeholder="CAIR / official immunization record" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold" /></Field>
            <Field label="Date Verified"><input type="date" value={record.verifiedAt} onChange={(event) => onPatch({ verifiedAt: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold" /></Field>
            <Field label="Verified By"><input value={record.verifiedBy} onChange={(event) => onPatch({ verifiedBy: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold" /></Field>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          {vaccineFields.map((field) => <VaccineDates key={field.key} label={field.label} values={record[field.key] as string[]} onAdd={(value) => onAddDose(field.key, value)} onRemove={(value) => onRemoveDose(field.key, value)} />)}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3"><BadgeCheck className="h-5 w-5 text-emerald-700" /><div><h3 className="font-black text-slate-950">California requirement check</h3><p className="text-xs text-slate-500">Based on the selected CDPH checkpoint and the vaccine dates entered above.</p></div></div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {requirements.length === 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">A valid date of birth and applicable age/grade checkpoint are needed before The Hub can evaluate requirements.</div> :
              requirements.map((item) => <div key={item.key} className={`rounded-xl border p-4 ${item.met ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}><div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-slate-950">{item.label}</strong><p className="mt-1 text-xs text-slate-600">Recorded: {item.received} • Required: {item.required}</p>{item.note && <p className="mt-2 text-[10px] leading-4 text-slate-500">{item.note}</p>}</div>{item.met ? <CheckCircle2 className="h-5 w-5 flex-none text-emerald-700" /> : <AlertTriangle className="h-5 w-5 flex-none text-red-700" />}</div></div>)}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4">
            <h3 className="font-black text-purple-950">Medical Exemption</h3>
            <p className="mt-1 text-xs leading-5 text-purple-800">New California medical exemptions for school/child-care entry are issued through CAIR-ME. Do not use this for personal-belief exemptions.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Type"><select value={record.medicalExemptionType} onChange={(event) => onPatch({ medicalExemptionType: event.target.value as ImmunizationRecord["medicalExemptionType"], medicalExemptionExpiresAt: event.target.value === "Temporary" ? record.medicalExemptionExpiresAt : "" })} className="w-full rounded-xl border border-purple-200 bg-white px-3 py-2.5 text-sm font-bold"><option>None</option><option>Permanent</option><option>Temporary</option></select></Field>
              {record.medicalExemptionType === "Temporary" && <Field label="Exemption Expires"><input type="date" value={record.medicalExemptionExpiresAt} onChange={(event) => onPatch({ medicalExemptionExpiresAt: event.target.value })} className="w-full rounded-xl border border-purple-200 bg-white px-3 py-2.5 text-sm font-bold" /></Field>}
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
            <label className="flex items-start gap-3"><input type="checkbox" checked={record.conditionalAdmission} onChange={(event) => onConditional(event.target.checked)} className="mt-1 h-4 w-4 accent-amber-700" /><span><strong className="block text-amber-950">Conditional admission / follow-up</strong><small className="mt-1 block text-xs leading-5 text-amber-800">Use only when the child is legally attending while completing still-needed doses. School conditional records must be reviewed at least every 30 days.</small></span></label>
            {record.conditionalAdmission && <div className="mt-3"><Field label="Next Conditional Follow-Up"><input type="date" value={record.conditionalReviewDue} onChange={(event) => onPatch({ conditionalReviewDue: event.target.value })} className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm font-bold" /></Field></div>}
          </div>
        </section>

        <label className="block rounded-2xl border border-slate-200 bg-white p-4"><span className="text-xs font-black uppercase tracking-wider text-slate-600">Notes</span><textarea value={record.notes} onChange={(event) => onPatch({ notes: event.target.value })} placeholder="Parent follow-up, dose due information, record clarification, CAIR-ME note…" className="mt-2 min-h-24 w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold leading-6" /></label>
      </div>

      <footer className="sticky bottom-0 z-20 flex flex-col gap-3 border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-xs font-semibold text-slate-500">The Hub tracks the record; staff remain responsible for verifying the official immunization documentation and current California rules.</p>
        <div className="flex gap-2"><button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700">Cancel</button><button disabled={saving} onClick={onSave} className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-[#245a39] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Shot Record</button></div>
      </footer>
    </section>
  </div>;
}

function VaccineDates({ label, values, onAdd, onRemove }: { label: string; values: string[]; onAdd: (value: string) => void; onRemove: (value: string) => void }) {
  const [date, setDate] = useState("");
  return <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
    <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Vaccine Series</p><h3 className="font-black text-slate-950">{label}</h3></div><Syringe className="h-5 w-5 text-blue-700" /></div>
    <div className="mt-3 flex gap-2"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold" /><button type="button" disabled={!date} onClick={() => { onAdd(date); setDate(""); }} className="inline-flex items-center gap-1 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Add</button></div>
    <div className="mt-3 flex flex-wrap gap-2">{values.length === 0 ? <span className="text-xs font-semibold text-slate-400">No doses entered</span> : values.map((value, index) => <span key={value} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-700">#{index + 1} {formatDate(value)} <button type="button" onClick={() => onRemove(value)} className="text-red-600"><X className="h-3 w-3" /></button></span>)}</div>
  </section>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "green" | "red" | "amber" | "purple" }) {
  const styles = { green: "bg-emerald-100 text-emerald-800", red: "bg-red-100 text-red-800", amber: "bg-amber-100 text-amber-900", purple: "bg-purple-100 text-purple-800" };
  return <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`grid h-11 w-11 place-items-center rounded-2xl ${styles[tone]}`}><Syringe className="h-5 w-5" /></span><div><strong className="block text-2xl font-black text-slate-950">{value}</strong><small className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</small></div></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><small className="block text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</small><strong className="mt-1 block text-xs text-slate-800">{value}</strong></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>;
}
