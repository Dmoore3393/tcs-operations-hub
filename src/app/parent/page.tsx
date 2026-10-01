"use client";

import { CelebrationBits, FunDoodles, GatorGuide } from "@/components/brand/HubJoy";
import { TcsKidsScene } from "@/components/brand/TcsKidsScene";
import SafeImage from "@/components/media/SafeImage";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";
import {
  AlertTriangle,
  Bell,
  BriefcaseBusiness,
  Camera,
  Coins,
  Heart,
  ShoppingBag,
  Star,
  Trophy,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileSignature,
  Home,
  LoaderCircle,
  Newspaper,
  UploadCloud,
  LogOut,
  ScanLine,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type ParentChild = {
  id: string;
  firstName: string;
  lastName: string;
  ageGroup: string;
  location: string;
  classroom: string;
  weeklySchedule: string;
  transportation: string;
  funding: string;
  enrollmentStatus: string;
  attendanceToday: string;
  attendanceDate: string;
  attendanceLocation: string;
  checkedInAt: string;
  checkedOutAt: string;
  pickupPerson: string;
  pickupPinConfigured: boolean;
  pickupPinUpdatedAt: string;
  missingDocuments: string[];
  medicalConsentStatus: string;
  nextAuditDue: string;
  fileAuditComplete: boolean;
  immunizationStatus: string;
  messages: Array<{
    id: string;
    direction: "TCS to Family" | "Family to TCS";
    subject: string;
    body: string;
    createdAt: string;
    createdBy: string;
    readAt: string;
  }>;
  access: {
    relationship: string;
    householdName: string;
    financialPrivacy: "Shared" | "Private";
    billingResponsibility: {
      mode: "Shared" | "Percentage" | "Fixed" | "Custom";
      percentage?: number;
      fixedWeeklyAmount?: number;
      covers?: string[];
    };
    permissions: {
      viewProfile: boolean;
      viewSchedule: boolean;
      submitSchedule: boolean;
      viewAttendance: boolean;
      viewTransportation: boolean;
      viewMedical: boolean;
      viewDocuments: boolean;
      viewIncidents: boolean;
      viewMessages: boolean;
      messageStaff: boolean;
      managePickup: boolean;
      editEmergencyContacts: boolean;
      viewBilling: boolean;
      viewRewards: boolean;
      makePayments: boolean;
    };
    grantedCount: number;
  };
};

type CareEntry = {
  id: string;
  childId: string;
  date: string;
  time: string;
  category: string;
  action: string;
  result: string;
  notes: string;
};

type ParentForm = {
  id: string;
  subjectName: string;
  formName: string;
  signerName: string;
  status: string;
  signatureMethod: string;
  requestedAt: string;
  dueDate: string;
  signedAt: string;
};

type TransportationFee = {
  id: string;
  weekOf: string;
  familyName: string;
  location: string;
  expectedAmount: number;
  chargedAmount: number;
  paymentStatus: string;
  dateCharged: string;
  datePaid: string;
  children: string[];
  schools: string[];
};

type Overview = {
  email: string;
  viewer: {
    email: string;
    separateFinancialPrivacy: boolean;
    adults: Array<{
      id: string;
      name: string;
      email: string;
      relationship: string;
      householdId: string;
      householdName: string;
      financialPrivacy: "Shared" | "Private";
      billingResponsibility: ParentChild["access"]["billingResponsibility"];
      permissions: ParentChild["access"]["permissions"];
    }>;
  };
  children: ParentChild[];
  careEntries: CareEntry[];
  forms: ParentForm[];
  transportationFees: TransportationFee[];
  familyMatters: Array<{
    id: string;
    locationId: string;
    category: string;
    title: string;
    message: string;
    emoji: string;
    startDate: string;
    endDate: string;
    isPinned: boolean;
  }>;
  weeklyCheckins: Array<{
    id: string;
    childId: string;
    weekOf: string;
    title: string;
    message: string;
    highlights: string[];
    createdByName: string;
    updatedAt: string;
  }>;
  media: Array<{
    id: string;
    childId: string;
    kind: string;
    date: string;
    caption: string;
    createdAt: string;
    url: string;
  }>;
  newsletters: Array<{
    id: string;
    locationId: string;
    month: string;
    title: string;
    summary: string;
    mimeType: string;
    sizeBytes: number;
    createdByName: string;
    createdAt: string;
    url: string;
  }>;
  gatorCash: Array<{
    childId: string;
    balance: number;
    lifetimeEarned: number;
    lifetimeSpent: number;
    earnedThisMonth: number;
    recentTransactions: Array<{
      id: string;
      amount: number;
      type: string;
      reason: string;
      staffName: string;
      location: string;
      createdAt: string;
    }>;
    recentPurchases: Array<{
      id: string;
      total: number;
      location: string;
      staffName: string;
      createdAt: string;
      items: Array<{
        name: string;
        quantity: number;
        price: number;
      }>;
    }>;
    activeJob: {
      assignmentId: string;
      jobId: string;
      title: string;
      payPerCompletion: number;
      completedCount: number;
      assignedAt: string;
      lastPaidAt: string;
      responsibilities: string[];
    } | null;
  }>;
};

function childName(child: ParentChild) {
  return `${child.firstName} ${child.lastName}`.trim();
}

function formatDate(value: string) {
  if (!value) return "Not set";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function billingResponsibilityLabel(access: ParentChild["access"]) {
  const responsibility = access.billingResponsibility;
  if (responsibility.mode === "Percentage") return `${responsibility.percentage ?? 0}% responsibility`;
  if (responsibility.mode === "Fixed") return `${(responsibility.fixedWeeklyAmount ?? 0).toFixed(2)} weekly responsibility`;
  if (responsibility.mode === "Custom") return "Custom financial responsibility";
  return access.financialPrivacy === "Private" ? "Private account responsibility" : "Shared household responsibility";
}

function monthYear(value: string) {
  if (!value) return "Newsletter";
  const date = new Date(`${value.slice(0, 7)}-01T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { month: "long", year: "numeric" });
}

function todayPacific() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function ParentPortalPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formToSign, setFormToSign] = useState<ParentForm | null>(null);
  const [typedName, setTypedName] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [notice, setNotice] = useState("");
  const [pickupPin, setPickupPin] = useState("");
  const [savingPickupPin, setSavingPickupPin] = useState(false);
  const [hasStaffAccess, setHasStaffAccess] = useState(false);
  const [uploadingProfilePhoto, setUploadingProfilePhoto] = useState(false);

  const loadOverview = useCallback(async (activeSession: Session) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch("/api/parent/overview", {
        headers: {
          Authorization: `Bearer ${activeSession.access_token}`,
        },
        cache: "no-store",
        signal: controller.signal,
      });

      const payload = await response.json() as Overview & { error?: string };

      if (!response.ok) {
        throw new Error(
          payload.error || "Could not open your Parent Portal."
        );
      }

      setOverview(payload);
      setSelectedChildId(
        (current) => current || payload.children[0]?.id || ""
      );
    } catch (loadError) {
      if (
        loadError instanceof DOMException &&
        loadError.name === "AbortError"
      ) {
        throw new Error(
          "The Parent Portal took too long to respond. Please try again."
        );
      }

      throw loadError;
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setError("The secure Parent Portal connection is not configured.");
      setLoading(false);
      return;
    }

    const client = supabase;
    let active = true;
    void client.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      const next = data.session;
      if (!next) {
        router.replace("/parent-login");
        return;
      }
      setSession(next);

      // Staff access only controls whether the Back to Hub button appears.
      // It should never block the family portal from loading.
      void client
        .from("staff_access")
        .select("user_id,is_active")
        .eq("user_id", next.user.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!active) return;

          if (error) {
            console.warn("Could not check staff access:", error);
            setHasStaffAccess(false);
            return;
          }

          setHasStaffAccess(Boolean(data?.is_active));
        });

      try {
        await loadOverview(next);
        setError("");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not open your Parent Portal.");
      } finally {
        if (active) setLoading(false);
      }
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, next) => {
      if (!next) {
        setSession(null);
        setOverview(null);
        setHasStaffAccess(false);
        router.replace("/parent-login");
        return;
      }
      setSession(next);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadOverview, router]);

  const selectedChild = useMemo(
    () => overview?.children.find((child) => child.id === selectedChildId) ?? overview?.children[0] ?? null,
    [overview, selectedChildId],
  );

  const care = useMemo(
    () => overview?.careEntries.filter((entry) => !selectedChild || entry.childId === selectedChild.id).slice(0, 20) ?? [],
    [overview, selectedChild],
  );

  const transportationFees = useMemo(() => {
    if (!overview || !selectedChild) return [];
    const selectedName = childName(selectedChild).toLowerCase();
    return overview.transportationFees.filter((fee) =>
      fee.children.some((name) => name.toLowerCase() === selectedName),
    );
  }, [overview, selectedChild]);
  const transportationDue = transportationFees
    .filter((fee) => fee.paymentStatus === "Unpaid")
    .reduce((sum, fee) => sum + Math.max(0, fee.chargedAmount || fee.expectedAmount), 0);

  const selectedFamilyMatters = useMemo(() => {
    if (!overview || !selectedChild) return [];
    return overview.familyMatters.slice(0, 5);
  }, [overview, selectedChild]);

  const selectedWeeklyCheckin = useMemo(() => {
    if (!overview || !selectedChild) return null;
    return overview.weeklyCheckins.find((entry) => entry.childId === selectedChild.id) ?? null;
  }, [overview, selectedChild]);

  const selectedMedia = useMemo(() => {
    if (!overview || !selectedChild) return [];
    return overview.media.filter((item) => item.childId === selectedChild.id && item.url);
  }, [overview, selectedChild]);

  const selectedGatorCash = useMemo(() => {
    if (!overview || !selectedChild) return null;
    return overview.gatorCash.find((item) => item.childId === selectedChild.id) ?? null;
  }, [overview, selectedChild]);

  const profilePhoto = selectedMedia.find((item) => item.kind === "Profile") ?? null;
  const recentPhotos = selectedMedia.filter((item) => item.kind === "Daily Photo").slice(0, 9);

  const openForms = overview?.forms.filter((form) => !["Signed", "Archived"].includes(form.status)) ?? [];
  const signedForms = overview?.forms.filter((form) => form.status === "Signed") ?? [];
  const canUseFamilyAttendance = overview?.children.some((child) => child.access.permissions.managePickup) ?? false;

  async function uploadProfilePhoto(file: File | null) {
    if (!file || !selectedChild || !session) return;
    setUploadingProfilePhoto(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.set("childId", selectedChild.id);
      form.set("file", file);
      const response = await fetch("/api/parent/profile-photo", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error || "Could not update the profile picture.");
      await loadOverview(session);
      setNotice(payload.message || "Profile picture updated. 💚");
      window.setTimeout(() => setNotice(""), 3200);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not update the profile picture.");
    } finally {
      setUploadingProfilePhoto(false);
    }
  }

  async function sendFamilyMessage() {
    if (!selectedChild || !session || !replySubject.trim() || !replyBody.trim()) return;
    setSendingMessage(true);
    setError("");
    try {
      const response = await fetch("/api/parent/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          childId: selectedChild.id,
          subject: replySubject,
          body: replyBody,
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not send your message.");
      await loadOverview(session);
      setReplySubject("");
      setReplyBody("");
      setNotice("Your message was sent to TCS.");
      window.setTimeout(() => setNotice(""), 3200);
    } catch (messageError) {
      setError(messageError instanceof Error ? messageError.message : "Could not send your message.");
    } finally {
      setSendingMessage(false);
    }
  }

  async function updatePickupPin(action: "set" | "clear") {
    if (!selectedChild || !session) return;
    setSavingPickupPin(true);
    setError("");
    try {
      const response = await fetch("/api/parent/pickup-pin", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          childId: selectedChild.id,
          action,
          pin: action === "set" ? pickupPin : "",
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not update the Family Attendance PIN.");
      await loadOverview(session);
      setPickupPin("");
      setNotice(action === "set" ? "Family Attendance PIN updated securely." : "Family Attendance PIN removed.");
      window.setTimeout(() => setNotice(""), 3200);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update the Family Attendance PIN.");
    } finally {
      setSavingPickupPin(false);
    }
  }

  async function signOut() {
    await supabase?.auth.signOut();
    router.replace("/parent-login");
  }

  function openForm(form: ParentForm) {
    setFormToSign(form);
    setTypedName(form.signerName || "");
    setAcknowledged(false);
    setError("");
  }

  async function acknowledgeForm() {
    if (!formToSign || !session) return;
    setSavingForm(true);
    setError("");
    try {
      const response = await fetch("/api/parent/forms", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          formId: formToSign.id,
          typedName,
          acknowledged,
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save the acknowledgment.");
      await loadOverview(session);
      setFormToSign(null);
      setNotice("Your acknowledgment was saved securely.");
      window.setTimeout(() => setNotice(""), 3200);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the acknowledgment.");
    } finally {
      setSavingForm(false);
    }
  }

  if (loading) {
    return <main className="relative grid min-h-screen place-items-center overflow-hidden bg-gradient-to-br from-[#fff6d7] via-[#f4f0e7] to-[#e3f6e8] p-5 text-slate-700"><FunDoodles soft /><section className="tcs-soft-pop relative z-10 w-full max-w-md rounded-[30px] border border-emerald-200 bg-white/90 p-7 text-center shadow-2xl backdrop-blur"><div className="flex justify-center"><GatorGuide size="lg" /></div><p className="mt-2 text-[10px] font-black uppercase tracking-[.18em] text-emerald-700">TCS Family Access</p><h1 className="mt-2 text-2xl font-black text-slate-950">Getting your family space ready ✨</h1><p className="mt-2 text-sm font-semibold leading-6 text-slate-500">Pulling together care updates, schedules, messages, and everything connected to your child.</p><LoaderCircle className="mx-auto mt-5 h-6 w-6 animate-spin text-emerald-700" /></section></main>;
  }

  if (error && !overview) {
    return <main className="min-h-screen bg-[#f4f0e7] p-4 sm:p-8"><section className="mx-auto mt-16 max-w-xl rounded-[28px] border border-red-200 bg-white p-7 text-center shadow-xl"><AlertTriangle className="mx-auto h-10 w-10 text-red-700" /><h1 className="mt-3 text-2xl font-black text-slate-950">Parent Portal access needs attention</h1><p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{error}</p><button onClick={() => void signOut()} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Sign Out</button></section></main>;
  }

  return <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#fffaf0] via-[#f5f1e8] to-[#eef8f1] pb-24 text-slate-950"><FunDoodles soft />
    <header className="sticky top-0 z-30 border-b border-emerald-900/10 bg-[#173d29]/95 text-white shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-[1450px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-200">TCS Family Access</p><h1 className="text-lg font-black">The Hub Parent Portal</h1></div>
        <div className="flex items-center gap-2">
          {hasStaffAccess && (
            <button
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-emerald-950 shadow-sm"
            >
              <BriefcaseBusiness className="h-4 w-4" /> Staff Hub
            </button>
          )}
          <button onClick={() => void signOut()} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-black"><LogOut className="h-4 w-4" /> Sign Out</button>
        </div>
      </div>
    </header>

    <div className="mx-auto max-w-[1450px] space-y-5 p-4 sm:p-6 lg:p-7">
      {notice && <div className="tcs-soft-pop relative overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-900"><CelebrationBits />{notice}</div>}
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">{error}</div>}

      <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#173d29] via-[#2e6c47] to-[#143522] p-6 text-white shadow-xl"><FunDoodles className="opacity-40" />
        <div className="relative z-10 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[.18em] text-emerald-200">Welcome back, family 💚</p>
            <h2 className="mt-2 max-w-3xl text-3xl font-black sm:text-4xl">You are part of your child’s TCS day.</h2>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-emerald-50/85">Schedules, attendance, care updates, forms, and conversations live here so you can stay connected—not just informed. Your family voice matters in the care we provide.</p>
          </div>
          <div className="w-full max-w-[390px]">
            <TcsKidsScene variant="family" compact className="opacity-95" />
            <div className="-mt-4 flex justify-end"><GatorGuide size="sm" message={<>We’re glad you’re here! ⭐</>} /></div>
          </div>
        </div>
        {canUseFamilyAttendance && <button
          onClick={() => router.push("/parent/scan")}
          className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-emerald-950 shadow-lg transition hover:bg-emerald-50"
        >
          <ScanLine className="h-5 w-5" /> Scan to Check In / Out
        </button>}
        {overview && overview.children.length > 1 && <div className="relative z-10 mt-5 flex flex-wrap gap-2">{overview.children.map((child) => <button key={child.id} onClick={() => setSelectedChildId(child.id)} className={`rounded-xl px-3 py-2 text-xs font-black ${selectedChild?.id === child.id ? "bg-white text-emerald-950 shadow-lg" : "bg-white/10 text-white"}`}>{childName(child)}</button>)}</div>}
      </section>

      {selectedChild && <section className="rounded-3xl border border-violet-200 bg-gradient-to-br from-white to-violet-50 p-5 shadow-sm">
        <div className="grid gap-5 md:grid-cols-[120px_1fr] md:items-start">
          <div>
            <div className="aspect-square overflow-hidden rounded-[28px] border-4 border-white bg-gradient-to-br from-emerald-100 to-violet-100 shadow-lg">
              <SafeImage src={profilePhoto?.url} alt={`${childName(selectedChild)} profile`} className="h-full w-full object-cover" fallback={<div className="grid h-full place-items-center text-violet-700"><UserRound className="h-12 w-12" /></div>} loading="eager" />
            </div>
            {selectedChild.access.permissions.viewProfile && <label className="mt-2 flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-violet-700 px-3 py-2 text-[10px] font-black text-white shadow-sm">
              {uploadingProfilePhoto ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {uploadingProfilePhoto ? "Uploading…" : profilePhoto ? "Change Photo" : "Add Profile Photo"}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploadingProfilePhoto} onChange={(event) => { const next = event.target.files?.[0] ?? null; void uploadProfilePhoto(next); event.currentTarget.value = ""; }} />
            </label>}
            <p className="mt-2 text-center text-[9px] font-semibold leading-4 text-slate-500">Family profile photo • private to your secure TCS account</p>
          </div>
          <div>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
            <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-violet-700" /><h2 className="font-black text-slate-950">Your access to {selectedChild.firstName}</h2></div>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">You are signed in as <strong>{selectedChild.access.relationship}</strong> for <strong>{selectedChild.access.householdName}</strong>. Your portal only shows information TCS has authorized for your individual account.</p>
          </div>
              <span className={`w-fit rounded-full px-3 py-1.5 text-[10px] font-black ${selectedChild.access.financialPrivacy === "Private" ? "bg-violet-700 text-white" : "bg-blue-100 text-blue-800"}`}>{selectedChild.access.financialPrivacy === "Private" ? "Private Household Billing" : "Shared Household Billing"}</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Info label="Household" value={selectedChild.access.householdName} />
              <Info label="Relationship" value={selectedChild.access.relationship} />
              <Info label="Financial Responsibility" value={billingResponsibilityLabel(selectedChild.access)} />
            </div>
            {selectedChild.access.financialPrivacy === "Private" && <div className="mt-4 rounded-xl border border-violet-200 bg-white p-3 text-xs font-semibold leading-5 text-violet-950">Other household balances, payments, saved payment methods, subsidy details, and unrelated children are not included in your account.</div>}
          </div>
        </div>
      </section>}

      {selectedChild && <>
        {(selectedChild.access.permissions.viewSchedule || selectedChild.access.permissions.submitSchedule) && <section className="overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-blue-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3"><span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-emerald-700 text-white shadow-sm"><CalendarDays className="h-6 w-6" /></span><div><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Weekly care planning</p><h2 className="mt-1 text-xl font-black text-slate-950">Family Care Calendar</h2><p className="mt-1 text-xs font-semibold leading-5 text-slate-600">Submit upcoming schedules early, see TCS closure dates, and track whether each weekly request is pending, approved, or needs changes.</p></div></div>
            <button onClick={() => router.push("/parent/schedule")} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-5 py-3 text-xs font-black text-white shadow-sm">{selectedChild.access.permissions.submitSchedule ? "Open & Submit Schedule" : "View Care Calendar"}</button>
          </div>
        </section>}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Card icon={<UserRound className="h-5 w-5" />} label="Attendance" value={selectedChild.attendanceDate === todayPacific() ? selectedChild.attendanceToday || "Not marked" : "Not marked today"} />
          <Card icon={<CalendarDays className="h-5 w-5" />} label="Schedule" value={selectedChild.weeklySchedule || "Schedule not entered"} />
          <Card icon={<Home className="h-5 w-5" />} label="Program" value={selectedChild.location || "Location not entered"} />
          <Card icon={<ShieldCheck className="h-5 w-5" />} label="Funding" value={selectedChild.funding || "Not set"} />
          <Card icon={<ShieldCheck className="h-5 w-5" />} label="Shot Record" value={selectedChild.immunizationStatus || "Needs review"} />
        </section>

        <div className="space-y-5">
          {selectedChild.access.permissions.viewRewards && selectedGatorCash && <section className="relative overflow-hidden rounded-[30px] border border-amber-200 bg-gradient-to-br from-[#fff9df] via-white to-[#e8f8ee] p-5 shadow-sm sm:p-6">
            <FunDoodles className="opacity-20" />
            <div className="relative z-10 grid gap-5 xl:grid-cols-[1.05fr_.95fr] xl:items-start">
              <div>
                <div className="flex items-start gap-3">
                  <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-[#173d29] text-amber-300 shadow-sm"><Coins className="h-6 w-6" /></span>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-700">Student rewards</p>
                    <h2 className="mt-1 text-2xl font-black text-slate-950">{selectedChild.firstName}’s Gator Cash 🐊💰</h2>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">See what {selectedChild.firstName} has earned for great choices, kindness, learning, leadership, jobs, and other TCS wins.</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl bg-[#173d29] p-4 text-white shadow-md sm:col-span-1">
                    <p className="text-[9px] font-black uppercase tracking-wider text-emerald-200">Current Balance</p>
                    <strong className="mt-1 block text-3xl font-black text-amber-300">{selectedGatorCash.balance} <span className="text-sm">GC</span></strong>
                  </div>
                  <RewardStat label="Earned This Month" value={`+${selectedGatorCash.earnedThisMonth} GC`} />
                  <RewardStat label="Lifetime Earned" value={`${selectedGatorCash.lifetimeEarned} GC`} />
                  <RewardStat label="Used in Store" value={`${selectedGatorCash.lifetimeSpent} GC`} />
                </div>

                {selectedGatorCash.activeJob && <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4">
                  <div className="flex items-start gap-3"><Trophy className="mt-0.5 h-5 w-5 flex-none text-violet-700" /><div><p className="text-[9px] font-black uppercase tracking-wider text-violet-700">Current Student Job</p><h3 className="mt-1 text-sm font-black text-slate-950">{selectedGatorCash.activeJob.title}</h3><p className="mt-1 text-xs font-semibold text-slate-600">{selectedGatorCash.activeJob.payPerCompletion} Gator Cash per completion • {selectedGatorCash.activeJob.completedCount} completed</p>{selectedGatorCash.activeJob.responsibilities.length > 0 && <p className="mt-2 text-[10px] font-semibold leading-4 text-slate-500">{selectedGatorCash.activeJob.responsibilities.slice(0,3).join(" • ")}</p>}</div></div>
                </div>}
              </div>

              <div className="rounded-3xl border border-white bg-white/85 p-4 shadow-sm backdrop-blur">
                <TcsKidsScene variant="celebrate" compact className="-mb-4 -mt-3" />
                <div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-wider text-amber-700">Recent Gator Cash activity</p><p className="text-xs font-semibold text-slate-500">Parents can view activity; only TCS staff can award or adjust Gator Cash.</p></div><Coins className="h-5 w-5 text-amber-600" /></div>
                <div className="mt-3 space-y-2">{selectedGatorCash.recentTransactions.length ? selectedGatorCash.recentTransactions.slice(0,6).map((entry) => <div key={entry.id || `${entry.createdAt}-${entry.reason}`} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="min-w-0"><p className="truncate text-xs font-black text-slate-900">{entry.reason || entry.type || "Gator Cash update"}</p><p className="mt-1 text-[9px] font-semibold text-slate-400">{entry.createdAt ? new Date(entry.createdAt).toLocaleDateString([], { month: "short", day: "numeric" }) : ""}{entry.location ? ` • ${entry.location}` : ""}</p></div><span className={`flex-none rounded-full px-2.5 py-1 text-[10px] font-black ${entry.amount >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{entry.amount >= 0 ? "+" : ""}{entry.amount} GC</span></div>) : <div className="rounded-2xl bg-amber-50 p-5 text-center"><Coins className="mx-auto h-7 w-7 text-amber-600" /><p className="mt-2 text-sm font-black text-slate-800">No Gator Cash activity yet.</p><p className="mt-1 text-xs font-semibold leading-5 text-slate-500">When TCS awards Gator Cash or {selectedChild.firstName} uses the Student Store, it will show here.</p></div>}</div>

                {selectedGatorCash.recentPurchases.length > 0 && <div className="mt-4 border-t border-slate-100 pt-4">
                  <div className="flex items-center gap-2"><ShoppingBag className="h-4 w-4 text-emerald-700" /><p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Recent Student Store purchases</p></div>
                  <div className="mt-2 space-y-2">{selectedGatorCash.recentPurchases.slice(0,3).map((order) => <div key={order.id} className="rounded-xl bg-emerald-50 p-3"><div className="flex items-start justify-between gap-3"><p className="text-xs font-black text-slate-900">{order.items.map((item) => `${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`).join(", ") || "Student Store purchase"}</p><span className="flex-none text-xs font-black text-emerald-800">{order.total} GC</span></div><p className="mt-1 text-[9px] font-semibold text-slate-400">{order.createdAt ? new Date(order.createdAt).toLocaleDateString([], { month: "short", day: "numeric" }) : ""}</p></div>)}</div>
                </div>}
              </div>
            </div>
          </section>}

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="relative overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-emerald-50 p-5 shadow-sm">
              <FunDoodles className="opacity-20" />
              <div className="relative z-10">
                <div className="flex items-center gap-3"><Star className="h-5 w-5 text-amber-600" /><div><h2 className="font-black text-slate-950">This week at TCS</h2><p className="text-xs text-slate-500">A little progress note just for {selectedChild.firstName}.</p></div></div>
                <TcsKidsScene variant="celebrate" compact className="-mb-5 -mt-2" />
                {selectedWeeklyCheckin ? <>
                  <p className="mt-4 text-[10px] font-black uppercase tracking-wider text-emerald-700">Week of {formatDate(selectedWeeklyCheckin.weekOf)}</p>
                  <h3 className="mt-1 text-xl font-black text-slate-950">{selectedWeeklyCheckin.title || "This Week at TCS"}</h3>
                  <div className="mt-3 flex flex-wrap gap-1.5">{selectedWeeklyCheckin.highlights.map((item) => <span key={item} className="rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-black text-amber-900">⭐ {item}</span>)}</div>
                  <p className="mt-4 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">{selectedWeeklyCheckin.message}</p>
                  {selectedWeeklyCheckin.createdByName && <p className="mt-4 text-[10px] font-semibold text-slate-400">Shared by {selectedWeeklyCheckin.createdByName}</p>}
                </> : <div className="mt-4 rounded-2xl bg-white/80 p-5 text-center"><Heart className="mx-auto h-7 w-7 text-emerald-700" /><p className="mt-2 text-sm font-black text-slate-800">No weekly check-in has been shared yet.</p><p className="mt-1 text-xs font-semibold leading-5 text-slate-500">When the TCS team posts this week’s progress note, it will appear right here.</p></div>}
              </div>
            </section>

            <section className="rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-5 shadow-sm">
              <div className="flex items-center gap-3"><Camera className="h-5 w-5 text-violet-700" /><div><h2 className="font-black text-slate-950">{selectedChild.firstName}’s photo moments</h2><p className="text-xs text-slate-500">Daily photos shared securely with your family.</p></div></div>
              {recentPhotos.length ? <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{recentPhotos.map((photo) => <figure key={photo.id} className="overflow-hidden rounded-2xl border border-white bg-white shadow-sm"><div className="aspect-square bg-slate-100"><SafeImage src={photo.url} alt={photo.caption || `${selectedChild.firstName} at TCS`} className="h-full w-full object-cover" fallback={<div className="grid h-full place-items-center text-slate-400"><Camera className="h-6 w-6" /></div>} /></div>{photo.caption && <figcaption className="p-2 text-[9px] font-semibold leading-4 text-slate-600">{photo.caption}</figcaption>}</figure>)}</div> : <div className="mt-4 rounded-2xl bg-white/80 p-5 text-center"><Camera className="mx-auto h-7 w-7 text-violet-700" /><p className="mt-2 text-sm font-black text-slate-800">No family photos yet.</p><p className="mt-1 text-xs font-semibold leading-5 text-slate-500">New daily moments will appear here when TCS shares them.</p></div>}
            </section>
          </div>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3"><Sparkles className="h-5 w-5 text-emerald-700" /><div><h2 className="font-black text-slate-950">Today & recent care</h2><p className="text-xs text-slate-500">Updates staff have recorded for {selectedChild.firstName}.</p></div></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Info label="Checked In" value={selectedChild.attendanceDate === todayPacific() ? formatTime(selectedChild.checkedInAt) : "—"} />
              <Info label="Checked Out" value={selectedChild.attendanceDate === todayPacific() ? formatTime(selectedChild.checkedOutAt) : "—"} />
              <Info label="Pickup Person" value={selectedChild.attendanceDate === todayPacific() ? selectedChild.pickupPerson || "—" : "—"} />
              <Info label="Today at" value={selectedChild.attendanceDate === todayPacific() ? selectedChild.attendanceLocation || selectedChild.location || "Not set" : "—"} />
              <Info label="Transportation" value={selectedChild.transportation || "No transportation"} />
            </div>

            <div className="mt-5 space-y-3">{care.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No recent daily-care updates are available yet.</p> : care.map((entry) => <div key={entry.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">{entry.category}</p><h3 className="mt-1 font-black text-slate-900">{entry.action || entry.result || "Care update"}</h3></div><span className="text-[10px] font-bold text-slate-400">{formatDate(entry.date)} • {entry.time}</span></div>{entry.result && entry.action && <p className="mt-2 text-sm font-semibold text-slate-700">{entry.result}</p>}{entry.notes && <p className="mt-2 text-xs leading-5 text-slate-500">{entry.notes}</p>}</div>)}</div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3"><ClipboardCheck className="h-5 w-5 text-blue-700" /><div><h2 className="font-black text-slate-950">File follow-up</h2><p className="text-xs text-slate-500">High-level status only; private internal notes stay with TCS.</p></div></div>
              <div className="mt-4 space-y-2">
                <StatusRow label="Child File Audit" ok={selectedChild.fileAuditComplete} value={selectedChild.fileAuditComplete ? "Current / complete" : "Needs follow-up"} />
                <StatusRow label="Next Audit" ok={Boolean(selectedChild.nextAuditDue)} value={selectedChild.nextAuditDue ? formatDate(selectedChild.nextAuditDue) : "Not set"} />
                <StatusRow label="Medical Consent" ok={selectedChild.medicalConsentStatus === "On File"} value={selectedChild.medicalConsentStatus || "Needs review"} />
                <StatusRow label="Immunization Record" ok={["Requirements Met", "Conditional", "Medical Exemption"].includes(selectedChild.immunizationStatus)} value={selectedChild.immunizationStatus} />
              </div>
              {selectedChild.missingDocuments.length > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900"><AlertTriangle className="mr-1 inline h-4 w-4" />TCS currently has {selectedChild.missingDocuments.length} file item{selectedChild.missingDocuments.length === 1 ? "" : "s"} marked for follow-up. Contact your location if you need the exact list.</div>}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-violet-700" /><h2 className="font-black text-slate-950">Family Attendance PIN</h2></div><p className="mt-1 text-xs text-slate-500">Create your own easy-to-remember code for QR check-in and check-out.</p></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${selectedChild.pickupPinConfigured ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{selectedChild.pickupPinConfigured ? "Configured" : "Not Set"}</span></div>
              <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs font-semibold leading-5 text-violet-950">Choose one 4–6 digit family code. After you scan a TCS location QR, this PIN lets you check your linked children in or out and also works as an extra pickup verification step. The same PIN is applied to your linked children, and TCS cannot display it after you save it.</div>
              <div className="mt-3 flex gap-2"><input inputMode="numeric" maxLength={6} value={pickupPin} onChange={(event) => setPickupPin(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="4–6 digits" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-3 text-center text-base font-black tracking-[.25em]" /><button disabled={!/^\d{4,6}$/.test(pickupPin) || savingPickupPin} onClick={() => void updatePickupPin("set")} className="rounded-xl bg-violet-700 px-4 py-3 text-xs font-black text-white disabled:opacity-40">{savingPickupPin ? "Saving…" : selectedChild.pickupPinConfigured ? "Change PIN" : "Set PIN"}</button></div>
              {selectedChild.pickupPinConfigured && <div className="mt-3 flex items-center justify-between gap-3"><p className="text-[10px] font-semibold text-slate-500">Last updated {selectedChild.pickupPinUpdatedAt ? new Date(selectedChild.pickupPinUpdatedAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "recently"}</p><button disabled={savingPickupPin} onClick={() => void updatePickupPin("clear")} className="text-xs font-black text-red-700">Remove PIN</button></div>}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Bell className="h-5 w-5 text-emerald-700" /><h2 className="font-black text-slate-950">Messages with TCS</h2></div><p className="mt-1 text-xs text-slate-500">Secure family thread for {selectedChild.firstName}.</p></div><span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-800">{selectedChild.messages?.length || 0}</span></div>
              <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">{!selectedChild.messages?.length ? <p className="rounded-xl bg-slate-50 p-4 text-xs font-semibold text-slate-500">No family messages yet.</p> : selectedChild.messages.slice(-12).map((message) => <div key={message.id} className={`flex ${message.direction === "Family to TCS" ? "justify-end" : "justify-start"}`}><div className={`max-w-[90%] rounded-2xl p-3 ${message.direction === "Family to TCS" ? "bg-emerald-700 text-white" : "border border-slate-200 bg-slate-50 text-slate-900"}`}><p className="text-[9px] font-black uppercase tracking-wider opacity-65">{message.direction}</p><p className="mt-1 text-xs font-black">{message.subject || "Message"}</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5 opacity-90">{message.body}</p><p className="mt-2 text-[9px] font-semibold opacity-55">{message.createdAt ? new Date(message.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}</p></div></div>)}</div>
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                <input value={replySubject} onChange={(event) => setReplySubject(event.target.value)} maxLength={160} placeholder="Subject" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold" />
                <textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} maxLength={5000} placeholder="Write a message to your TCS team…" className="min-h-20 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold leading-5" />
                <button disabled={!replySubject.trim() || !replyBody.trim() || sendingMessage} onClick={() => void sendFamilyMessage()} className="w-full rounded-xl bg-emerald-700 px-3 py-2.5 text-xs font-black text-white disabled:opacity-40">{sendingMessage ? "Sending…" : "Send Message"}</button>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-blue-700" /><h2 className="font-black text-slate-950">Billing & transportation fees</h2></div><p className="mt-1 text-xs text-slate-500">Funding source and transportation charges currently recorded by TCS.</p></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${transportationDue > 0 ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{transportationDue > 0 ? `Due ${transportationDue.toFixed(2)}` : "No unpaid transport fee"}</span></div>
              <div className="mt-4 rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Funding Source</p><p className="mt-1 text-sm font-black text-slate-900">{selectedChild.funding || "Not set"}</p></div>
              <div className="mt-4 space-y-2">{transportationFees.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-xs font-semibold text-slate-500">No transportation fee records are currently attached to this child.</p> : transportationFees.slice(0, 8).map((fee) => <div key={fee.id || fee.weekOf} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div><strong className="text-xs text-slate-900">Week of {fee.weekOf ? formatDate(fee.weekOf) : "Not set"}</strong><p className="mt-1 text-[10px] text-slate-500">{fee.schools.join(", ") || fee.location}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-black ${fee.paymentStatus === "Paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{fee.paymentStatus || "Recorded"}</span></div><div className="mt-2 grid grid-cols-2 gap-2"><Info label="Expected" value={`${fee.expectedAmount.toFixed(2)}`} /><Info label="Charged" value={`${fee.chargedAmount.toFixed(2)}`} /></div>{fee.datePaid && <p className="mt-2 text-[10px] font-semibold text-emerald-700">Paid {formatDate(fee.datePaid)}</p>}</div>)}</div>
              <p className="mt-4 text-[10px] font-semibold leading-4 text-slate-500">Financial information shown here is limited to records assigned to your Parent Portal access. If separate household billing is enabled, another adult’s balance and payment activity stay private.</p>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><FileSignature className="h-5 w-5 text-purple-700" /><h2 className="font-black text-slate-950">Forms & acknowledgments</h2></div><p className="mt-1 text-xs text-slate-500">{openForms.length} item{openForms.length === 1 ? "" : "s"} waiting</p></div><Bell className="h-5 w-5 text-slate-400" /></div>
              <div className="mt-4 space-y-3">{openForms.length === 0 ? <p className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900"><CheckCircle2 className="mr-1 inline h-4 w-4" />No Parent Portal acknowledgments are currently waiting.</p> : openForms.map((form) => <div key={form.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-slate-900">{form.formName}</strong><p className="mt-1 text-[10px] text-slate-500">{form.subjectName || "Family form"} • Due {form.dueDate ? formatDate(form.dueDate) : "not set"}</p></div><span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-black text-amber-900">{form.status}</span></div>{form.signatureMethod === "Parent Portal Acknowledgment" ? <button onClick={() => openForm(form)} className="mt-3 w-full rounded-xl bg-purple-700 px-3 py-2.5 text-xs font-black text-white">Review & Acknowledge</button> : <p className="mt-3 text-[10px] font-semibold leading-4 text-slate-500">This form requires completion outside the Parent Portal. Contact your TCS location for instructions.</p>}</div>)}</div>
              {signedForms.length > 0 && <p className="mt-4 text-[10px] font-bold text-slate-400">{signedForms.length} portal/form item{signedForms.length === 1 ? "" : "s"} already completed.</p>}
            </section>

            <section className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-5 shadow-sm">
              <div className="flex items-center gap-3"><Newspaper className="h-5 w-5 text-emerald-700" /><div><h2 className="font-black text-slate-950">Monthly Newsletters</h2><p className="text-xs text-slate-500">Family updates, activities, reminders, and what’s happening around TCS.</p></div></div>
              {overview?.newsletters?.length ? <div className="mt-4 space-y-3">{overview.newsletters.slice(0, 6).map((newsletter) => <article key={newsletter.id} className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-wider text-emerald-700">{monthYear(newsletter.month)}</p><h3 className="mt-1 text-sm font-black text-slate-950">{newsletter.title}</h3>{newsletter.summary && <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{newsletter.summary}</p>}</div><Newspaper className="h-5 w-5 flex-none text-emerald-500" /></div>{newsletter.url && <a href={newsletter.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2.5 text-[10px] font-black text-white"><UploadCloud className="h-3.5 w-3.5 rotate-180" />Open Newsletter</a>}</article>)}</div> : <div className="mt-4 rounded-2xl bg-white/80 p-5 text-center"><Newspaper className="mx-auto h-7 w-7 text-emerald-700" /><p className="mt-2 text-sm font-black text-slate-800">No newsletters posted yet.</p><p className="mt-1 text-xs font-semibold leading-5 text-slate-500">When TCS publishes a monthly newsletter, you’ll be able to open it here anytime.</p></div>}
            </section>

            <section className="relative overflow-hidden rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-amber-50 p-5 shadow-sm">
              <FunDoodles className="opacity-25" />
              <div className="relative z-10">
                <TcsKidsScene variant="reading" compact className="-mb-5 -mt-3" />
                <p className="text-[10px] font-black uppercase tracking-[.16em] text-sky-700">Family Matters</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">A little something from TCS 🐊</h2>
                {selectedFamilyMatters.length ? <div className="mt-4 space-y-3">{selectedFamilyMatters.map((post) => <article key={post.id} className="rounded-2xl border border-white bg-white/90 p-4 shadow-sm"><div className="flex items-start gap-3"><span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-sky-50 text-xl">{post.emoji || "💚"}</span><div><div className="flex flex-wrap items-center gap-2"><p className="text-[9px] font-black uppercase tracking-wider text-sky-700">{post.category}</p>{post.isPinned && <span className="rounded-full bg-amber-100 px-2 py-1 text-[8px] font-black text-amber-900">PINNED</span>}</div><h3 className="mt-1 text-sm font-black text-slate-950">{post.title}</h3><p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{post.message}</p></div></div></article>)}</div> : <><p className="mt-2 max-w-xl text-xs font-semibold leading-5 text-slate-600">Checking schedules, reading updates, sending messages, and keeping forms current all help us plan better care for your child. You are not just using the app—you are part of the care team.</p><div className="mt-4"><GatorGuide size="md" message={<>Thanks for staying connected with us. It makes a difference. 💚</>} /></div></>}
              </div>
            </section>
          </div>
        </div>
      </>}

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold leading-5 text-emerald-950"><ShieldCheck className="mr-1 inline h-4 w-4" />Parent Portal acknowledgment records the authenticated guardian email, typed name, time, and audit history. It is used only for forms TCS has specifically enabled for portal acknowledgment; it does not automatically replace a licensing form that requires a different signature process.</div>
    </div>

    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[max(.4rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-8px_28px_rgba(15,23,42,.10)] backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-3 px-4"><Bottom icon={<Home className="h-5 w-5" />} label="Home" /><Bottom icon={<CalendarDays className="h-5 w-5" />} label="Care" /><Bottom icon={<FileSignature className="h-5 w-5" />} label="Forms" /></div>
    </nav>

    {formToSign && <div className="fixed inset-0 z-[10000] overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm">
      <section className="mx-auto my-10 w-full max-w-xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 bg-gradient-to-r from-purple-800 to-purple-600 px-5 py-4 text-white"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-purple-100">Parent Portal acknowledgment</p><h2 className="mt-1 text-2xl font-black">{formToSign.formName}</h2></div><button onClick={() => setFormToSign(null)} className="rounded-xl bg-white/10 p-2"><X className="h-5 w-5" /></button></header>
        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 text-sm font-semibold leading-6 text-purple-950">By submitting this acknowledgment, you confirm that you reviewed the named TCS form/request and that the typed name below is yours. This portal does not display or manufacture a signature image.</div>
          <label><span className="mb-1 block text-xs font-black uppercase tracking-wider text-slate-500">Type your full name</span><input value={typedName} onChange={(event) => setTypedName(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold" /></label>
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1 h-4 w-4 accent-purple-700" /><span className="text-xs font-semibold leading-5 text-slate-700">I acknowledge that I reviewed this form/request and agree to submit this acknowledgment under my authenticated Parent Portal account.</span></label>
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 p-4"><button onClick={() => setFormToSign(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700">Cancel</button><button disabled={!typedName.trim() || !acknowledged || savingForm} onClick={() => void acknowledgeForm()} className="inline-flex min-w-36 items-center justify-center rounded-xl bg-purple-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">{savingForm ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Submit Acknowledgment"}</button></footer>
      </section>
    </div>}
  </main>;
}

function Card({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <section className="tcs-joy-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">{icon}</span><p className="mt-3 text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p><strong className="mt-1 block text-sm leading-5 text-slate-900">{value}</strong></section>;
}
function RewardStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-amber-100 bg-white p-4 shadow-sm"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p><strong className="mt-1 block text-lg text-slate-950">{value}</strong></div>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><span className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</span><strong className="mt-1 block text-xs text-slate-900">{value}</strong></div>;
}
function StatusRow({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><span className="text-xs font-black text-slate-700">{label}</span><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black ${ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}{value}</span></div>;
}
function Bottom({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <div className="flex min-h-[62px] flex-col items-center justify-center gap-1 text-[10px] font-black text-emerald-800"><span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-50">{icon}</span>{label}</div>;
}
