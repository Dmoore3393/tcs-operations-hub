"use client";

import Link from "next/link";
import {
  Bell,
  CalendarCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileText,
  HeartPulse,
  Home,
  LogOut,
  MapPin,
  MessageSquare,
  Pencil,
  Search,
  ShieldCheck,
  Soup,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { canAccessRoute, canWriteStateKey, useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { childAttendsLocation, starterChildSchedules, type ChildScheduleRecord } from "@/lib/child-schedules";
import { initialChildren, type AgeGroup, type ChildRecord } from "@/lib/children";
import { starterEmployees, starterTasks, type EmployeeRecord, type WorkTask } from "@/lib/hub-data";
import { formatClock, locationThemes, normalizeLocation, starterLocationHours, type DayName, type LocationHoursRecord, type LocationKey } from "@/lib/location-config";

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

type NavItem = { label: string; href: string; icon: React.ReactNode };

const mooreTheme = locationThemes.Halcom;

const locationFallback: LocationRecord[] = (Object.keys(locationThemes) as LocationKey[])
  .filter((item): item is Exclude<LocationKey, "All Locations"> => item !== "All Locations")
  .map((key) => ({
    id: key.toLowerCase().replaceAll(" ", "-"),
    name: locationThemes[key].fullName,
    shortName: key,
    type: locationThemes[key].programType,
    capacity: locationThemes[key].capacity,
    facilityNumber: key === "42nd Street" ? "Facility #197701124" : "Add facility number",
    address: key === "Halcom" ? "Lancaster, CA" : "Add site address",
    phone: "(760) 382-5742",
    status: "Active",
  }));

const dailyRoutine = [
  ["6:00 AM", "Open & Welcome"],
  ["7:30 AM", "Breakfast"],
  ["9:30 AM", "AM Snack"],
  ["11:30 AM", "Lunch"],
  ["12:00 PM", "Rest / Quiet Time"],
  ["2:30 PM", "PM Snack"],
  ["4:30 PM", "Dinner"],
  ["Closing", "Final pickup & closing checks"],
] as const;

const navItems: NavItem[] = [
  { label: "Locations", href: "/locations", icon: <Home className="h-5 w-5" /> },
  { label: "Children", href: "/children", icon: <Users className="h-5 w-5" /> },
  { label: "Staff", href: "/employees", icon: <Users className="h-5 w-5" /> },
  { label: "Enrollment", href: "/enrollment-pipeline", icon: <FileText className="h-5 w-5" /> },
  { label: "Attendance", href: "/child-schedules", icon: <CalendarCheck className="h-5 w-5" /> },
  { label: "Health & Safety", href: "/health-safety", icon: <ShieldCheck className="h-5 w-5" /> },
  { label: "Meals", href: "/meals", icon: <Soup className="h-5 w-5" /> },
  { label: "Reports", href: "/reports", icon: <ClipboardList className="h-5 w-5" /> },
  { label: "Communications", href: "/families", icon: <MessageSquare className="h-5 w-5" /> },
  { label: "Settings", href: "/settings", icon: <Pencil className="h-5 w-5" /> },
];

export default function MooreFamilyChildcareHomePage() {
  const { profile, user, isSystemOwner, signOut } = useAuth();
  const { setLocation } = useHubLocation();
  const [children] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const [childSchedules] = usePersistentState<ChildScheduleRecord[]>("tcs-child-schedules-v2", starterChildSchedules);
  const [employees] = usePersistentState<EmployeeRecord[]>("tcs-employees", starterEmployees);
  const [tasks, setTasks] = usePersistentState<WorkTask[]>("tcs-work-tasks", starterTasks);
  const [hours] = usePersistentState<LocationHoursRecord[]>("tcs-location-hours-v2", starterLocationHours);
  const [locations] = usePersistentState<LocationRecord[]>("tcs-locations-v2", locationFallback);
  const [search, setSearch] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    setLocation("Halcom");
  }, [setLocation]);

  const assignedToMoore = isSystemOwner || (profile?.locations ?? []).some((location) => location === "All Locations" || normalizeLocation(location) === "Halcom");
  const canUpdateTasks = canWriteStateKey(profile, "tcs-work-tasks");

  const activeChildren = useMemo(() => children.filter((child) => child.enrollmentStatus !== "Archived"), [children]);
  const mooreChildren = useMemo(
    () => activeChildren.filter((child) => childAttendsLocation(child, childSchedules.find((record) => record.childId === child.id), "Halcom")),
    [activeChildren, childSchedules],
  );
  const presentChildren = mooreChildren.filter((child) => child.attendanceToday === "Present");
  const pendingChildren = mooreChildren.filter((child) => child.enrollmentStatus === "Pending");
  const documentAttention = mooreChildren.filter((child) => child.licensingStatus === "Missing Documents");

  const mooreEmployees = useMemo(
    () => employees.filter((employee) => normalizeLocation(employee.location) === "Halcom" || employee.location.toLowerCase().includes("all sites") || employee.location.toLowerCase().includes("halcom")),
    [employees],
  );
  const activeStaff = mooreEmployees.filter((employee) => employee.status === "Working Today");
  const siteLead = mooreEmployees.find((employee) => employee.role.toLowerCase().includes("licensee")) ?? mooreEmployees[0];

  const mooreTasks = useMemo(
    () => tasks.filter((task) => task.location === "All Sites" || normalizeLocation(task.location) === "Halcom"),
    [tasks],
  );
  const openTasks = mooreTasks.filter((task) => !task.completed);

  const location = locations.find((item) => normalizeLocation(item.shortName) === "Halcom" || normalizeLocation(item.name) === "Halcom")
    ?? locationFallback.find((item) => item.shortName === "Halcom")!;
  const todayName = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date()) as DayName;
  const locationHours = hours.find((record) => record.location === "Halcom") ?? starterLocationHours.find((record) => record.location === "Halcom")!;
  const todayHours = locationHours.days[todayName];
  const attendancePercent = mooreChildren.length ? Math.round((presentChildren.length / mooreChildren.length) * 100) : 0;
  const ratioText = activeStaff.length ? `1:${(presentChildren.length / activeStaff.length).toFixed(1)}` : "—";

  const ageGroups: AgeGroup[] = ["Infant", "Toddler", "Preschool", "School Age"];
  const groupCounts = Object.fromEntries(ageGroups.map((group) => [group, mooreChildren.filter((child) => child.ageGroup === group).length])) as Record<AgeGroup, number>;

  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    const childResults = mooreChildren
      .filter((child) => `${child.firstName} ${child.lastName}`.toLowerCase().includes(query))
      .map((child) => ({ label: `${child.firstName} ${child.lastName}`, meta: `${child.ageGroup} • Child`, href: "/children" }));
    const staffResults = mooreEmployees
      .filter((employee) => `${employee.name} ${employee.role}`.toLowerCase().includes(query))
      .map((employee) => ({ label: employee.name, meta: `${employee.role} • Staff`, href: "/employees" }));
    return [...childResults, ...staffResults].slice(0, 8);
  }, [mooreChildren, mooreEmployees, search]);

  const visibleNav = navItems.filter((item) => item.href === "/locations" ? isSystemOwner : canAccessRoute(profile, item.href));
  const staffName = profile?.full_name || user?.email || "TCS Staff";
  const initials = staffName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "TCS";

  function toggleTask(id: number) {
    if (!canUpdateTasks) return;
    setTasks((current) => current.map((task) => task.id === id ? { ...task, completed: !task.completed } : task));
  }

  if (!assignedToMoore) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f4ed] p-6">
        <section className="max-w-xl rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-xl">
          <ShieldCheck className="mx-auto h-12 w-12 text-rose-600" />
          <h1 className="mt-4 text-2xl font-black text-slate-950">Moore Family Childcare access is location-restricted</h1>
          <p className="mt-3 leading-7 text-slate-600">This homepage is for staff assigned to Halcom and company Owners/Admins.</p>
          <Link href="/" className="mt-6 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Return to Dashboard</Link>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f7f2] text-[#334238]">
      <header className="sticky top-0 z-40 flex h-[64px] items-center border-b border-[#e5e5df] bg-white/95 px-4 shadow-sm backdrop-blur lg:pl-[220px]">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search children, staff, or anything..." className="h-10 w-full rounded-xl border border-[#dddcd5] bg-[#fbfbf8] pl-10 pr-4 text-sm outline-none focus:border-[#89a58e]" />
          {search.trim() && (
            <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-2xl border border-[#dddcd5] bg-white shadow-2xl">
              {searchResults.map((result) => <Link key={`${result.meta}-${result.label}`} href={result.href} className="block border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-[#f5f7f2]"><p className="text-sm font-black text-[#314a38]">{result.label}</p><p className="text-xs text-slate-500">{result.meta}</p></Link>)}
              {!searchResults.length && <p className="p-4 text-sm text-slate-500">No Halcom children or staff match that search.</p>}
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={() => setShowNotifications((value) => !value)} className="relative grid h-10 w-10 place-items-center rounded-full text-slate-600 hover:bg-slate-100" aria-label="Notifications"><Bell className="h-5 w-5" />{openTasks.length > 0 && <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-[#f49b72] ring-2 ring-white" />}</button>
          <button onClick={() => setShowUserMenu((value) => !value)} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-50"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#e6eadf] text-xs font-black text-[#3f5944]">{initials}</span><span className="hidden text-left sm:block"><strong className="block text-sm text-slate-800">{staffName}</strong><span className="block text-xs text-slate-500">{profile?.role}</span></span><ChevronDown className="h-4 w-4 text-slate-500" /></button>
          {showUserMenu && <div className="absolute right-4 top-14 w-64 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"><p className="font-black text-slate-900">{staffName}</p><p className="mt-1 text-xs text-slate-500">{profile?.email || user?.email}</p><button onClick={() => void signOut()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#314a38] px-4 py-2.5 text-sm font-black text-white"><LogOut className="h-4 w-4" /> Sign Out</button></div>}
          {showNotifications && <div className="absolute right-24 top-14 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"><p className="font-black text-[#314a38]">Important reminders</p><p className="mt-1 text-xs text-slate-500">{openTasks.length} open Halcom work-plan item{openTasks.length === 1 ? "" : "s"}.</p><Link href="/work-plans" className="mt-3 inline-flex text-sm font-black text-[#66826c]">Open Work Plans →</Link></div>}
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 z-50 hidden w-[205px] flex-col border-r border-[#e1e2db] bg-[#f5f6f1] lg:flex">
        <div className="flex h-[92px] items-center gap-3 border-b border-[#e1e2db] px-5"><span className="text-4xl">🌿</span><div><p className="text-3xl font-medium tracking-tight text-[#1f3025]">TCS</p><p className="-mt-1 font-serif text-sm italic text-[#5d725f]">Operations Hub</p></div></div>
        <nav className="space-y-1 p-3">
          {visibleNav.map((item) => <Link key={item.label} href={item.href} className={`flex items-center gap-4 rounded-xl px-4 py-3 text-sm font-semibold ${item.label === "Locations" ? "bg-[#dfe8d9] text-[#36523b]" : "text-slate-600 hover:bg-white"}`}>{item.icon}<span>{item.label}</span></Link>)}
        </nav>
        <div className="mt-auto overflow-hidden px-5 pb-8 text-center"><div className="text-5xl opacity-70">🌿</div><p className="mt-2 font-serif text-xl italic leading-7 text-[#647b67]">Nurturing<br />Brighter<br />Tomorrows<br />Together</p><p className="mt-2 text-2xl text-[#e89570]">♥</p></div>
      </aside>

      <main className="px-4 py-5 lg:ml-[205px] lg:px-5">
        <section className="relative overflow-hidden rounded-[22px] border border-[#e6e0d5] bg-[#fbf6e9] shadow-sm">
          <div className="absolute inset-0 opacity-80" style={{ backgroundImage: "radial-gradient(circle at 18% 20%, rgba(250,179,137,.23), transparent 18%), radial-gradient(circle at 80% 22%, rgba(126,154,115,.22), transparent 20%), radial-gradient(circle at 50% 90%, rgba(218,203,166,.22), transparent 30%)" }} />
          <div className="absolute -left-3 top-3 text-[95px] opacity-35">🌿</div><div className="absolute right-2 top-2 rotate-12 text-[92px] opacity-35">🌿</div><div className="absolute bottom-2 left-20 text-5xl opacity-40">🌸</div><div className="absolute bottom-4 right-24 text-5xl opacity-40">🌼</div>
          <div className="relative flex min-h-[235px] flex-col items-center justify-center px-6 py-10 text-center">
            <p className="font-serif text-5xl italic tracking-tight text-[#29452f] sm:text-6xl lg:text-7xl">Moore Family</p>
            <p className="mt-1 text-2xl font-medium tracking-[0.35em] text-[#ec946e] sm:text-3xl">CHILDCARE</p>
            <p className="mt-5 rounded-full bg-white/60 px-5 py-2 font-serif text-lg italic text-[#657065]">“Small children. Big tomorrows.”</p>
          </div>
        </section>

        <section className="mt-4 flex flex-col gap-4 border-b border-[#dddcd6] pb-3 xl:flex-row xl:items-end xl:justify-between">
          <div><h1 className="font-serif text-3xl font-black text-[#1e2822]">Moore Family Childcare</h1><p className="mt-1 flex items-center gap-2 text-sm text-slate-500"><MapPin className="h-4 w-4 text-[#70836e]" /> Halcom • TCS Location</p></div>
          <div className="flex flex-wrap items-center gap-3"><span className="inline-flex items-center gap-2 rounded-full bg-[#e6f2e2] px-4 py-2 text-sm font-bold text-[#37553e]"><span className="h-2.5 w-2.5 rounded-full bg-[#43b75a]" />{todayHours.closed ? "Closed Today" : "Open Today"}</span>{isSystemOwner && <Link href="/locations" className="inline-flex items-center gap-2 rounded-xl border border-[#d7d6cf] bg-white px-4 py-2 text-sm font-black text-slate-700"><Pencil className="h-4 w-4" /> Edit Location</Link>}</div>
        </section>

        <nav className="flex gap-7 overflow-x-auto border-b border-[#dddcd6] py-3 text-sm font-semibold text-slate-600"><span className="border-b-2 border-[#3f7457] pb-3 font-black text-[#2f5b43]">Overview</span><Link href="/children">Children</Link><Link href="/employees">Staff</Link><Link href="/daily-care">Daily Operations</Link><Link href="/reports">Reports</Link><Link href="/files">Documents</Link></nav>

        <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={<Users className="h-6 w-6" />} label="Children Enrolled" value={mooreChildren.length} helper={`${Math.max(location.capacity - mooreChildren.length, 0)} spaces available`} tone="peach" />
          <Stat icon={<Users className="h-6 w-6" />} label="Staff Members" value={mooreEmployees.length} helper={`${activeStaff.length} marked working today`} tone="sage" />
          <Stat icon={<Users className="h-6 w-6" />} label="Current Ratio" value={ratioText} helper="Live headcount per working staff" tone="peach" />
          <Stat icon={<CalendarDays className="h-6 w-6" />} label="Today’s Attendance" value={`${presentChildren.length} / ${mooreChildren.length}`} helper={`${attendancePercent}% marked present`} tone="sage" />
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_1fr_1.05fr]">
          <Panel title="Location Overview" icon={<MapPin className="h-5 w-5" />}>
            <InfoRow label="Address" value={location.address} />
            <InfoRow label="Phone" value={location.phone} />
            <InfoRow label="Hours" value={todayHours.closed ? "Closed today" : `${formatClock(todayHours.open)} – ${formatClock(todayHours.close)}`} />
            <InfoRow label="License #" value={location.facilityNumber || "Add facility number"} />
            <InfoRow label="Age Groups" value="Infant • Toddler • Preschool • School Age" />
            <InfoRow label="Licensee" value={siteLead?.name || "Add licensee in Employees"} />
            <div className="mt-5 rounded-xl bg-[#fff0e8] p-4 text-center font-serif italic text-[#8a6b5d]">♥ “A safe, loving place to learn, grow, and belong.”</div>
          </Panel>

          <Panel title="Current Staffing" icon={<Users className="h-5 w-5" />} action={<Link href="/employees" className="text-xs font-black text-[#66826c]">View All</Link>}>
            <div className="space-y-3">{mooreEmployees.slice(0, 6).map((employee) => <div key={employee.id} className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#edf0e8] text-xs font-black text-[#526854]">{employee.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-800">{employee.name}</p><p className="truncate text-xs text-slate-500">{employee.role}</p></div><span className={`text-xs font-bold ${employee.status === "Working Today" ? "text-[#58a963]" : "text-slate-400"}`}>● {employee.status === "Working Today" ? "On Site" : employee.status}</span></div>)}</div>
          </Panel>

          <div className="space-y-4">
            <Panel title="Classroom / Child Snapshot" icon={<Users className="h-5 w-5" />}>
              <div className="space-y-1">{ageGroups.map((group, index) => <Link href="/children" key={group} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-slate-50"><span className={`h-3.5 w-3.5 rounded-full ${["bg-[#6ea77d]","bg-[#f2a17e]","bg-[#f5c05c]","bg-[#a3a08c]"][index]}`} /><span className="flex-1 text-sm font-semibold text-slate-700">{group}</span><strong className="text-sm text-slate-700">{groupCounts[group]} children</strong><span>›</span></Link>)}</div>
            </Panel>
            <Panel title="Quick Actions" icon={<CheckCircle2 className="h-5 w-5" />}>
              <div className="grid grid-cols-2 gap-2"><Quick href="/children" label="Add Child" icon={<UserPlus className="h-4 w-4" />} className="bg-[#dceade]" /><Quick href="/child-schedules" label="Log Attendance" icon={<CalendarCheck className="h-4 w-4" />} className="bg-[#fde9df]" /><Quick href="/health-safety" label="Record Incident" icon={<FileText className="h-4 w-4" />} className="bg-[#f5dfd6]" /><Quick href="/families" label="Send Parent Notice" icon={<MessageSquare className="h-4 w-4" />} className="bg-[#e3eadb]" /></div>
            </Panel>
          </div>
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-3">
          <Panel title="Daily Operations" icon={<ClipboardList className="h-5 w-5" />} action={<Link href="/daily-care" className="text-xs font-black text-[#66826c]">Open Daily Care</Link>}>
            <div className="space-y-2">{dailyRoutine.map(([time, label], index) => <div key={label} className="grid grid-cols-[28px_72px_1fr] items-center gap-2 text-sm"><span className={`grid h-5 w-5 place-items-center rounded border ${index < 3 ? "border-[#6e9d77] bg-[#6e9d77] text-white" : "border-slate-300 bg-white text-transparent"}`}><Check className="h-3 w-3" /></span><span className="text-xs font-bold text-slate-500">{time}</span><span className="font-semibold text-slate-700">{label}</span></div>)}</div>
          </Panel>

          <Panel title="Location Notices" icon={<MessageSquare className="h-5 w-5" />} action={<Link href="/families" className="text-xs font-black text-[#66826c]">Open Families</Link>}>
            <Notice title="Attendance snapshot" body={`${presentChildren.length} of ${mooreChildren.length} enrolled children are marked present today.`} tone="bg-[#f2bb55]" />
            <Notice title="Enrollment" body={pendingChildren.length ? `${pendingChildren.length} Halcom enrollment record${pendingChildren.length === 1 ? " is" : "s are"} pending.` : "No Halcom enrollments are currently pending."} tone="bg-[#f5a17c]" />
            <Notice title="Document check" body={documentAttention.length ? `${documentAttention.length} child file${documentAttention.length === 1 ? " needs" : "s need"} document attention.` : "Visible Halcom child files are currently marked complete."} tone="bg-[#9da08b]" />
          </Panel>

          <Panel title="Important Reminders" icon={<Bell className="h-5 w-5" />}>
            <div className="space-y-2">{openTasks.slice(0, 6).map((task) => <label key={task.id} className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-1.5 text-sm hover:bg-slate-50"><input type="checkbox" disabled={!canUpdateTasks} checked={task.completed} onChange={() => toggleTask(task.id)} className="mt-0.5 h-4 w-4 rounded border-slate-300" /><span className="font-semibold text-slate-700">{task.title}</span></label>)}{!openTasks.length && <div className="rounded-xl bg-[#eef5ea] p-4 text-sm font-bold text-[#56705a]">All visible Halcom work-plan reminders are complete. ✓</div>}</div>
            <Link href="/work-plans" className="mt-4 inline-flex text-xs font-black text-[#66826c]">View Work Plans →</Link>
          </Panel>
        </section>
      </main>
    </div>
  );
}

function Stat({ icon, label, value, helper, tone }: { icon: React.ReactNode; label: string; value: string | number; helper: string; tone: "peach" | "sage" }) {
  return <div className="flex items-center gap-4 rounded-2xl border border-[#e3e1da] bg-white p-4 shadow-sm"><span className={`grid h-12 w-12 place-items-center rounded-full ${tone === "peach" ? "bg-[#fde6db] text-[#db845f]" : "bg-[#e3eadf] text-[#5b7c61]"}`}>{icon}</span><div><p className="text-xs font-semibold text-slate-600">{label}</p><p className="mt-0.5 text-2xl font-black text-[#243129]">{value}</p><p className="text-xs text-slate-500">{helper}</p></div></div>;
}

function Panel({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-[#e3e1da] bg-white p-4 shadow-sm"><div className="mb-4 flex items-center gap-2"><span className="text-[#4e7758]">{icon}</span><h2 className="font-serif text-lg font-black text-[#243129]">{title}</h2><div className="ml-auto">{action}</div></div>{children}</section>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[100px_1fr] gap-3 border-b border-slate-100 py-2 text-sm last:border-0"><span className="font-semibold text-slate-500">{label}</span><span className="font-semibold text-slate-700">{value}</span></div>;
}

function Quick({ href, label, icon, className }: { href: string; label: string; icon: React.ReactNode; className: string }) {
  return <Link href={href} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-center text-xs font-black text-[#4b5148] transition hover:-translate-y-0.5 ${className}`}>{icon}{label}</Link>;
}

function Notice({ title, body, tone }: { title: string; body: string; tone: string }) {
  return <div className="flex gap-3 border-b border-slate-100 py-3 last:border-0"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${tone}`} /><div><p className="text-sm font-black text-slate-800">{title}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{body}</p></div></div>;
}
