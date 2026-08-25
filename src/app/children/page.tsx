"use client";

import MainLayout from "@/components/layout/MainLayout";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  Baby,
  Bus,
  CalendarDays,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Clock3,
  Database,
  FileText,
  HeartPulse,
  LoaderCircle,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  type AgeGroup,
  type AttendanceStatus,
  type ChildFormState,
  type ChildRecord,
  type EnrollmentStatus,
  type LicensingStatus,
  emptyForm,
  initialChildren,
  locations,
} from "@/lib/children";
import { usePersistentState } from "@/hooks/usePersistentState";
import { canAccessRoute, useAuth } from "@/components/providers/AuthProvider";
import { starterKidKareEnrollments, type KidKareEnrollment } from "@/lib/compliance-ops";
import { childAttendsLocation, createBlankChildSchedule, locationForChildRecord, starterChildSchedules, type ChildScheduleRecord } from "@/lib/child-schedules";
import { normalizeLocation } from "@/lib/location-config";

const fieldClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100";

function fullName(child: ChildRecord) {
  return `${child.firstName} ${child.lastName}`;
}

function initials(child: ChildRecord) {
  return `${child.firstName.charAt(0)}${child.lastName.charAt(0)}`.toUpperCase();
}

function parseMissingDocuments(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function ChildrenPage() {
  const { profile, isEmployee } = useAuth();
  const canManageChildFiles = !isEmployee;
  const canUseKidKare = canAccessRoute(profile, "/kidkare");
  const canUseSchedules = canAccessRoute(profile, "/child-schedules");
  const [children, setChildren, childrenReady] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const [, setKidKareRecords] = usePersistentState<KidKareEnrollment[]>("tcs-kidkare-enrollments-v1", starterKidKareEnrollments);
  const [childSchedules, setChildSchedules] = usePersistentState<ChildScheduleRecord[]>("tcs-child-schedules-v2", starterChildSchedules);
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("All Locations");
  const [ageGroupFilter, setAgeGroupFilter] = useState("All Age Groups");
  const [statusFilter, setStatusFilter] = useState("Active & Pending");
  const [sortBy, setSortBy] = useState("Name A–Z");
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingChildId, setEditingChildId] = useState<number | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [form, setForm] = useState<ChildFormState>(emptyForm);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const isLoading = !childrenReady;

  const selectedChild = useMemo(
    () => children.find((child) => child.id === selectedChildId) ?? null,
    [children, selectedChildId],
  );

  useEffect(() => {
    const modalIsOpen = showFormModal || selectedChildId !== null;
    if (!modalIsOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowFormModal(false);
        setSelectedChildId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showFormModal, selectedChildId]);

  const filteredChildren = useMemo(() => {
    const query = search.trim().toLowerCase();

    const results = children.filter((child) => {
      const matchesSearch =
        !query ||
        fullName(child).toLowerCase().includes(query) ||
        child.primaryGuardian.toLowerCase().includes(query) ||
        child.location.toLowerCase().includes(query);

      const schedule = childSchedules.find((record) => record.childId === child.id);
      const normalizedFilter = normalizeLocation(locationFilter);
      const matchesLocation = locationFilter === "All Locations" || (
        normalizedFilter !== "All Locations" && childAttendsLocation(child, schedule, normalizedFilter)
      );

      const matchesAgeGroup =
        ageGroupFilter === "All Age Groups" || child.ageGroup === ageGroupFilter;

      const matchesStatus =
        statusFilter === "All Enrollment Statuses" ||
        (statusFilter === "Active & Pending"
          ? child.enrollmentStatus !== "Archived"
          : child.enrollmentStatus === statusFilter);

      return matchesSearch && matchesLocation && matchesAgeGroup && matchesStatus;
    });

    return [...results].sort((a, b) => {
      if (sortBy === "Location") {
        return a.location.localeCompare(b.location) || fullName(a).localeCompare(fullName(b));
      }
      if (sortBy === "Documents Needing Attention") {
        return b.missingDocuments.length - a.missingDocuments.length || fullName(a).localeCompare(fullName(b));
      }
      if (sortBy === "Age Group") {
        return a.ageGroup.localeCompare(b.ageGroup) || fullName(a).localeCompare(fullName(b));
      }
      return fullName(a).localeCompare(fullName(b));
    });
  }, [children, childSchedules, search, locationFilter, ageGroupFilter, statusFilter, sortBy]);

  const activeChildren = children.filter((child) => child.enrollmentStatus === "Active");
  const presentCount = children.filter((child) => child.attendanceToday === "Present").length;
  const completeCount = children.filter(
    (child) => child.licensingStatus === "Complete" && child.enrollmentStatus !== "Archived",
  ).length;
  const missingCount = children.filter(
    (child) => child.licensingStatus === "Missing Documents" && child.enrollmentStatus !== "Archived",
  ).length;

  const hasActiveFilters =
    search !== "" ||
    locationFilter !== "All Locations" ||
    ageGroupFilter !== "All Age Groups" ||
    statusFilter !== "Active & Pending";

  function resetForm() {
    setEditingChildId(null);
    setForm(emptyForm);
    setFormError("");
  }

  function openAddChild() {
    resetForm();
    setShowFormModal(true);
  }

  function openEditChild(child: ChildRecord) {
    setEditingChildId(child.id);
    setForm({
      firstName: child.firstName,
      lastName: child.lastName,
      age: child.age,
      dateOfBirth: child.dateOfBirth,
      ageGroup: child.ageGroup,
      location: child.location,
      classroom: child.classroom,
      primaryGuardian: child.primaryGuardian,
      secondaryGuardian: child.secondaryGuardian ?? "",
      phone: child.phone,
      subsidy: child.subsidy,
      weeklySchedule: child.weeklySchedule,
      transportation: child.transportation,
      allergies: child.allergies,
      medicalNotes: child.medicalNotes,
      licensingStatus: child.licensingStatus,
      missingDocuments: child.missingDocuments.join(", "),
      enrollmentStatus: child.enrollmentStatus,
      attendanceToday: child.attendanceToday,
    });
    setFormError("");
    setSelectedChildId(null);
    setShowFormModal(true);
  }

  function updateForm<K extends keyof ChildFormState>(key: K, value: ChildFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function ensureKidKareEnrollment(child: ChildRecord) {
    if (child.enrollmentStatus === "Archived") return;
    const childName = fullName(child);
    setKidKareRecords((current) => {
      const existing = current.find((record) => record.childId === child.id && record.location === child.location);
      if (existing) {
        if (existing.childName === childName) return current;
        return current.map((record) => record.id === existing.id ? { ...record, childName } : record);
      }
      return [...current, {
        id: Math.max(0, ...current.map((record) => record.id)) + 1,
        childId: child.id,
        childName,
        location: child.location,
        required: true,
        status: "Not Started",
        dateAdded: "",
        completedBy: "",
        kidKareChildId: "",
        lastVerified: "",
        notes: "Automatically added to the KidKare queue when the child record was enrolled at this location.",
      }];
    });
  }

  function ensureChildSchedule(child: ChildRecord) {
    if (child.enrollmentStatus === "Archived") return;
    setChildSchedules((current) => {
      const existing = current.find((record) => record.childId === child.id);
      if (!existing) return [...current, createBlankChildSchedule(child)];
      const nextName = fullName(child);
      const nextLocation = locationForChildRecord(child.location);
      return current.map((record) => record.childId === child.id
        ? { ...record, childName: nextName, ageGroup: child.ageGroup, defaultLocation: nextLocation }
        : record);
    });
  }

  function saveChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setFormError("Please enter the child’s first and last name.");
      return;
    }

    if (!form.primaryGuardian.trim()) {
      setFormError("Please enter at least one parent or guardian.");
      return;
    }

    const missingDocuments = form.licensingStatus === "Missing Documents"
      ? parseMissingDocuments(form.missingDocuments)
      : [];

    if (form.licensingStatus === "Missing Documents" && missingDocuments.length === 0) {
      setFormError("List the missing document or choose Licensing Complete.");
      return;
    }

    const childRecord: ChildRecord = {
      id: editingChildId ?? Date.now(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      age: form.age.trim() || "Age not entered",
      dateOfBirth: form.dateOfBirth,
      ageGroup: form.ageGroup,
      location: form.location,
      classroom: form.classroom.trim() || `${form.ageGroup} Room`,
      primaryGuardian: form.primaryGuardian.trim(),
      secondaryGuardian: form.secondaryGuardian.trim() || undefined,
      phone: form.phone.trim() || "No phone entered",
      subsidy: form.subsidy,
      weeklySchedule: form.weeklySchedule.trim() || "Schedule not entered",
      transportation: form.transportation.trim() || "No transportation",
      allergies: form.allergies.trim() || "None reported",
      medicalNotes: form.medicalNotes.trim() || "No current medical notes",
      licensingStatus: form.licensingStatus,
      missingDocuments,
      enrollmentStatus: form.enrollmentStatus,
      attendanceToday: form.attendanceToday,
    };

    setIsSaving(true);
    setFormError("");
    setChildren((current) => editingChildId !== null
      ? current.map((child) => (child.id === editingChildId ? childRecord : child))
      : [childRecord, ...current]);
    ensureKidKareEnrollment(childRecord);
    ensureChildSchedule(childRecord);
    setIsSaving(false);
    setShowFormModal(false);
    resetForm();
  }

  function clearFilters() {
    setSearch("");
    setLocationFilter("All Locations");
    setAgeGroupFilter("All Age Groups");
    setStatusFilter("Active & Pending");
  }

  function toggleArchive(child: ChildRecord) {
    const nextStatus: EnrollmentStatus = child.enrollmentStatus === "Archived" ? "Active" : "Archived";
    setIsSaving(true);
    setChildren((current) => current.map((item) => item.id === child.id ? { ...item, enrollmentStatus: nextStatus } : item));
    setIsSaving(false);
    setSelectedChildId(null);
  }

  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-[1500px] space-y-6">
        <section className="overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-br from-white via-white to-emerald-50 shadow-sm">
          <div className="flex flex-col gap-5 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">
                <UsersRound className="h-3.5 w-3.5" />
                Enrollment records
              </div>
              <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                Children
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                {canManageChildFiles
                  ? "View enrollment, schedules, parent information, transportation, health alerts, and confidential child-file status for your authorized locations."
                  : "View the care information needed for supervision, including schedules, transportation, allergies, and support notes. Confidential child files and billing details stay restricted."}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {canUseKidKare && <Link href="/kidkare" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
                <ShieldCheck className="h-5 w-5" />
                KidKare Queue
              </Link>}
              {canUseSchedules && <Link href="/child-schedules" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
                <CalendarClock className="h-5 w-5" />
                Daily Schedules
              </Link>}
              {canManageChildFiles && <button
                type="button"
                onClick={openAddChild}
                disabled={isLoading}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-200 transition hover:-translate-y-0.5 hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="h-5 w-5" />
                Add Child
              </button>}
            </div>
          </div>
        </section>

        <section className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          {isLoading ? <LoaderCircle className="h-5 w-5 animate-spin text-emerald-700" /> : <Database className="h-5 w-5 text-emerald-700" />}
          <div><p className="font-bold text-emerald-950">{isLoading ? "Loading the shared Children file…" : "Secure shared Children file"}</p><p className="mt-0.5 text-xs text-emerald-800">{canManageChildFiles ? "Child-file changes save for Owner/Admin and authorized Location Licensees." : "Your employee login receives care-only child information; confidential files are not included."}</p></div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Active Enrollment"
            value={activeChildren.length}
            helper={`${children.filter((child) => child.enrollmentStatus === "Pending").length} pending enrollment`}
            icon={<UsersRound className="h-5 w-5" />}
            tone="slate"
          />
          <SummaryCard
            label="Present Today"
            value={presentCount}
            helper={`${activeChildren.length - presentCount} absent or not scheduled`}
            icon={<CheckCircle2 className="h-5 w-5" />}
            tone="green"
          />
          {canManageChildFiles && <SummaryCard
            label="Licensing Complete"
            value={completeCount}
            helper="Records ready for review"
            icon={<ShieldCheck className="h-5 w-5" />}
            tone="emerald"
          />}
          {canManageChildFiles && <SummaryCard
            label="Needs Attention"
            value={missingCount}
            helper="Missing or updated forms needed"
            icon={<CircleAlert className="h-5 w-5" />}
            tone="amber"
          />}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Search children</span>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  placeholder="Search child, guardian, or location…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className={`${fieldClass} pl-10`}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2 xl:flex xl:w-auto">
                <FilterSelect
                  label="Location"
                  value={locationFilter}
                  onChange={setLocationFilter}
                  options={["All Locations", ...locations]}
                />
                <FilterSelect
                  label="Age group"
                  value={ageGroupFilter}
                  onChange={setAgeGroupFilter}
                  options={["All Age Groups", "Infant", "Toddler", "Preschool", "School Age"]}
                />
                <FilterSelect
                  label="Enrollment status"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    "Active & Pending",
                    "All Enrollment Statuses",
                    "Active",
                    "Pending",
                    "Archived",
                  ]}
                />
                <FilterSelect
                  label="Sort"
                  value={sortBy}
                  onChange={setSortBy}
                  options={canManageChildFiles
                    ? ["Name A–Z", "Location", "Age Group", "Documents Needing Attention"]
                    : ["Name A–Z", "Location", "Age Group"]}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <p className="text-sm text-slate-500">
                Showing <span className="font-bold text-slate-900">{filteredChildren.length}</span> of{" "}
                <span className="font-bold text-slate-900">{children.length}</span> records
              </p>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
                >
                  <X className="h-4 w-4" />
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="hidden grid-cols-[minmax(250px,1.5fr)_minmax(180px,1fr)_minmax(165px,.8fr)_minmax(180px,.9fr)_130px] gap-5 border-b border-slate-200 bg-slate-50 px-6 py-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-500 xl:grid">
            <span>Child</span>
            <span>Care Details</span>
            <span>{canManageChildFiles ? "Guardian" : "Health Alert"}</span>
            <span>{canManageChildFiles ? "Documents" : "Care Notes"}</span>
            <span className="text-right">Actions</span>
          </div>

          {isLoading ? (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <LoaderCircle className="h-8 w-8 animate-spin text-emerald-600" />
              <p className="font-bold text-slate-900">Loading child records…</p>
              <p className="text-sm text-slate-500">Securely retrieving the Children file from Supabase.</p>
            </div>
          ) : filteredChildren.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {filteredChildren.map((child) => (
                <ChildRow
                  key={child.id}
                  child={child}
                  onOpen={() => setSelectedChildId(child.id)}
                  onEdit={() => openEditChild(child)}
                  adminView={canManageChildFiles}
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <Search className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-bold text-slate-900">
                {children.length === 0 && !hasActiveFilters ? "No child records yet" : "No children found"}
              </h2>
              <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">
                {children.length === 0 && !hasActiveFilters
                  ? "The secure Children file is ready. Add the first live child record when you are ready."
                  : "Try changing your search or filters. You can also add a new child record."}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Clear filters
                  </button>
                )}
                {canManageChildFiles && <button
                  type="button"
                  onClick={openAddChild}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  <Plus className="h-4 w-4" /> Add Child
                </button>}
              </div>
            </div>
          )}
        </section>
      </div>

      {showFormModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowFormModal(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="child-form-title"
            className="max-h-[94vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-7">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                  Enrollment record
                </p>
                <h2 id="child-form-title" className="mt-1 text-2xl font-black text-slate-950">
                  {editingChildId ? "Edit Child" : "Add Child"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Enter the information staff needs for enrollment and daily care.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close child form"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={saveChild} className="flex max-h-[calc(94vh-108px)] flex-col">
              <div className="flex-1 space-y-7 overflow-y-auto px-5 py-6 sm:px-7">
                <FormSection
                  icon={<Baby className="h-4 w-4" />}
                  title="Child information"
                  description="Basic enrollment and classroom details."
                >
                  <FormField label="First name" required>
                    <input
                      value={form.firstName}
                      onChange={(event) => updateForm("firstName", event.target.value)}
                      className={fieldClass}
                      placeholder="First name"
                      autoFocus
                    />
                  </FormField>
                  <FormField label="Last name" required>
                    <input
                      value={form.lastName}
                      onChange={(event) => updateForm("lastName", event.target.value)}
                      className={fieldClass}
                      placeholder="Last name"
                    />
                  </FormField>
                  <FormField label="Date of birth">
                    <input
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(event) => updateForm("dateOfBirth", event.target.value)}
                      className={fieldClass}
                    />
                  </FormField>
                  <FormField label="Display age">
                    <input
                      value={form.age}
                      onChange={(event) => updateForm("age", event.target.value)}
                      className={fieldClass}
                      placeholder="Example: 4 years"
                    />
                  </FormField>
                  <FormField label="Age group">
                    <select
                      value={form.ageGroup}
                      onChange={(event) => updateForm("ageGroup", event.target.value as AgeGroup)}
                      className={fieldClass}
                    >
                      <option>Infant</option>
                      <option>Toddler</option>
                      <option>Preschool</option>
                      <option>School Age</option>
                    </select>
                  </FormField>
                  <FormField label="Enrollment status">
                    <select
                      value={form.enrollmentStatus}
                      onChange={(event) =>
                        updateForm("enrollmentStatus", event.target.value as EnrollmentStatus)
                      }
                      className={fieldClass}
                    >
                      <option>Active</option>
                      <option>Pending</option>
                      <option>Archived</option>
                    </select>
                  </FormField>
                  <FormField label="Location" wide>
                    <select
                      value={form.location}
                      onChange={(event) => updateForm("location", event.target.value)}
                      className={fieldClass}
                    >
                      {locations.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs leading-5 text-emerald-800">Saving an active child automatically creates a KidKare enrollment task for this location.</p>
                  </FormField>
                  <FormField label="Classroom" wide>
                    <input
                      value={form.classroom}
                      onChange={(event) => updateForm("classroom", event.target.value)}
                      className={fieldClass}
                      placeholder="Example: Preschool Room"
                    />
                  </FormField>
                </FormSection>

                <FormSection
                  icon={<UsersRound className="h-4 w-4" />}
                  title="Family and funding"
                  description="Guardian contacts and payment source."
                >
                  <FormField label="Primary parent or guardian" required>
                    <input
                      value={form.primaryGuardian}
                      onChange={(event) => updateForm("primaryGuardian", event.target.value)}
                      className={fieldClass}
                      placeholder="Full name"
                    />
                  </FormField>
                  <FormField label="Second parent or guardian">
                    <input
                      value={form.secondaryGuardian}
                      onChange={(event) => updateForm("secondaryGuardian", event.target.value)}
                      className={fieldClass}
                      placeholder="Full name"
                    />
                  </FormField>
                  <FormField label="Phone number">
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(event) => updateForm("phone", event.target.value)}
                      className={fieldClass}
                      placeholder="(661) 555-0000"
                    />
                  </FormField>
                  <FormField label="Funding source">
                    <select
                      value={form.subsidy}
                      onChange={(event) => updateForm("subsidy", event.target.value)}
                      className={fieldClass}
                    >
                      <option>Private Pay</option>
                      <option>CCRC</option>
                      <option>DCFS</option>
                      <option>CCCC</option>
                      <option>Other</option>
                    </select>
                  </FormField>
                </FormSection>

                <FormSection
                  icon={<CalendarDays className="h-4 w-4" />}
                  title="Care and transportation"
                  description="The child’s current care plan at a glance."
                >
                  <FormField label="Weekly schedule" wide>
                    <input
                      value={form.weeklySchedule}
                      onChange={(event) => updateForm("weeklySchedule", event.target.value)}
                      className={fieldClass}
                      placeholder="Example: Mon–Fri • 8:00 AM–5:00 PM"
                    />
                  </FormField>
                  <FormField label="Transportation" wide>
                    <input
                      value={form.transportation}
                      onChange={(event) => updateForm("transportation", event.target.value)}
                      className={fieldClass}
                      placeholder="School pick-up, home drop-off, or none"
                    />
                  </FormField>
                  <FormField label="Today’s attendance">
                    <select
                      value={form.attendanceToday}
                      onChange={(event) =>
                        updateForm("attendanceToday", event.target.value as AttendanceStatus)
                      }
                      className={fieldClass}
                    >
                      <option>Present</option>
                      <option>Absent</option>
                      <option>Not Scheduled</option>
                    </select>
                  </FormField>
                </FormSection>

                <FormSection
                  icon={<HeartPulse className="h-4 w-4" />}
                  title="Health and licensing"
                  description="Quick alerts and required enrollment paperwork."
                >
                  <FormField label="Allergies or dietary needs" wide>
                    <textarea
                      value={form.allergies}
                      onChange={(event) => updateForm("allergies", event.target.value)}
                      className={`${fieldClass} min-h-24 resize-y`}
                    />
                  </FormField>
                  <FormField label="Medical or support notes" wide>
                    <textarea
                      value={form.medicalNotes}
                      onChange={(event) => updateForm("medicalNotes", event.target.value)}
                      className={`${fieldClass} min-h-24 resize-y`}
                    />
                  </FormField>
                  <FormField label="Licensing status">
                    <select
                      value={form.licensingStatus}
                      onChange={(event) =>
                        updateForm("licensingStatus", event.target.value as LicensingStatus)
                      }
                      className={fieldClass}
                    >
                      <option>Complete</option>
                      <option>Missing Documents</option>
                    </select>
                  </FormField>
                  {form.licensingStatus === "Missing Documents" && (
                    <FormField label="Missing documents">
                      <input
                        value={form.missingDocuments}
                        onChange={(event) => updateForm("missingDocuments", event.target.value)}
                        className={fieldClass}
                        placeholder="Separate forms with commas"
                      />
                    </FormField>
                  )}
                </FormSection>

                {formError && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {formError}
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {isSaving ? "Saving…" : editingChildId ? "Save Changes" : "Save Child"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedChild && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedChildId(null);
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="child-file-title"
            className="ml-auto flex h-full w-full max-w-2xl flex-col bg-slate-50 shadow-2xl"
          >
            <div className="border-b border-slate-200 bg-white px-5 py-5 sm:px-7">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <Avatar child={selectedChild} large />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 id="child-file-title" className="truncate text-2xl font-black text-slate-950">
                        {fullName(selectedChild)}
                      </h2>
                      <EnrollmentBadge status={selectedChild.enrollmentStatus} />
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {selectedChild.ageGroup} • {selectedChild.age} • {selectedChild.classroom}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedChildId(null)}
                  className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                  aria-label="Close child file"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {canManageChildFiles && <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => openEditChild(selectedChild)}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700"
                >
                  <Pencil className="h-4 w-4" /> Edit Record
                </button>
                <button
                  type="button"
                  onClick={() => void toggleArchive(selectedChild)}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Archive className="h-4 w-4" />
                  {selectedChild.enrollmentStatus === "Archived" ? "Restore Record" : "Archive Record"}
                </button>
              </div>}
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-7">
              {canManageChildFiles && selectedChild.licensingStatus === "Missing Documents" && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-3">
                    <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                    <div>
                      <p className="font-bold text-amber-950">Licensing documents need attention</p>
                      <p className="mt-1 text-sm leading-6 text-amber-800">
                        Missing: {selectedChild.missingDocuments.join(", ")}.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <DetailSection title="Care Summary" icon={<CalendarDays className="h-4 w-4" />}>
                <DetailItem icon={<MapPin />} label="Location" value={selectedChild.location} />
                <DetailItem icon={<Clock3 />} label="Weekly Schedule" value={selectedChild.weeklySchedule} />
                <DetailItem icon={<Bus />} label="Transportation" value={selectedChild.transportation} />
                <DetailItem
                  icon={<CheckCircle2 />}
                  label="Today"
                  value={selectedChild.attendanceToday}
                />
              </DetailSection>

              {canManageChildFiles && <DetailSection title="Family Information" icon={<UsersRound className="h-4 w-4" />}>
                <DetailItem
                  icon={<UserRound />}
                  label="Primary Guardian"
                  value={selectedChild.primaryGuardian}
                />
                {selectedChild.secondaryGuardian && (
                  <DetailItem
                    icon={<UserRound />}
                    label="Second Guardian"
                    value={selectedChild.secondaryGuardian}
                  />
                )}
                <DetailItem icon={<Phone />} label="Phone" value={selectedChild.phone} />
                <DetailItem icon={<FileText />} label="Funding" value={selectedChild.subsidy} />
              </DetailSection>}

              <DetailSection title="Health & Safety" icon={<HeartPulse className="h-4 w-4" />}>
                <DetailItem icon={<CircleAlert />} label="Allergies / Diet" value={selectedChild.allergies} />
                <DetailItem icon={<ClipboardList />} label="Medical / Support Notes" value={selectedChild.medicalNotes} />
              </DetailSection>

              {canManageChildFiles && <DetailSection title="Licensing File" icon={<ShieldCheck className="h-4 w-4" />}>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-slate-900">Enrollment documents</p>
                      <p className="mt-1 text-xs text-slate-500">
                        LIC 700, emergency contacts, medical consent, immunizations, and signed policies.
                      </p>
                    </div>
                    <LicensingBadge child={selectedChild} />
                  </div>
                </div>
              </DetailSection>}
            </div>
          </aside>
        </div>
      )}
    </MainLayout>
  );
}

