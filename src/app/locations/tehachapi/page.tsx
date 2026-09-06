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
  FileWarning,
  Heart,
  Home,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
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

const siteTheme = locationThemes.Tehachapi;

const locationFallback: LocationRecord[] = (Object.keys(locationThemes) as LocationKey[])
  .filter((item): item is Exclude<LocationKey, "All Locations"> => item !== "All Locations")
  .map((key) => ({
    id: key.toLowerCase().replaceAll(" ", "-"),
    name: locationThemes[key].fullName,
    shortName: key,
    type: locationThemes[key].programType,
    capacity: locationThemes[key].capacity,
    facilityNumber: "Add facility number",
    address: key === "Tehachapi" ? "Tehachapi, CA" : key === "Halcom" ? "Lancaster, CA" : "Add site address",
    phone: "(760) 382-5742",
    status: "Active",
  }));

const quickActions = [
  { label: "Children", href: "/children", icon: Baby },
  { label: "Staff", href: "/employees", icon: Users },
  { label: "Daily Care", href: "/daily-care", icon: CalendarCheck },
  { label: "Family Accounts", href: "/families", icon: MessageCircle },
  { label: "Files", href: "/files", icon: FileWarning },
  { label: "Reports", href: "/reports", icon: ClipboardCheck },
] as const;

