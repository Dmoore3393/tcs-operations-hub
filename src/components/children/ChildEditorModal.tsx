"use client";

import type { FamilyRecord } from "@/lib/hub-data";
import {
  locations,
  type AgeGroup,
  type AttendanceStatus,
  type ChildFormState,
  type EnrollmentStatus,
  type LicensingStatus,
} from "@/lib/children";
import { LoaderCircle, X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";

const inputClass = "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-100";

type Props = {
  title: string;
  form: ChildFormState;
  setForm: (form: ChildFormState) => void;
  families: FamilyRecord[];
  familyMode: "existing" | "new";
  setFamilyMode: (mode: "existing" | "new") => void;
  selectedFamilyId: number | "";
  chooseFamily: (value: string) => void;
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export default function ChildEditorModal({
  title,
  form,
  setForm,
  families,
  familyMode,
  setFamilyMode,
  selectedFamilyId,
  chooseFamily,
  saving,
  onClose,
  onSubmit,
}: Props) {
  const lockFamily = familyMode === "existing" && selectedFamilyId !== "";

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 sm:p-5">
    <button aria-label="Close" className="absolute inset-0" onClick={onClose} />
    <section className="relative z-10 max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
        <div><p className="text-xs font-black uppercase tracking-[.16em] text-emerald-700">Secured database record</p><h2 className="mt-1 text-xl font-black text-slate-950">{title}</h2></div>
        <button onClick={onClose} disabled={saving} className="rounded-xl border border-slate-200 p-2 text-slate-600 disabled:opacity-40"><X className="h-4 w-4" /></button>
      </header>

      <form onSubmit={onSubmit} className="space-y-6 p-5 sm:p-6">
        <Section title="Child">
          <Grid>
            <Field label="First name"><input required className={inputClass} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
            <Field label="Last name"><input required className={inputClass} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
            <Field label="Date of birth"><input type="date" className={inputClass} value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} /></Field>
            <Field label="Display age"><input className={inputClass} placeholder="Example: 4 years" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} /></Field>
            <Field label="Age group"><select className={inputClass} value={form.ageGroup} onChange={(e) => setForm({ ...form, ageGroup: e.target.value as AgeGroup })}><option>Infant</option><option>Toddler</option><option>Preschool</option><option>School Age</option></select></Field>
            <Field label="Location"><select className={inputClass} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}>{locations.map((location) => <option key={location}>{location}</option>)}</select></Field>
            <Field label="Classroom"><input className={inputClass} value={form.classroom} onChange={(e) => setForm({ ...form, classroom: e.target.value })} /></Field>
            <Field label="Enrollment status"><select className={inputClass} value={form.enrollmentStatus} onChange={(e) => setForm({ ...form, enrollmentStatus: e.target.value as EnrollmentStatus })}><option>Active</option><option>Pending</option><option>Archived</option></select></Field>
            <Field label="Attendance today"><select className={inputClass} value={form.attendanceToday} onChange={(e) => setForm({ ...form, attendanceToday: e.target.value as AttendanceStatus })}><option>Not Scheduled</option><option>Present</option><option>Absent</option></select></Field>
          </Grid>
        </Section>

        <Section title="Parent / Family" shaded>
          {families.length > 0 && <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-slate-600">Link siblings to an existing family, or create a new family with this child.</p>
            <div className="flex rounded-xl bg-white p-1 text-xs font-black shadow-sm">
              <button type="button" onClick={() => setFamilyMode("existing")} className={`rounded-lg px-3 py-1.5 ${familyMode === "existing" ? "bg-slate-950 text-white" : "text-slate-500"}`}>Existing Family</button>
              <button type="button" onClick={() => setFamilyMode("new")} className={`rounded-lg px-3 py-1.5 ${familyMode === "new" ? "bg-slate-950 text-white" : "text-slate-500"}`}>Create New Family</button>
            </div>
          </div>}

          {familyMode === "existing" && families.length > 0 && <div className="mb-4"><Field label="Choose family"><select className={inputClass} value={selectedFamilyId} onChange={(e) => chooseFamily(e.target.value)}><option value="">Select parent/family…</option>{families.map((family) => <option key={family.id} value={family.id}>{family.familyName} • {family.primaryGuardian}</option>)}</select></Field></div>}

          <Grid>
            <Field label="Family name"><input className={inputClass} disabled={lockFamily} value={form.familyName} onChange={(e) => setForm({ ...form, familyName: e.target.value })} /></Field>
            <Field label="Primary guardian"><input required className={inputClass} disabled={lockFamily} value={form.primaryGuardian} onChange={(e) => setForm({ ...form, primaryGuardian: e.target.value })} /></Field>
            <Field label="Secondary guardian"><input className={inputClass} disabled={lockFamily} value={form.secondaryGuardian} onChange={(e) => setForm({ ...form, secondaryGuardian: e.target.value })} /></Field>
            <Field label="Phone"><input className={inputClass} disabled={lockFamily} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Email"><input type="email" className={inputClass} disabled={lockFamily} value={form.guardianEmail} onChange={(e) => setForm({ ...form, guardianEmail: e.target.value })} /></Field>
            <Field label="Funding"><select className={inputClass} disabled={lockFamily} value={form.subsidy} onChange={(e) => setForm({ ...form, subsidy: e.target.value })}><option>Private Pay</option><option>CCRC</option><option>CCRC Stage 1</option><option>CCRC Stage 2</option><option>CCCC</option><option>DCFS</option><option>Respite</option></select></Field>
          </Grid>
        </Section>

        <Section title="Care & Safety">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Weekly schedule"><textarea className={`${inputClass} min-h-24`} value={form.weeklySchedule} onChange={(e) => setForm({ ...form, weeklySchedule: e.target.value })} /></Field>
            <Field label="Transportation"><textarea className={`${inputClass} min-h-24`} value={form.transportation} onChange={(e) => setForm({ ...form, transportation: e.target.value })} /></Field>
            <Field label="Allergies / medical alerts"><textarea className={`${inputClass} min-h-24`} value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} /></Field>
            <Field label="Medical / support notes"><textarea className={`${inputClass} min-h-24`} value={form.medicalNotes} onChange={(e) => setForm({ ...form, medicalNotes: e.target.value })} /></Field>
            <Field label="Licensing status"><select className={inputClass} value={form.licensingStatus} onChange={(e) => setForm({ ...form, licensingStatus: e.target.value as LicensingStatus })}><option>Complete</option><option>Missing Documents</option></select></Field>
            {form.licensingStatus === "Missing Documents" && <Field label="Missing documents (comma separated)"><input className={inputClass} value={form.missingDocuments} onChange={(e) => setForm({ ...form, missingDocuments: e.target.value })} /></Field>}
          </div>
        </Section>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-5">
          <button type="button" disabled={saving} onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-40">Cancel</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving && <LoaderCircle className="h-4 w-4 animate-spin" />} Save Child Securely</button>
        </div>
      </form>
    </section>
  </div>;
}

function Section({ title, shaded = false, children }: { title: string; shaded?: boolean; children: ReactNode }) {
  return <section className={shaded ? "rounded-2xl bg-slate-50 p-4" : ""}><h3 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-500">{title}</h3>{children}</section>;
}
function Grid({ children }: { children: ReactNode }) { return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label><span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>; }
