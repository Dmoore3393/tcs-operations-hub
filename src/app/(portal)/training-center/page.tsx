"use client";

import "./training-center-v2.css";
import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import { TcsKidsScene } from "@/components/brand/TcsKidsScene";
import { canAccessRoute, useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  emptyTeamTrainingCompletions,
  emptyTeamTrainings,
  emptyTeamXpLedger,
  type TeamStoreLocation,
  type TeamTraining,
  type TeamTrainingCompletion,
  type TeamTrainingDelivery,
  type TeamXpLedgerEntry,
} from "@/lib/team-store";
import {
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileText,
  Home,
  Link2,
  LoaderCircle,
  MapPin,
  Play,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trophy,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { canManageTraining, isTrainingAssigned } from "@/lib/training-access";
import { trainingFileDetails } from "@/lib/training-files";
import { uploadTrainingAsset } from "@/lib/training-upload";
import { hubRequest } from "@/lib/hub-request";

type CenterView = "Dashboard" | "My Trainings" | "Learning Paths" | "Certificates" | "Leaderboards" | "Achievements" | "Manage" | "Reports";
type Filter = "All Trainings" | "Required" | "My Assignments" | "In Progress" | "Completed" | "Due Soon";

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function formatDate(value: string) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "TS";
}
function isOnTime(training: TeamTraining, completedAt: string) {
  return !training.dueDate || completedAt.slice(0, 10) <= training.dueDate;
}
function delivery(training: TeamTraining): TeamTrainingDelivery {
  if (training.deliveryType) return training.deliveryType;
  if (training.contentId || training.contentAssetId) return "Uploaded Content";
  if (training.lessonContent) return "In-House";
  return "External Link";
}
function deliveryLabel(training: TeamTraining) {
  const type = delivery(training);
  if (type === "Uploaded Content" && training.contentMimeType === "video/mp4") return "Video Training";
  if (type === "Uploaded Content") return training.contentName?.toLowerCase().endsWith(".pptx") || training.contentName?.toLowerCase().endsWith(".ppt") ? "PowerPoint" : "Uploaded Training";
  if (type === "In-House") return "Custom Training";
  return "External Link";
}
function coverEmoji(training: TeamTraining) {
  const text = `${training.title} ${training.description}`.toLowerCase();
  if (text.includes("food") || text.includes("handler")) return "🥗";
  if (text.includes("transport") || text.includes("driver")) return "🚌";
  if (text.includes("behavior") || text.includes("guidance")) return "🤝";
  if (text.includes("emergency") || text.includes("safety")) return "🛡️";
  if (text.includes("title 22") || text.includes("licens")) return "📘";
  if (text.includes("communication")) return "💬";
  return delivery(training) === "Uploaded Content" ? "📊" : delivery(training) === "In-House" ? "🎓" : "🔗";
}
function dayStreak(completions: TeamTrainingCompletion[]) {
  const days = [...new Set(completions.filter((item) => item.status === "Verified").map((item) => item.completedAt.slice(0, 10)))].sort().reverse();
  if (!days.length) return 0;
  const cursor = new Date();
  const today = cursor.toISOString().slice(0, 10);
  cursor.setDate(cursor.getDate() - 1);
  const yesterday = cursor.toISOString().slice(0, 10);
  if (days[0] !== today && days[0] !== yesterday) return 0;
  let count = 0;
  let expected = new Date(`${days[0]}T12:00:00`);
  for (const day of days) {
    if (day !== expected.toISOString().slice(0, 10)) break;
    count += 1;
    expected.setDate(expected.getDate() - 1);
  }
  return count;
}

