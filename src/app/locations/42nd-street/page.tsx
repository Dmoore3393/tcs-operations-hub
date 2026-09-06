"use client";

import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import { canAccessRoute, useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { childAttendsLocation, starterChildSchedules, type ChildScheduleRecord } from "@/lib/child-schedules";
import { initialChildren, type ChildRecord } from "@/lib/children";
import { starterEmployees, starterTasks, type EmployeeRecord, type WorkTask } from "@/lib/hub-data";
import { formatClock, locationThemes, normalizeLocation, starterLocationHours, type DayName, type LocationHoursRecord, type LocationKey } from "@/lib/location-config";
import {
  ArrowRight,
  Baby,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  Heart,
  Home,
  MapPin,
  Megaphone,
  Pencil,
  ShieldCheck,
  Sparkles,
  Users,
  UserRoundCheck,
} from "lucide-react";
import { useEffect, useMemo } from "react";

type LocationRecord = {
  id: string;
  name: string;
  shortName: Exclude<LocationKey, "All Locations">;
  type: string;
  capacity: number;
  facilityNumber: string;
  address: string;
  phone: string;
  status: "Active" | "Planning";
};

const laraTheme = locationThemes["42nd Street"];

const locationFallback: LocationRecord[] = (Object.keys(locationThemes) as LocationKey[])
  .filter((item): item is Exclude<LocationKey, "All Locations"> => item !== "All Locations")
  .map((key) => ({
    id: key.toLowerCase().replaceAll(" ", "-"),
    name: locationThemes[key].fullName,
    shortName: key,
    type: locationThemes[key].programType,
    capacity: locationThemes[key].capacity,
    facilityNumber: key === "42nd Street" ? "Facility #197701124" : "Add facility number",
    address: key === "42nd Street" ? "44027 42nd St W, Lancaster, CA 93536" : key === "Halcom" ? "Lancaster, CA" : "Add site address",
    phone: "(760) 382-5742",
    status: "Active",
  }));

const quickActions = [
  { label: "Add / View Child", href: "/children", icon: Baby, className: "bg-[#0b3153] text-white" },
  { label: "Log Daily Care", href: "/daily-care", icon: CalendarCheck, className: "bg-[#2f6b37] text-white" },
  { label: "Staff Schedule", href: "/scheduling", icon: Users, className: "bg-[#d89a23] text-[#0b3153]" },
  { label: "Create Report", href: "/shift-reports", icon: FileText, className: "bg-white text-[#0b3153] ring-1 ring-[#dfd3bd]" },
] as const;

export default function LaraFamilyChildcareHomePage() {
  const { profile, isSystemOwner } = useAuth();
  const { setLocation } = useHubLocation();
  const [children] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const [childSchedules] = usePersistentState<ChildScheduleRecord[]>("tcs-child-schedules-v2", starterChildSchedules);
  const [employees] = usePersistentState<EmployeeRecord[]>("tcs-employees", starterEmployees);
  const [tasks] = usePersistentState<WorkTask[]>("tcs-work-tasks", starterTasks);
  const [hours] = usePersistentState<LocationHoursRecord[]>("tcs-location-hours-v2", starterLocationHours);
  const [locations] = usePersistentState<LocationRecord[]>("tcs-locations-v2", locationFallback);

  useEffect(() => {
    setLocation("42nd Street");
  }, [setLocation]);

  const assignedToLara = isSystemOwner || (profile?.locations ?? []).some((location) => location === "All Locations" || normalizeLocation(location) === "42nd Street");

  const activeChildren = useMemo(() => children.filter((child) => child.enrollmentStatus !== "Archived"), [children]);
  const laraChildren = useMemo(
    () => activeChildren.filter((child) => childAttendsLocation(child, childSchedules.find((record) => record.childId === child.id), "42nd Street")),
    [activeChildren, childSchedules],
  );
  const presentChildren = laraChildren.filter((child) => child.attendanceToday === "Present");
  const attendancePercent = laraChildren.length ? Math.round((presentChildren.length / laraChildren.length) * 100) : 100;

  const laraEmployees = useMemo(
    () => employees.filter((employee) => normalizeLocation(employee.location) === "42nd Street" || employee.location.toLowerCase().includes("all sites")),
    [employees],
  );
  const activeStaff = laraEmployees.filter((employee) => employee.status === "Working Today");
  const childrenPerStaff = activeStaff.length ? Math.ceil(presentChildren.length / activeStaff.length) : 0;

  const laraTasks = useMemo(
    () => tasks.filter((task) => task.location === "All Sites" || normalizeLocation(task.location) === "42nd Street"),
    [tasks],
  );
  const openTasks = laraTasks.filter((task) => !task.completed);
  const completedTasks = laraTasks.filter((task) => task.completed);

  const laraLocation = locations.find((location) => normalizeLocation(location.shortName) === "42nd Street" || normalizeLocation(location.name) === "42nd Street")
    ?? locationFallback.find((location) => location.shortName === "42nd Street")!;
  const availableSpaces = Math.max(laraLocation.capacity - laraChildren.length, 0);

  const todayName = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date()) as DayName;
  const laraHours = hours.find((record) => record.location === "42nd Street") ?? starterLocationHours.find((record) => record.location === "42nd Street")!;
  const todayHours = laraHours.days[todayName];

  const notices = [
    {
      title: "Today’s attendance snapshot",
      body: laraChildren.length ? `${presentChildren.length} of ${laraChildren.length} enrolled children are marked present right now.` : "No Lara Family Childcare children are currently visible to this account.",
      icon: UserRoundCheck,
      tone: "bg-[#edf7ee] text-[#2f6b37] border-[#cfe4d1]",
    },
    {
      title: activeStaff.length ? `${activeStaff.length} team member${activeStaff.length === 1 ? "" : "s"} working today` : "No staff marked Working Today",
      body: laraEmployees.length ? `${laraEmployees.length} staff record${laraEmployees.length === 1 ? " is" : "s are"} assigned to Lara Family Childcare or All Sites.` : "Add staff assignments in Employees so this card can populate automatically.",
      icon: Users,
      tone: "bg-[#eef3f8] text-[#0b3153] border-[#cddbe8]",
    },
    {
      title: openTasks.length ? `${openTasks.length} open location task${openTasks.length === 1 ? "" : "s"}` : "Location work plan is caught up",
      body: openTasks.length ? "Open Work Plans to review the remaining site responsibilities." : "There are no open Lara Family Childcare work-plan items visible to this account.",
      icon: ClipboardCheck,
      tone: "bg-[#fff7e8] text-[#9a6615] border-[#edd8ad]",
    },
  ];

  if (!assignedToLara) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-2xl rounded-3xl border border-red-200 bg-white p-8 text-center shadow-lg">
          <ShieldCheck className="mx-auto h-12 w-12 text-red-600" />
          <h1 className="mt-4 text-2xl font-black text-slate-950">Lara Family Childcare access is location-restricted</h1>
          <p className="mt-3 leading-7 text-slate-600">This homepage is for staff assigned to 42nd Street and company Owners/Admins.</p>
          <Link href="/" className="mt-6 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Return to Dashboard</Link>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1540px] space-y-5 pb-12">
        <section className="relative overflow-hidden rounded-[2rem] border border-[#e5d9c4] bg-[#fffdf8] shadow-[0_20px_60px_rgba(11,49,83,0.14)]">
          <div className="absolute inset-x-0 top-0 h-2 bg-[#d89a23]" />
          <div className="absolute -left-14 -top-16 h-44 w-44 rounded-full border-[14px] border-[#d89a23]/30" />
          <div className="absolute -right-16 top-10 h-52 w-52 rounded-full bg-[#2f6b37]/10" />
          <div className="absolute left-8 top-20 text-5xl opacity-80">🌿</div>
          <div className="absolute right-12 top-24 text-5xl opacity-80">🌿</div>
          <div className="absolute left-[15%] top-14 text-3xl">💛</div>
          <div className="absolute right-[18%] top-10 text-3xl">💛</div>
          <div className="relative grid min-h-[330px] gap-8 p-7 sm:p-10 lg:grid-cols-[1.12fr_.88fr] lg:items-center lg:p-12">
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 rounded-full bg-[#f7f0e3] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#0b3153]"><Sparkles className="h-4 w-4 text-[#d89a23]" /> TCS Family Childcare Network</div>
              <h1 className="mt-5 font-serif text-5xl font-black tracking-[-0.04em] text-[#0b3153] sm:text-7xl">Lara</h1>
              <p className="mt-1 text-2xl font-black tracking-[0.15em] text-[#2f6b37] sm:text-3xl">FAMILY CHILDCARE</p>
              <div className="mt-5 inline-flex max-w-2xl items-center gap-2 rounded-xl bg-[#0b3153] px-4 py-2 text-sm font-black text-white"><Heart className="h-4 w-4 fill-[#d89a23] text-[#d89a23]" /> Where little hearts grow, big futures begin.</div>
              <p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-slate-600">A warm location command center for enrollment, staffing, attendance, daily care, family-childcare operations, and the things that need attention today.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                {canAccessRoute(profile, "/daily-care") && <Link href="/daily-care" className="inline-flex items-center gap-2 rounded-xl bg-[#2f6b37] px-5 py-3 text-sm font-black text-white shadow-lg"><CalendarCheck className="h-4 w-4" /> Daily Operations <ArrowRight className="h-4 w-4" /></Link>}
                {isSystemOwner && <Link href="/locations" className="inline-flex items-center gap-2 rounded-xl border border-[#dbc9a9] bg-white px-5 py-3 text-sm font-black text-[#0b3153]"><Pencil className="h-4 w-4" /> Edit Location</Link>}
              </div>
            </div>

            <div className="relative z-10 flex min-h-64 items-center justify-center">
              <div className="relative h-64 w-72">
                <div className="absolute left-1/2 top-4 grid h-44 w-48 -translate-x-1/2 place-items-center rounded-[3rem] bg-white shadow-xl ring-8 ring-[#f7f0e3]">
                  <Home className="h-24 w-24 text-[#0b3153]" strokeWidth={1.6} />
                  <Heart className="absolute left-1/2 top-[86px] h-9 w-9 -translate-x-1/2 fill-[#d89a23] text-[#d89a23]" />
                </div>
                <div className="absolute bottom-7 left-1/2 flex -translate-x-1/2 gap-2 text-3xl"><span>🌱</span><span>💛</span><span>🌱</span></div>
                <p className="absolute bottom-0 left-1/2 w-full -translate-x-1/2 text-center font-serif text-lg font-black italic text-[#0b3153]">Safe Hearts • Happy Days • Brighter Tomorrows</p>
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-[#e7ddcb] sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#f7f0e3] text-[#d89a23]"><Heart className="h-7 w-7 fill-current" /></span>
            <div><h2 className="text-2xl font-black text-[#0b3153]">Lara Family Childcare</h2><p className="mt-1 font-semibold text-slate-500">42nd Street • Family Childcare • {laraLocation.status}</p></div>
          </div>
          <div className="rounded-2xl bg-[#edf7ee] px-5 py-3 text-sm font-bold text-[#2f6b37]"><strong>{todayName}:</strong> {todayHours.closed ? "Closed" : `${formatClock(todayHours.open)}–${formatClock(todayHours.close)}`}</div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={<Baby className="h-6 w-6" />} label="Children Enrolled" value={laraChildren.length} helper={`${availableSpaces} of ${laraLocation.capacity} spaces available`} tone="gold" />
          <MetricCard icon={<Users className="h-6 w-6" />} label="Active Staff" value={activeStaff.length} helper={`${laraEmployees.length} assigned staff record${laraEmployees.length === 1 ? "" : "s"}`} tone="green" />
          <MetricCard icon={<UserRoundCheck className="h-6 w-6" />} label="Live Headcount" value={activeStaff.length ? `${childrenPerStaff}:1` : "—"} helper={activeStaff.length ? "Children per staff marked working" : "No staff marked working"} tone="navy" />
          <MetricCard icon={<CalendarCheck className="h-6 w-6" />} label="Today’s Attendance" value={presentChildren.length} helper={`${attendancePercent}% of enrolled marked present`} tone="gold" />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_1fr_1.1fr]">
          <Card title="Location Overview" icon={<Home className="h-5 w-5" />} action={<span className="rounded-full bg-[#edf7ee] px-3 py-1 text-xs font-black text-[#2f6b37]">● {laraLocation.status}</span>}>
            <p className="text-sm font-semibold leading-6 text-slate-600">Lara Family Childcare provides a welcoming home-based setting where children can feel safe, supported, connected, and ready to grow.</p>
            <div className="mt-5 space-y-3 text-sm font-semibold text-slate-600">
              <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 text-[#0b3153]" /> {laraLocation.address}</p>
              <p className="flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 text-[#0b3153]" /> {todayHours.closed ? "Closed today" : `${formatClock(todayHours.open)}–${formatClock(todayHours.close)} today`}</p>
              <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 text-[#0b3153]" /> {laraLocation.facilityNumber}</p>
              <p className="flex items-start gap-2"><Heart className="mt-0.5 h-4 w-4 text-[#d89a23]" /> Program: {laraLocation.type}</p>
            </div>
            {isSystemOwner && <Link href="/locations" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#f4f6f8] px-4 py-2 text-sm font-black text-[#0b3153]">View Location Details <ArrowRight className="h-4 w-4" /></Link>}
          </Card>

          <Card title="Staffing" icon={<Users className="h-5 w-5" />} action={canAccessRoute(profile, "/employees") ? <Link href="/employees" className="rounded-xl bg-[#f4f6f8] px-3 py-2 text-xs font-black text-[#0b3153]">Manage Staff</Link> : undefined}>
            <div className="space-y-3">
              {laraEmployees.slice(0, 4).map((employee) => (
                <div key={employee.id} className="flex items-center gap-3 rounded-2xl border border-[#eee5d5] p-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#f7f0e3] text-sm font-black text-[#0b3153]">{employee.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div>
                  <div className="min-w-0 flex-1"><p className="truncate font-black text-[#0b3153]">{employee.name}</p><p className="truncate text-xs font-semibold text-slate-500">{employee.role}</p></div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${employee.status === "Working Today" ? "bg-[#edf7ee] text-[#2f6b37]" : "bg-slate-100 text-slate-500"}`}>{employee.status}</span>
                </div>
              ))}
              {laraEmployees.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No staff records are assigned to Lara Family Childcare yet.</p>}
            </div>
          </Card>

          <Card title="Child Roster Snapshot" icon={<Baby className="h-5 w-5" />} action={canAccessRoute(profile, "/children") ? <Link href="/children" className="rounded-xl bg-[#f4f6f8] px-3 py-2 text-xs font-black text-[#0b3153]">View All</Link> : undefined}>
            <div className="overflow-hidden rounded-2xl border border-[#eee5d5]">
              <div className="grid grid-cols-[1.3fr_.7fr_1fr_.8fr] bg-[#faf7f0] px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400"><span>Name</span><span>Age</span><span>Group</span><span>Status</span></div>
              {laraChildren.slice(0, 5).map((child) => (
                <div key={child.id} className="grid grid-cols-[1.3fr_.7fr_1fr_.8fr] items-center border-t border-[#f1eadf] px-3 py-2 text-xs">
                  <span className="truncate font-black text-[#0b3153]">{child.firstName} {child.lastName.slice(0, 1)}.</span>
                  <span className="truncate text-slate-500">{child.age}</span>
                  <span className="truncate text-slate-500">{child.ageGroup}</span>
                  <span className={`w-fit rounded-full px-2 py-1 text-[10px] font-black ${child.attendanceToday === "Present" ? "bg-[#edf7ee] text-[#2f6b37]" : child.attendanceToday === "Absent" ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"}`}>{child.attendanceToday}</span>
                </div>
              ))}
              {laraChildren.length === 0 && <p className="p-4 text-sm font-semibold text-slate-500">No enrolled children are currently assigned to 42nd Street.</p>}
            </div>
          </Card>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_1fr_1fr]">
          <Card title="Daily Operations" icon={<ClipboardCheck className="h-5 w-5" />}>
            <div className="space-y-2">
              {laraTasks.slice(0, 6).map((task) => (
                <div key={task.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                  {task.completed ? <CheckCircle2 className="h-5 w-5 shrink-0 text-[#2f6b37]" /> : <span className="h-5 w-5 shrink-0 rounded border-2 border-slate-300" />}
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-700">{task.title}</p><p className="text-[11px] font-semibold text-slate-400">{task.due} • {task.owner}</p></div>
                </div>
              ))}
              {laraTasks.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No Lara-specific work-plan tasks yet.</p>}
            </div>
            {canAccessRoute(profile, "/work-plans") && <Link href="/work-plans" className="mt-4 inline-flex items-center gap-2 text-sm font-black text-[#0b3153]">Open Work Plans <ArrowRight className="h-4 w-4" /></Link>}
          </Card>

          <Card title="Location Notices" icon={<Megaphone className="h-5 w-5" />}>
            <div className="space-y-3">
              {notices.map((notice) => {
                const Icon = notice.icon;
                return <div key={notice.title} className={`rounded-2xl border p-3 ${notice.tone}`}><div className="flex items-start gap-3"><Icon className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="text-sm font-black">{notice.title}</p><p className="mt-1 text-xs font-semibold leading-5 opacity-80">{notice.body}</p></div></div></div>;
              })}
            </div>
          </Card>

          <Card title="Quick Actions" icon={<Sparkles className="h-5 w-5 text-[#d89a23]" />}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {quickActions.filter((action) => canAccessRoute(profile, action.href)).map((action) => {
                const Icon = action.icon;
                return <Link key={action.href} href={action.href} className={`flex items-center gap-3 rounded-2xl px-4 py-4 text-sm font-black shadow-sm transition hover:-translate-y-0.5 ${action.className}`}><Icon className="h-5 w-5" /> {action.label}</Link>;
              })}
            </div>
            <div className="mt-5 rounded-2xl bg-[#f7f0e3] p-4 text-sm font-semibold leading-6 text-[#0b3153]"><Heart className="mr-1 inline h-4 w-4 fill-[#d89a23] text-[#d89a23]" /> Together for brighter tomorrows.</div>
          </Card>
        </section>

        <footer className="flex flex-col gap-2 border-t border-[#e7ddcb] pt-5 text-xs font-bold text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>TCS Operations Hub • Lara Family Childcare</span>
          <span>{completedTasks.length} completed • {openTasks.length} open location task{openTasks.length === 1 ? "" : "s"} 💛</span>
        </footer>
      </div>
    </MainLayout>
  );
}

function MetricCard({ icon, label, value, helper, tone }: { icon: React.ReactNode; label: string; value: string | number; helper: string; tone: "gold" | "green" | "navy" }) {
  const styles = tone === "green"
    ? "bg-[#edf7ee] text-[#2f6b37]"
    : tone === "navy"
      ? "bg-[#eef3f8] text-[#0b3153]"
      : "bg-[#fff6df] text-[#9a6615]";
  return <article className="rounded-3xl border border-[#e7ddcb] bg-white p-5 shadow-sm"><div className="flex items-center gap-4"><span className={`grid h-12 w-12 place-items-center rounded-2xl ${styles}`}>{icon}</span><div><p className="text-sm font-bold text-slate-600">{label}</p><p className="mt-0.5 text-3xl font-black text-[#0b3153]">{value}</p><p className="mt-1 text-xs font-semibold text-slate-400">{helper}</p></div></div></article>;
}

function Card({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return <article className="rounded-3xl border border-[#e7ddcb] bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-[#0b3153]">{icon}<h3 className="text-lg font-black">{title}</h3></div>{action}</div>{children}</article>;
}
