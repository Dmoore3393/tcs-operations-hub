"use client";

import { CelebrationBits, FunDoodles, GatorGuide } from "@/components/brand/HubJoy";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  LoaderCircle,
  PauseCircle,
  PlayCircle,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Viewer = { userId: string; fullName: string; role: string; canManage: boolean };
type Location = { id: string; name: string };
type Staff = {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  jobTitle: string;
  secondaryTitle: string;
  reportsToLabel: string;
  primaryLocation: string;
  locationIds: string[];
  acceptedAt: string;
  createdAt: string;
};
type Plan = {
  id: string;
  staffUserId: string;
  locationId: string;
  startDate: string;
  managerUserId: string;
  status: "Active" | "Completed" | "Paused";
  createdAt: string;
  updatedAt: string;
};
type RatingValue = "Strong" | "On Track" | "Needs Support" | "Not Reviewed";
type Checkin = {
  id: string;
  planId: string;
  staffUserId: string;
  locationId: string;
  milestoneDays: 30 | 60 | 90;
  dueDate: string;
  status: "Upcoming" | "Employee Submitted" | "Leadership Draft" | "Review Shared" | "Completed";
  employeeProudOf: string;
  employeeSupportNeeded: string;
  employeeQuestions: string;
  employeeGoal: string;
  employeeSubmittedAt: string;
  leadershipStrengths: string;
  leadershipFocus: string;
  leadershipSupport: string;
  leadershipNextGoal: string;
  leadershipRatings: Record<string, RatingValue>;
  leadershipPrivateNotes?: string;
  reviewedBy: string;
  reviewSharedAt: string;
  employeeAcknowledgedAt: string;
  completedAt: string;
  updatedAt: string;
};
type Payload = {
  viewer: Viewer;
  locations: Location[];
  staff: Staff[];
  plans: Plan[];
  checkins: Checkin[];
};

const milestones = [30, 60, 90] as const;
const ratingFields = [
  ["safety", "Safety & Supervision"],
  ["reliability", "Reliability"],
  ["communication", "Communication"],
  ["teamwork", "Teamwork"],
  ["routines", "TCS Routines & Policies"],
  ["growth", "Training & Growth"],
] as const;
const ratingOptions: RatingValue[] = ["Not Reviewed", "Strong", "On Track", "Needs Support"];

const milestoneCopy: Record<number, { title: string; subtitle: string; focus: string }> = {
  30: {
    title: "30-Day Check-In",
    subtitle: "Settling in",
    focus: "Comfort with routines, safety expectations, communication, questions, and the support needed to feel confident.",
  },
  60: {
    title: "60-Day Check-In",
    subtitle: "Building consistency",
    focus: "Consistency, teamwork, independence, communication, training progress, and what will help the employee keep growing.",
  },
  90: {
    title: "90-Day Check-In",
    subtitle: "Growing into the role",
    focus: "Strengths, ownership of the role, continued development, support from leadership, and goals for the next chapter.",
  },
};

