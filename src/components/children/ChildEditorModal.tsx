"use client";

import type { FamilyRecord } from "@/lib/hub-data";
import {
  deriveChildAgeProfile,
  fundingSources,
  locations,
  type AgeGroup,
  type AttendanceStatus,
  type ChildFormState,
  type EnrollmentStatus,
  type LicensingStatus,
} from "@/lib/children";
import {
  Baby,
  HeartPulse,
  LoaderCircle,
  MapPin,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

const inputClass =
  "w-full rounded-xl border border-[#d7c9ad] bg-white px-3.5 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#5f7b50] focus:ring-4 focus:ring-[#dfe9d8] disabled:bg-[#f4f1ea] disabled:text-slate-500";

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

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const modal = (
    <div className="fixed inset-0 z-[9999] bg-[#102417]/75 p-2 backdrop-blur-sm sm:p-4 lg:p-6">
      <button aria-label="Close child form" className="absolute inset-0" onClick={onClose} />

      <section className="relative z-10 mx-auto flex h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-[#b79b70] bg-[#f8f3e5] shadow-[0_32px_90px_rgba(7,24,12,.45)] sm:h-[calc(100dvh-2rem)] lg:h-[calc(100dvh-3rem)]">
        <header className="shrink-0 border-b border-[#d8cdb1] bg-gradient-to-r from-[#294d31] via-[#3f663f] to-[#6f8751] px-4 py-4 text-white sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[.2em] text-[#dce8cb]">Children Center • Secure Record</p>
              <h2 className="mt-1 truncate text-xl font-black sm:text-2xl">{title}</h2>
              <p className="mt-1 hidden text-sm text-white/75 sm:block">Complete the child, family, and care information below. You can scroll each section without losing the Save button.</p>
            </div>
            <button type="button" onClick={onClose} disabled={saving} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-40">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5 lg:px-6">
            <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
              <aside className="hidden self-start rounded-2xl border border-[#d8cdb1] bg-[#efe8d5] p-4 xl:block">
                <p className="text-xs font-black uppercase tracking-[.18em] text-[#6a7758]">Record Sections</p>
                <div className="mt-4 space-y-2">
                  <SectionNav icon={<Baby className="h-4 w-4" />} title="Child" note="Identity, age & location" />
                  <SectionNav icon={<UsersRound className="h-4 w-4" />} title="Parent / Family" note="Guardians & funding" />
                  <SectionNav icon={<HeartPulse className="h-4 w-4" />} title="Care & Safety" note="Schedule, alerts & notes" />
                  <SectionNav icon={<ShieldCheck className="h-4 w-4" />} title="File Status" note="Licensing documents" />
                </div>
                <div className="mt-5 rounded-xl bg-[#385b39] p-3 text-xs leading-5 text-[#f6f1df]">
                  🌿 Child information is saved to the secured Hub database, not into the public website code.
                </div>
              </aside>

              <div className="space-y-4">
                <SectionCard icon={<Baby className="h-5 w-5" />} title="Child Information" subtitle="Basic child record and enrollment details">
                  <div className="mb-4 rounded-xl border border-[#cbd9bd] bg-[#edf4e8] px-3 py-2 text-xs font-bold text-[#466047]">🌿 Enter the date of birth and The Hub will automatically calculate the child’s current age, age group, and room.</div>
                  <Grid>
                    <Field label="First name"><input required className={inputClass} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
                    <Field label="Last name"><input required className={inputClass} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
                    <Field label="Date of birth"><input required type="date" className={inputClass} value={form.dateOfBirth} onChange={(e) => {
                      const dateOfBirth = e.target.value;
                      const profile = deriveChildAgeProfile(dateOfBirth);
                      setForm({
                        ...form,
                        dateOfBirth,
                        age: profile?.age ?? "",
                        ageGroup: profile?.ageGroup ?? "Infant",
                        classroom: profile?.classroom ?? "Infant Room",
                      });
                    }} /></Field>
                    <Field label="Current age"><input readOnly className={inputClass} placeholder="Calculated from date of birth" value={form.age} /></Field>
                    <Field label="Age group"><select disabled className={inputClass} value={form.ageGroup} onChange={(e) => setForm({ ...form, ageGroup: e.target.value as AgeGroup })}><option>Infant</option><option>Toddler</option><option>Preschool</option><option>School Age</option></select></Field>
                    <Field label="Location"><select className={inputClass} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}>{locations.map((location) => <option key={location}>{location}</option>)}</select></Field>
                    <Field label="Classroom"><input readOnly className={inputClass} value={form.classroom} /></Field>
                    <Field label="Enrollment status"><select className={inputClass} value={form.enrollmentStatus} onChange={(e) => setForm({ ...form, enrollmentStatus: e.target.value as EnrollmentStatus })}><option>Active</option><option>Pending</option><option>Archived</option></select></Field>
                    <Field label="Attendance today"><select className={inputClass} value={form.attendanceToday} onChange={(e) => setForm({ ...form, attendanceToday: e.target.value as AttendanceStatus })}><option>Not Scheduled</option><option>Present</option><option>Absent</option></select></Field>
                  </Grid>
                </SectionCard>

                <SectionCard icon={<UsersRound className="h-5 w-5" />} title="Parent / Family" subtitle="Link siblings to one family account or create a new family">
                  {families.length > 0 && <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-[#ddd1b8] bg-[#f7f2e7] p-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-semibold text-[#5b6653]">Choose whether this child belongs to an existing family.</p>
                    <div className="flex shrink-0 rounded-xl bg-white p-1 text-xs font-black shadow-sm">
                      <button type="button" onClick={() => setFamilyMode("existing")} className={`rounded-lg px-3 py-2 ${familyMode === "existing" ? "bg-[#355b3a] text-white" : "text-slate-500"}`}>Existing Family</button>
                      <button type="button" onClick={() => setFamilyMode("new")} className={`rounded-lg px-3 py-2 ${familyMode === "new" ? "bg-[#355b3a] text-white" : "text-slate-500"}`}>Create New Family</button>
                    </div>
                  </div>}

                  {familyMode === "existing" && families.length > 0 && <div className="mb-4"><Field label="Choose family"><select className={inputClass} value={selectedFamilyId} onChange={(e) => chooseFamily(e.target.value)}><option value="">Select parent/family…</option>{families.map((family) => <option key={family.id} value={family.id}>{family.familyName} • {family.primaryGuardian}</option>)}</select></Field></div>}

                  <Grid>
                    <Field label="Family name"><input className={inputClass} disabled={lockFamily} value={form.familyName} onChange={(e) => setForm({ ...form, familyName: e.target.value })} /></Field>
                    <Field label="Primary guardian"><input required className={inputClass} disabled={lockFamily} value={form.primaryGuardian} onChange={(e) => setForm({ ...form, primaryGuardian: e.target.value })} /></Field>
                    <Field label="Secondary guardian"><input className={inputClass} disabled={lockFamily} value={form.secondaryGuardian} onChange={(e) => setForm({ ...form, secondaryGuardian: e.target.value })} /></Field>
                    <Field label="Phone"><input className={inputClass} disabled={lockFamily} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
                    <Field label="Email"><input type="email" className={inputClass} disabled={lockFamily} value={form.guardianEmail} onChange={(e) => setForm({ ...form, guardianEmail: e.target.value })} /></Field>
                    <Field label="Funding"><select required className={inputClass} disabled={lockFamily} value={form.subsidy} onChange={(e) => setForm({ ...form, subsidy: e.target.value })}><option value="">Choose funding source…</option>{form.subsidy === "CCRC" && <option value="CCRC" disabled>CCRC — choose Stage 1 or Stage 2</option>}{fundingSources.map((source) => <option key={source}>{source}</option>)}</select></Field>
                  </Grid>
                </SectionCard>

                <SectionCard icon={<HeartPulse className="h-5 w-5" />} title="Care & Safety" subtitle="Daily schedule, transportation, allergies, and support information">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Field label="Weekly schedule"><textarea className={`${inputClass} min-h-28 resize-y`} placeholder="Example: Mon–Fri 6:00 AM–6:00 PM" value={form.weeklySchedule} onChange={(e) => setForm({ ...form, weeklySchedule: e.target.value })} /></Field>
                    <Field label="Transportation"><textarea className={`${inputClass} min-h-28 resize-y`} placeholder="School, pickup/drop-off, booster or harness notes" value={form.transportation} onChange={(e) => setForm({ ...form, transportation: e.target.value })} /></Field>
                    <Field label="Allergies / medical alerts"><textarea className={`${inputClass} min-h-28 resize-y`} placeholder="Enter None reported if there are no known allergies" value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} /></Field>
                    <Field label="Medical / support notes"><textarea className={`${inputClass} min-h-28 resize-y`} placeholder="Supports, accommodations, emergency or care notes" value={form.medicalNotes} onChange={(e) => setForm({ ...form, medicalNotes: e.target.value })} /></Field>
                  </div>
                </SectionCard>

                <SectionCard icon={<ShieldCheck className="h-5 w-5" />} title="Child File Status" subtitle="Track licensing documents that still need follow-up">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Field label="Licensing status"><select className={inputClass} value={form.licensingStatus} onChange={(e) => setForm({ ...form, licensingStatus: e.target.value as LicensingStatus })}><option>Complete</option><option>Missing Documents</option></select></Field>
                    {form.licensingStatus === "Missing Documents" && <Field label="Missing documents"><input className={inputClass} placeholder="Separate documents with commas" value={form.missingDocuments} onChange={(e) => setForm({ ...form, missingDocuments: e.target.value })} /></Field>}
                  </div>
                </SectionCard>
              </div>
            </div>
          </div>

          <footer className="shrink-0 border-t border-[#d8cdb1] bg-[#fffdf7]/98 px-3 py-3 shadow-[0_-10px_24px_rgba(60,52,38,.08)] backdrop-blur sm:px-6">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="hidden text-xs font-semibold text-[#74806a] md:block"><MapPin className="mr-1 inline h-3.5 w-3.5" />Make sure the selected location is correct before saving.</p>
              <div className="flex w-full gap-2 sm:w-auto">
                <button type="button" disabled={saving} onClick={onClose} className="flex-1 rounded-xl border border-[#cdbfa3] bg-white px-4 py-3 text-sm font-black text-slate-700 disabled:opacity-40 sm:flex-none">Cancel</button>
                <button type="submit" disabled={saving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#355b3a] px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-950/10 transition hover:bg-[#294c31] disabled:opacity-50 sm:flex-none">{saving && <LoaderCircle className="h-4 w-4 animate-spin" />} Save Child Securely</button>
              </div>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}

function SectionCard({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-[#d8cdb1] bg-[#fffdf7] p-4 shadow-sm sm:p-5">
    <div className="mb-4 flex items-start gap-3 border-b border-[#eee5d3] pb-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e4ecd9] text-[#355b3a]">{icon}</span>
      <div><h3 className="text-base font-black text-[#263923]">{title}</h3><p className="mt-0.5 text-xs font-semibold text-[#7a806f]">{subtitle}</p></div>
    </div>
    {children}
  </section>;
}

function SectionNav({ icon, title, note }: { icon: ReactNode; title: string; note: string }) {
  return <div className="flex items-start gap-2 rounded-xl bg-white/70 p-3">
    <span className="mt-0.5 text-[#426245]">{icon}</span>
    <div><p className="text-sm font-black text-[#314531]">{title}</p><p className="text-[11px] text-[#7c826f]">{note}</p></div>
  </div>;
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[11px] font-black uppercase tracking-[.12em] text-[#65705d]">{label}</span>{children}</label>;
}
