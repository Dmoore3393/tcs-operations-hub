"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  emptyTeamTrainingCompletions,
  emptyTeamTrainings,
  emptyTeamXpLedger,
  type TeamStoreLocation,
  type TeamTraining,
  type TeamTrainingCompletion,
  type TeamXpLedgerEntry,
} from "@/lib/team-store";
import { Award, CheckCircle2, Clock3, ExternalLink, FileCheck2, LoaderCircle, Plus, ShieldCheck, Upload, X } from "lucide-react";
import { useMemo, useState } from "react";

const trainingAdminNames = new Set(["danielle moore", "jennifer thomason", "heather graham"]);

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDate(value: string) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function isOnTime(training: TeamTraining, completedAt: string) {
  if (!training.dueDate) return true;
  return completedAt.slice(0, 10) <= training.dueDate;
}

export default function TrainingCenterPage() {
  const { profile, user, session, isSystemOwner } = useAuth();
  const { location, availableLocations } = useHubLocation();
  const [trainings, setTrainings] = usePersistentState<TeamTraining[]>("tcs-team-trainings-v1", emptyTeamTrainings);
  const [completions, setCompletions] = usePersistentState<TeamTrainingCompletion[]>("tcs-team-training-completions-v1", emptyTeamTrainingCompletions);
  const [ledger, setLedger] = usePersistentState<TeamXpLedgerEntry[]>("tcs-team-xp-ledger-v1", emptyTeamXpLedger);

  const staffName = profile?.full_name || profile?.email || user?.email || "TCS Staff";
  const staffEmail = (profile?.email || user?.email || "").toLowerCase();
  const staffUserId = profile?.user_id || user?.id || staffEmail;
  const canManageTrainings = isSystemOwner || trainingAdminNames.has((profile?.full_name || "").trim().toLowerCase());
  const staffLocations = useMemo(() => (profile?.locations ?? []).filter((item): item is TeamStoreLocation => item !== "All Locations"), [profile?.locations]);
  const fallbackLocation = (location !== "All Locations" ? location : staffLocations[0] ?? availableLocations.find((item) => item !== "All Locations") ?? "Halcom") as TeamStoreLocation;

  const [selectedTraining, setSelectedTraining] = useState<TeamTraining | null>(null);
  const [certificate, setCertificate] = useState<File | null>(null);
  const [completionNote, setCompletionNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [adminMode, setAdminMode] = useState(false);
  const [trainingTitle, setTrainingTitle] = useState("");
  const [trainingProvider, setTrainingProvider] = useState("");
  const [trainingUrl, setTrainingUrl] = useState("");
  const [trainingDescription, setTrainingDescription] = useState("");
  const [trainingDue, setTrainingDue] = useState("");
  const [trainingLocations, setTrainingLocations] = useState<TeamStoreLocation[]>([fallbackLocation]);
  const [trainingRoles, setTrainingRoles] = useState("");
  const [trainingEmails, setTrainingEmails] = useState("");
  const [baseXp, setBaseXp] = useState(50);
  const [bonusXp, setBonusXp] = useState(20);
  const [lateXp, setLateXp] = useState(25);
  const [requiresProof, setRequiresProof] = useState(true);
  const [verificationRequired, setVerificationRequired] = useState(true);

  const assignedTrainings = useMemo(() => trainings.filter((training) => {
    if (!training.active) return false;
    const profileHasAll = (profile?.locations ?? []).includes("All Locations");
    const locationMatch = training.locations.length === 0 || profileHasAll || training.locations.some((item) => staffLocations.includes(item));
    const roleMatch = training.roles.length === 0 || training.roles.some((role) => role.toLowerCase() === (profile?.role || "").toLowerCase());
    const emailMatch = training.assignedEmails.length === 0 || training.assignedEmails.some((email) => email.toLowerCase() === staffEmail);
    return locationMatch && roleMatch && emailMatch;
  }), [profile?.locations, profile?.role, staffEmail, staffLocations, trainings]);

  const myCompletions = completions.filter((item) => item.userId === staffUserId || item.staffEmail.toLowerCase() === staffEmail);
  const pendingVerification = completions.filter((item) => item.status === "Submitted");
  const currentXp = ledger.filter((item) => item.userId === staffUserId || item.staffEmail.toLowerCase() === staffEmail).reduce((sum, item) => sum + item.amount, 0);

  function completionFor(trainingId: string) {
    return myCompletions.find((item) => item.trainingId === trainingId && item.status !== "Rejected");
  }

  function trainingLocation(training: TeamTraining) {
    if (location !== "All Locations" && training.locations.includes(location as TeamStoreLocation)) return location as TeamStoreLocation;
    return training.locations.find((item) => staffLocations.includes(item)) ?? training.locations[0] ?? fallbackLocation;
  }

  function addTrainingXp(completion: TeamTrainingCompletion, training: TeamTraining) {
    if (ledger.some((entry) => entry.referenceId === completion.id && entry.amount > 0)) return;
    const entries: TeamXpLedgerEntry[] = [];
    const onTime = isOnTime(training, completion.completedAt);
    const now = new Date().toISOString();
    if (onTime) {
      if (training.baseXp > 0) entries.push({ id: makeId("xp"), userId: completion.userId, staffEmail: completion.staffEmail, staffName: completion.staffName, location: completion.location, amount: training.baseXp, type: "Training XP", reason: `Completed ${training.title}`, createdAt: now, referenceId: completion.id });
      if (training.onTimeBonusXp > 0) entries.push({ id: makeId("xp"), userId: completion.userId, staffEmail: completion.staffEmail, staffName: completion.staffName, location: completion.location, amount: training.onTimeBonusXp, type: "On-Time Bonus", reason: `On-time bonus: ${training.title}`, createdAt: now, referenceId: completion.id });
    } else if (training.lateXp > 0) {
      entries.push({ id: makeId("xp"), userId: completion.userId, staffEmail: completion.staffEmail, staffName: completion.staffName, location: completion.location, amount: training.lateXp, type: "Late Training XP", reason: `Late completion: ${training.title}`, createdAt: now, referenceId: completion.id });
    }
    if (entries.length) setLedger((current) => [...current, ...entries]);
    const awarded = entries.reduce((sum, entry) => sum + entry.amount, 0);
    setCompletions((current) => current.map((item) => item.id === completion.id ? { ...item, xpAwarded: awarded } : item));
  }

  async function submitCompletion() {
    if (!selectedTraining || !session?.access_token) return;
    if (selectedTraining.requiresProof && !certificate) {
      setNotice("Upload your certificate or proof before submitting this training.");
      return;
    }
    if (completionFor(selectedTraining.id)) {
      setNotice("You already have a completion submitted for this training.");
      return;
    }

    setUploading(true);
    setNotice("");
    try {
      let proofId: string | undefined;
      let proofName: string | undefined;
      if (certificate) {
        const form = new FormData();
        form.set("file", certificate);
        form.set("location", trainingLocation(selectedTraining));
        form.set("trainingId", selectedTraining.id);
        const response = await fetch("/api/training-certificates", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: form,
        });
        const payload = await response.json() as { error?: string; proofId?: string; proofName?: string };
        if (!response.ok || !payload.proofId) throw new Error(payload.error || "Certificate upload failed.");
        proofId = payload.proofId;
        proofName = payload.proofName;
      }

      const now = new Date().toISOString();
      const completion: TeamTrainingCompletion = {
        id: makeId("training-completion"),
        trainingId: selectedTraining.id,
        userId: staffUserId,
        staffEmail,
        staffName,
        location: trainingLocation(selectedTraining),
        status: selectedTraining.verificationRequired ? "Submitted" : "Verified",
        completedAt: now,
        proofName,
        proofUrl: proofId,
        note: completionNote.trim() || undefined,
        reviewedAt: selectedTraining.verificationRequired ? undefined : now,
        reviewedBy: selectedTraining.verificationRequired ? undefined : "Auto-verified",
        xpAwarded: 0,
      };
      setCompletions((current) => [...current, completion]);
      if (!selectedTraining.verificationRequired) addTrainingXp(completion, selectedTraining);
      setSelectedTraining(null);
      setCertificate(null);
      setCompletionNote("");
      setNotice(selectedTraining.verificationRequired ? "Certificate uploaded. Your completion is waiting for verification." : "Training completed and XP awarded!");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not submit this training.");
    } finally {
      setUploading(false);
    }
  }

  async function viewCertificate(proofId?: string) {
    if (!proofId || !session?.access_token) return;
    try {
      const response = await fetch(`/api/training-certificates/${proofId}/download`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "Could not open certificate.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not open certificate.");
    }
  }

  function reviewCompletion(completion: TeamTrainingCompletion, approved: boolean) {
    if (!canManageTrainings) return;
    const training = trainings.find((item) => item.id === completion.trainingId);
    if (!training) return;
    const updated: TeamTrainingCompletion = { ...completion, status: approved ? "Verified" : "Rejected", reviewedAt: new Date().toISOString(), reviewedBy: staffName };
    setCompletions((current) => current.map((item) => item.id === completion.id ? updated : item));
    if (approved) addTrainingXp(updated, training);
    setNotice(approved ? `${completion.staffName}'s completion was verified and XP was awarded.` : `${completion.staffName}'s completion was rejected.`);
  }

  function saveTraining() {
    if (!canManageTrainings || !trainingTitle.trim()) return;
    const record: TeamTraining = {
      id: makeId("training"),
      title: trainingTitle.trim(),
      provider: trainingProvider.trim(),
      externalUrl: trainingUrl.trim(),
      description: trainingDescription.trim(),
      instructions: "Complete the assigned training and return to the Training Center to upload your certificate/proof.",
      locations: trainingLocations,
      roles: trainingRoles.split(",").map((item) => item.trim()).filter(Boolean),
      assignedEmails: trainingEmails.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean),
      dueDate: trainingDue,
      recurring: false,
      requiresProof,
      verificationRequired,
      baseXp: Math.max(0, baseXp),
      onTimeBonusXp: Math.max(0, bonusXp),
      lateXp: Math.max(0, lateXp),
      active: true,
      createdBy: staffName,
      createdAt: new Date().toISOString(),
    };
    setTrainings((current) => [...current, record]);
    setAdminMode(false);
    setTrainingTitle(""); setTrainingProvider(""); setTrainingUrl(""); setTrainingDescription(""); setTrainingDue(""); setTrainingRoles(""); setTrainingEmails("");
    setNotice("Training assignment created.");
  }

  return <MainLayout><div className="mx-auto max-w-[1450px] space-y-6">
    {notice && <div className="flex items-center justify-between rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-900"><span>{notice}</span><button onClick={() => setNotice("")}><X className="h-4 w-4" /></button></div>}

    <section className="overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,#07131d,#123842)] p-7 text-white shadow-xl sm:p-9">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
        <div><p className="text-xs font-black uppercase tracking-[0.3em] text-[#35e2d2]">TCS Learning + Rewards</p><h1 className="mt-2 text-4xl font-black sm:text-6xl">Training Center</h1><p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-300">Open assigned trainings, complete them with the approved provider, upload your certificate here, and earn XP after verification.</p></div>
        <div className="grid min-w-[260px] grid-cols-2 gap-3"><div className="rounded-2xl bg-white/10 p-4"><p className="text-xs font-black uppercase text-slate-300">My XP</p><p className="mt-1 text-3xl font-black text-[#35e2d2]">{currentXp}</p></div><div className="rounded-2xl bg-white/10 p-4"><p className="text-xs font-black uppercase text-slate-300">Assigned</p><p className="mt-1 text-3xl font-black">{assignedTrainings.length}</p></div></div>
      </div>
    </section>

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {assignedTrainings.map((training) => {
        const completion = completionFor(training.id);
        const potential = training.baseXp + training.onTimeBonusXp;
        return <article key={training.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-teal-700"><Award className="h-6 w-6" /></div><span className={`rounded-full px-3 py-1 text-xs font-black ${completion?.status === "Verified" ? "bg-emerald-100 text-emerald-700" : completion?.status === "Submitted" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{completion?.status ?? "Not Started"}</span></div>
          <h2 className="mt-4 text-xl font-black text-slate-950">{training.title}</h2><p className="mt-1 text-sm font-bold text-slate-500">{training.provider || "TCS Training"}</p>
          <p className="mt-3 text-sm leading-6 text-slate-600">{training.description || "Complete this assigned training and upload proof when finished."}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold"><div className="rounded-xl bg-slate-50 p-3"><Clock3 className="mb-1 h-4 w-4" />Due {formatDate(training.dueDate)}</div><div className="rounded-xl bg-amber-50 p-3 text-amber-800"><Award className="mb-1 h-4 w-4" />Up to {potential} XP</div></div>
          <div className="mt-4 flex flex-wrap gap-2">{training.externalUrl && <a href={training.externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">Open Training <ExternalLink className="h-4 w-4" /></a>}{!completion && <button onClick={() => setSelectedTraining(training)} className="inline-flex items-center gap-2 rounded-xl bg-[#35e2d2] px-4 py-2.5 text-sm font-black text-[#07131d]"><Upload className="h-4 w-4" />Upload Certificate</button>}{completion?.proofUrl && <button onClick={() => void viewCertificate(completion.proofUrl)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black">View Certificate</button>}</div>
        </article>;
      })}
      {!assignedTrainings.length && <div className="md:col-span-2 xl:col-span-3 rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" /><h2 className="mt-3 text-xl font-black">No trainings assigned right now</h2><p className="mt-1 text-sm text-slate-500">New assignments will appear here automatically.</p></div>}
    </section>

    {canManageTrainings && <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-teal-700">Training Admin</p><h2 className="text-2xl font-black">Verification Queue</h2><p className="text-sm text-slate-500">Review uploaded certificates before XP is awarded when verification is required.</p></div><button onClick={() => setAdminMode(true)} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white"><Plus className="mr-1 inline h-4 w-4" />Add Training</button></div>
      <div className="mt-5 space-y-3">{pendingVerification.map((completion) => { const training = trainings.find((item) => item.id === completion.trainingId); return <div key={completion.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 lg:flex-row lg:items-center"><div className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-700"><FileCheck2 className="h-5 w-5" /></div><div className="flex-1"><p className="font-black">{completion.staffName} — {training?.title ?? "Training"}</p><p className="text-xs text-slate-500">Submitted {new Date(completion.completedAt).toLocaleString()} • {completion.proofName || "No file"}</p></div><div className="flex flex-wrap gap-2">{completion.proofUrl && <button onClick={() => void viewCertificate(completion.proofUrl)} className="rounded-xl border px-3 py-2 text-xs font-black">View Certificate</button>}<button onClick={() => reviewCompletion(completion, true)} className="rounded-xl bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-800">Verify + Award XP</button><button onClick={() => reviewCompletion(completion, false)} className="rounded-xl bg-rose-100 px-3 py-2 text-xs font-black text-rose-800">Reject</button></div></div>; })}{!pendingVerification.length && <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">No certificates are waiting for verification.</p>}</div>
    </section>}

    {selectedTraining && <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/65 p-4"><section className="relative w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl"><button onClick={() => { setSelectedTraining(null); setCertificate(null); setCompletionNote(""); }} className="absolute right-4 top-4 rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button><p className="text-xs font-black uppercase tracking-wider text-teal-700">Complete Training</p><h2 className="mt-1 text-2xl font-black">{selectedTraining.title}</h2><p className="mt-2 text-sm text-slate-500">Upload your actual certificate or proof here. It is encrypted before private storage.</p><label className="mt-5 block text-sm font-black">Certificate / proof {selectedTraining.requiresProof && <span className="text-rose-600">*</span>}<input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic,image/heif" onChange={(event) => setCertificate(event.target.files?.[0] ?? null)} className="mt-2 block w-full rounded-xl border border-slate-200 p-3 text-sm" /></label><label className="mt-4 block text-sm font-black">Completion note (optional)<textarea value={completionNote} onChange={(event) => setCompletionNote(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 p-3" /></label><div className="mt-4 rounded-xl bg-teal-50 p-3 text-xs font-bold text-teal-900"><ShieldCheck className="mr-1 inline h-4 w-4" />Certificate files are encrypted and are not stored as public links.</div><button disabled={uploading || (selectedTraining.requiresProof && !certificate)} onClick={() => void submitCompletion()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#35e2d2] py-3 font-black text-[#07131d] disabled:bg-slate-200">{uploading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}Submit Completion</button></section></div>}

    {adminMode && canManageTrainings && <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/65 p-4"><section className="relative my-6 w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl"><button onClick={() => setAdminMode(false)} className="absolute right-4 top-4 rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button><p className="text-xs font-black uppercase tracking-wider text-teal-700">Training Admin</p><h2 className="text-2xl font-black">Create Training Assignment</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Training title"><input value={trainingTitle} onChange={(e) => setTrainingTitle(e.target.value)} className="input" /></Field><Field label="Provider / company"><input value={trainingProvider} onChange={(e) => setTrainingProvider(e.target.value)} className="input" /></Field><Field label="External training URL"><input value={trainingUrl} onChange={(e) => setTrainingUrl(e.target.value)} className="input" /></Field><Field label="Due date"><input type="date" value={trainingDue} onChange={(e) => setTrainingDue(e.target.value)} className="input" /></Field><label className="sm:col-span-2 text-sm font-black">Description<textarea value={trainingDescription} onChange={(e) => setTrainingDescription(e.target.value)} className="input min-h-24" /></label><label className="sm:col-span-2 text-sm font-black">Locations<div className="mt-2 flex flex-wrap gap-2">{availableLocations.filter((item) => item !== "All Locations").map((item) => <button key={item} type="button" onClick={() => setTrainingLocations((current) => current.includes(item as TeamStoreLocation) ? current.filter((value) => value !== item) : [...current, item as TeamStoreLocation])} className={`rounded-full px-3 py-2 text-xs font-black ${trainingLocations.includes(item as TeamStoreLocation) ? "bg-slate-950 text-white" : "bg-slate-100"}`}>{item}</button>)}</div></label><Field label="Roles (comma separated)"><input value={trainingRoles} onChange={(e) => setTrainingRoles(e.target.value)} placeholder="Employee, Teacher" className="input" /></Field><Field label="Specific staff emails (comma separated)"><input value={trainingEmails} onChange={(e) => setTrainingEmails(e.target.value)} className="input" /></Field><Field label="Base XP"><input type="number" min="0" value={baseXp} onChange={(e) => setBaseXp(Number(e.target.value))} className="input" /></Field><Field label="On-time bonus XP"><input type="number" min="0" value={bonusXp} onChange={(e) => setBonusXp(Number(e.target.value))} className="input" /></Field><Field label="Late completion XP"><input type="number" min="0" value={lateXp} onChange={(e) => setLateXp(Number(e.target.value))} className="input" /></Field><div className="space-y-2 self-end"><label className="flex items-center gap-2 text-sm font-black"><input type="checkbox" checked={requiresProof} onChange={(e) => setRequiresProof(e.target.checked)} />Certificate/proof required</label><label className="flex items-center gap-2 text-sm font-black"><input type="checkbox" checked={verificationRequired} onChange={(e) => setVerificationRequired(e.target.checked)} />Verification required before XP</label></div></div><button onClick={saveTraining} disabled={!trainingTitle.trim() || trainingLocations.length === 0} className="mt-6 w-full rounded-xl bg-slate-950 py-3 font-black text-white disabled:bg-slate-300">Create Training</button></section></div>}

    <style jsx>{`.input{margin-top:.4rem;width:100%;border:1px solid #dbe3e7;border-radius:.75rem;padding:.75rem;outline:none}.input:focus{border-color:#35e2d2}`}</style>
  </div></MainLayout>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-sm font-black">{label}{children}</label>;
}