function SummaryCard({
  label,
  value,
  helper,
  icon,
  tone,
}: {
  label: string;
  value: number;
  helper: string;
  icon: React.ReactNode;
  tone: "slate" | "green" | "emerald" | "amber";
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-green-100 text-green-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{value}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>
          {icon}
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{helper}</p>
    </article>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${fieldClass} min-w-44 pr-9 xl:max-w-60`}
        title={label}
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function ChildRow({
  child,
  onOpen,
  onEdit,
  adminView,
}: {
  child: ChildRecord;
  onOpen: () => void;
  onEdit: () => void;
  adminView: boolean;
}) {
  return (
    <article className="group px-4 py-5 transition hover:bg-slate-50/80 sm:px-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(250px,1.5fr)_minmax(180px,1fr)_minmax(165px,.8fr)_minmax(180px,.9fr)_130px] xl:items-center">
        <div className="flex min-w-0 items-start gap-3.5">
          <Avatar child={child} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onOpen}
                className="truncate text-left text-base font-black text-slate-950 transition hover:text-emerald-700"
              >
                {fullName(child)}
              </button>
              <EnrollmentBadge status={child.enrollmentStatus} />
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{child.location}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
              <span className="rounded-md bg-slate-100 px-2 py-1">{child.ageGroup}</span>
              <span className="rounded-md bg-slate-100 px-2 py-1">{child.age}</span>
              <AttendanceBadge status={child.attendanceToday} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 xl:block xl:space-y-2">
          <p className="flex min-w-0 items-start gap-2 text-slate-700">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <span className="line-clamp-2">{child.weeklySchedule}</span>
          </p>
          <p className="flex min-w-0 items-start gap-2 text-slate-700">
            <Bus className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <span className="line-clamp-2">{child.transportation}</span>
          </p>
        </div>

        <div>
          {adminView ? <>
            <p className="text-sm font-bold text-slate-900">{child.primaryGuardian}</p>
            {child.secondaryGuardian && <p className="mt-0.5 truncate text-xs text-slate-500">+ {child.secondaryGuardian}</p>}
            <p className="mt-1 text-xs font-semibold text-slate-500">{child.subsidy}</p>
          </> : <>
            <p className="text-sm font-bold text-slate-900">{child.allergies || "No allergy information entered"}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">Allergies / dietary alerts</p>
          </>}
        </div>

        <div>
          {adminView ? <>
            <LicensingBadge child={child} />
            {child.missingDocuments.length > 0 && <p className="mt-2 line-clamp-2 text-xs leading-5 text-amber-800">{child.missingDocuments.join(", ")}</p>}
          </> : <p className="line-clamp-3 text-xs leading-5 text-slate-600">{child.medicalNotes || "No support notes entered"}</p>}
        </div>

        <div className="flex gap-2 xl:justify-end">
          {adminView && <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
            aria-label={`Edit ${fullName(child)}`}
            title="Edit record"
          >
            <Pencil className="h-4 w-4" />
          </button>}
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded-xl bg-slate-900 px-3 text-sm font-bold text-white transition hover:bg-emerald-700 xl:flex-none"
          >
            Open <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

function Avatar({ child, large = false }: { child: ChildRecord; large?: boolean }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-green-200 font-black text-emerald-900 ring-1 ring-inset ring-emerald-200 ${
        large ? "h-14 w-14 text-lg" : "h-11 w-11 text-sm"
      }`}
      aria-hidden="true"
    >
      {initials(child)}
    </div>
  );
}