function dateOnly(value: string) {
  return value ? value.slice(0, 10) : "";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string) {
  if (!value) return "Not set";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function daysBetween(from: string, to: string) {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

function dueLabel(checkin: Checkin) {
  if (checkin.status === "Completed") return { label: "Completed", tone: "emerald" };
  const diff = daysBetween(todayIso(), checkin.dueDate);
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, tone: "red" };
  if (diff === 0) return { label: "Due today", tone: "amber" };
  if (diff <= 7) return { label: `Due in ${diff}d`, tone: "amber" };
  return { label: formatDate(checkin.dueDate), tone: "slate" };
}

function toneClasses(tone: string) {
  if (tone === "emerald") return "bg-emerald-100 text-emerald-800";
  if (tone === "amber") return "bg-amber-100 text-amber-900";
  if (tone === "red") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-600";
}

function statusClasses(status: Checkin["status"]) {
  if (status === "Completed") return "bg-emerald-100 text-emerald-800";
  if (status === "Review Shared") return "bg-violet-100 text-violet-800";
  if (status === "Employee Submitted") return "bg-blue-100 text-blue-800";
  if (status === "Leadership Draft") return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-600";
}

export default function EmployeeCheckinsPage() {
  const { session } = useAuth();
  const [data, setData] = useState<Payload | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [selectedCheckinId, setSelectedCheckinId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [setupStartDate, setSetupStartDate] = useState("");
  const [setupLocationId, setSetupLocationId] = useState("");
  const [employeeProudOf, setEmployeeProudOf] = useState("");
  const [employeeSupportNeeded, setEmployeeSupportNeeded] = useState("");
  const [employeeQuestions, setEmployeeQuestions] = useState("");
  const [employeeGoal, setEmployeeGoal] = useState("");
  const [leadershipStrengths, setLeadershipStrengths] = useState("");
  const [leadershipFocus, setLeadershipFocus] = useState("");
  const [leadershipSupport, setLeadershipSupport] = useState("");
  const [leadershipNextGoal, setLeadershipNextGoal] = useState("");
  const [leadershipPrivateNotes, setLeadershipPrivateNotes] = useState("");
  const [ratings, setRatings] = useState<Record<string, RatingValue>>({});

  const api = useCallback(async (method: "GET" | "POST" | "PATCH", body?: Record<string, unknown>) => {
    if (!session?.access_token) throw new Error("Your staff session is not ready.");
    const response = await fetch("/api/employee-checkins", {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Employee check-in request failed.");
    return payload;
  }, [session?.access_token]);

  const load = useCallback(async (quiet = false) => {
    if (!session?.access_token) return;
    if (!quiet) setLoading(true);
    try {
      const payload = await api("GET") as unknown as Payload;
      setData(payload);
      const preferredStaff = payload.viewer.canManage
        ? selectedStaffId || payload.staff[0]?.userId || ""
        : payload.viewer.userId;
      setSelectedStaffId(preferredStaff);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load employee check-ins.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [api, selectedStaffId, session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  const visibleStaff = useMemo(() => (data?.staff ?? []).filter((staff) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [staff.fullName, staff.jobTitle, staff.secondaryTitle, staff.email, staff.primaryLocation].filter(Boolean).join(" ").toLowerCase().includes(term);
  }), [data, search]);

  const selectedStaff = data?.staff.find((staff) => staff.userId === selectedStaffId) ?? null;
  const selectedPlans = useMemo(() => (data?.plans ?? [])
    .filter((plan) => plan.staffUserId === selectedStaffId)
    .sort((a, b) => b.startDate.localeCompare(a.startDate)), [data, selectedStaffId]);
  const activePlan = selectedPlans.find((plan) => plan.status === "Active") ?? selectedPlans[0] ?? null;
  const planCheckins = useMemo(() => activePlan
    ? (data?.checkins ?? []).filter((item) => item.planId === activePlan.id).sort((a,b) => a.milestoneDays - b.milestoneDays)
    : [], [activePlan, data]);

  const selectedCheckin = planCheckins.find((item) => item.id === selectedCheckinId)
    ?? planCheckins.find((item) => item.status !== "Completed")
    ?? planCheckins[0]
    ?? null;

  useEffect(() => {
    if (!selectedStaff) return;
    const suggestedStart = dateOnly(selectedStaff.acceptedAt || selectedStaff.createdAt) || todayIso();
    setSetupStartDate((current) => current || suggestedStart);
    setSetupLocationId((current) => {
      if (current && selectedStaff.locationIds.includes(current)) return current;
      return selectedStaff.locationIds[0] || "";
    });
  }, [selectedStaff]);

  useEffect(() => {
    if (!selectedCheckin) {
      setSelectedCheckinId("");
      return;
    }
    if (selectedCheckinId !== selectedCheckin.id) setSelectedCheckinId(selectedCheckin.id);
    setEmployeeProudOf(selectedCheckin.employeeProudOf || "");
    setEmployeeSupportNeeded(selectedCheckin.employeeSupportNeeded || "");
    setEmployeeQuestions(selectedCheckin.employeeQuestions || "");
    setEmployeeGoal(selectedCheckin.employeeGoal || "");
    setLeadershipStrengths(selectedCheckin.leadershipStrengths || "");
    setLeadershipFocus(selectedCheckin.leadershipFocus || "");
    setLeadershipSupport(selectedCheckin.leadershipSupport || "");
    setLeadershipNextGoal(selectedCheckin.leadershipNextGoal || "");
    setLeadershipPrivateNotes(selectedCheckin.leadershipPrivateNotes || "");
    setRatings(Object.fromEntries(ratingFields.map(([key]) => [key, selectedCheckin.leadershipRatings[key] || "Not Reviewed"])));
  }, [selectedCheckin?.id, selectedCheckin?.updatedAt]);

  const completedCount = planCheckins.filter((item) => item.status === "Completed").length;
  const nextCheckin = planCheckins.find((item) => item.status !== "Completed") ?? null;
  const overdueCount = planCheckins.filter((item) => item.status !== "Completed" && item.dueDate < todayIso()).length;

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3600);
  }

  async function createPlan() {
    if (!selectedStaff) return;
    setWorking(true);
    setError("");
    try {
      const result = await api("POST", {
        action: "create_plan",
        staffUserId: selectedStaff.userId,
        locationId: setupLocationId,
        startDate: setupStartDate,
      });
      flash(typeof result.message === "string" ? result.message : "30/60/90 plan created.");
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the 30/60/90 plan.");
    } finally {
      setWorking(false);
    }
  }

  async function submitReflection() {
    if (!selectedCheckin) return;
    setWorking(true);
    setError("");
    try {
      const result = await api("POST", {
        action: "employee_reflection",
        id: selectedCheckin.id,
        employeeProudOf,
        employeeSupportNeeded,
        employeeQuestions,
        employeeGoal,
      });
      flash(typeof result.message === "string" ? result.message : "Reflection saved.");
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your reflection.");
    } finally {
      setWorking(false);
    }
  }

  async function saveLeadershipReview(share: boolean) {
    if (!selectedCheckin) return;
    setWorking(true);
    setError("");
    try {
      const result = await api("POST", {
        action: "manager_review",
        id: selectedCheckin.id,
        share,
        leadershipStrengths,
        leadershipFocus,
        leadershipSupport,
        leadershipNextGoal,
        leadershipPrivateNotes,
        leadershipRatings: ratings,
      });
      flash(typeof result.message === "string" ? result.message : "Leadership review saved.");
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the leadership review.");
    } finally {
      setWorking(false);
    }
  }

  async function acknowledge() {
    if (!selectedCheckin) return;
    setWorking(true);
    setError("");
    try {
      const result = await api("POST", { action: "acknowledge", id: selectedCheckin.id });
      flash(typeof result.message === "string" ? result.message : "Check-in completed.");
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not acknowledge the check-in.");
    } finally {
      setWorking(false);
    }
  }

  async function setPlanStatus(status: "Active" | "Paused" | "Completed") {
    if (!activePlan) return;
    setWorking(true);
    setError("");
    try {
      const result = await api("PATCH", { action: "set_plan_status", planId: activePlan.id, status });
      flash(typeof result.message === "string" ? result.message : "Plan updated.");
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the plan.");
    } finally {
      setWorking(false);
    }
  }

  return <MainLayout><div className="mx-auto max-w-[1600px] space-y-6 pb-12">
    <section className="relative overflow-hidden rounded-[34px] bg-gradient-to-br from-[#173d29] via-[#2e6c47] to-[#223558] p-6 text-white shadow-xl sm:p-8">
      <FunDoodles className="opacity-30" />
      <div className="relative z-10 grid gap-6 xl:grid-cols-[1fr_auto] xl:items-end">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-200">People • support • growth</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">{data?.viewer.canManage ? "Employee 30/60/90 Check-Ins" : "My 30/60/90 Check-Ins"}</h1>
          <p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-white/85">Three intentional conversations during the first 90 days: settle in at 30, build consistency at 60, and grow into the role at 90. This is for support, clarity, goals, and connection—not a secret scorecard.</p>
        </div>
        <GatorGuide size="lg" message={data?.viewer.canManage ? <>Great employees need clear expectations <em>and</em> real support. ⭐</> : <>Your questions matter here. Check-ins are a chance to tell us what you need too. 💚</>} />
      </div>
    </section>

    {notice && <div className="tcs-soft-pop relative overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-black text-emerald-900"><CelebrationBits /><CheckCircle2 className="mr-2 inline h-4 w-4" />{notice}</div>}
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div>}

    {loading ? <div className="grid min-h-96 place-items-center rounded-3xl border border-slate-200 bg-white"><div className="text-center"><LoaderCircle className="mx-auto h-7 w-7 animate-spin text-emerald-700" /><p className="mt-2 text-sm font-black text-slate-500">Opening employee check-ins…</p></div></div> : <>
      {data?.viewer.canManage && <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employees…" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm font-semibold outline-none focus:border-emerald-400" /></label>
          </div>
          <div className="max-h-[760px] overflow-y-auto p-2">{visibleStaff.map((staff) => {
            const staffPlan = data.plans.find((plan) => plan.staffUserId === staff.userId && plan.status === "Active") ?? data.plans.find((plan) => plan.staffUserId === staff.userId);
            const checkins = staffPlan ? data.checkins.filter((item) => item.planId === staffPlan.id) : [];
            const done = checkins.filter((item) => item.status === "Completed").length;
            return <button key={staff.userId} onClick={() => { setSelectedStaffId(staff.userId); setSelectedCheckinId(""); setSetupStartDate(""); setSetupLocationId(""); }} className={`mb-1 w-full rounded-2xl border p-4 text-left transition ${selectedStaffId === staff.userId ? "border-emerald-300 bg-emerald-50" : "border-transparent hover:bg-slate-50"}`}><div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-slate-950">{staff.fullName}</strong><p className="mt-1 text-xs font-semibold text-slate-500">{staff.jobTitle || staff.role}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-black ${staffPlan ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{staffPlan ? `${done}/3 done` : "Not started"}</span></div></button>;
          })}</div>
        </section>

        <div className="space-y-6">
          <LeadershipEmployeeHeader staff={selectedStaff} plan={activePlan} completedCount={completedCount} nextCheckin={nextCheckin} overdueCount={overdueCount} locations={data.locations} />
          {!activePlan && selectedStaff ? <section className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-emerald-50 p-6 shadow-sm">
            <div className="flex items-start gap-3"><Target className="mt-1 h-6 w-6 flex-none text-amber-700" /><div><h2 className="text-xl font-black text-slate-950">Start {selectedStaff.fullName}’s 30/60/90 plan</h2><p className="mt-1 text-xs font-semibold leading-5 text-slate-600">Use the actual employment/start date. The Hub will automatically calculate the 30-, 60-, and 90-day check-in dates.</p></div></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Employment start date"><input type="date" value={setupStartDate} onChange={(event) => setSetupStartDate(event.target.value)} className={inputClass} /></Field>
              <Field label="Primary check-in location"><select value={setupLocationId} onChange={(event) => setSetupLocationId(event.target.value)} className={inputClass}><option value="">Choose location…</option>{data.locations.filter((location) => selectedStaff.locationIds.includes(location.id)).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
            </div>
            <button disabled={working || !setupStartDate || !setupLocationId} onClick={() => void createPlan()} className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white disabled:opacity-40">{working ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}Create 30/60/90 Plan</button>
          </section> : activePlan && <>
            <Timeline checkins={planCheckins} selectedId={selectedCheckin?.id || ""} onSelect={setSelectedCheckinId} />
            {selectedCheckin && <LeadershipReview
              checkin={selectedCheckin}
              employeeName={selectedStaff?.fullName || "Employee"}
              ratings={ratings}
              setRatings={setRatings}
              strengths={leadershipStrengths}
              setStrengths={setLeadershipStrengths}
              focus={leadershipFocus}
              setFocus={setLeadershipFocus}
              support={leadershipSupport}
              setSupport={setLeadershipSupport}
              nextGoal={leadershipNextGoal}
              setNextGoal={setLeadershipNextGoal}
              privateNotes={leadershipPrivateNotes}
              setPrivateNotes={setLeadershipPrivateNotes}
              working={working}
              onSaveDraft={() => void saveLeadershipReview(false)}
              onShare={() => void saveLeadershipReview(true)}
            />}
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs font-semibold text-slate-500"><span>Plan status: <strong className="text-slate-900">{activePlan.status}</strong> • Started {formatDate(activePlan.startDate)}</span><div className="flex gap-2">{activePlan.status === "Active" ? <button disabled={working} onClick={() => void setPlanStatus("Paused")} className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 font-black text-slate-700"><PauseCircle className="h-4 w-4" />Pause</button> : activePlan.status === "Paused" ? <button disabled={working} onClick={() => void setPlanStatus("Active")} className="inline-flex items-center gap-1 rounded-xl bg-emerald-100 px-3 py-2 font-black text-emerald-800"><PlayCircle className="h-4 w-4" />Resume</button> : null}</div></section>
          </>}
        </div>
      </div>}

      {!data?.viewer.canManage && <div className="space-y-6">
        <EmployeeHeader staff={selectedStaff} plan={activePlan} completedCount={completedCount} nextCheckin={nextCheckin} />
        {!activePlan ? <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><CalendarDays className="mx-auto h-10 w-10 text-emerald-700" /><h2 className="mt-3 text-xl font-black">Your 30/60/90 plan hasn’t been started yet</h2><p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-500">Leadership will add your employment start date and the Hub will build your 30-, 60-, and 90-day check-ins automatically.</p></section> : <>
          <Timeline checkins={planCheckins} selectedId={selectedCheckin?.id || ""} onSelect={setSelectedCheckinId} />
          {selectedCheckin && <EmployeeReflection
            checkin={selectedCheckin}
            proud={employeeProudOf}
            setProud={setEmployeeProudOf}
            supportNeeded={employeeSupportNeeded}
            setSupportNeeded={setEmployeeSupportNeeded}
            questions={employeeQuestions}
            setQuestions={setEmployeeQuestions}
            goal={employeeGoal}
            setGoal={setEmployeeGoal}
            working={working}
            onSubmit={() => void submitReflection()}
            onAcknowledge={() => void acknowledge()}
          />}
        </>}
      </div>}
    </>}
  </div></MainLayout>;
}

function LeadershipEmployeeHeader({ staff, plan, completedCount, nextCheckin, overdueCount, locations }: { staff: Staff | null; plan: Plan | null; completedCount: number; nextCheckin: Checkin | null; overdueCount: number; locations: Location[] }) {
  if (!staff) return <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center"><Users className="mx-auto h-9 w-9 text-emerald-700" /><p className="mt-2 font-black">Choose an employee</p></section>;
  const location = locations.find((item) => item.id === plan?.locationId);
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div className="flex items-start gap-3"><span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><UserRoundCheck className="h-6 w-6" /></span><div><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Employee check-in plan</p><h2 className="mt-1 text-2xl font-black text-slate-950">{staff.fullName}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{staff.jobTitle || staff.role}{location ? ` • ${location.name}` : ""}</p></div></div>{plan && <div className="flex flex-wrap gap-2"><span className="rounded-full bg-emerald-100 px-3 py-1.5 text-[10px] font-black text-emerald-800">{completedCount}/3 completed</span>{overdueCount > 0 && <span className="rounded-full bg-red-100 px-3 py-1.5 text-[10px] font-black text-red-800">{overdueCount} overdue</span>}{nextCheckin && <span className="rounded-full bg-blue-100 px-3 py-1.5 text-[10px] font-black text-blue-800">Next: {nextCheckin.milestoneDays} days</span>}</div>}</div></section>;
}

function EmployeeHeader({ staff, plan, completedCount, nextCheckin }: { staff: Staff | null; plan: Plan | null; completedCount: number; nextCheckin: Checkin | null }) {
  return <section className="relative overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-6 shadow-sm"><FunDoodles className="opacity-20" /><div className="relative z-10"><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Your first 90 days</p><h2 className="mt-1 text-2xl font-black text-slate-950">{staff?.fullName || "Your check-in journey"}</h2><p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">These check-ins are two-way conversations. Share what you’re proud of, where you need support, questions you have, and what you want to work on next.</p>{plan && <div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full bg-emerald-100 px-3 py-1.5 text-[10px] font-black text-emerald-800">{completedCount}/3 completed</span><span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-black text-slate-600">Started {formatDate(plan.startDate)}</span>{nextCheckin && <span className="rounded-full bg-blue-100 px-3 py-1.5 text-[10px] font-black text-blue-800">Next: {milestoneCopy[nextCheckin.milestoneDays].title}</span>}</div>}</div></section>;
}

function Timeline({ checkins, selectedId, onSelect }: { checkins: Checkin[]; selectedId: string; onSelect: (id: string) => void }) {
  return <section className="grid gap-4 lg:grid-cols-3">{checkins.map((checkin) => {
    const copy = milestoneCopy[checkin.milestoneDays];
    const due = dueLabel(checkin);
    return <button key={checkin.id} onClick={() => onSelect(checkin.id)} className={`tcs-joy-card rounded-3xl border p-5 text-left shadow-sm transition ${selectedId === checkin.id ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 bg-white"}`}><div className="flex items-start justify-between gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-lg font-black text-white">{checkin.milestoneDays}</span><div className="flex flex-col items-end gap-1"><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${statusClasses(checkin.status)}`}>{checkin.status}</span><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${toneClasses(due.tone)}`}>{due.label}</span></div></div><h3 className="mt-4 text-lg font-black text-slate-950">{copy.title}</h3><p className="text-xs font-black uppercase tracking-wider text-emerald-700">{copy.subtitle}</p><p className="mt-3 text-xs font-semibold leading-5 text-slate-500">{copy.focus}</p><div className="mt-4 flex items-center justify-between text-[10px] font-black text-slate-400"><span>Due {formatDate(checkin.dueDate)}</span><ChevronRight className="h-4 w-4" /></div></button>;
  })}</section>;
}

function EmployeeReflection({ checkin, proud, setProud, supportNeeded, setSupportNeeded, questions, setQuestions, goal, setGoal, working, onSubmit, onAcknowledge }: {
  checkin: Checkin;
  proud: string; setProud: (value: string) => void;
  supportNeeded: string; setSupportNeeded: (value: string) => void;
  questions: string; setQuestions: (value: string) => void;
  goal: string; setGoal: (value: string) => void;
  working: boolean;
  onSubmit: () => void;
  onAcknowledge: () => void;
}) {
  const copy = milestoneCopy[checkin.milestoneDays];
  const locked = ["Review Shared", "Completed"].includes(checkin.status);
  return <div className="grid gap-6 xl:grid-cols-[.95fr_1.05fr]">
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3"><ClipboardCheck className="mt-1 h-6 w-6 text-emerald-700" /><div><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Your reflection</p><h2 className="mt-1 text-xl font-black">{copy.title}</h2><p className="mt-1 text-xs font-semibold leading-5 text-slate-500">There are no “perfect” answers here. This gives leadership a better picture of what is going well and what support would help.</p></div></div>
      <Field label="What are you proud of so far?"><textarea disabled={locked} value={proud} onChange={(event) => setProud(event.target.value.slice(0,4000))} className={`${inputClass} min-h-28 resize-y disabled:bg-slate-50`} placeholder="A win, something you learned, or something that feels more comfortable now…" /></Field>
      <Field label="Where would more support help?"><textarea disabled={locked} value={supportNeeded} onChange={(event) => setSupportNeeded(event.target.value.slice(0,4000))} className={`${inputClass} min-h-28 resize-y disabled:bg-slate-50`} placeholder="Training, routines, behavior support, communication, time management, transportation, paperwork…" /></Field>
      <Field label="Questions for leadership"><textarea disabled={locked} value={questions} onChange={(event) => setQuestions(event.target.value.slice(0,4000))} className={`${inputClass} min-h-24 resize-y disabled:bg-slate-50`} placeholder="Anything you want clarified or talked through…" /></Field>
      <Field label="One goal before the next check-in"><textarea disabled={locked} value={goal} onChange={(event) => setGoal(event.target.value.slice(0,4000))} className={`${inputClass} min-h-24 resize-y disabled:bg-slate-50`} placeholder="What would you like to get stronger or more confident in next?" /></Field>
      {!locked && <button disabled={working || (!proud.trim() && !supportNeeded.trim() && !questions.trim() && !goal.trim())} onClick={onSubmit} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white disabled:opacity-40">{working ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}Submit Reflection</button>}
      {checkin.employeeSubmittedAt && <p className="mt-3 text-center text-[10px] font-semibold text-slate-400">Reflection submitted {new Date(checkin.employeeSubmittedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>}
    </section>

    <section className="rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-emerald-50 p-5 shadow-sm">
      <div className="flex items-start gap-3"><ShieldCheck className="mt-1 h-6 w-6 text-violet-700" /><div><p className="text-[10px] font-black uppercase tracking-wider text-violet-700">Leadership review</p><h2 className="mt-1 text-xl font-black">What TCS is seeing & supporting</h2></div></div>
      {!["Review Shared", "Completed"].includes(checkin.status) ? <div className="mt-5 rounded-2xl bg-white/80 p-6 text-center"><Clock3 className="mx-auto h-8 w-8 text-violet-600" /><p className="mt-2 font-black text-slate-800">Leadership review has not been shared yet.</p><p className="mt-1 text-xs font-semibold leading-5 text-slate-500">Once your check-in conversation is reviewed, the shared notes will appear here.</p></div> : <>
        <ReviewText label="What you’re doing well" value={checkin.leadershipStrengths} />
        <ReviewText label="Focus before the next check-in" value={checkin.leadershipFocus} />
        <ReviewText label="Support TCS will provide" value={checkin.leadershipSupport} />
        {checkin.leadershipNextGoal && <ReviewText label="Next goal" value={checkin.leadershipNextGoal} />}
        <div className="mt-5 grid gap-2 sm:grid-cols-2">{ratingFields.map(([key,label]) => <div key={key} className="rounded-xl border border-violet-100 bg-white p-3"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-xs font-black text-slate-900">{checkin.leadershipRatings[key] || "Not Reviewed"}</p></div>)}</div>
        {checkin.status === "Review Shared" && <button disabled={working} onClick={onAcknowledge} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white disabled:opacity-40">{working ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}I Reviewed This Check-In</button>}
        {checkin.status === "Completed" && <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-black text-emerald-900"><CheckCircle2 className="mr-2 inline h-4 w-4" />Check-in completed and acknowledged.</div>}
      </>}
    </section>
  </div>;
}

function LeadershipReview({ checkin, employeeName, ratings, setRatings, strengths, setStrengths, focus, setFocus, support, setSupport, nextGoal, setNextGoal, privateNotes, setPrivateNotes, working, onSaveDraft, onShare }: {
  checkin: Checkin; employeeName: string;
  ratings: Record<string, RatingValue>; setRatings: (value: Record<string, RatingValue>) => void;
  strengths: string; setStrengths: (value: string) => void;
  focus: string; setFocus: (value: string) => void;
  support: string; setSupport: (value: string) => void;
  nextGoal: string; setNextGoal: (value: string) => void;
  privateNotes: string; setPrivateNotes: (value: string) => void;
  working: boolean; onSaveDraft: () => void; onShare: () => void;
}) {
  const copy = milestoneCopy[checkin.milestoneDays];
  return <div className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]">
    <section className="rounded-3xl border border-blue-200 bg-blue-50/60 p-5 shadow-sm">
      <div className="flex items-start gap-3"><UserRoundCheck className="mt-1 h-6 w-6 text-blue-700" /><div><p className="text-[10px] font-black uppercase tracking-wider text-blue-700">{employeeName}’s reflection</p><h2 className="mt-1 text-xl font-black">{copy.title}</h2></div></div>
      <ReviewText label="Proud of" value={checkin.employeeProudOf || "No reflection entered yet."} />
      <ReviewText label="Support requested" value={checkin.employeeSupportNeeded || "No support request entered yet."} />
      <ReviewText label="Questions for leadership" value={checkin.employeeQuestions || "No questions entered yet."} />
      <ReviewText label="Employee goal" value={checkin.employeeGoal || "No employee goal entered yet."} />
      {!checkin.employeeSubmittedAt && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900">The employee has not submitted a reflection yet. Leadership can still prepare a draft and hold the check-in conversation.</div>}
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Leadership review</p><h2 className="mt-1 text-xl font-black">{copy.title} • {employeeName}</h2><p className="mt-1 text-xs font-semibold leading-5 text-slate-500">Shared fields are visible to the employee after you choose “Share Review.” Private leadership notes stay leadership-only.</p></div><span className={`rounded-full px-3 py-1.5 text-[9px] font-black ${statusClasses(checkin.status)}`}>{checkin.status}</span></div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{ratingFields.map(([key,label]) => <label key={key}><span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</span><select value={ratings[key] || "Not Reviewed"} onChange={(event) => setRatings({ ...ratings, [key]: event.target.value as RatingValue })} className={inputClass}>{ratingOptions.map((value) => <option key={value}>{value}</option>)}</select></label>)}</div>

      <Field label="What the employee is doing well"><textarea value={strengths} onChange={(event) => setStrengths(event.target.value.slice(0,4000))} className={`${inputClass} min-h-24 resize-y`} placeholder="Specific strengths or progress you want the employee to hear…" /></Field>
      <Field label="Focus before the next check-in"><textarea value={focus} onChange={(event) => setFocus(event.target.value.slice(0,4000))} className={`${inputClass} min-h-24 resize-y`} placeholder="One or two clear areas to keep practicing…" /></Field>
      <Field label="Support TCS will provide"><textarea value={support} onChange={(event) => setSupport(event.target.value.slice(0,4000))} className={`${inputClass} min-h-24 resize-y`} placeholder="Training, coaching, modeling, resources, clearer expectations, schedule support…" /></Field>
      <Field label="Next goal"><textarea value={nextGoal} onChange={(event) => setNextGoal(event.target.value.slice(0,4000))} className={`${inputClass} min-h-20 resize-y`} placeholder="What should success look like before the next check-in?" /></Field>

      <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4">
        <p className="text-[10px] font-black uppercase tracking-wider text-red-700">Leadership-only note • not shown to employee</p>
        <textarea value={privateNotes} onChange={(event) => setPrivateNotes(event.target.value.slice(0,6000))} className="mt-2 min-h-24 w-full resize-y rounded-xl border border-red-200 bg-white px-3 py-3 text-sm font-semibold leading-6 text-slate-900 outline-none focus:border-red-400" placeholder="Internal follow-up context only. Keep notes factual and job-related." />
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end"><button disabled={working} onClick={onSaveDraft} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-40"><Save className="h-4 w-4" />Save Leadership Draft</button><button disabled={working || !strengths.trim() || !focus.trim() || !support.trim()} onClick={onShare} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-black text-white disabled:opacity-40">{working ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Share Review With Employee</button></div>
    </section>
  </div>;
}

function ReviewText({ label, value }: { label: string; value: string }) {
  return <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">{value || "Not entered yet."}</p></div>;
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mt-4 block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span>{children}</label>;
}