export default function TrainingCenterPage() {
  const { profile, user, session } = useAuth();
  const { location, setLocation, availableLocations } = useHubLocation();
  const [trainings, setTrainings] = usePersistentState<TeamTraining[]>("tcs-team-trainings-v1", emptyTeamTrainings);
  const [completions, setCompletions] = usePersistentState<TeamTrainingCompletion[]>("tcs-team-training-completions-v1", emptyTeamTrainingCompletions);
  const [ledger, setLedger] = usePersistentState<TeamXpLedgerEntry[]>("tcs-team-xp-ledger-v1", emptyTeamXpLedger);

  const staffName = profile?.full_name || profile?.email || user?.email || "TCS Staff";
  const staffEmail = (profile?.email || user?.email || "").toLowerCase();
  const staffUserId = profile?.user_id || user?.id || staffEmail;
  const canManageTrainings = Boolean(profile && canManageTraining(profile));
  const staffLocations = useMemo(() => (profile?.locations ?? []).filter((item): item is TeamStoreLocation => item !== "All Locations"), [profile?.locations]);
  const storeLocations = useMemo(() => availableLocations.filter((item): item is TeamStoreLocation => item !== "All Locations"), [availableLocations]);
  const fallbackLocation = (location !== "All Locations" ? location : staffLocations[0] ?? storeLocations[0] ?? "Halcom") as TeamStoreLocation;

  const [view, setView] = useState<CenterView>("Dashboard");
  const [filter, setFilter] = useState<Filter>("All Trainings");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedTraining, setSelectedTraining] = useState<TeamTraining | null>(null);
  const [lessonTraining, setLessonTraining] = useState<TeamTraining | null>(null);
  const [certificate, setCertificate] = useState<File | null>(null);
  const [completionNote, setCompletionNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [savingTraining, setSavingTraining] = useState(false);

  const [trainingTitle, setTrainingTitle] = useState("");
  const [trainingProvider, setTrainingProvider] = useState("TCS / The Hub");
  const [deliveryType, setDeliveryType] = useState<TeamTrainingDelivery>("In-House");
  const [trainingUrl, setTrainingUrl] = useState("");
  const [trainingFile, setTrainingFile] = useState<File | null>(null);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [allStaff, setAllStaff] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<{ label: string; percent: number } | null>(null);
  const [mediaTraining, setMediaTraining] = useState<{ training: TeamTraining; url: string; mimeType: string } | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [lessonContent, setLessonContent] = useState("");
  const [trainingDescription, setTrainingDescription] = useState("");
  const [trainingInstructions, setTrainingInstructions] = useState("");
  const [trainingDue, setTrainingDue] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [trainingLocations, setTrainingLocations] = useState<TeamStoreLocation[]>([fallbackLocation]);
  const [trainingRoles, setTrainingRoles] = useState("");
  const [trainingEmails, setTrainingEmails] = useState("");
  const [includeLeadership, setIncludeLeadership] = useState(true);
  const [recurring, setRecurring] = useState(false);
  const [renewalMonths, setRenewalMonths] = useState(12);
  const [baseXp, setBaseXp] = useState(100);
  const [bonusXp, setBonusXp] = useState(25);
  const [lateXp, setLateXp] = useState(50);
  const [requiresProof, setRequiresProof] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(true);

  if (!canAccessRoute(profile, "/training-center")) {
    return <main className="grid min-h-screen place-items-center bg-[#06251f] p-6"><section className="max-w-lg rounded-3xl bg-white p-8 text-center shadow-2xl"><h1 className="text-2xl font-black">Training Center access is not available</h1><p className="mt-3 text-slate-600">Ask a TCS Owner/Admin if your account should be able to use the Training Center.</p><Link href="/" className="mt-5 inline-flex rounded-xl bg-slate-950 px-5 py-3 font-black text-white">Return to Hub</Link></section></main>;
  }

  const assignedTrainings = trainings.filter(training => {
    if (!profile || !isTrainingAssigned(training, { ...profile, email: staffEmail })) return false;
    return training.allStaff || location === "All Locations" || !training.locations.length || training.locations.includes(location as TeamStoreLocation);
  });

  const myCompletions = completions.filter((item) => item.userId === staffUserId || item.staffEmail.toLowerCase() === staffEmail);
  const verifiedMine = myCompletions.filter((item) => item.status === "Verified");
  const pendingMine = myCompletions.filter((item) => item.status === "Submitted");
  const pendingVerification = completions.filter((item) => item.status === "Submitted");
  const myLedger = ledger.filter((item) => item.userId === staffUserId || item.staffEmail.toLowerCase() === staffEmail);
  const currentXp = myLedger.reduce((sum, item) => sum + item.amount, 0);
  const lifetimeXp = myLedger.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0);
  const level = Math.max(1, Math.floor(lifetimeXp / 500) + 1);
  const levelProgress = lifetimeXp % 500;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const completedThisMonth = verifiedMine.filter((item) => item.completedAt.slice(0, 7) === currentMonth).length;
  const streak = dayStreak(myCompletions);

  function completionFor(trainingId: string) {
    return myCompletions.find((item) => item.trainingId === trainingId && item.status !== "Rejected");
  }
  function trainingLocation(training: TeamTraining) {
    if (location !== "All Locations" && training.locations.includes(location as TeamStoreLocation)) return location as TeamStoreLocation;
    return training.locations.find((item) => staffLocations.includes(item)) ?? training.locations[0] ?? fallbackLocation;
  }
  function isDueSoon(training: TeamTraining) {
    if (!training.dueDate) return false;
    const due = new Date(`${training.dueDate}T12:00:00`).getTime();
    const now = Date.now();
    return due >= now && due - now <= 14 * 86400000;
  }

  const filteredTrainings = assignedTrainings.filter((training) => {
    const completion = completionFor(training.id);
    const searchMatch = !search.trim() || `${training.title} ${training.provider} ${training.description}`.toLowerCase().includes(search.trim().toLowerCase());
    if (!searchMatch) return false;
    if (filter === "Completed") return completion?.status === "Verified";
    if (filter === "In Progress") return completion?.status === "Submitted";
    if (filter === "Due Soon") return !completion && isDueSoon(training);
    return true;
  });

  const leaderboard = useMemo(() => {
    const totals = new Map<string, { name: string; xp: number }>();
    ledger.filter((entry) => entry.amount > 0).forEach((entry) => {
      const key = entry.userId || entry.staffEmail.toLowerCase();
      const row = totals.get(key) ?? { name: entry.staffName || entry.staffEmail, xp: 0 };
      row.xp += entry.amount;
      totals.set(key, row);
    });
    return [...totals.values()].sort((a, b) => b.xp - a.xp);
  }, [ledger]);

  const learningTarget = Math.max(8, assignedTrainings.length);
  const learningPct = Math.min(100, Math.round((verifiedMine.length / learningTarget) * 100));
  const badgeData = [
    { icon: "⏱", name: "On-Time", note: "Complete by due date", earned: verifiedMine.some((completion) => { const t = trainings.find((item) => item.id === completion.trainingId); return t ? isOnTime(t, completion.completedAt) : false; }) },
    { icon: "✚", name: "Safety Pro", note: "Complete safety training", earned: verifiedMine.some((completion) => trainings.find((item) => item.id === completion.trainingId)?.title.toLowerCase().includes("safety")) },
    { icon: "🔥", name: "Learning Streak", note: "Keep learning", earned: streak >= 2 || verifiedMine.length >= 5 },
  ];

  async function recordTrainingPerformance(completion: TeamTrainingCompletion, training: TeamTraining) {
    if (!session?.access_token) return;
    try {
      await fetch("/api/staff-performance", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recordType: "training_verified",
          completionId: completion.id,
          staffUserId: completion.userId,
          locationName: completion.location || trainingLocation(training),
          trainingTitle: training.title,
          completedAt: completion.completedAt,
        }),
      });
    } catch {
      // Training completion and XP remain authoritative even if recognition sync is temporarily unavailable.
    }
  }

  function addTrainingXp(completion: TeamTrainingCompletion, training: TeamTraining) {
    if (ledger.some((entry) => entry.referenceId === completion.id && entry.amount > 0)) return;
    const entries: TeamXpLedgerEntry[] = [];
    const onTime = isOnTime(training, completion.completedAt);
    const now = new Date().toISOString();
    if (onTime) {
      if (training.baseXp > 0) entries.push({ id: makeId("xp"), userId: completion.userId, staffEmail: completion.staffEmail, staffName: completion.staffName, location: completion.location, amount: training.baseXp, type: "Training XP", reason: `Completed ${training.title}`, createdAt: now, referenceId: completion.id });
      if (training.onTimeBonusXp > 0) entries.push({ id: makeId("xp"), userId: completion.userId, staffEmail: completion.staffEmail, staffName: completion.staffName, location: completion.location, amount: training.onTimeBonusXp, type: "On-Time Bonus", reason: `On-time bonus: ${training.title}`, createdAt: now, referenceId: completion.id });
    } else if (training.lateXp > 0) entries.push({ id: makeId("xp"), userId: completion.userId, staffEmail: completion.staffEmail, staffName: completion.staffName, location: completion.location, amount: training.lateXp, type: "Late Training XP", reason: `Late completion: ${training.title}`, createdAt: now, referenceId: completion.id });
    if (entries.length) setLedger((current) => [...current, ...entries]);
    setCompletions((current) => current.map((item) => item.id === completion.id ? { ...item, xpAwarded: entries.reduce((sum, entry) => sum + entry.amount, 0) } : item));
  }

  async function openTrainingContent(training: TeamTraining) {
    if (!session?.access_token) return;
    if (delivery(training) === "External Link") {
      if (!training.externalUrl) return setNotice("This training does not have an external link yet.");
      window.open(training.externalUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (delivery(training) === "In-House") {
      setLessonTraining(training);
      return;
    }
    if (training.contentAssetId) {
      try {
        const asset = await hubRequest<{ url: string; mimeType: string }>(`/api/training-assets/${training.contentAssetId}`, session.access_token);
        if (asset.mimeType === "video/mp4" || asset.mimeType === "application/pdf") {
          setMediaError(""); setMediaTraining({ training, ...asset });
        } else {
          const anchor = document.createElement("a"); anchor.href = asset.url; anchor.download = training.contentName || "training-file"; anchor.click();
        }
      } catch (error) { setNotice(error instanceof Error ? error.message : "Could not open training content."); }
      return;
    }
    if (!training.contentId) return setNotice("The uploaded training file is not available.");
    try {
      const response = await fetch(`/api/training-content/${training.contentId}/download`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) { const payload = await response.json().catch(() => ({})) as { error?: string }; throw new Error(payload.error || "Could not open training content."); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (training.contentMimeType === "application/pdf") window.open(url, "_blank", "noopener,noreferrer");
      else { const anchor = document.createElement("a"); anchor.href = url; anchor.download = training.contentName || "training-file"; anchor.click(); }
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not open training content."); }
  }

  async function submitCompletion() {
    if (!selectedTraining || !session?.access_token) return;
    if (selectedTraining.requiresProof && !selectedTraining.certificateAssetId && !certificate) return setNotice("Upload your certificate or proof before submitting this training.");
    if (completionFor(selectedTraining.id)) return setNotice("You already have a completion submitted for this training.");
    setUploading(true); setNotice("");
    try {
      let proofId: string | undefined; let proofName: string | undefined;
      if (certificate) {
        const form = new FormData(); form.set("file", certificate); form.set("location", trainingLocation(selectedTraining)); form.set("trainingId", selectedTraining.id);
        const response = await fetch("/api/training-certificates", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: form });
        const payload = await response.json() as { error?: string; proofId?: string; proofName?: string };
        if (!response.ok || !payload.proofId) throw new Error(payload.error || "Certificate upload failed.");
        proofId = payload.proofId; proofName = payload.proofName;
      }
      const now = new Date().toISOString();
      const completion: TeamTrainingCompletion = { id: makeId("training-completion"), trainingId: selectedTraining.id, userId: staffUserId, staffEmail, staffName, location: trainingLocation(selectedTraining), status: selectedTraining.verificationRequired ? "Submitted" : "Verified", completedAt: now, proofName, proofUrl: proofId, note: completionNote.trim() || undefined, reviewedAt: selectedTraining.verificationRequired ? undefined : now, reviewedBy: selectedTraining.verificationRequired ? undefined : "Auto-verified", xpAwarded: 0 };
      setCompletions((current) => [...current, completion]);
      if (!selectedTraining.verificationRequired) {
        addTrainingXp(completion, selectedTraining);
        void recordTrainingPerformance(completion, selectedTraining);
      }
      setSelectedTraining(null); setCertificate(null); setCompletionNote("");
      setNotice(selectedTraining.verificationRequired ? "Completion submitted for verification." : "Training completed and XP awarded!");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not submit training completion."); }
    finally { setUploading(false); }
  }

  async function downloadTrainingCertificate(training: TeamTraining) {
    if (!training.certificateAssetId || !session?.access_token) return;
    try {
      const asset = await hubRequest<{ url: string }>(`/api/training-assets/${training.certificateAssetId}`, session.access_token);
      const anchor = document.createElement("a"); anchor.href = asset.url; anchor.download = training.certificateName || "training-certificate"; anchor.click();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not download the certificate."); }
  }

  async function viewCertificate(proofId?: string) {
    if (!proofId || !session?.access_token) return;
    try {
      const response = await fetch(`/api/training-certificates/${proofId}/download`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) { const payload = await response.json().catch(() => ({})) as { error?: string }; throw new Error(payload.error || "Could not open certificate."); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); window.open(url, "_blank", "noopener,noreferrer"); window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not open certificate."); }
  }

  function reviewCompletion(completion: TeamTrainingCompletion, approved: boolean) {
    if (!canManageTrainings) return;
    const training = trainings.find((item) => item.id === completion.trainingId); if (!training) return;
    const updated: TeamTrainingCompletion = { ...completion, status: approved ? "Verified" : "Rejected", reviewedAt: new Date().toISOString(), reviewedBy: staffName };
    setCompletions((current) => current.map((item) => item.id === completion.id ? updated : item));
    if (approved) {
      addTrainingXp(updated, training);
      void recordTrainingPerformance(updated, training);
    }
    setNotice(approved ? `${completion.staffName}'s completion was verified, XP was awarded, and the recognition record was synced.` : `${completion.staffName}'s completion was rejected.`);
  }

  function resetCreate(mode: TeamTrainingDelivery = "In-House") {
    setCertificateFile(null); setAllStaff(true); setUploadProgress(null); setNotice("");
    setDeliveryType(mode); setTrainingTitle(""); setTrainingProvider(mode === "External Link" ? "" : "TCS / The Hub"); setTrainingUrl(""); setTrainingFile(null); setLessonContent(""); setTrainingDescription(""); setTrainingInstructions(""); setTrainingDue(""); setDurationMinutes(30); setTrainingLocations([fallbackLocation]); setTrainingRoles(""); setTrainingEmails(""); setIncludeLeadership(true); setRecurring(false); setRenewalMonths(12); setBaseXp(100); setBonusXp(25); setLateXp(50); setRequiresProof(mode === "External Link"); setVerificationRequired(true); setShowCreate(true);
  }
  function toggleTrainingLocation(item: TeamStoreLocation) {
    setTrainingLocations((current) => current.includes(item) ? current.filter((locationItem) => locationItem !== item) : [...current, item]);
  }

  async function saveTraining() {
    if (!canManageTrainings || !session?.access_token || !trainingTitle.trim()) return;
    if (!allStaff && trainingLocations.length === 0) return setNotice("Choose at least one location for this training.");
    if (deliveryType === "External Link" && !trainingUrl.trim()) return setNotice("Add the training link.");
    if (deliveryType === "Uploaded Content" && !trainingFile) return setNotice("Choose an MP4 video, PowerPoint, or PDF training file.");
    if (deliveryType === "In-House" && !lessonContent.trim()) return setNotice("Add the lesson/content for this in-house training.");
    setSavingTraining(true); setNotice("");
    try {
      const id = makeId("training");
      let contentAssetId: string | undefined, contentName: string | undefined, contentMimeType: string | undefined;
      let certificateAssetId: string | undefined, certificateName: string | undefined;
      // Validate both files before starting either upload.
      if (deliveryType === "Uploaded Content" && trainingFile) trainingFileDetails("content", trainingFile.name, trainingFile.size, trainingFile.type);
      if (certificateFile) trainingFileDetails("certificate", certificateFile.name, certificateFile.size, certificateFile.type);
      if (deliveryType === "Uploaded Content" && trainingFile) {
        setUploadProgress({ label: "Uploading training", percent: 0 });
        const asset = await uploadTrainingAsset(trainingFile, "content", id, session.access_token, percent => setUploadProgress({ label: "Uploading training", percent }));
        contentAssetId = asset.assetId; contentName = asset.name; contentMimeType = asset.mimeType;
      }
      if (certificateFile) {
        setUploadProgress({ label: "Uploading certificate", percent: 0 });
        const asset = await uploadTrainingAsset(certificateFile, "certificate", id, session.access_token, percent => setUploadProgress({ label: "Uploading certificate", percent }));
        certificateAssetId = asset.assetId; certificateName = asset.name;
      }
      const record: TeamTraining = {
        id, title: trainingTitle.trim(), provider: trainingProvider.trim() || "TCS / The Hub", externalUrl: deliveryType === "External Link" ? trainingUrl.trim() : "", description: trainingDescription.trim(), instructions: trainingInstructions.trim() || "Complete the training, then return here to submit completion/proof.", allStaff, locations: allStaff ? [] : trainingLocations, roles: (allStaff ? "" : trainingRoles).split(",").map((item) => item.trim()).filter(Boolean), assignedEmails: (allStaff ? "" : trainingEmails).split(",").map((item) => item.trim().toLowerCase()).filter(Boolean), dueDate: trainingDue, recurring, renewalMonths: recurring ? Math.max(1, renewalMonths) : undefined, requiresProof: certificateAssetId ? false : requiresProof, verificationRequired, baseXp: Math.max(0, baseXp), onTimeBonusXp: Math.max(0, bonusXp), lateXp: Math.max(0, lateXp), active: true, createdBy: staffName, createdAt: new Date().toISOString(), deliveryType, contentAssetId, contentName, contentMimeType, certificateAssetId, certificateName, lessonContent: deliveryType === "In-House" ? lessonContent.trim() : undefined, includeLeadership: allStaff || includeLeadership, durationMinutes: Math.max(1, durationMinutes),
      };
      setTrainings((current) => [...current, record]); setShowCreate(false); setNotice(`“${record.title}” was created and assigned${allStaff ? " to everyone, including leadership" : " to the selected staff"}.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not create the training."); }
    finally { setSavingTraining(false); setUploadProgress(null); }
  }

  const navItems: Array<{ label: CenterView; icon: React.ReactNode }> = [
    { label: "Dashboard", icon: <Home /> },
    { label: "My Trainings", icon: <Award /> },
    { label: "Learning Paths", icon: <BookOpen /> },
    { label: "Certificates", icon: <FileCheck2 /> },
    { label: "Leaderboards", icon: <BarChart3 /> },
    { label: "Achievements", icon: <Trophy /> },
    ...(canManageTrainings ? [
      { label: "Manage" as CenterView, icon: <Users /> },
      { label: "Reports" as CenterView, icon: <BarChart3 /> },
    ] : []),
  ];

  function renderTrainingGrid() {
    return <>
      <div className="tc-filters">
        {(["All Trainings", "Required", "My Assignments", "In Progress", "Completed", "Due Soon"] as Filter[]).map((item) => <button key={item} onClick={() => setFilter(item)} className={`tc-filter ${filter === item ? "active" : ""}`}>{item}</button>)}
        <span className="tc-filter-spacer" /><select className="tc-sort"><option>Due Date (Soonest)</option><option>Newest</option><option>Highest XP</option></select>
      </div>
      <div className="tc-heading"><div><h2>Available Trainings</h2><p>Build your knowledge. Make a bigger tomorrow.</p></div><button onClick={() => setFilter("All Trainings")}>Showing {filteredTrainings.length} of {assignedTrainings.length}</button></div>
      <section className="tc-grid">
        {filteredTrainings.length === 0 && <div className="tc-empty"><div><BookOpen size={44} /><h3>No trainings match this view yet.</h3><p>{canManageTrainings ? "Use Create Training to add the first assignment." : "Assigned trainings will appear here."}</p></div></div>}
        {filteredTrainings.map((training) => {
          const completion = completionFor(training.id); const type = delivery(training); const pct = completion?.status === "Verified" ? 100 : completion?.status === "Submitted" ? 75 : 0;
          return <article className="tc-card" key={training.id}>
            <div className={`tc-card-cover ${type === "External Link" ? "link" : type === "Uploaded Content" ? "upload" : "house"}`}><span className="tc-type">{deliveryLabel(training)}{training.recurring ? " • Recurring" : ""}</span><span className="tc-card-art">{coverEmoji(training)}</span></div>
            <div className="tc-card-body"><h3>{training.title}</h3><p className="tc-provider">{training.provider || "TCS / The Hub"}</p><div className="tc-meta"><span><MapPin size={13} />{training.locations.length ? training.locations.join(", ") : "All locations"}</span><span><Clock3 size={13} />{training.durationMinutes ?? 30} min</span><span><FileText size={13} />Due {formatDate(training.dueDate)}</span></div><div className="tc-xp"><span>🪙</span><strong>{training.baseXp} XP</strong>{training.onTimeBonusXp > 0 && <b>+{training.onTimeBonusXp} XP on-time</b>}</div><div className="tc-progress"><span style={{ width: `${pct}%` }} /></div><div className="tc-card-actions">{completion?.status === "Verified" ? <button className="tc-primary" disabled><CheckCircle2 size={15} />Completed</button> : <><button className="tc-primary" onClick={() => void openTrainingContent(training)}><Play size={14} />{completion ? "Continue" : "Start Training"}</button><button className="tc-secondary" onClick={() => setSelectedTraining(training)}><Upload size={14} />Complete</button></>}{completion?.status === "Verified" && <button className="tc-secondary" onClick={() => void openTrainingContent(training)}><Play size={14}/>Review Training</button>}{training.certificateAssetId && completion?.status === "Verified" && <button className="tc-secondary" onClick={() => void downloadTrainingCertificate(training)}><FileCheck2 size={14}/>Download Certificate</button>}{training.certificateAssetId && completion?.status === "Submitted" && <small>Certificate available after verification.</small>}{training.externalUrl && type === "External Link" && <button className="tc-secondary" onClick={() => window.open(training.externalUrl, "_blank", "noopener,noreferrer")}><ExternalLink size={14} /></button>}</div></div>
          </article>;
        })}
      </section>
    </>;
  }

  function renderCertificates() {
    const rows = canManageTrainings ? completions : myCompletions;
    return <section className="tc-panel"><div className="tc-panel-title"><strong>Certificates & Proof of Completion</strong><span>{rows.length} submissions</span></div><div className="tc-pending">{rows.length === 0 && <p>No certificate submissions yet.</p>}{rows.slice().sort((a,b)=>b.completedAt.localeCompare(a.completedAt)).map((completion) => { const training = trainings.find((item) => item.id === completion.trainingId); return <div className="tc-pending-row" key={completion.id}><div><strong>{completion.staffName}</strong><div>{training?.title ?? "Training"}</div></div><div>{completion.proofName ? <button className="tc-secondary" onClick={() => void viewCertificate(completion.proofUrl)}>View {completion.proofName}</button> : training?.certificateAssetId ? (completion.status === "Verified" ? <button className="tc-secondary" onClick={() => void downloadTrainingCertificate(training)}>Download Certificate</button> : <span>Certificate available after verification</span>) : <span>No certificate required</span>}</div><div><b>{completion.status}</b>{canManageTrainings && completion.status === "Submitted" && <><button className="tc-approve" onClick={() => reviewCompletion(completion,true)}>Verify</button><button className="tc-reject" onClick={() => reviewCompletion(completion,false)}>Reject</button></>}</div></div>; })}</div></section>;
  }

  function renderCenterBody() {
    if (view === "Certificates") return renderCertificates();
    if (view === "Leaderboards") return <section className="tc-panel"><div className="tc-panel-title"><strong>Team Leaderboard</strong><span>This reflects earned training XP.</span></div>{leaderboard.length === 0 ? <p>No XP has been earned yet.</p> : leaderboard.map((row,index)=><div className="tc-leader" key={`${row.name}-${index}`}><span className="tc-rank">{index+1}</span><span className="tc-leader-avatar">{initials(row.name)}</span><strong>{row.name}</strong><b>{row.xp.toLocaleString()} XP</b></div>)}</section>;
    if (view === "Achievements") return <section className="tc-panel"><div className="tc-panel-title"><strong>Badges & Achievements</strong></div><div className="tc-badges">{badgeData.map((badge)=><div className="tc-badge" key={badge.name} style={{opacity:badge.earned?1:.35}}><div className="tc-badge-icon">{badge.icon}</div><b>{badge.name}</b><small><span translate="no" className="contents">{badge.earned?"Earned":badge.note}</span></small></div>)}</div></section>;
    if (view === "Learning Paths") return <section className="tc-panel"><div className="tc-panel-title"><strong>TCS Core Learning Path</strong></div><div className="tc-learning"><strong>Strong Teams • Safe Care • Better Operations</strong><small>{verifiedMine.length} of {learningTarget} trainings completed</small><div className="tc-learning-row"><div className="tc-stat-bar"><span style={{width:`${learningPct}%`}}/></div><b>{learningPct}%</b></div><button onClick={()=>{setView("My Trainings");setFilter("All Trainings")}}>Continue Training →</button></div></section>;
    if (view === "Reports") return <section className="tc-panel"><div className="tc-panel-title"><strong>Training Reports</strong></div><div className="tc-progress-grid"><div className="tc-stat"><span>Active Trainings</span><strong>{trainings.filter(t=>t.active).length}</strong></div><div className="tc-stat"><span>Pending Verification</span><strong>{pendingVerification.length}</strong></div><div className="tc-stat"><span>Verified Completions</span><strong>{completions.filter(c=>c.status==="Verified").length}</strong></div><div className="tc-stat"><span>XP Awarded</span><strong>{ledger.filter(l=>l.amount>0).reduce((s,l)=>s+l.amount,0)}</strong></div></div></section>;
    if (view === "Manage") return <><section className="tc-panel"><div className="tc-panel-title"><strong>Manage Training Assignments</strong><button onClick={()=>resetCreate("In-House")}>+ Create Training</button></div>{trainings.length===0?<p>No trainings yet.</p>:trainings.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(training=><div className="tc-pending-row" key={training.id}><div><strong>{training.title}</strong><div>{deliveryLabel(training)} • {training.allStaff ? "Everyone — all locations" : training.locations.join(", ")}</div></div><div>{training.includeLeadership??true?"Leadership required":"Leadership excluded"}</div><div><button className={training.active?"tc-approve":"tc-secondary"} onClick={()=>setTrainings(current=>current.map(item=>item.id===training.id?{...item,active:!item.active}:item))}>{training.active?"Active":"Inactive"}</button></div></div>)}</section>{pendingVerification.length>0&&renderCertificates()}</>;
    return renderTrainingGrid();
  }

  return <MainLayout><div className="tc-shell">
    <div className="tc-main">
      <section className="tc-app-head">
        <div className="tc-app-head-row">
          <Link href="/" className="tc-back-home"><Home size={17}/> Hub Home</Link>
          <div className="tc-app-title">
            <span>THE HUB</span>
            <strong>Team Training Center</strong>
            <small>Learn • complete • earn XP • grow</small>
          </div>
          {canManageTrainings && <button className="tc-create-mobile" onClick={()=>resetCreate("In-House")}><Plus size={16}/> Create</button>}
        </div>

        <div className="tc-training-tools">
          <label className="tc-search"><Search/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search trainings..."/></label>
          <label className="tc-location"><MapPin/><select value={location} onChange={(e)=>setLocation(e.target.value as TeamStoreLocation | "All Locations")} disabled={availableLocations.length===1}>{availableLocations.map(item=><option key={item}>{item}</option>)}</select></label>
        </div>

        <nav className="tc-view-nav" aria-label="Training Center sections">
          {navItems.map((item)=><button key={item.label} className={view===item.label?"active":""} onClick={()=>setView(item.label)}>{item.icon}<span>{item.label}</span></button>)}
        </nav>
      </section>

      <div className="tc-content">{notice&&<div className="tc-notice"><span>{notice}</span><button onClick={()=>setNotice("")}><X size={16}/></button></div>}<div className="tc-layout"><div><section className="tc-hero"><div className="tc-hero-kids"><TcsKidsScene variant="school" compact /></div><div className="tc-hero-copy"><span>THE</span><strong>HUB</strong><em>TEAM TRAINING CENTER</em><small>CREATE TRAININGS • ASSIGN LEARNING • TRACK PROGRESS • EARN XP</small></div><div className="tc-hero-note">INVEST<br/>IN PEOPLE<br/><span>BUILD<br/>POSSIBILITIES</span></div></section>{renderCenterBody()}{(view==="Dashboard"||view==="My Trainings")&&<div className="tc-bottom">{canManageTrainings&&<section className="tc-admin-actions"><div className="tc-panel-title"><strong>⚙ Admin Quick Actions</strong><button onClick={()=>setView("Manage")}>Go to Admin Tools →</button></div><div className="tc-admin-grid"><button onClick={()=>resetCreate("In-House")}><Sparkles/>Create New Training</button><button onClick={()=>resetCreate("Uploaded Content")}><Upload/>Upload Video / PDF / PowerPoint</button><button onClick={()=>resetCreate("External Link")}><Link2/>Add External Link</button><button onClick={()=>setView("Manage")}><Users/>Manage Assignments</button><button onClick={()=>setView("Certificates")}><FileCheck2/>Verify Certificates</button><button onClick={()=>setView("Reports")}><BarChart3/>View Reports</button></div></section>}<section className="tc-certs"><div className="tc-panel-title"><strong>📄 Certificates & Proof of Completion</strong><button onClick={()=>setView("Certificates")}>View All →</button></div><div className="tc-cert-drop"><Upload size={27}/><div>Upload earned certificates when submitting completion. Certificates supplied with a training appear here after verification.</div><small>PDF, PNG, JPG, HEIC</small></div>{myCompletions.slice(-3).reverse().map(c=><div className="tc-cert-row" key={c.id}><span>{c.proofName||"Completion record"}</span><b>{c.status}</b></div>)}</section></div>}</div>

        <aside className="tc-right"><section className="tc-panel"><div className="tc-panel-title"><strong>My Progress</strong><Link href="/team-store">View Team Store →</Link></div><div className="tc-progress-grid"><div className="tc-stat"><span>XP Balance</span><strong>{currentXp.toLocaleString()} XP</strong></div><div className="tc-stat"><span>Level {level}</span><strong>{levelProgress} / 500 XP</strong><div className="tc-stat-bar"><span style={{width:`${Math.min(100,(levelProgress/500)*100)}%`}}/></div></div><div className="tc-stat"><span>Day Streak</span><strong>🔥 {streak}</strong></div><div className="tc-stat"><span>Completed This Month</span><strong>{completedThisMonth}</strong></div><div className="tc-stat wide"><span>Total Completed</span><strong>{verifiedMine.length}</strong></div></div></section>
          <section className="tc-panel"><div className="tc-panel-title"><strong>Badges Earned</strong><button onClick={()=>setView("Achievements")}>View All →</button></div><div className="tc-badges">{badgeData.map(badge=><div className="tc-badge" key={badge.name} style={{opacity:badge.earned?1:.35}}><div className="tc-badge-icon">{badge.icon}</div><b>{badge.name}</b><small><span translate="no" className="contents">{badge.earned?"Earned":badge.note}</span></small></div>)}</div></section>
          <section className="tc-panel"><div className="tc-panel-title"><strong>Current Learning Path</strong><button onClick={()=>setView("Learning Paths")}>View All Paths →</button></div><div className="tc-learning"><strong>TCS Core Team Path</strong><small>{verifiedMine.length} of {learningTarget} trainings completed</small><div className="tc-learning-row"><div className="tc-stat-bar"><span style={{width:`${learningPct}%`}}/></div><b>{learningPct}%</b></div><button onClick={()=>setView("My Trainings")}>Continue Training →</button></div></section>
          <section className="tc-panel"><div className="tc-panel-title"><strong>Leaderboard</strong><button onClick={()=>setView("Leaderboards")}>View All →</button></div>{leaderboard.slice(0,5).map((row,index)=><div className="tc-leader" key={`${row.name}-${index}`}><span className="tc-rank">{index+1}</span><span className="tc-leader-avatar">{initials(row.name)}</span><strong>{row.name}</strong><b>{row.xp.toLocaleString()} XP</b></div>)}{leaderboard.length===0&&<p>No XP earned yet.</p>}</section>
        </aside></div></div></div>

    {selectedTraining&&<div className="tc-modal-backdrop"><section className="tc-modal"><button className="tc-close" onClick={()=>{setSelectedTraining(null);setCertificate(null)}}><X/></button><h2>Complete {selectedTraining.title}</h2><p>{selectedTraining.instructions||"Complete the training and submit your completion here."}</p><div className="tc-form-grid">{selectedTraining.certificateAssetId&&<p className="tc-field full">Your certificate will be available {selectedTraining.verificationRequired ? "after an administrator verifies your completion" : "after you submit completion"}. No certificate upload is needed.</p>}{selectedTraining.requiresProof&&!selectedTraining.certificateAssetId&&<label className="tc-field full">Certificate / proof file<input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif" onChange={(e)=>setCertificate(e.target.files?.[0]??null)}/></label>}<label className="tc-field full">Completion notes (optional)<textarea value={completionNote} onChange={(e)=>setCompletionNote(e.target.value)} placeholder="Anything the reviewer should know..."/></label></div><div className="tc-modal-actions"><button className="tc-cancel" onClick={()=>setSelectedTraining(null)}>Cancel</button><button className="tc-save" disabled={uploading} onClick={()=>void submitCompletion()}>{uploading?<LoaderCircle className="animate-spin"/>:<CheckCircle2/>} Submit Completion</button></div></section></div>}

    {lessonTraining&&<div className="tc-modal-backdrop"><section className="tc-modal"><button className="tc-close" onClick={()=>setLessonTraining(null)}><X/></button><h2>{lessonTraining.title}</h2><p><strong>{lessonTraining.provider}</strong> • About {lessonTraining.durationMinutes??30} minutes</p><div className="tc-lesson">{lessonTraining.lessonContent||lessonTraining.description||"Training content will be added by an administrator."}</div><div className="tc-modal-actions"><button className="tc-cancel" onClick={()=>setLessonTraining(null)}>Close</button><button className="tc-save" onClick={()=>{setLessonTraining(null);setSelectedTraining(lessonTraining)}}><CheckCircle2/> I Finished This Training</button></div></section></div>}

    {mediaTraining && <div className="tc-modal-backdrop"><section className="tc-modal" role="dialog" aria-modal="true" aria-labelledby="training-player-title">
      <button className="tc-close" aria-label="Close training" onClick={() => setMediaTraining(null)}><X/></button>
      <h2 id="training-player-title">{mediaTraining.training.title}</h2>
      <p>{mediaTraining.training.instructions || "Watch or read the training, then submit your completion."}</p>
      {mediaTraining.mimeType === "video/mp4" ? <video className="tc-training-video" key={mediaTraining.url} src={mediaTraining.url} controls playsInline preload="metadata" onError={() => setMediaError("This video could not play. Try reopening it. MP4 files encoded with H.264 video and AAC audio work best.")} /> : <iframe className="tc-training-document" src={mediaTraining.url} title={mediaTraining.training.title}/>}
      {mediaError && <p role="alert">{mediaError}</p>}
      <div className="tc-modal-actions"><button className="tc-cancel" onClick={() => setMediaTraining(null)}>Close</button>{!completionFor(mediaTraining.training.id) && <button className="tc-save" onClick={() => { setSelectedTraining(mediaTraining.training); setMediaTraining(null); setCertificate(null); setNotice(""); }}><CheckCircle2/> I Finished This Training</button>}</div>
    </section></div>}

    {showCreate && canManageTrainings && <div className="tc-modal-backdrop"><section className="tc-modal" role="dialog" aria-modal="true" aria-labelledby="create-training-title">
      <button className="tc-close" aria-label="Close create training" disabled={savingTraining} onClick={() => setShowCreate(false)}><X/></button>
      <h2 id="create-training-title">Create Training</h2>
      <p>Add your welcome video, a document, an external link, or an in-house lesson. Attach a certificate for staff to download after completion.</p>
      {notice && <div className="tc-notice" role="alert">{notice}</div>}
      <fieldset className="tc-training-fields" disabled={savingTraining}><div className="tc-form-grid">
        <label className="tc-field">Training title<input value={trainingTitle} onChange={e => setTrainingTitle(e.target.value)} placeholder="Welcome to TCS" required/></label>
        <label className="tc-field">Training type<select value={deliveryType} onChange={e => setDeliveryType(e.target.value as TeamTrainingDelivery)}><option>External Link</option><option value="Uploaded Content">Upload Video / PDF / PowerPoint</option><option>In-House</option></select></label>
        <label className="tc-field">Provider / company<input value={trainingProvider} onChange={e => setTrainingProvider(e.target.value)} placeholder="TCS / The Hub"/></label>
        <label className="tc-field">Duration (minutes)<input type="number" min={1} value={durationMinutes} onChange={e => setDurationMinutes(Number(e.target.value))}/></label>
        {deliveryType === "External Link" && <label className="tc-field full">External training URL<input value={trainingUrl} onChange={e => setTrainingUrl(e.target.value)} placeholder="https://..."/></label>}
        {deliveryType === "Uploaded Content" && <label className="tc-field full">Training video or document<input type="file" accept=".mp4,.ppt,.pptx,.pdf" onChange={e => setTrainingFile(e.target.files?.[0] ?? null)}/><small>MP4, PDF, PPT, or PPTX, up to 50 MB. Videos play inside the Hub. Use H.264/AAC for the widest device support.</small></label>}
        {deliveryType === "In-House" && <label className="tc-field full">Training lesson/content<textarea value={lessonContent} onChange={e => setLessonContent(e.target.value)} placeholder="Add the lesson, steps, examples, or policies staff should learn..."/></label>}
        <label className="tc-field full">Completion certificate for staff (optional)<input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => { setCertificateFile(e.target.files?.[0] ?? null); if (e.target.files?.[0]) setRequiresProof(false); }}/><small>PDF, PNG, or JPG, up to 15 MB. Staff download the file you provide after completion is verified. Names are not filled in automatically.</small></label>
        <label className="tc-field full">Description<textarea value={trainingDescription} onChange={e => setTrainingDescription(e.target.value)} placeholder="What this training covers..."/></label>
        <label className="tc-field full">Instructions<textarea value={trainingInstructions} onChange={e => setTrainingInstructions(e.target.value)} placeholder="What staff should watch, learn, and do to complete this training..."/></label>
        <label className="tc-field">Due date<input type="date" value={trainingDue} onChange={e => setTrainingDue(e.target.value)}/></label>
        <label className="tc-field">Assign to<select value={allStaff ? "everyone" : "selected"} onChange={e => setAllStaff(e.target.value === "everyone")}><option value="everyone">Everyone — all locations and leadership</option><option value="selected">Choose locations or staff</option></select></label>
        {allStaff ? <p className="tc-field full">All active Hub staff, including leadership and future staff, will receive this training.</p> : <>
          <label className="tc-field">Specific roles (optional)<input value={trainingRoles} onChange={e => setTrainingRoles(e.target.value)} placeholder="Employee, Driver"/></label>
          <label className="tc-field">Specific employee emails (optional)<input value={trainingEmails} onChange={e => setTrainingEmails(e.target.value)} placeholder="employee@tcs.org"/></label>
          <div className="tc-field full"><span>Required locations</span><div className="tc-training-locations">{storeLocations.map(item => <label className="tc-check" key={item}><input type="checkbox" checked={trainingLocations.includes(item)} onChange={() => toggleTrainingLocation(item)}/><span>{item}</span></label>)}</div></div>
          <label className="tc-check full"><input type="checkbox" checked={includeLeadership} onChange={e => setIncludeLeadership(e.target.checked)}/><span>Include leadership in role/email assignments</span></label>
        </>}
        <label className="tc-check"><input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)}/><span>Recurring / renewal training</span></label>
        {recurring && <label className="tc-field">Renew every (months)<input type="number" min={1} value={renewalMonths} onChange={e => setRenewalMonths(Number(e.target.value))}/></label>}
        {!certificateFile && <label className="tc-check"><input type="checkbox" checked={requiresProof} onChange={e => setRequiresProof(e.target.checked)}/><span>Staff must upload their own certificate/proof</span></label>}
        <label className="tc-check full"><input type="checkbox" checked={verificationRequired} onChange={e => setVerificationRequired(e.target.checked)}/><span>Admin verification required before certificate download and XP</span></label>
        <label className="tc-field">Base XP<input type="number" min={0} value={baseXp} onChange={e => setBaseXp(Number(e.target.value))}/></label>
        <label className="tc-field">On-time bonus XP<input type="number" min={0} value={bonusXp} onChange={e => setBonusXp(Number(e.target.value))}/></label>
        <label className="tc-field">Late completion XP<input type="number" min={0} value={lateXp} onChange={e => setLateXp(Number(e.target.value))}/></label>
      </div></fieldset>
      {uploadProgress && <div className="tc-upload-progress" role="status"><span>{uploadProgress.label}: {uploadProgress.percent}%</span><progress value={uploadProgress.percent} max={100}/><small>Keep this page open while your files upload.</small></div>}
      <div className="tc-modal-actions"><button className="tc-cancel" disabled={savingTraining} onClick={() => setShowCreate(false)}>Cancel</button><button className="tc-save" disabled={savingTraining || !trainingTitle.trim()} onClick={() => void saveTraining()}>{savingTraining ? <LoaderCircle className="animate-spin"/> : <Plus/>} {savingTraining ? "Saving Training…" : "Create & Assign Training"}</button></div>
    </section></div>}

  </div></MainLayout>;
}
