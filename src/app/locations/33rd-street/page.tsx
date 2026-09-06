"use client";

import Link from "next/link";
import {
  Bell,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileText,
  Heart,
  HelpCircle,
  Home,
  LogOut,
  MapPin,
  MessageSquare,
  Search,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { canAccessRoute, useAuth } from "@/components/providers/AuthProvider";
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

const locationFallback: LocationRecord[] = (Object.keys(locationThemes) as LocationKey[])
  .filter((item): item is Exclude<LocationKey, "All Locations"> => item !== "All Locations")
  .map((key) => ({
    id: key.toLowerCase().replaceAll(" ", "-"),
    name: locationThemes[key].fullName,
    shortName: key,
    type: locationThemes[key].programType,
    capacity: locationThemes[key].capacity,
    facilityNumber: "Add facility number",
    address: key === "33rd Street" ? "Add Cornejo site address" : "Add site address",
    phone: "(760) 382-5742",
    status: "Active",
  }));

const routine = [
  ["7:00 AM", "Morning Check-in"],
  ["7:30 AM", "Breakfast"],
  ["9:30 AM", "AM Snack / Learning Activities"],
  ["11:30 AM", "Lunch"],
  ["12:00 PM", "Rest / Quiet Time"],
  ["2:30 PM", "PM Snack"],
  ["4:30 PM", "Dinner"],
  ["Closing", "End of Day Check-out"],
] as const;

function currentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function timeMinutes(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/);
  if (!match) return 24 * 60;
  let hour = Number(match[1]) % 12;
  if (match[3] === "PM") hour += 12;
  return hour * 60 + Number(match[2]);
}