function EnrollmentBadge({ status }: { status: EnrollmentStatus }) {
  const styles: Record<EnrollmentStatus, string> = {
    Active: "bg-emerald-100 text-emerald-800",
    Pending: "bg-blue-100 text-blue-800",
    Archived: "bg-slate-200 text-slate-700",
  };

  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${styles[status]}`}>
      {status}
    </span>
  );
}

function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  const styles: Record<AttendanceStatus, string> = {
    Present: "bg-green-100 text-green-800",
    Absent: "bg-rose-100 text-rose-800",
    "Not Scheduled": "bg-slate-100 text-slate-600",
  };

  return <span className={`rounded-md px-2 py-1 ${styles[status]}`}>{status}</span>;
}

function LicensingBadge({ child }: { child: ChildRecord }) {
  if (child.licensingStatus === "Complete") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1.5 text-xs font-bold text-emerald-800">
        <CheckCircle2 className="h-3.5 w-3.5" /> Complete
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1.5 text-xs font-bold text-amber-900">
      <CircleAlert className="h-3.5 w-3.5" /> Missing {child.missingDocuments.length}
    </span>
  );
}

function FormSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
          {icon}
        </span>
        <div>
          <h3 className="font-black text-slate-950">{title}</h3>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function FormField({
  label,
  required = false,
  wide = false,
  children,
}: {
  label: string;
  required?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function DetailSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2.5 text-slate-950">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
          {icon}
        </span>
        <h3 className="font-black">{title}</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function DetailItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactElement<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3.5">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
        {label}
      </div>
      <p className="mt-2 text-sm font-semibold leading-5 text-slate-900">{value}</p>
    </div>
  );
}