export default function ThomasonFamilyChildcareHomePage() {
  const { profile, isSystemOwner } = useAuth();
  const { setLocation } = useHubLocation();
  const [children] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const [childSchedules] = usePersistentState<ChildScheduleRecord[]>("tcs-child-schedules-v2", starterChildSchedules);
  const [employees] = usePersistentState<EmployeeRecord[]>("tcs-employees", starterEmployees);
  const [tasks] = usePersistentState<WorkTask[]>("tcs-work-tasks", starterTasks);
  const [hours] = usePersistentState<LocationHoursRecord[]>("tcs-location-hours-v2", starterLocationHours);
  const [locations] = usePersistentState<LocationRecord[]>("tcs-locations-v2", locationFallback);

  useEffect(() => {
    setLocation("Tehachapi");
  }, [setLocation]);

  const assignedToSite = isSystemOwner || (profile?.locations ?? []).some((location) => location === "All Locations" || normalizeLocation(location) === "Tehachapi");

  const activeChildren = useMemo(() => children.filter((child) => child.enrollmentStatus !== "Archived"), [children]);
  const siteChildren = useMemo(
    () => activeChildren.filter((child) => childAttendsLocation(child, childSchedules.find((record) => record.childId === child.id), "Tehachapi")),
    [activeChildren, childSchedules],
  );
  const presentChildren = siteChildren.filter((child) => child.attendanceToday === "Present");
  const attendancePercent = siteChildren.length ? Math.round((presentChildren.length / siteChildren.length) * 100) : 100;

  const siteEmployees = useMemo(
    () => employees.filter((employee) => normalizeLocation(employee.location) === "Tehachapi" || employee.location.toLowerCase().includes("all sites")),
    [employees],
  );
  const workingStaff = siteEmployees.filter((employee) => employee.status === "Working Today");

  const siteTasks = useMemo(
    () => tasks.filter((task) => task.location === "All Sites" || normalizeLocation(task.location) === "Tehachapi"),
    [tasks],
  );
  const openTasks = siteTasks.filter((task) => !task.completed);
  const completeTasks = siteTasks.filter((task) => task.completed);

  const siteLocation = locations.find((location) => normalizeLocation(location.shortName) === "Tehachapi" || normalizeLocation(location.name) === "Tehachapi")
    ?? locationFallback.find((location) => location.shortName === "Tehachapi")!;
  const availableSpaces = Math.max(siteLocation.capacity - siteChildren.length, 0);
  const capacityPercent = siteLocation.capacity ? Math.min(100, Math.round((siteChildren.length / siteLocation.capacity) * 100)) : 0;

  const todayName = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date()) as DayName;
  const siteHours = hours.find((record) => record.location === "Tehachapi") ?? starterLocationHours.find((record) => record.location === "Tehachapi")!;
  const todayHours = siteHours.days[todayName];

  const ageGroups = (["Infant", "Toddler", "Preschool", "School Age"] as const).map((ageGroup) => ({
    ageGroup,
    count: siteChildren.filter((child) => child.ageGroup === ageGroup).length,
  }));
  const families = new Set(siteChildren.map((child) => child.familyId ?? child.primaryGuardian).filter(Boolean)).size;
  const childFileNeeds = siteChildren.filter((child) => child.licensingStatus === "Missing Documents");
  const staffFileNeeds = siteEmployees.filter((employee) => employee.fileStatus === "Needs Attention");

  if (!assignedToSite) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-2xl rounded-3xl border border-red-200 bg-white p-8 text-center shadow-lg">
          <ShieldCheck className="mx-auto h-12 w-12 text-red-600" />
          <h1 className="mt-4 text-2xl font-black text-slate-950">Thomason Family Childcare access is location-restricted</h1>
          <p className="mt-3 leading-7 text-slate-600">This homepage is for Tehachapi-assigned staff and company Owners/Admins.</p>
          <Link href="/" className="mt-6 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Return to Dashboard</Link>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1540px] space-y-5 pb-12">
        <section className="relative overflow-hidden rounded-[2rem] border border-[#dfdac8] bg-[#fffdf8] shadow-[0_20px_55px_rgba(22,91,59,0.12)]">
          <div className="absolute -left-16 -top-20 h-56 w-56 rounded-full bg-[#f1e6c8]" />
          <div className="absolute -right-10 -top-16 h-52 w-52 rounded-full bg-[#edf2e5]" />
          <div className="absolute -bottom-16 left-0 h-28 w-[46%] rounded-[50%] bg-[#dfe8cf]" />
          <div className="absolute -bottom-12 right-0 h-24 w-[42%] rounded-[50%] bg-[#f2e4bb]" />
          <div className="relative grid min-h-[330px] gap-8 p-7 sm:p-10 lg:grid-cols-[.82fr_1.18fr] lg:items-center lg:p-12">
            <div className="relative z-10 flex items-center justify-center">
              <div className="relative grid h-60 w-60 place-items-center rounded-full border-[10px] border-[#d6a23d] bg-white shadow-xl">
                <div className="absolute inset-4 rounded-full border-4 border-[#155b3b]" />
                <span className="relative z-10 text-[8rem] font-black leading-none text-[#155b3b]">T</span>
                <span className="absolute bottom-8 left-8 z-20 text-6xl">🐊</span>
                <Heart className="absolute right-8 top-10 z-20 h-10 w-10 fill-[#d6a23d] text-[#d6a23d]" />
              </div>
            </div>

            <div className="relative z-10 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 rounded-full bg-[#eef4e8] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#155b3b]"><Sparkles className="h-4 w-4" /> TCS • Tehachapi</div>
              <h1 className="mt-5 text-4xl font-black tracking-[-0.045em] text-[#155b3b] sm:text-6xl">THOMASON</h1>
              <p className="mt-1 text-2xl font-black tracking-[0.22em] text-[#d6a23d] sm:text-3xl">FAMILY CHILDCARE</p>
              <p className="mt-5 text-sm font-black uppercase tracking-[0.22em] text-[#315b43]">Nurturing Minds. Building Futures.</p>
              <p className="mx-auto mt-4 max-w-2xl text-base font-semibold leading-7 text-slate-600 lg:mx-0">A warm, organized home base for the Tehachapi program — children, families, staff, daily operations, files, and care information in one place.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-3 lg:justify-start">
                {canAccessRoute(profile, "/daily-care") && <Link href="/daily-care" className="inline-flex items-center gap-2 rounded-xl bg-[#155b3b] px-5 py-3 text-sm font-black text-white shadow-lg"><CalendarCheck className="h-4 w-4" /> Daily Operations <ArrowRight className="h-4 w-4" /></Link>}
                <a href="#location-overview" className="inline-flex items-center gap-2 rounded-xl border border-[#d9cfb7] bg-white px-5 py-3 text-sm font-black text-[#155b3b]"><Home className="h-4 w-4" /> Location Overview</a>
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-[#e3ddcf] sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#eef4e8] text-[#155b3b]"><MapPin className="h-7 w-7" /></span>
            <div><h2 className="text-2xl font-black text-[#155b3b]">Thomason Family Childcare</h2><p className="mt-1 font-semibold text-slate-500">Tehachapi • Licensed Family Childcare Home</p></div>
          </div>
          <div className="rounded-2xl bg-[#fbf4df] px-5 py-3 text-sm font-bold text-[#5b4a20]"><strong>{todayName}:</strong> {todayHours.closed ? "Closed" : `${formatClock(todayHours.open)}–${formatClock(todayHours.close)}`} • {siteLocation.status}</div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Children Enrolled" value={siteChildren.length} helper={`${availableSpaces} spaces available`} icon={<Baby className="h-5 w-5" />} />
          <MetricCard label="Active Staff" value={workingStaff.length} helper={`${siteEmployees.length} assigned to this site`} icon={<Users className="h-5 w-5" />} />
          <MetricCard label="Today’s Attendance" value={`${presentChildren.length}/${siteChildren.length || 0}`} helper={`${attendancePercent}% marked present`} icon={<CalendarCheck className="h-5 w-5" />} />
          <MetricCard label="Open Operations" value={openTasks.length} helper={`${completeTasks.length} completed`} icon={<ClipboardCheck className="h-5 w-5" />} />
        </section>

        <section className="grid gap-5 xl:grid-cols-3">
          <article id="location-overview" className="rounded-3xl border border-[#e3ddcf] bg-white p-6 shadow-sm">
            <PanelTitle icon={<Home className="h-5 w-5" />} title="Location Overview" />
            <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">A safe, caring, and enriching family childcare environment where children can learn, grow, and belong.</p>
            <div className="mt-5 space-y-3 text-sm text-slate-700">
              <InfoRow icon={<MapPin className="h-4 w-4" />} text={siteLocation.address || "Tehachapi, CA • Add exact site address in Locations"} />
              <InfoRow icon={<Clock3 className="h-4 w-4" />} text={todayHours.closed ? `${todayName}: Closed` : `${todayName}: ${formatClock(todayHours.open)}–${formatClock(todayHours.close)}`} />
              <InfoRow icon={<Users className="h-4 w-4" />} text={`Licensed capacity: ${siteLocation.capacity} children`} />
              <InfoRow icon={<ShieldCheck className="h-4 w-4" />} text={siteLocation.facilityNumber || "Facility number not entered"} />
            </div>
            <div className="mt-5 rounded-2xl bg-[#eef4e8] px-4 py-3 text-center text-sm font-black italic text-[#315b43]">“Nurturing minds. Building futures.” 💛</div>
          </article>

          <article className="rounded-3xl border border-[#e3ddcf] bg-white p-6 shadow-sm">
            <PanelTitle icon={<Users className="h-5 w-5" />} title="Staffing" action={canAccessRoute(profile, "/employees") ? <Link href="/employees" className="text-xs font-black text-[#155b3b]">View All</Link> : undefined} />
            <div className="mt-4 space-y-3">
              {siteEmployees.slice(0, 5).map((employee) => <div key={employee.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#fbfaf5] p-3">
                <div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#dce9d8] text-sm font-black text-[#155b3b]">{employee.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div className="min-w-0"><p className="truncate font-black text-slate-900">{employee.name}</p><p className="truncate text-xs font-semibold text-slate-500">{employee.role}</p></div></div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${employee.status === "Working Today" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{employee.status}</span>
              </div>)}
              {siteEmployees.length === 0 && <EmptyText>No Tehachapi staff records are currently visible to this account.</EmptyText>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-[#eef4e8] p-4 text-center"><div><p className="text-2xl font-black text-[#155b3b]">{workingStaff.length}</p><p className="text-xs font-bold text-slate-500">Working Today</p></div><div><p className="text-2xl font-black text-[#d09a2e]">{siteEmployees.length}</p><p className="text-xs font-bold text-slate-500">Assigned Staff</p></div></div>
          </article>

          <article className="rounded-3xl border border-[#e3ddcf] bg-white p-6 shadow-sm">
            <PanelTitle icon={<Baby className="h-5 w-5" />} title="Child Roster Snapshot" action={canAccessRoute(profile, "/children") ? <Link href="/children" className="text-xs font-black text-[#155b3b]">View All</Link> : undefined} />
            <div className="mt-5 flex items-center gap-5">
              <div className="grid h-32 w-32 shrink-0 place-items-center rounded-full bg-[conic-gradient(#155b3b_var(--capacity),#e7eddc_0)] p-3" style={{ "--capacity": `${capacityPercent}%` } as React.CSSProperties}><div className="grid h-full w-full place-items-center rounded-full bg-white text-center"><div><p className="text-3xl font-black text-[#155b3b]">{siteChildren.length}</p><p className="text-xs font-bold text-slate-500">Children</p></div></div></div>
              <div className="flex-1 space-y-2">{ageGroups.map((group, index) => <div key={group.ageGroup} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 font-semibold text-slate-600"><span className={`h-3 w-3 rounded-full ${["bg-[#155b3b]","bg-[#9fbd8b]","bg-[#d6a23d]","bg-[#ead8a8]"][index]}`} />{group.ageGroup}</span><strong className="text-slate-900">{group.count}</strong></div>)}</div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-[#fbfaf5] p-4 text-center"><div><p className="text-xl font-black text-[#155b3b]">{siteChildren.length} of {siteLocation.capacity}</p><p className="text-xs font-bold text-slate-500">Enrollment Capacity</p></div><div><p className="text-xl font-black text-[#155b3b]">{capacityPercent}%</p><p className="text-xs font-bold text-slate-500">Capacity Used</p></div></div>
          </article>
        </section>

        <section className="grid gap-5 xl:grid-cols-3">
          <article className="rounded-3xl border border-[#e3ddcf] bg-white p-6 shadow-sm">
            <PanelTitle icon={<MessageCircle className="h-5 w-5" />} title="Family Communication" action={canAccessRoute(profile, "/families") ? <Link href="/families" className="text-xs font-black text-[#155b3b]">Open Families</Link> : undefined} />
            <div className="mt-5 rounded-2xl bg-[#fbfaf5] p-5"><p className="text-3xl font-black text-[#155b3b]">{families}</p><p className="mt-1 text-sm font-bold text-slate-500">family account{families === 1 ? "" : "s"} connected to visible Tehachapi children</p></div>
            <p className="mt-4 text-sm leading-6 text-slate-600">Use Family Accounts for guardian, subsidy, billing, and communication details. This panel does not invent message history that is not stored in the Hub.</p>
            {canAccessRoute(profile, "/families") && <Link href="/families" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#155b3b] px-4 py-3 text-sm font-black text-white"><MessageCircle className="h-4 w-4" /> Open Family Accounts</Link>}
          </article>

          <article className="rounded-3xl border border-[#e3ddcf] bg-white p-6 shadow-sm">
            <PanelTitle icon={<ClipboardCheck className="h-5 w-5" />} title="Daily Operations" action={canAccessRoute(profile, "/work-plans") ? <Link href="/work-plans" className="text-xs font-black text-[#155b3b]">View All</Link> : undefined} />
            <div className="mt-4 space-y-2">{siteTasks.slice(0, 6).map((task) => <div key={task.id} className="flex items-start gap-3 rounded-xl px-2 py-2"><span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md ${task.completed ? "bg-[#155b3b] text-white" : "border-2 border-slate-300 bg-white"}`}>{task.completed && <CheckCircle2 className="h-3.5 w-3.5" />}</span><div className="min-w-0 flex-1"><p className={`text-sm font-bold ${task.completed ? "text-slate-500 line-through" : "text-slate-800"}`}>{task.title}</p><p className="mt-0.5 text-xs text-slate-400">{task.owner} • {task.due}</p></div></div>)}{siteTasks.length === 0 && <EmptyText>No Tehachapi work-plan tasks are currently visible.</EmptyText>}</div>
            <div className="mt-5 rounded-2xl bg-[#fbf4df] px-4 py-3 text-center text-sm font-black italic text-[#6a5421]">Today is a great day to make a difference! 💛</div>
          </article>

          <article className="rounded-3xl border border-[#e3ddcf] bg-white p-6 shadow-sm">
            <PanelTitle icon={<ShieldCheck className="h-5 w-5" />} title="Licensing & File Reminders" action={canAccessRoute(profile, "/compliance") ? <Link href="/compliance" className="text-xs font-black text-[#155b3b]">View All</Link> : undefined} />
            <div className="mt-4 space-y-3">
              <ReminderRow label="Child files needing documents" value={childFileNeeds.length} okay={childFileNeeds.length === 0} />
              <ReminderRow label="Staff files needing attention" value={staffFileNeeds.length} okay={staffFileNeeds.length === 0} />
              <ReminderRow label="Children marked present today" value={presentChildren.length} okay />
              <ReminderRow label="Open work-plan items" value={openTasks.length} okay={openTasks.length === 0} />
            </div>
            <p className="mt-5 text-xs leading-5 text-slate-500">Due dates only appear when they are actually stored in the Hub. This homepage does not create placeholder compliance deadlines.</p>
          </article>
        </section>

        <section className="rounded-3xl border border-[#e3ddcf] bg-white p-5 shadow-sm sm:p-6">
          <PanelTitle icon={<Sparkles className="h-5 w-5" />} title="Quick Actions" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{quickActions.filter((action) => canAccessRoute(profile, action.href)).map((action) => { const Icon = action.icon; return <Link key={action.href} href={action.href} className="flex items-center justify-center gap-2 rounded-2xl border border-[#e3ddcf] bg-[#fffdf8] px-4 py-4 text-sm font-black text-[#155b3b] transition hover:-translate-y-0.5 hover:shadow-md"><Icon className="h-5 w-5" />{action.label}</Link>; })}</div>
        </section>

        <p className="text-center text-sm font-black italic text-[#6b765e]">Happy Children. Brighter Tomorrows. ♡</p>
      </div>
    </MainLayout>
  );
}

function MetricCard({ label, value, helper, icon }: { label: string; value: string | number; helper: string; icon: React.ReactNode }) {
  return <article className="rounded-3xl border border-[#e3ddcf] bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#eef4e8] text-[#155b3b]">{icon}</span><div><p className="text-xs font-black uppercase tracking-[0.13em] text-slate-400">{label}</p><p className="mt-1 text-2xl font-black text-[#155b3b]">{value}</p></div></div><p className="mt-3 text-xs font-semibold text-slate-500">{helper}</p></article>;
}

function PanelTitle({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2.5 text-[#155b3b]">{icon}<h3 className="text-lg font-black text-slate-900">{title}</h3></div>{action}</div>;
}

function InfoRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="flex items-start gap-3"><span className="mt-0.5 text-[#155b3b]">{icon}</span><span className="font-semibold">{text}</span></div>;
}

function ReminderRow({ label, value, okay }: { label: string; value: number; okay: boolean }) {
  return <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#fbfaf5] px-4 py-3"><div className="flex items-center gap-3"><span className={`grid h-9 w-9 place-items-center rounded-xl ${okay ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{okay ? <CheckCircle2 className="h-4 w-4" /> : <FileWarning className="h-4 w-4" />}</span><p className="text-sm font-bold text-slate-700">{label}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${okay ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{value}</span></div>;
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-500">{children}</p>;
}