export default function CornejoFamilyChildcareHomePage() {
  const { profile, user, isSystemOwner, signOut } = useAuth();
  const { setLocation } = useHubLocation();
  const [children] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const [childSchedules] = usePersistentState<ChildScheduleRecord[]>("tcs-child-schedules-v2", starterChildSchedules);
  const [employees] = usePersistentState<EmployeeRecord[]>("tcs-employees", starterEmployees);
  const [tasks] = usePersistentState<WorkTask[]>("tcs-work-tasks", starterTasks);
  const [hours] = usePersistentState<LocationHoursRecord[]>("tcs-location-hours-v2", starterLocationHours);
  const [locations] = usePersistentState<LocationRecord[]>("tcs-locations-v2", locationFallback);
  const [search, setSearch] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => setLocation("33rd Street"), [setLocation]);

  const assigned = isSystemOwner || (profile?.locations ?? []).some((value) => value === "All Locations" || normalizeLocation(value) === "33rd Street");
  const activeChildren = useMemo(() => children.filter((child) => child.enrollmentStatus !== "Archived"), [children]);
  const cornejoChildren = useMemo(
    () => activeChildren.filter((child) => childAttendsLocation(child, childSchedules.find((record) => record.childId === child.id), "33rd Street")),
    [activeChildren, childSchedules],
  );
  const presentChildren = cornejoChildren.filter((child) => child.attendanceToday === "Present");
  const absentChildren = cornejoChildren.filter((child) => child.attendanceToday === "Absent");
  const pendingChildren = cornejoChildren.filter((child) => child.enrollmentStatus === "Pending");
  const missingDocs = cornejoChildren.filter((child) => child.licensingStatus === "Missing Documents");

  const cornejoEmployees = useMemo(
    () => employees.filter((employee) => normalizeLocation(employee.location) === "33rd Street" || employee.location.toLowerCase().includes("cornejo") || employee.location.toLowerCase().includes("all sites")),
    [employees],
  );
  const onSiteStaff = cornejoEmployees.filter((employee) => employee.status === "Working Today");
  const substituteCount = cornejoEmployees.filter((employee) => employee.status === "Off Today" || employee.status === "Training").length;

  const cornejoTasks = useMemo(
    () => tasks.filter((task) => task.location === "All Sites" || normalizeLocation(task.location) === "33rd Street"),
    [tasks],
  );
  const openTasks = cornejoTasks.filter((task) => !task.completed);

  const location = locations.find((item) => normalizeLocation(item.shortName) === "33rd Street" || normalizeLocation(item.name) === "33rd Street")
    ?? locationFallback.find((item) => item.shortName === "33rd Street")!;
  const todayName = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date()) as DayName;
  const locationHours = hours.find((record) => record.location === "33rd Street") ?? starterLocationHours.find((record) => record.location === "33rd Street")!;
  const todayHours = locationHours.days[todayName];
  const attendancePercent = cornejoChildren.length ? Math.round((presentChildren.length / cornejoChildren.length) * 100) : 0;
  const enrollmentPercent = location.capacity ? Math.min(100, Math.round((cornejoChildren.length / location.capacity) * 100)) : 0;

  const ageGroups: AgeGroup[] = ["Infant", "Toddler", "Preschool", "School Age"];
  const groupCounts = Object.fromEntries(ageGroups.map((group) => [group, cornejoChildren.filter((child) => child.ageGroup === group).length])) as Record<AgeGroup, number>;

  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return [
      ...cornejoChildren.filter((child) => `${child.firstName} ${child.lastName}`.toLowerCase().includes(query)).map((child) => ({ label: `${child.firstName} ${child.lastName}`, meta: `${child.ageGroup} • Child`, href: "/children" })),
      ...cornejoEmployees.filter((employee) => `${employee.name} ${employee.role}`.toLowerCase().includes(query)).map((employee) => ({ label: employee.name, meta: `${employee.role} • Staff`, href: "/employees" })),
    ].slice(0, 8);
  }, [cornejoChildren, cornejoEmployees, search]);

  const staffName = profile?.full_name || user?.email || "TCS Staff";
  const initials = staffName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "TCS";

  if (!assigned) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f4eb] p-6">
        <section className="max-w-xl rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-xl">
          <ShieldCheck className="mx-auto h-12 w-12 text-[#b98a34]" />
          <h1 className="mt-4 text-2xl font-black text-slate-950">Cornejo Family Childcare access is location-restricted</h1>
          <p className="mt-3 leading-7 text-slate-600">This homepage is for staff assigned to 33rd Street and company Owners/Admins.</p>
          <Link href="/" className="mt-6 inline-flex rounded-xl bg-[#0b315b] px-5 py-3 text-sm font-black text-white">Return to Dashboard</Link>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#fbfaf6] text-[#102d52]">
      <header className="sticky top-0 z-40 flex h-[62px] items-center border-b border-[#e8e2d6] bg-white/95 px-4 shadow-sm backdrop-blur lg:pl-[225px]">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search anything..." className="h-10 w-full rounded-xl border border-[#ddd8ce] bg-[#fbfaf7] pl-10 pr-4 text-sm outline-none focus:border-[#c79a42]" />
          {search.trim() && <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-2xl border border-[#ddd8ce] bg-white shadow-2xl">{searchResults.map((result) => <Link key={`${result.meta}-${result.label}`} href={result.href} className="block border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-[#fbf8f0]"><p className="text-sm font-black text-[#0b315b]">{result.label}</p><p className="text-xs text-slate-500">{result.meta}</p></Link>)}{!searchResults.length && <p className="p-4 text-sm text-slate-500">No Cornejo children or staff match that search.</p>}</div>}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={() => setShowNotifications((value) => !value)} className="relative grid h-10 w-10 place-items-center rounded-full text-[#0b315b] hover:bg-slate-50" aria-label="Notifications"><Bell className="h-5 w-5" />{openTasks.length > 0 && <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-[#e06f5c] ring-2 ring-white" />}</button>
          <button onClick={() => setShowUserMenu((value) => !value)} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-50"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#0b315b] text-xs font-black text-white">{initials}</span><span className="hidden text-left sm:block"><strong className="block text-sm text-[#0b315b]">{staffName}</strong><span className="block text-xs text-slate-500">{profile?.role}</span></span><ChevronDown className="h-4 w-4 text-slate-500" /></button>
          {showUserMenu && <div className="absolute right-4 top-14 w-64 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"><p className="font-black text-[#0b315b]">{staffName}</p><p className="mt-1 text-xs text-slate-500">{profile?.email || user?.email}</p><button onClick={() => void signOut()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0b315b] px-4 py-2.5 text-sm font-black text-white"><LogOut className="h-4 w-4" /> Sign Out</button></div>}
          {showNotifications && <div className="absolute right-24 top-14 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"><p className="font-black text-[#0b315b]">Cornejo reminders</p><p className="mt-1 text-xs text-slate-500">{openTasks.length} open 33rd Street / company work-plan item{openTasks.length === 1 ? "" : "s"}.</p><Link href="/work-plans" className="mt-3 inline-flex text-sm font-black text-[#b98a34]">Open Work Plans →</Link></div>}
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 z-50 hidden w-[210px] flex-col bg-[#0b315b] text-white lg:flex">
        <div className="h-[62px] border-b border-white/10 px-5 py-3"><p className="font-serif text-lg font-black">♥ TCS Operations Hub</p><p className="text-[9px] font-bold tracking-[.2em] text-[#e8c77b]">PEOPLE • PLACES • BRIGHTER TOMORROWS</p></div>
        <nav className="space-y-1 p-2.5 text-sm">
          <Link href="/" className="flex items-center gap-3 rounded-xl px-3 py-2.5 font-semibold hover:bg-white/10"><Home className="h-5 w-5" />Dashboard</Link>
          <p className="px-3 pt-4 text-[10px] font-black tracking-[.16em] text-white/60">LOCATIONS</p>
          <div className="flex items-center gap-3 rounded-xl border-l-4 border-[#d5a84c] bg-white/15 px-3 py-2.5 font-black"><MapPin className="h-5 w-5 text-[#e6bd67]" />Cornejo Family Childcare</div>
          {isSystemOwner && <Link href="/locations" className="flex items-center gap-3 rounded-xl px-3 py-2.5 font-semibold hover:bg-white/10"><Home className="h-5 w-5" />All Locations</Link>}
          <p className="px-3 pt-4 text-[10px] font-black tracking-[.16em] text-white/60">OPERATIONS</p>
          {canAccessRoute(profile, "/daily-care") && <Link href="/daily-care" className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/10"><CalendarCheck className="h-5 w-5" />Daily Operations</Link>}
          {canAccessRoute(profile, "/children") && <Link href="/children" className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/10"><Users className="h-5 w-5" />Children & Families</Link>}
          {canAccessRoute(profile, "/scheduling") && <Link href="/scheduling" className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/10"><Users className="h-5 w-5" />Staff & Scheduling</Link>}
          {canAccessRoute(profile, "/health-safety") && <Link href="/health-safety" className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/10"><ShieldCheck className="h-5 w-5" />Health & Safety</Link>}
          {canAccessRoute(profile, "/reports") && <Link href="/reports" className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/10"><ClipboardList className="h-5 w-5" />Reports</Link>}
          {canAccessRoute(profile, "/files") && <Link href="/files" className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/10"><FileText className="h-5 w-5" />Documents</Link>}
          <p className="px-3 pt-4 text-[10px] font-black tracking-[.16em] text-white/60">COMMUNICATION</p>
          {canAccessRoute(profile, "/families") && <Link href="/families" className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/10"><MessageSquare className="h-5 w-5" />Parent Notices</Link>}
          {isSystemOwner && <><p className="px-3 pt-4 text-[10px] font-black tracking-[.16em] text-white/60">ADMIN</p><Link href="/settings" className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/10"><Settings className="h-5 w-5" />Settings</Link></>}
          <Link href="/employee-lounge" className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/10"><HelpCircle className="h-5 w-5" />Help & Support</Link>
        </nav>
        <div className="mt-auto px-5 pb-8 text-center"><p className="font-serif text-xl italic leading-7 text-white/80">Stronger<br />Families<br />Brighter<br />Tomorrows</p><p className="mt-2 text-2xl text-[#e1b85e]">♥</p></div>
      </aside>

      <main className="px-4 py-5 lg:ml-[210px] lg:px-5">
        <section className="relative overflow-hidden rounded-[1.8rem] border border-[#e8dfcc] bg-[#fffdf7] shadow-sm">
          <div className="absolute inset-0 opacity-80" style={{ backgroundImage: "radial-gradient(circle at 14% 18%, rgba(199,154,66,.15) 0 2px, transparent 2.5px), radial-gradient(circle at 82% 30%, rgba(88,112,76,.12) 0 2px, transparent 2.5px)" }} />
          <div className="absolute -left-16 -top-20 h-56 w-56 rounded-full border-[24px] border-[#0b315b]/10" />
          <div className="absolute -right-8 -top-20 text-[150px] opacity-20">🌿</div>
          <div className="relative flex min-h-[245px] items-center justify-center px-7 py-8 text-center sm:px-12">
            <div>
              <div className="mx-auto flex w-fit items-center gap-3"><span className="text-5xl">🇸🇻</span><span className="text-5xl">👩‍👧</span><span className="text-5xl">📖</span></div>
              <h1 className="mt-3 font-serif text-5xl font-black tracking-[.08em] text-[#0b315b] sm:text-7xl">CORNEJO</h1>
              <p className="mt-1 text-lg font-black tracking-[.32em] text-[#b78a35] sm:text-2xl">FAMILY CHILDCARE</p>
              <p className="mt-5 text-xs font-black tracking-[.12em] text-[#496448]">♥ TEACHING WITH LOVE. BUILDING BRIGHTER TOMORROWS. ♥</p>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-3 border-b border-[#e5e0d5] px-2 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-serif text-2xl font-black text-[#0b315b]">Cornejo Family Childcare</h2><p className="mt-1 flex items-center gap-2 text-sm text-slate-500"><MapPin className="h-4 w-4 text-[#b98a34]" />{location.address} <span>•</span> <em>Teaching with love. Building brighter tomorrows.</em></p></div>
          <div className="flex flex-wrap gap-2"><span className="rounded-full bg-[#edf7ea] px-4 py-2 text-xs font-black text-[#3b7538]">● Location {location.status}</span>{isSystemOwner && <Link href="/locations" className="rounded-xl border border-[#ddd4c2] bg-white px-4 py-2 text-xs font-black text-[#0b315b]">Location Actions</Link>}</div>
        </section>

        <section className="grid gap-4 py-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat title="Licensed Capacity" icon="⌂" value={location.capacity} helper={`${cornejoChildren.length} currently enrolled`} progress={enrollmentPercent} />
          <Stat title="Today’s Attendance" icon="▣" value={`${presentChildren.length} / ${cornejoChildren.length}`} helper={`${absentChildren.length} absent today`} progress={attendancePercent} />
          <Stat title="Team Members" icon="♥" value={cornejoEmployees.length} helper={`${substituteCount} off / training`} />
          <Stat title="Location Status" icon="★" value={location.status} helper={todayHours.closed ? "Closed today" : `${formatClock(todayHours.open)}–${formatClock(todayHours.close)}`} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1fr_1fr_1.05fr]">
          <Panel title="Staffing" action={<Link href="/employees" className="text-xs font-black underline">View All</Link>}>
            <div className="space-y-2">{cornejoEmployees.slice(0, 5).map((employee) => <div key={employee.id} className="flex items-center gap-3 rounded-xl px-1 py-2"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#edf2f8] text-xs font-black text-[#0b315b]">{employee.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{employee.name}</p><p className="truncate text-xs text-slate-500">{employee.role}</p></div><span className={`rounded-full px-3 py-1 text-[11px] font-black ${employee.status === "Working Today" ? "bg-[#eaf6e7] text-[#397238]" : "bg-slate-100 text-slate-500"}`}>{employee.status === "Working Today" ? "On Site" : employee.status}</span></div>)}{!cornejoEmployees.length && <p className="text-sm text-slate-500">No staff records are currently assigned to 33rd Street.</p>}</div>
          </Panel>

          <Panel title="Child Roster Snapshot" action={<Link href="/children" className="text-xs font-black underline">View Roster</Link>}>
            <div className="space-y-2">{ageGroups.map((group, index) => <div key={group} className="flex items-center gap-3 rounded-xl px-1 py-2"><span className={`h-3 w-3 rounded-full ${["bg-rose-400","bg-violet-400","bg-amber-400","bg-emerald-500"][index]}`} /><span className="flex-1 text-sm font-semibold">{group}</span><strong>{groupCounts[group]}</strong></div>)}</div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-[#fbf4e5] px-4 py-3"><span className="text-3xl font-black text-[#b98a34]">{cornejoChildren.length}</span><span className="text-xs font-semibold italic text-[#806432]">Curious minds.<br />Kind hearts.<br />Bright tomorrows. ♥</span></div>
          </Panel>

          <Panel title="Daily Operations" action={<Link href="/daily-care" className="text-xs font-black underline">View All</Link>}>
            <div className="space-y-1">{routine.slice(0, 6).map(([time, label]) => { const done = time !== "Closing" && currentMinutes() >= timeMinutes(time); return <div key={label} className="flex items-center gap-3 border-b border-slate-100 py-2 last:border-0"><span className={`grid h-6 w-6 place-items-center rounded-full ${done ? "bg-[#5e8a5e] text-white" : "border border-[#7890a4] text-[#7890a4]"}`}>{done ? <CheckCircle2 className="h-4 w-4" /> : ""}</span><span className="flex-1 text-sm font-semibold">{label}</span><span className="text-xs text-slate-400">{time}</span></div>; })}</div>
          </Panel>
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
          <Panel title="Parent Notices" action={<Link href="/families" className="text-xs font-black underline">View All</Link>}>
            <Notice title="Attendance check" body={`${presentChildren.length} child${presentChildren.length === 1 ? " is" : "ren are"} marked present; ${absentChildren.length} marked absent today.`} />
            <Notice title="Enrollment follow-up" body={pendingChildren.length ? `${pendingChildren.length} Cornejo enrollment${pendingChildren.length === 1 ? " is" : "s are"} still pending.` : "No Cornejo enrollments are currently pending."} />
            <Notice title="Documents" body={missingDocs.length ? `${missingDocs.length} child file${missingDocs.length === 1 ? " needs" : "s need"} document attention.` : "No visible Cornejo child files are flagged for missing documents."} />
          </Panel>

          <Panel title="Quick Actions">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2">
              {canAccessRoute(profile, "/children") && <Quick href="/children" icon={<UserPlus className="h-5 w-5" />} label="Add / View Child" />}
              {canAccessRoute(profile, "/child-schedules") && <Quick href="/child-schedules" icon={<CalendarCheck className="h-5 w-5" />} label="Log Attendance" />}
              {canAccessRoute(profile, "/families") && <Quick href="/families" icon={<MessageSquare className="h-5 w-5" />} label="Send Notice" />}
              {canAccessRoute(profile, "/scheduling") && <Quick href="/scheduling" icon={<CalendarDays className="h-5 w-5" />} label="Staff Schedule" />}
              {canAccessRoute(profile, "/files") && <Quick href="/files" icon={<FileText className="h-5 w-5" />} label="Upload Document" />}
              {canAccessRoute(profile, "/reports") && <Quick href="/reports" icon={<ClipboardList className="h-5 w-5" />} label="View Reports" />}
            </div>
          </Panel>
        </section>

        <footer className="mt-5 flex flex-col gap-2 border-t border-[#e5e0d5] px-2 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between"><span className="font-black text-[#0b315b]">♥ TCS Operations Hub • Cornejo Family Childcare</span><span>A stronger tomorrow, together. ♥</span></footer>
      </main>
    </div>
  );
}

function Stat({ title, icon, value, helper, progress }: { title: string; icon: string; value: string | number; helper: string; progress?: number }) {
  return <div className="rounded-2xl border border-[#e7e2d8] bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-[#fbf2df] text-xl text-[#b98a34]">{icon}</span><div><p className="text-sm font-black text-[#0b315b]">{title}</p><p className="mt-1 text-3xl font-black text-[#0b315b]">{value}</p><p className="text-xs text-slate-500">{helper}</p></div></div>{typeof progress === "number" && <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#78966e]" style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }} /></div>}</div>;
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-[#e7e2d8] bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><h3 className="font-serif text-lg font-black text-[#0b315b]">{title}</h3>{action}</div>{children}</section>;
}

function Notice({ title, body }: { title: string; body: string }) {
  return <div className="flex gap-3 border-b border-slate-100 py-3 last:border-0"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#d2a344]" /><div><p className="text-sm font-black text-[#0b315b]">{title}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{body}</p></div></div>;
}

function Quick({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return <Link href={href} className="flex min-h-16 items-center justify-center gap-2 rounded-xl border border-[#e7e2d8] bg-[#fbfaf6] px-3 py-3 text-center text-xs font-black text-[#0b315b] hover:bg-[#fbf3e2]">{icon}{label}</Link>;
}
