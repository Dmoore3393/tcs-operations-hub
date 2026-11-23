"use client";

import { compareChildrenByLastName } from "@/lib/child-sort";

import ChildEditorModal from "@/components/children/ChildEditorModal";
import { childFamilyFields, newChildFamilyId, type ChildFamilyMode } from "@/lib/child-family";
import ChildTransportSummary from "@/components/transportation/ChildTransportSummary";
import { usePersistentState } from "@/hooks/usePersistentState";
import { starterSchools, type SchoolRecord } from "@/lib/hub-data";
import { childSchool, transportChildKey, transportSchoolDirectory } from "@/lib/transport-child-schools";
import {PageIntro, StatCard, PrimaryButton, SecondaryButton} from "@/components/hub/HubUI";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { deriveFamiliesFromChildren } from "@/lib/family-derived";
import { emergencyCardReadiness } from "@/lib/emergency-cards";
import { sendHubNotificationEvent } from "@/lib/notification-client";
import { applyChildAgeProfile, deriveChildAgeProfile, emptyForm, locations as childLocationOptions, type ChildFormState, type ChildRecord } from "@/lib/children";
import { birthdayMonthNow, birthdayMonths, birthdaysInMonth, formatBirthday } from "@/lib/staff-contact";
import {
  Archive,
  Baby,
  CalendarClock,
  Camera,
  CakeSlice,
  Download,
  FileWarning,
  HeartPulse,
  Home,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Upload,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";


type LiveLocation = {
  id: string;
  slug: string;
  name: string;
  fullName: string;
  capacity: number;
  programType: string;
  colorPrimary: string;
  colorSecondary: string;
};

type SiteKey = "Halcom" | "Cornejo" | "Lara" | "Division" | "21st" | "Tehachapi";

const siteOrder: SiteKey[] = ["Halcom", "Cornejo", "Lara", "Division", "21st", "Tehachapi"];

function keyFor(value: string): SiteKey {
  if (/halcom|moore family/i.test(value)) return "Halcom";
  if (/33rd|cornejo/i.test(value)) return "Cornejo";
  if (/42nd|lara/i.test(value)) return "Lara";
  if (/division|school age/i.test(value)) return "Division";
  if (/21st|cathers/i.test(value)) return "21st";
  return "Tehachapi";
}

function locationKey(location: LiveLocation): SiteKey {
  return keyFor(`${location.slug} ${location.name} ${location.fullName}`);
}

const nameOf = (child: ChildRecord) => `${child.firstName} ${child.lastName}`.trim();
const initials = (child: ChildRecord) => `${child.firstName?.[0] ?? ""}${child.lastName?.[0] ?? ""}`.toUpperCase();

const toForm = (child: ChildRecord): ChildFormState => {
  const normalized = applyChildAgeProfile(child);
  return ({
  firstName: normalized.firstName,
  schoolName: childSchool(normalized),
  schoolGrade: normalized.schoolAgeSupport?.grade || "",
  noTransportationNeeded: normalized.noTransportationNeeded === true,
  lastName: normalized.lastName,
  age: normalized.age,
  dateOfBirth: normalized.dateOfBirth,
  ageGroup: normalized.ageGroup,
  location: normalized.location,
  fundingLocation: normalized.fundingLocation ?? "",
  classroom: normalized.classroom,
  primaryGuardian: normalized.primaryGuardian,
  secondaryGuardian: normalized.secondaryGuardian ?? "",
  secondaryGuardianPhone: normalized.secondaryGuardianPhone ?? "",
  secondaryGuardianEmail: normalized.secondaryGuardianEmail ?? "",
  phone: normalized.phone,
  familyName: normalized.familyName ?? "",
  guardianEmail: normalized.guardianEmail ?? "",
  subsidy: normalized.subsidy,
  weeklySchedule: normalized.weeklySchedule,
  transportation: normalized.transportation,
  allergies: normalized.allergies,
  medicalNotes: normalized.medicalNotes,
  licensingStatus: normalized.licensingStatus,
  missingDocuments: normalized.missingDocuments.join(", "),
  enrollmentStatus: normalized.enrollmentStatus,
  plannedStartDate: normalized.plannedStartDate ?? "",
  plannedLastDay: normalized.plannedLastDay ?? "",
  attendanceToday: normalized.attendanceToday,
  medicalConsentStatus: normalized.medicalConsentStatus ?? "Missing",
  medicalConsentSignedAt: normalized.medicalConsentSignedAt ?? "",
  medicalConsentVerifiedAt: normalized.medicalConsentVerifiedAt ?? "",
  medicalProvider: normalized.medicalProvider ?? "",
  medicalProviderPhone: normalized.medicalProviderPhone ?? "",
  dentistProvider: normalized.dentistProvider ?? "",
  dentistPhone: normalized.dentistPhone ?? "",
  insuranceProvider: normalized.insuranceProvider ?? "",
  insuranceMemberId: normalized.insuranceMemberId ?? "",
  emergencyContact1Name: normalized.emergencyContact1Name ?? "",
  emergencyContact1Phone: normalized.emergencyContact1Phone ?? "",
  emergencyContact1Relationship: normalized.emergencyContact1Relationship ?? "",
  emergencyContact2Name: normalized.emergencyContact2Name ?? "",
  emergencyContact2Phone: normalized.emergencyContact2Phone ?? "",
  emergencyContact2Relationship: normalized.emergencyContact2Relationship ?? "",
  transportRestraint: normalized.transportRestraint ?? "",
  emergencyInstructions: normalized.emergencyInstructions ?? "",
  });
};

export default function ChildrenCenterLivePage() {
  const { session, isEmployee } = useAuth();
  const canManage = !isEmployee;
  const accessToken = session?.access_token;
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [schools] = usePersistentState<SchoolRecord[]>("tcs-schools-v2", starterSchools);
  const schoolOptions = useMemo(() => transportSchoolDirectory(schools, children), [schools, children]);
  const [locations, setLocations] = useState<LiveLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("All Locations");
  const [ageFilter, setAgeFilter] = useState("All Children");
  const [payFilter, setPayFilter] = useState("All Pay Sources");
  const [editing, setEditing] = useState<ChildRecord | null>(null);
  const [selected, setSelected] = useState<ChildRecord | null>(null);
  const [form, setForm] = useState<ChildFormState>({ ...emptyForm });
  const [familyMode, setFamilyMode] = useState<ChildFamilyMode>("new");
  const [selectedFamilyId, setSelectedFamilyId] = useState<number | "">("");
  const tourHandoffProcessed = useRef(false);
  const editQueryProcessed = useRef(false);

  const request = useCallback(async (method: "GET" | "POST", body?: Record<string, unknown>) => {
    if (!accessToken) throw new Error("Your staff session is not ready yet.");
    const response = await fetch("/api/children", {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const raw = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    } catch {
      payload = { error: raw };
    }
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "The child database request failed.");
    return payload;
  }, [accessToken]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const payload = await request("GET");
      const loadedChildren = Array.isArray(payload.children) ? payload.children as ChildRecord[] : [];
      setChildren(loadedChildren.map((child) => applyChildAgeProfile(child)));
      setLocations(Array.isArray(payload.locations) ? payload.locations as LiveLocation[] : []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load child records.");
    } finally {
      setLoading(false);
    }
  }, [request, accessToken]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  useEffect(() => {
    if (loading || editQueryProcessed.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const editChildId = params.get("editChild");
    const viewChildId = params.get("child");
    if (!editChildId && !viewChildId) return;
    const target = editChildId || viewChildId;
    const child = children.find((item) => transportChildKey(item) === target || String(item.id) === target);
    if (!child) return;
    const timer = window.setTimeout(() => {
      editQueryProcessed.current = true;
      if (editChildId && canManage) {
        setEditing(child); setForm(toForm(child)); setFamilyMode("keep"); setSelectedFamilyId(""); setSelected(null);
      } else setSelected(child);
      window.history.replaceState({}, "", window.location.pathname);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [children, loading, canManage]);

  useEffect(() => {
    if (loading || tourHandoffProcessed.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("fromTour") !== "1") return;
    const raw = sessionStorage.getItem("tcs-tour-child-handoff");
    if (!raw) return;
    const timer = window.setTimeout(() => {
    tourHandoffProcessed.current = true;
    try {
      const handoff = JSON.parse(raw) as Record<string, unknown>;
      const requestedLocation = String(handoff.location || "");
      const matchedLocation = childLocationOptions.find((option) => keyFor(option) === keyFor(requestedLocation)) || emptyForm.location;
      setEditing({} as ChildRecord);
      setFamilyMode("new");
      setSelectedFamilyId("");
      setForm({
        ...emptyForm,
        firstName: String(handoff.firstName || ""),
        lastName: String(handoff.lastName || ""),
        familyName: String(handoff.familyName || ""),
        primaryGuardian: String(handoff.primaryGuardian || ""),
        phone: String(handoff.phone || ""),
        guardianEmail: String(handoff.guardianEmail || ""),
        location: matchedLocation,
        subsidy: String(handoff.subsidy || ""),
        weeklySchedule: String(handoff.weeklySchedule || ""),
        plannedStartDate: String(handoff.preferredStartDate || ""),
        transportation: String(handoff.transportation || "No transportation"),
      });
      sessionStorage.removeItem("tcs-tour-child-handoff");
      window.history.replaceState({}, "", window.location.pathname);
      flash("Enrollment information carried over from the Tour Board. Enter the date of birth to finish age and room placement.");
    } catch {
      sessionStorage.removeItem("tcs-tour-child-handoff");
    }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loading]);

  const live = children.filter((child) => child.enrollmentStatus !== "Archived");
  const active = live.filter((child) => child.enrollmentStatus === "Active");
  const pending = live.filter((child) => child.enrollmentStatus === "Pending");
  const families = useMemo(() => deriveFamiliesFromChildren(live), [live]);
  const fileAlerts = live.filter((child) => child.licensingStatus === "Missing Documents").length;
  const healthAlerts = live.filter((child) => !/^none reported$/i.test(child.allergies || "None reported")).length;
  const paySources = useMemo(() => [...new Set(live.map((child) => child.subsidy).filter(Boolean))].sort(), [live]);

  const siteRows = useMemo(() => locations.map((location) => {
    const key = locationKey(location);
    const enrolled = active.filter((child) => keyFor(child.location) === key).length;
    const capacity = Math.max(0, Number(location.capacity) || 0);
    const open = Math.max(0, capacity - enrolled);
    return {
      ...location,
      key,
      enrolled,
      open,
      pct: capacity > 0 ? Math.min(100, Math.round((enrolled / capacity) * 100)) : 0,
    };
  }).sort((a, b) => siteOrder.indexOf(a.key) - siteOrder.indexOf(b.key)), [locations, active]);

  const totalCapacity = siteRows.reduce((sum, site) => sum + site.capacity, 0);
  const enrolledInVisibleSites = siteRows.reduce((sum, site) => sum + site.enrolled, 0);
  const openSpots = siteRows.reduce((sum, site) => sum + site.open, 0);
  const capacityPct = totalCapacity > 0 ? Math.min(100, Math.round((enrolledInVisibleSites / totalCapacity) * 100)) : 0;

  const filtered = live.filter((child) =>
    (!search || `${nameOf(child)} ${child.primaryGuardian} ${child.location} ${child.subsidy}`.toLowerCase().includes(search.toLowerCase())) &&
    (siteFilter === "All Locations" || keyFor(child.location) === siteFilter) &&
    (ageFilter === "All Children" || child.ageGroup === ageFilter) &&
    (payFilter === "All Pay Sources" || child.subsidy === payFilter)
  ).sort(compareChildrenByLastName);

  const birthdayMonth = birthdayMonthNow();
  // The current roster is already authorized by /api/children and narrowed by the view filters.
  const childBirthdays = birthdaysInMonth(filtered.filter((child) => child.enrollmentStatus === "Active" && deriveChildAgeProfile(child.dateOfBirth)).map((child) => {
    const [, month, day] = child.dateOfBirth.split("-").map(Number);
    return { id: String(child.id), name: nameOf(child), month, day };
  }), birthdayMonth);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }

  function openAdd() {
    setEditing({} as ChildRecord);
    setForm({ ...emptyForm });
    setFamilyMode("new");
    setSelectedFamilyId("");
    setError("");
  }

  function openEdit(child: ChildRecord) {
    setEditing(child);
    setForm(toForm(child));
    setFamilyMode("keep");
    setSelectedFamilyId("");
    setSelected(null);
  }

  function chooseFamily(value: string) {
    if (!value) return setSelectedFamilyId("");
    const family = families.find((item) => item.id === Number(value));
    if (!family) return;
    setSelectedFamilyId(family.id);
    setForm((current) => ({
      ...current,
      familyName: family.familyName,
      // A family link must not copy another child's parent, phone, email or funding.
    }));
  }

  async function saveChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    if (!form.firstName.trim() || !form.lastName.trim()) return setError("Enter the child’s first and last name.");
    if (!form.primaryGuardian.trim()) return setError("Enter at least one parent or guardian.");
    if (familyMode === "existing" && selectedFamilyId === "") return setError("Choose an existing family or Create New Family.");
    const family = selectedFamilyId === "" ? undefined : families.find((item) => item.id === selectedFamilyId);
    const missingDocuments = form.licensingStatus === "Missing Documents" ? form.missingDocuments.split(",").map((item) => item.trim()).filter(Boolean) : [];
    const ageProfile = deriveChildAgeProfile(form.dateOfBirth);
    if (form.dateOfBirth && !ageProfile) return setError("Correct the date of birth or leave it blank.");
    let familyFields: ReturnType<typeof childFamilyFields>;
    try {
      familyFields = childFamilyFields(form, familyMode, editing, family, () => newChildFamilyId([
        ...families.map((item) => item.id), ...children.flatMap((item) => item.familyId ? [item.familyId] : []),
      ]));
    } catch (caught) {
      return setError(caught instanceof Error ? caught.message : "Could not prepare this child's family details.");
    }
    const child: ChildRecord = {
      id: editing?.id || Date.now(),
      legacyId: editing?.legacyId,
      updatedAt: editing?.updatedAt,
      schoolAgeSupport: { ...editing?.schoolAgeSupport, schoolName: form.schoolName || "", grade: form.schoolGrade ?? editing?.schoolAgeSupport?.grade ?? "" } as ChildRecord["schoolAgeSupport"],
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      age: ageProfile?.age || "Age not entered",
      dateOfBirth: form.dateOfBirth,
      ageGroup: ageProfile?.ageGroup || "Unknown",
      location: form.location,
      fundingLocation: form.fundingLocation,
      classroom: ageProfile?.classroom || "Not assigned",
      ...familyFields,
      weeklySchedule: form.weeklySchedule.trim() || "Schedule not entered",
      transportation: form.transportation.trim() || "No transportation",
      noTransportationNeeded: form.noTransportationNeeded === true,
      allergies: form.allergies.trim() || "None reported",
      medicalNotes: form.medicalNotes.trim() || "No current medical notes",
      licensingStatus: form.licensingStatus,
      missingDocuments,
      enrollmentStatus: form.enrollmentStatus,
      plannedStartDate: form.plannedStartDate,
      plannedLastDay: form.plannedLastDay,
      attendanceToday: form.attendanceToday,
      medicalConsentStatus: form.medicalConsentStatus,
      medicalConsentSignedAt: form.medicalConsentSignedAt,
      medicalConsentVerifiedAt: form.medicalConsentVerifiedAt,
      medicalProvider: form.medicalProvider.trim(),
      medicalProviderPhone: form.medicalProviderPhone.trim(),
      dentistProvider: form.dentistProvider.trim(),
      dentistPhone: form.dentistPhone.trim(),
      insuranceProvider: form.insuranceProvider.trim(),
      insuranceMemberId: form.insuranceMemberId.trim(),
      emergencyContact1Name: form.emergencyContact1Name.trim(),
      emergencyContact1Phone: form.emergencyContact1Phone.trim(),
      emergencyContact1Relationship: form.emergencyContact1Relationship.trim(),
      emergencyContact2Name: form.emergencyContact2Name.trim(),
      emergencyContact2Phone: form.emergencyContact2Phone.trim(),
      emergencyContact2Relationship: form.emergencyContact2Relationship.trim(),
      transportRestraint: form.transportRestraint.trim(),
      emergencyInstructions: form.emergencyInstructions.trim(),
    };
    setSaving(true);
    try {
      const payload = await request("POST", { action: editing?.id ? "update" : "save", child });
      const saved = payload.child as ChildRecord;
      setChildren((current) => current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
      if (!emergencyCardReadiness(saved).ready) {
        void sendHubNotificationEvent({
          accessToken: session?.access_token,
          eventType: "emergency_record_attention",
          location: keyFor(saved.location),
          eventKey: `emergency:${saved.id}:${saved.medicalConsentStatus || "Missing"}:${saved.medicalConsentVerifiedAt || "unverified"}`,
        });
      }
      setEditing(null);
      flash(`${nameOf(saved)} saved securely.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save child.");
    } finally {
      setSaving(false);
    }
  }

  async function archive(child: ChildRecord) {
    setSaving(true);
    try {
      const payload = await request("POST", { action: "archive", child });
      const saved = payload.child as ChildRecord;
      setChildren((current) => current.map((item) => item.id === saved.id ? saved : item));
      setSelected(null);
      flash(`${nameOf(child)} archived.`);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Could not archive child.");
    } finally {
      setSaving(false);
    }
  }

  function exportRoster() {
    const rows = [
      ["Child", "Age", "Location", "Age Group", "Schedule", "Pay Source", "Status"],
      ...filtered.map((child) => [nameOf(child), child.age, keyFor(child.location), child.ageGroup, child.weeklySchedule, child.subsidy, child.enrollmentStatus]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    anchor.download = "tcs-child-roster.csv";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  return <MainLayout><div className="mx-auto w-full max-w-[1600px] text-slate-900"><div className="space-y-6 pb-8">
    <PageIntro eyebrow="Children & care" title="Children" description="Find child records, manage enrollment, and keep each location ready for care." actions={<>{canManage && <PrimaryButton onClick={openAdd}><Plus className="h-4 w-4" /> Add Child</PrimaryButton>}<SecondaryButton onClick={exportRoster}><Download className="h-4 w-4" /> Export Roster</SecondaryButton></>} />

    {(error || notice) && <div role={error ? "alert" : "status"} className={`flex justify-between rounded-xl border px-4 py-2 text-base font-bold ${error ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}><span>{error || notice}</span><button aria-label="Dismiss message" className="min-h-11 min-w-11" onClick={() => { setError(""); setNotice(""); }}><X className="h-4 w-4" /></button></div>}


    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><MiniStat icon={<UsersRound />} n={active.length} l="Total Enrolled" /><MiniStat icon={<Baby />} n={openSpots} l="Open Spots" /><MiniStat icon={<CalendarClock />} n={pending.length} l="Pending Enrollment" /><MiniStat icon={<UsersRound />} n={families.length} l="Active Families" /><MiniStat icon={<FileWarning />} n={fileAlerts} l="Documents Missing" /></section>

    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-xl font-black">Child roster</h2><p className="mb-4 mt-1 text-base font-semibold text-slate-600" data-child-sort="last-name">Sorted by last name, then first name (A–Z).</p>
          <div className="flex flex-wrap gap-2"><Pill active={ageFilter === "All Children"} onClick={() => setAgeFilter("All Children")}>All Children ({live.length})</Pill>{["Infant", "Toddler", "Preschool", "School Age"].map((age) => <Pill key={age} active={ageFilter === age} onClick={() => setAgeFilter(age)}>{age} ({live.filter((child) => child.ageGroup === age).length})</Pill>)}</div>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_180px_180px]"><label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" /><input aria-label="Search children" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search child, family, or pay source…" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-base outline-none focus:ring-2 focus:ring-[#6ee7b7]" /></label><select aria-label="Filter by location" value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-base font-semibold"><option>All Locations</option>{siteRows.map((site) => <option key={site.key}>{site.key}</option>)}</select><select aria-label="Filter by pay source" value={payFilter} onChange={(event) => setPayFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-base font-semibold"><option>All Pay Sources</option>{paySources.map((source) => <option key={source}>{source}</option>)}</select></div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? <div className="flex min-h-56 items-center justify-center gap-2 text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading secured child records…</div> : filtered.length === 0 ? <div className="p-12 text-center"><Baby className="mx-auto h-9 w-9 text-[#047857]" /><h2 className="mt-2 font-black">No children match this view</h2></div>  : <><div className="space-y-3 p-4 md:hidden">{filtered.map(child => <article key={child.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><button onClick={() => setSelected(child)} className="flex min-h-11 items-center gap-3 text-left font-black"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800">{initials(child)}</span><span>{nameOf(child)}<span className="mt-1 block text-base font-medium text-slate-500">{child.age} · {child.ageGroup}</span></span></button><span className="rounded-lg bg-slate-100 px-2 py-1 text-base font-bold">{child.enrollmentStatus}</span></div><dl className="mt-4 grid grid-cols-2 gap-3 text-base"><div><dt className="text-base text-slate-500">Location</dt><dd className="font-semibold">{keyFor(child.location)}</dd></div><div><dt className="text-base text-slate-500">Pay source</dt><dd className="font-semibold">{child.subsidy || "Not entered"}</dd></div><div className="col-span-2"><dt className="text-base text-slate-500">Schedule</dt><dd>{child.weeklySchedule || "Not entered"}</dd></div></dl><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => setSelected(child)} className="min-h-11 rounded-xl bg-emerald-800 px-4 font-bold text-white">View File</button><Link href={`/emergency-cards?child=${child.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-3 font-bold">Emergency Card</Link></div></article>)}</div><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[850px] text-left text-base"><thead className="bg-[#f8fafc] text-sm text-slate-500"><tr>{["Child", "Age", "Location", "Program / Age Group", "Schedule", "Pay Source", "Status", "Actions"].map((heading) => <th key={heading} className="px-4 py-3 font-black">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((child) => <tr key={child.id} className="hover:bg-[#f0fdf4]"><td className="px-4 py-3"><button onClick={() => setSelected(child)} className="flex items-center gap-3 font-black"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#ecfdf5] text-sm text-[#065f46]">{initials(child)}</span>{nameOf(child)}</button></td><td className="px-4 py-3">{child.age}</td><td className="px-4 py-3">{keyFor(child.location)}</td><td className="px-4 py-3">{child.ageGroup}</td><td className="max-w-40 truncate px-4 py-3">{child.weeklySchedule}</td><td className="px-4 py-3">{child.subsidy}</td><td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-sm font-black ${child.enrollmentStatus === "Active" ? "bg-[#dcfce7] text-[#166534]" : "bg-amber-100 text-amber-800"}`}>{child.enrollmentStatus}</span></td><td className="px-4 py-3"><div className="flex gap-2"><button onClick={() => setSelected(child)} className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">View File</button><Link href={`/emergency-cards?child=${child.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">Emergency Card</Link><button onClick={() => setSelected(child)} aria-label={`Open actions for ${nameOf(child)}`} className="min-h-11 rounded-lg border border-slate-200 p-2"><MoreHorizontal className="h-4 w-4" /></button></div></td></tr>)}</tbody></table></div></>}
        </section>

        <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><summary className="min-h-11 cursor-pointer font-black">Childcare tools</summary><p className="mb-4 mt-1 text-base text-slate-500">Enrollment, records, schedules, and support.</p><div className="grid gap-2 sm:grid-cols-2">{canManage && <Link href="/children/import-brightwheel" className="inline-flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-bold text-slate-700 hover:bg-emerald-50"><Upload className="h-4 w-4" /> Import Brightwheel</Link>}{canManage && <Link href="/child-file-audits" className="inline-flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-bold text-slate-700 hover:bg-emerald-50"><FileWarning className="h-4 w-4" /> Child File Audits</Link>}{canManage && <Link href="/immunization-tracker" className="inline-flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-bold text-slate-700 hover:bg-emerald-50"><HeartPulse className="h-4 w-4" /> Shot Records</Link>}{canManage && <Link href="/child-photos" className="inline-flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-bold text-slate-700 hover:bg-emerald-50"><Camera className="h-4 w-4" /> Child Photos</Link>}{canManage && <Link href="/weekly-checkins" className="inline-flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-bold text-slate-700 hover:bg-emerald-50"><CalendarClock className="h-4 w-4" /> Weekly Check-Ins</Link>}{canManage && <Link href="/school-age-support" className="inline-flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-bold text-slate-700 hover:bg-emerald-50"><CalendarClock className="h-4 w-4" /> School Age Support</Link>}<Link href="/emergency-cards" className="inline-flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-bold text-slate-700 hover:bg-emerald-50"><HeartPulse className="h-4 w-4" /> Emergency Medical Cards</Link><Link href="/enrollment-pipeline" className="inline-flex items-center gap-2 rounded-xl bg-[#047857] px-5 py-3 text-base font-black text-white"><FileWarning className="h-4 w-4" /> Start Enrollment</Link><Link href="/enrollment-forecast" className="inline-flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-bold text-slate-700 hover:bg-emerald-50"><CalendarClock className="h-4 w-4" /> Enrollment Forecast</Link><Link href="/child-schedules" className="inline-flex items-center gap-2 rounded-xl border border-[#cbd5e1] bg-[#ffffff] px-5 py-3 text-base font-black"><CalendarClock className="h-4 w-4" /> Child Schedules</Link></div></details>
      </div>

      <aside className="space-y-3">
        <section className="rounded-xl border border-[#e2e8f0] bg-[#ffffff] p-4 shadow-sm"><h2 className="font-black">Needs Attention</h2><div className="mt-3 space-y-3"><Action icon={<FileWarning />} n={fileAlerts} label="Missing Child Files" /><Action icon={<CalendarClock />} n={pending.length} label="Pending Enrollments" /><Action icon={<HeartPulse />} n={healthAlerts} label="Health / Allergy Alerts" /></div></section>
        <section className="rounded-xl border border-[#e2e8f0] bg-[#ffffff] p-4 shadow-sm">
          <h2 className="flex items-center gap-2 font-black"><CakeSlice className="h-5 w-5 text-[#047857]" />{birthdayMonths[birthdayMonth - 1]} Birthdays</h2>
          <p className="mt-1 text-sm text-slate-600">Celebrate children in the current roster view.</p>
          {loading ? <p className="mt-3 text-base text-slate-500">Loading birthdays…</p> : error ? <p className="mt-3 text-base text-slate-500">Refresh the roster to load birthdays.</p> : childBirthdays.length ? <ul className="mt-3 space-y-2">{childBirthdays.map((birthday) => <li key={birthday.id} className="flex items-center justify-between gap-3 rounded-lg bg-white p-3 text-base"><span className="font-bold">{birthday.name}</span><span className="shrink-0 font-semibold text-[#047857]">{formatBirthday(birthday.month, birthday.day)}</span></li>)}</ul> : <p className="mt-3 text-base text-slate-500">No birthdays listed this month.</p>}
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-black">Enrollment Snapshot</h2><p className="mt-4 text-3xl font-black">{enrolledInVisibleSites}<span className="text-lg font-semibold text-slate-400"> / {totalCapacity}</span></p><p className="mt-1 text-base text-slate-500">Enrolled · licensed capacity</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100" role="meter" aria-label="Enrollment capacity" aria-valuenow={capacityPct} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-emerald-600" style={{width:`${Math.min(100,capacityPct)}%`}} /></div><div className="mt-3 flex justify-between text-base"><span>{capacityPct}% filled</span><strong className="text-emerald-800">{openSpots} open spots</strong></div></section>



      </aside>
    </div>

    <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><summary className="min-h-11 cursor-pointer font-black">Location enrollment & capacity</summary><p className="text-base text-slate-500">Choose a location to filter the roster.</p>    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {loading && siteRows.length === 0 ? Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-[116px] animate-pulse rounded-xl bg-slate-100" />) : siteRows.map((site) => <button key={site.id || site.slug} onClick={() => setSiteFilter(site.key)} className={`min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white hover:border-emerald-500 focus-visible:outline-2 focus-visible:outline-emerald-600 text-left transition`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 p-4"><span className="flex items-center gap-2"><Home className="h-5 w-5 text-emerald-700" /><strong>{site.key}</strong></span><span className="text-base font-bold uppercase tracking-wide text-slate-500">{site.programType}</span></div>
        <div className="grid grid-cols-3 divide-x divide-slate-100 p-3 text-center"><Cell n={site.capacity} l="Capacity" /><Cell n={site.enrolled} l="Enrolled" /><Cell n={site.open} l="Open Spots" hot /></div>
      </button>)}
    </div>
</details>

    {editing && <ChildEditorModal existingChild={Boolean(editing.id)} schools={schoolOptions} activeLocations={locations.map(location => location.fullName || location.name)} error={error} title={editing.id ? `Edit ${nameOf(editing)}` : "Add Child"} form={form} setForm={setForm} families={families} familyMode={familyMode} setFamilyMode={setFamilyMode} selectedFamilyId={selectedFamilyId} chooseFamily={chooseFamily} saving={saving} onClose={() => setEditing(null)} onSubmit={saveChild} />}
    {selected && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4">
      <button className="absolute inset-0" onClick={() => setSelected(null)} aria-label="Close" />
      <section role="dialog" aria-modal="true" aria-label={`Child file: ${nameOf(selected)}`} className="relative z-10 max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-[#ffffff] p-6 shadow-2xl">
        <div className="flex justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-wider text-[#047857]">Child File</p>
            <h2 className="text-2xl font-black">{nameOf(selected)}</h2>
            <p className="text-base text-slate-500">{selected.age} • Care: {keyFor(selected.location)} • {selected.ageGroup}</p><p className="mt-1 text-base text-slate-700">Funding authorization: {selected.fundingLocation ? keyFor(selected.fundingLocation) : `Same as care location (${keyFor(selected.location)})`}</p>
          </div>
          <button aria-label="Close child file" className="min-h-11 min-w-11" onClick={() => setSelected(null)}><X /></button>
        </div>
        <ChildTransportSummary child={selected} canManage={canManage} />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Detail l="Parent / Guardian" v={selected.primaryGuardian} />
          <Detail l="Second Parent / Guardian" v={selected.secondaryGuardian || "Not entered"} />
          <Detail l="Second Parent Phone" v={selected.secondaryGuardianPhone || "Not entered"} />
          <Detail l="Second Parent Email" v={selected.secondaryGuardianEmail || "Not entered"} />
          <Detail l="Second Emergency Contact" v={selected.emergencyContact2Name ? [selected.emergencyContact2Name,selected.emergencyContact2Phone,selected.emergencyContact2Relationship].filter(Boolean).join(" • ") : "Not entered"} />
          {selected.additionalGuardianContacts?.map((contact,index) => <Detail key={`guardian-${index}`} l={`Additional Parent / Guardian ${index + 3}`} v={[contact.name,contact.phone,contact.email].filter(Boolean).join(" • ")} />)}
          {selected.additionalEmergencyContacts?.map((contact,index) => <Detail key={`emergency-${index}`} l={`Additional Emergency Contact ${index + 3}`} v={[contact.name,contact.phone,contact.relationship].filter(Boolean).join(" • ")} />)}
          <Detail l="Phone" v={selected.phone} />
          <Detail l="Schedule" v={selected.weeklySchedule} />
          <Detail l="Planned Start" v={selected.plannedStartDate || "Not entered"} />
          <Detail l="Planned Last Day" v={selected.plannedLastDay || "Not entered"} />
          {selected.careStatusNote && <Detail l="Care Status Note" v={selected.careStatusNote} />}
          <Detail l="Pay Source" v={selected.subsidy} />
          <Detail l="Transportation" v={selected.transportation} />
          <Detail l="File Status" v={selected.licensingStatus} />
          <Detail l="Allergies / Alerts" v={selected.allergies} />
          <Detail l="Support Notes" v={selected.medicalNotes} />
          <Detail l="Medical Consent" v={selected.medicalConsentStatus ?? "Missing"} />
          <Detail l="Emergency Contact" v={selected.emergencyContact1Name ? `${selected.emergencyContact1Name} • ${selected.emergencyContact1Phone || "No phone"}` : "Not entered"} />
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Link href={`/emergency-cards?child=${selected.id}`} className="inline-flex items-center gap-2 rounded-xl bg-[#065f46] px-4 py-2.5 text-base font-black text-white"><HeartPulse className="h-4 w-4" /> Emergency Card</Link>{canManage && keyFor(selected.location) !== "Tehachapi" && <Link href={`/child-file-audits?child=${selected.id}`} className="inline-flex items-center gap-2 rounded-xl bg-[#065f46] px-4 py-2.5 text-base font-black text-white"><FileWarning className="h-4 w-4" /> File Audit</Link>}{canManage && <Link href={`/immunization-tracker?child=${selected.id}`} className="inline-flex items-center gap-2 rounded-xl bg-[#065f46] px-4 py-2.5 text-base font-black text-white"><HeartPulse className="h-4 w-4" /> Shot Record</Link>}{canManage && selected.ageGroup === "School Age" && <Link href="/school-age-support" className="inline-flex items-center gap-2 rounded-xl bg-[#065f46] px-4 py-2.5 text-base font-black text-white"><CalendarClock className="h-4 w-4" /> School Support</Link>}
          {canManage && <Link href={`/child-photos?child=${encodeURIComponent(selected.legacyId || String(selected.id))}`} className="inline-flex items-center gap-2 rounded-xl bg-[#065f46] px-4 py-2.5 text-base font-black text-white"><Camera className="h-4 w-4" /> Photos</Link>}{canManage && <button onClick={() => openEdit(selected)} className="inline-flex items-center gap-2 rounded-xl bg-[#065f46] px-4 py-2.5 text-base font-black text-white"><Pencil className="h-4 w-4" /> Edit File</button>}
          {canManage && <button onClick={() => void archive(selected)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-base font-black"><Archive className="h-4 w-4" /> Archive</button>}
        </div>
      </section>
    </div>}
  </div></div></MainLayout>;
}

function Cell({ n, l, hot = false }: { n: number; l: string; hot?: boolean }) {
  return <div><p className={`text-xl font-black ${hot ? "text-[#047857]" : ""}`}>{n}</p><p className="text-base text-slate-500">{l}</p></div>;
}

function MiniStat({ icon, n, l }: { icon: ReactNode; n: number; l: string }) {
  return <StatCard label={l} value={n} icon={icon} />;
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} aria-pressed={active} className={`min-h-11 rounded-xl border px-4 py-2 text-base font-bold transition ${active ? "border-emerald-800 bg-emerald-800 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{children}</button>;
}

function Action({ icon, n, label }: { icon: ReactNode; n: number; label: string }) {
  return <div className="flex items-center gap-3 rounded-lg bg-white px-3 py-2"><span className="text-[#047857]">{icon}</span><p className="text-base"><strong>{n}</strong> {label}</p></div>;
}

function Detail({ l, v }: { l: string; v: string }) {
  return <div className="rounded-xl bg-[#f8fafc] p-3"><p className="text-base font-black uppercase tracking-wider text-slate-600">{l}</p><p className="mt-1 text-base font-bold text-slate-800">{v || "Not entered"}</p></div>;
}