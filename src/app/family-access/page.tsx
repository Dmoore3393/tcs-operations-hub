"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  familyPermissionKeys,
  fullFamilyPermissions,
  pickupOnlyFamilyPermissions,
  type FamilyAdultAccess,
  type FamilyAccessPermissions,
  type FamilyPermissionKey,
} from "@/lib/family-access";
import type { ChildRecord } from "@/lib/children";
import {
  AlertTriangle,
  Check,
  Eye,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const permissionLabels: Record<FamilyPermissionKey, string> = {
  viewProfile: "View child profile",
  viewSchedule: "View schedule",
  submitSchedule: "Submit schedule changes",
  viewAttendance: "View attendance / check-in",
  viewTransportation: "View transportation",
  viewMedical: "View medical information",
  viewDocuments: "View forms & documents",
  viewIncidents: "View incident reports",
  viewMessages: "View messages",
  messageStaff: "Message TCS staff",
  managePickup: "Manage pickup PIN",
  editEmergencyContacts: "Edit emergency contacts",
  viewBilling: "View this adult's billing",
  makePayments: "Make payments",
};

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-950 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100";

function clonePermissions(value: FamilyAccessPermissions): FamilyAccessPermissions {
  return familyPermissionKeys.reduce((next, key) => {
    next[key] = value[key];
    return next;
  }, {} as FamilyAccessPermissions);
}

function viewOnlyPermissions(): FamilyAccessPermissions {
  return {
    ...fullFamilyPermissions,
    submitSchedule: false,
    messageStaff: false,
    managePickup: false,
    editEmergencyContacts: false,
    makePayments: false,
  };
}

function newAdult(child: ChildRecord): FamilyAdultAccess {
  return {
    id: `adult-${Date.now()}`,
    name: "",
    email: "",
    relationship: "Parent / Guardian",
    householdId: `household-${Date.now()}`,
    householdName: child.familyName || `${child.lastName || "Family"} Household`,
    status: "Invited",
    financialPrivacy: "Private",
    permissions: clonePermissions(fullFamilyPermissions),
    billingResponsibility: { mode: "Shared" },
  };
}

export default function FamilyAccessPage() {
  const { session } = useAuth();
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<FamilyAdultAccess | null>(null);
  const [saving, setSaving] = useState(false);
  const [invitingAdultId, setInvitingAdultId] = useState("");
  const [reviewingApproval, setReviewingApproval] = useState<FamilyAdultAccess | null>(null);
  const [approvalIdentityChecked, setApprovalIdentityChecked] = useState(false);
  const [approvalPermissionsChecked, setApprovalPermissionsChecked] = useState(false);
  const [approvalCustodyChecked, setApprovalCustodyChecked] = useState(false);
  const [approvingAdultId, setApprovingAdultId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const requestChildren = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const response = await fetch("/api/children", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json() as { children?: ChildRecord[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load child records.");
      const next = Array.isArray(payload.children) ? payload.children : [];
      setChildren(next);
      setSelectedId((current) => current ?? next[0]?.id ?? null);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load child records.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { void requestChildren(); }, [requestChildren]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return children
      .filter((child) => child.enrollmentStatus !== "Archived")
      .filter((child) => !query || `${child.firstName} ${child.lastName} ${child.primaryGuardian} ${child.secondaryGuardian || ""} ${child.familyName || ""} ${child.location}`.toLowerCase().includes(query))
      .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
  }, [children, search]);

  const selected = children.find((child) => child.id === selectedId) ?? null;
  const adults = selected?.familyAccess ?? [];
  const legacyMode = Boolean(selected && adults.length === 0 && selected.guardianEmail);

  function updateSelectedChild(patch: Partial<ChildRecord>) {
    if (!selected) return;
    setChildren((current) => current.map((child) => child.id === selected.id ? { ...child, ...patch } : child));
  }

  async function saveChild(nextChild: ChildRecord, success: string) {
    if (!session?.access_token) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/children", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "save", child: nextChild }),
      });
      const payload = await response.json() as { child?: ChildRecord; error?: string };
      if (!response.ok || !payload.child) throw new Error(payload.error || "Could not save family access.");
      setChildren((current) => current.map((child) => child.id === nextChild.id ? payload.child! : child));
      setEditing(null);
      setNotice(success);
      window.setTimeout(() => setNotice(""), 3200);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save family access.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAdult() {
    if (!selected || !editing) return;
    const email = editing.email.trim().toLowerCase();
    if (!editing.name.trim() || !email) {
      setError("Enter the adult's name and email before saving.");
      return;
    }
    const duplicate = adults.some((adult) => adult.id !== editing.id && adult.email.toLowerCase() === email);
    if (duplicate) {
      setError("That email already has access to this child.");
      return;
    }
    const nextAdult: FamilyAdultAccess = {
      ...editing,
      name: editing.name.trim(),
      email,
      householdName: editing.householdName.trim() || "Family Household",
      relationship: editing.relationship.trim() || "Parent / Guardian",
    };
    const nextAdults = adults.some((adult) => adult.id === nextAdult.id)
      ? adults.map((adult) => adult.id === nextAdult.id ? nextAdult : adult)
      : [...adults, nextAdult];
    await saveChild({ ...selected, familyAccess: nextAdults }, `${nextAdult.name}'s Parent Portal access was saved. Send the invitation when you are ready.`);
  }

  async function sendInvite(adult: FamilyAdultAccess) {
    if (!session?.access_token || !selected) return;
    if (adult.status === "Suspended") {
      setError("This account is suspended. Update the access record before sending an invitation.");
      return;
    }

    setInvitingAdultId(adult.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/parent/invitations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          childLegacyId: selected.legacyId || String(selected.id),
          adultId: adult.id,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error || "Could not send the Parent Portal invitation.");

      await requestChildren();
      setNotice(payload.message || "Parent Portal invitation sent.");
      window.setTimeout(() => setNotice(""), 4200);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the Parent Portal invitation.");
    } finally {
      setInvitingAdultId("");
    }
  }

  function openApprovalReview(adult: FamilyAdultAccess) {
    setReviewingApproval(adult);
    setApprovalIdentityChecked(false);
    setApprovalPermissionsChecked(false);
    setApprovalCustodyChecked(false);
    setError("");
  }

  async function approveAdult() {
    if (!session?.access_token || !selected || !reviewingApproval) return;
    if (!approvalIdentityChecked || !approvalPermissionsChecked || (selected.custodyAccessAlert && !approvalCustodyChecked)) {
      setError("Complete the required approval checks before activating this Parent Portal account.");
      return;
    }

    setApprovingAdultId(reviewingApproval.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/parent/approvals", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          childLegacyId: selected.legacyId || String(selected.id),
          adultId: reviewingApproval.id,
          confirmedIdentity: approvalIdentityChecked,
          confirmedPermissions: approvalPermissionsChecked,
          confirmedCustody: selected.custodyAccessAlert ? approvalCustodyChecked : true,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error || "Could not approve Parent Portal access.");

      setReviewingApproval(null);
      await requestChildren();
      setNotice(payload.message || "Parent Portal access approved.");
      window.setTimeout(() => setNotice(""), 4200);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not approve Parent Portal access.");
    } finally {
      setApprovingAdultId("");
    }
  }

    async function removeAdult(adult: FamilyAdultAccess) {
    if (!selected) return;
    await saveChild(
      { ...selected, familyAccess: adults.filter((item) => item.id !== adult.id) },
      `${adult.name}'s access was removed from ${selected.firstName}.`,
    );
  }

  async function convertLegacy() {
    if (!selected?.guardianEmail) return;
    const primary: FamilyAdultAccess = {
      id: `adult-${Date.now()}`,
      name: selected.primaryGuardian || selected.guardianEmail,
      email: selected.guardianEmail.toLowerCase(),
      relationship: "Primary Parent / Guardian",
      householdId: `household-${selected.familyId ?? Date.now()}`,
      householdName: selected.familyName || `${selected.lastName} Household`,
      status: "Active",
      financialPrivacy: "Shared",
      permissions: clonePermissions(fullFamilyPermissions),
      billingResponsibility: { mode: "Shared" },
    };
    await saveChild(
      { ...selected, familyAccess: [primary] },
      "This child now uses explicit adult access. Only adults listed here can open this child's portal record.",
    );
  }

  function applyPreset(preset: "full" | "view" | "pickup") {
    if (!editing) return;
    setEditing({
      ...editing,
      permissions: clonePermissions(
        preset === "full" ? fullFamilyPermissions
          : preset === "view" ? viewOnlyPermissions()
          : pickupOnlyFamilyPermissions,
      ),
    });
  }

  function togglePermission(key: FamilyPermissionKey) {
    if (!editing) return;
    setEditing({
      ...editing,
      permissions: { ...editing.permissions, [key]: !editing.permissions[key] },
    });
  }

  return <MainLayout><div className="mx-auto max-w-[1500px] space-y-6 pb-12">
    <section className="overflow-hidden rounded-[30px] bg-gradient-to-br from-[#173d29] via-[#265b3c] to-[#132b42] p-6 text-white shadow-xl sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[.18em] text-emerald-200">Parent Portal security</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Family Access & Privacy</h1>
          <p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-emerald-50/80">Give each adult their own account. One child can be connected to separate households without exposing unrelated siblings, another parent's private billing, saved payment methods, messages, or restricted records.</p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/10 p-4 text-xs font-semibold leading-5 text-emerald-50"><LockKeyhole className="mr-1 inline h-4 w-4" />Once explicit access is turned on for a child, only adults listed here can open that child's Parent Portal record.</div>
      </div>
    </section>

    {(error || notice) && <div className={`flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-sm font-bold ${error ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}><span>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }}><X className="h-4 w-4" /></button></div>}

    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <label className="relative block"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search child or guardian…" className={`${inputClass} pl-10`} /></label>
        </div>
        <div className="max-h-[720px] overflow-y-auto p-2">
          {loading ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm font-bold text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" />Loading children…</div> : filtered.map((child) => {
            const count = child.familyAccess?.length ?? 0;
            return <button key={child.id} onClick={() => { setSelectedId(child.id); setEditing(null); }} className={`mb-1 w-full rounded-2xl border p-4 text-left transition ${selectedId === child.id ? "border-emerald-300 bg-emerald-50" : "border-transparent hover:bg-slate-50"}`}>
              <div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-slate-950">{child.firstName} {child.lastName}</strong><p className="mt-1 text-xs font-semibold text-slate-500">{child.location}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-black ${count ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{count ? `${count} account${count === 1 ? "" : "s"}` : "Legacy"}</span></div>
              <p className="mt-3 text-xs text-slate-600">{child.primaryGuardian}{child.secondaryGuardian ? ` • ${child.secondaryGuardian}` : ""}</p>
            </button>;
          })}
        </div>
      </section>

      {!selected ? <section className="grid min-h-[420px] place-items-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center"><div><Users className="mx-auto h-10 w-10 text-emerald-700" /><h2 className="mt-3 text-xl font-black">Choose a child</h2><p className="mt-2 text-sm text-slate-500">Then set exactly who can see and manage that child's Parent Portal information.</p></div></section> : <div className="space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div><p className="text-xs font-black uppercase tracking-wider text-emerald-700">Child access record</p><h2 className="mt-1 text-2xl font-black">{selected.firstName} {selected.lastName}</h2><p className="mt-2 text-sm text-slate-500">{selected.familyName || "Family not named"} • {selected.location}</p></div>
            <button onClick={() => setEditing(newAdult(selected))} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white"><Plus className="h-4 w-4" />Add Adult Account</button>
          </div>

          {legacyMode && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-800" /><div><h3 className="font-black text-amber-950">Legacy single-email access is still active</h3><p className="mt-1 text-xs font-semibold leading-5 text-amber-900">Right now {selected.guardianEmail} receives full access because no explicit adult list has been created. Converting this child lets you control custody/privacy settings adult by adult.</p><button disabled={saving} onClick={() => void convertLegacy()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-900 px-3 py-2 text-xs font-black text-white"><ShieldCheck className="h-4 w-4" />Turn On Explicit Access</button></div></div>
          </div>}

          {!legacyMode && adults.length === 0 && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-900"><AlertTriangle className="mr-1 inline h-4 w-4" />No adult has Parent Portal access to this child yet.</div>}
        </section>

        <section className={`rounded-3xl border p-5 shadow-sm ${selected.custodyAccessAlert ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex gap-3">
              <span className={`grid h-11 w-11 flex-none place-items-center rounded-2xl ${selected.custodyAccessAlert ? "bg-red-700 text-white" : "bg-slate-100 text-slate-700"}`}><LockKeyhole className="h-5 w-5" /></span>
              <div><h3 className="font-black text-slate-950">Internal Custody / Access Alert</h3><p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-slate-600">Staff-only safeguard. Use this when verified custody, guardianship, restraining-order, foster-placement, or other access documentation requires extra review before changing Parent Portal or pickup access.</p></div>
            </div>
            <span className={`w-fit rounded-full px-3 py-1.5 text-[10px] font-black ${selected.custodyAccessAlert ? "bg-red-700 text-white" : "bg-slate-100 text-slate-600"}`}>{selected.custodyAccessAlert ? "RESTRICTION / REVIEW FLAGGED" : "No alert flagged"}</span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3"><input type="checkbox" checked={Boolean(selected.custodyAccessAlert)} onChange={(event) => updateSelectedChild({ custodyAccessAlert: event.target.checked })} className="mt-1 h-4 w-4 accent-red-700" /><span><strong className="block text-xs text-slate-900">Custody / access review required</strong><span className="mt-1 block text-[10px] font-semibold leading-4 text-slate-500">Warn authorized staff before changing adult access or pickup permissions.</span></span></label>
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3"><input type="checkbox" checked={Boolean(selected.custodyDocumentationOnFile)} onChange={(event) => updateSelectedChild({ custodyDocumentationOnFile: event.target.checked })} className="mt-1 h-4 w-4 accent-emerald-700" /><span><strong className="block text-xs text-slate-900">Documentation verified / on file</strong><span className="mt-1 block text-[10px] font-semibold leading-4 text-slate-500">Use only after TCS has the supporting documentation it relies on.</span></span></label>
          </div>

          <label className="mt-4 block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Staff-only access note</span><textarea value={selected.custodyAccessNote || ""} onChange={(event) => updateSelectedChild({ custodyAccessNote: event.target.value.slice(0, 4000) })} placeholder="Example: Review verified custody documentation before changing pickup or Parent Portal access. Do not include unnecessary sensitive detail." className="min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold leading-6 text-slate-900 outline-none focus:border-red-300" /></label>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-[10px] font-semibold leading-4 text-slate-500">This alert is never returned by the Parent Portal API and does not make a legal custody determination. Staff should follow verified documentation and TCS policy.</p><button disabled={saving} onClick={() => void saveChild(selected, "Custody / access safeguards were saved for this child.")} className="inline-flex flex-none items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Custody Settings</button></div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          {adults.map((adult) => <article key={adult.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div className="flex gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-800"><UserRound className="h-5 w-5" /></span><div><h3 className="font-black text-slate-950">{adult.name}</h3><p className="mt-1 text-xs font-semibold text-slate-500">{adult.relationship} • {adult.email}</p><div className="mt-2 flex flex-wrap gap-1.5"><span className={`rounded-full px-2 py-1 text-[9px] font-black ${adult.status === "Active" ? "bg-emerald-100 text-emerald-800" : adult.status === "Pending Approval" ? "bg-blue-100 text-blue-900" : adult.status === "Invited" ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-800"}`}>{adult.status === "Active" ? "Account Active" : adult.status === "Pending Approval" ? "Staff Approval Required" : adult.status === "Invited" ? "Invitation Pending" : "Suspended"}</span>{adult.invitedAt && <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-500">Invited {new Date(adult.invitedAt).toLocaleDateString([], { month: "short", day: "numeric" })}</span>}</div></div></div><span className={`rounded-full px-2 py-1 text-[9px] font-black ${adult.financialPrivacy === "Private" ? "bg-violet-100 text-violet-800" : "bg-blue-100 text-blue-800"}`}>{adult.financialPrivacy} Billing</span></div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2"><Detail label="Household" value={adult.householdName} /><Detail label="Billing split" value={adult.billingResponsibility.mode === "Percentage" ? `${adult.billingResponsibility.percentage ?? 0}%` : adult.billingResponsibility.mode === "Fixed" ? `$${(adult.billingResponsibility.fixedWeeklyAmount ?? 0).toFixed(2)} / week` : adult.billingResponsibility.mode} /></div>
            <div className="mt-4 flex flex-wrap gap-1.5">{familyPermissionKeys.filter((key) => adult.permissions[key]).slice(0, 7).map((key) => <span key={key} className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600">{permissionLabels[key]}</span>)}{familyPermissionKeys.filter((key) => adult.permissions[key]).length > 7 && <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600">+{familyPermissionKeys.filter((key) => adult.permissions[key]).length - 7} more</span>}</div>
            <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">{adult.status === "Invited" ? adult.invitedAt ? <div className="flex items-center justify-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-black text-amber-900"><Mail className="h-4 w-4" />Invite Sent</div> : <button disabled={invitingAdultId === adult.id} onClick={() => void sendInvite(adult)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2.5 text-xs font-black text-white disabled:opacity-50">{invitingAdultId === adult.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}Send Invite</button> : adult.status === "Pending Approval" ? <button disabled={approvingAdultId === adult.id} onClick={() => openApprovalReview(adult)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 py-2.5 text-xs font-black text-white disabled:opacity-50"><ShieldCheck className="h-4 w-4" />Review & Approve</button> : <div className={`flex items-center justify-center rounded-xl px-3 py-2.5 text-xs font-black ${adult.status === "Active" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{adult.status === "Active" ? "Parent account is active" : "Account suspended"}</div>}<button onClick={() => setEditing({ ...adult, permissions: { ...adult.permissions }, billingResponsibility: { ...adult.billingResponsibility } })} className="rounded-xl bg-slate-950 px-3 py-2.5 text-xs font-black text-white">Edit Access</button><button disabled={saving} onClick={() => void removeAdult(adult)} aria-label={`Remove ${adult.name}`} className="rounded-xl border border-red-200 px-3 py-2.5 text-red-700"><Trash2 className="h-4 w-4" /></button></div>
          </article>)}
        </section>
      </div>}
    </div>

    {reviewingApproval && selected && <div className="fixed inset-0 z-[10001] overflow-y-auto bg-slate-950/75 p-3 backdrop-blur-sm">
      <section className="mx-auto my-8 w-full max-w-4xl overflow-hidden rounded-[30px] bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 bg-gradient-to-r from-blue-900 to-emerald-800 px-5 py-4 text-white">
          <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-blue-100">Final Parent Portal security review</p><h2 className="mt-1 text-2xl font-black">Review & Approve {reviewingApproval.name}</h2></div>
          <button disabled={Boolean(approvingAdultId)} onClick={() => setReviewingApproval(null)} className="rounded-xl bg-white/10 p-2"><X className="h-5 w-5" /></button>
        </header>
        <div className="space-y-6 p-5">
          {selected.custodyAccessAlert && <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-4"><div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-red-700" /><div><h3 className="font-black text-red-950">Custody / access alert is active</h3><p className="mt-1 text-xs font-semibold leading-5 text-red-900">{selected.custodyAccessNote || "Review verified custody/access documentation before approving this account."}</p></div></div></div>}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Child" value={`${selected.firstName} ${selected.lastName}`} />
            <Detail label="Adult" value={reviewingApproval.name} />
            <Detail label="Relationship" value={reviewingApproval.relationship} />
            <Detail label="Household" value={reviewingApproval.householdName} />
          </div>

          <section className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
            <h3 className="font-black text-violet-950">Financial privacy review</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Detail label="Billing privacy" value={`${reviewingApproval.financialPrivacy} Billing`} />
              <Detail label="Responsibility" value={reviewingApproval.billingResponsibility.mode === "Percentage" ? `${reviewingApproval.billingResponsibility.percentage ?? 0}%` : reviewingApproval.billingResponsibility.mode === "Fixed" ? `${(reviewingApproval.billingResponsibility.fixedWeeklyAmount ?? 0).toFixed(2)} / week` : reviewingApproval.billingResponsibility.mode} />
            </div>
          </section>

          <section>
            <h3 className="font-black text-slate-950">Exactly what this account will be able to do</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">Green permissions will become available immediately after approval. Gray permissions remain blocked.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{familyPermissionKeys.map((key) => <div key={key} className={`flex items-center gap-3 rounded-xl border p-3 text-xs font-black ${reviewingApproval.permissions[key] ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-slate-200 bg-slate-50 text-slate-400"}`}><span className={`grid h-7 w-7 flex-none place-items-center rounded-lg ${reviewingApproval.permissions[key] ? "bg-emerald-700 text-white" : "bg-slate-200 text-slate-500"}`}>{reviewingApproval.permissions[key] ? <Check className="h-4 w-4" /> : <X className="h-3.5 w-3.5" />}</span>{permissionLabels[key]}</div>)}</div>
          </section>

          <section className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <h3 className="font-black text-blue-950">Required approval checks</h3>
            <ApprovalCheck checked={approvalIdentityChecked} onChange={setApprovalIdentityChecked} title="I verified the adult, child, relationship, and household." helper="I confirmed this is the correct adult account for this child and household." />
            <ApprovalCheck checked={approvalPermissionsChecked} onChange={setApprovalPermissionsChecked} title="I reviewed every permission and the billing/privacy settings." helper="I understand that enabled permissions will unlock as soon as I approve this account." />
            {selected.custodyAccessAlert && <ApprovalCheck checked={approvalCustodyChecked} onChange={setApprovalCustodyChecked} title="I reviewed the custody/access alert and supporting documentation." helper="I confirmed approval is consistent with the verified documentation and TCS policy." />}
          </section>
        </div>
        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 p-4 sm:flex-row sm:justify-end">
          <button disabled={Boolean(approvingAdultId)} onClick={() => setReviewingApproval(null)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-black">Not Yet</button>
          <button disabled={Boolean(approvingAdultId) || !approvalIdentityChecked || !approvalPermissionsChecked || Boolean(selected.custodyAccessAlert && !approvalCustodyChecked)} onClick={() => void approveAdult()} className="inline-flex min-w-48 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{approvingAdultId ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Approve & Activate</button>
        </footer>
      </section>
    </div>}

        {editing && selected && <div className="fixed inset-0 z-[10000] overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm">
      <section className="mx-auto my-8 w-full max-w-4xl overflow-hidden rounded-[30px] bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 bg-gradient-to-r from-[#173d29] to-[#265b3c] px-5 py-4 text-white"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-200">Adult access for {selected.firstName}</p><h2 className="mt-1 text-2xl font-black">{adults.some((adult) => adult.id === editing.id) ? "Edit Parent / Guardian" : "Add Parent / Guardian"}</h2></div><button disabled={saving} onClick={() => setEditing(null)} className="rounded-xl bg-white/10 p-2"><X className="h-5 w-5" /></button></header>
        <div className="space-y-6 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Adult name"><input className={inputClass} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} placeholder="Parent or guardian name" /></Field>
            <Field label="Email used to sign in"><input type="email" className={inputClass} value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })} placeholder="parent@example.com" /></Field>
            <Field label="Relationship"><select className={inputClass} value={editing.relationship} onChange={(event) => setEditing({ ...editing, relationship: event.target.value })}><option>Mother</option><option>Father</option><option>Parent / Guardian</option><option>Stepparent</option><option>Grandmother</option><option>Grandfather</option><option>Foster Parent</option><option>Legal Guardian</option><option>Respite Provider</option><option>Case Worker</option><option>Emergency Contact</option><option>Authorized Pickup</option><option>Other</option></select></Field>
            <Field label="Household name"><input className={inputClass} value={editing.householdName} onChange={(event) => setEditing({ ...editing, householdName: event.target.value })} placeholder="Moore Household" /></Field>
            <Field label="Account status"><select className={inputClass} value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value as FamilyAdultAccess["status"] })}>{editing.status === "Active" && <option>Active</option>}{editing.status === "Pending Approval" && <option>Pending Approval</option>}<option>Invited</option><option>Suspended</option></select><span className="mt-1 block text-[10px] font-semibold leading-4 text-slate-500">New accounts stay Invited until the parent creates their password, then move to Pending Approval. Only the approval review can make them Active.</span></Field>
            <Field label="Financial privacy"><select className={inputClass} value={editing.financialPrivacy} onChange={(event) => setEditing({ ...editing, financialPrivacy: event.target.value as FamilyAdultAccess["financialPrivacy"] })}><option value="Private">Private — hide other household finances</option><option value="Shared">Shared — household sees shared balance</option></select></Field>
          </div>

          <section className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
            <div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 h-5 w-5 flex-none text-violet-800" /><div><h3 className="font-black text-violet-950">Billing responsibility</h3><p className="mt-1 text-xs font-semibold leading-5 text-violet-900">This controls this adult's responsibility only. With Private billing, another household should not see whether this adult paid, owes a balance, uses a subsidy, or has a saved payment method.</p></div></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Field label="Split type"><select className={inputClass} value={editing.billingResponsibility.mode} onChange={(event) => setEditing({ ...editing, billingResponsibility: { ...editing.billingResponsibility, mode: event.target.value as FamilyAdultAccess["billingResponsibility"]["mode"] } })}><option>Shared</option><option>Percentage</option><option>Fixed</option><option>Custom</option></select></Field>
              {editing.billingResponsibility.mode === "Percentage" && <Field label="Percent responsible"><input type="number" min={0} max={100} className={inputClass} value={editing.billingResponsibility.percentage ?? 50} onChange={(event) => setEditing({ ...editing, billingResponsibility: { ...editing.billingResponsibility, percentage: Number(event.target.value) } })} /></Field>}
              {editing.billingResponsibility.mode === "Fixed" && <Field label="Weekly amount"><input type="number" min={0} step="0.01" className={inputClass} value={editing.billingResponsibility.fixedWeeklyAmount ?? 0} onChange={(event) => setEditing({ ...editing, billingResponsibility: { ...editing.billingResponsibility, fixedWeeklyAmount: Number(event.target.value) } })} /></Field>}
            </div>
          </section>

          <section>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-lg font-black text-slate-950">Portal permissions</h3><p className="mt-1 text-xs text-slate-500">Being connected to the child does not automatically mean this adult can see or change everything.</p></div><div className="flex flex-wrap gap-2"><Preset label="Full Parent" onClick={() => applyPreset("full")} /><Preset label="View Only" onClick={() => applyPreset("view")} /><Preset label="Pickup Only" onClick={() => applyPreset("pickup")} /></div></div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{familyPermissionKeys.map((key) => <button type="button" key={key} onClick={() => togglePermission(key)} className={`flex items-center gap-3 rounded-xl border p-3 text-left text-xs font-black transition ${editing.permissions[key] ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-slate-200 bg-white text-slate-500"}`}><span className={`grid h-7 w-7 flex-none place-items-center rounded-lg ${editing.permissions[key] ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-400"}`}>{editing.permissions[key] ? <Check className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</span>{permissionLabels[key]}</button>)}</div>
          </section>
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 p-4"><button disabled={saving} onClick={() => setEditing(null)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-black">Cancel</button><button disabled={saving} onClick={() => void saveAdult()} className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Access</button></footer>
      </section>
    </div>}
  </div></MainLayout>;
}

function ApprovalCheck({ checked, onChange, title, helper }: { checked: boolean; onChange: (checked: boolean) => void; title: string; helper: string }) {
  return <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-blue-200 bg-white p-3"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 accent-blue-700" /><span><strong className="block text-xs text-slate-950">{title}</strong><span className="mt-1 block text-[10px] font-semibold leading-4 text-slate-500">{helper}</span></span></label>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-xs font-bold text-slate-800">{value}</p></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>;
}

function Preset({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm">{label}</button>;
}
