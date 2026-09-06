"use client";

import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import { canAccessRoute, useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { childAttendsLocation, starterChildSchedules, type ChildScheduleRecord } from "@/lib/child-schedules";
import { initialChildren, type ChildRecord } from "@/lib/children";
import { starterRoutes, starterTasks, type TransportationRoute, type WorkTask } from "@/lib/hub-data";
import { formatClock, locationThemes, normalizeLocation, starterLocationHours, type DayName, type LocationHoursRecord } from "@/lib/location-config";
import {
  ArrowRight,
  BookOpenCheck,
  Bus,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Heart,
  HelpCircle,
  MapPin,
  Megaphone,
  Palette,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  Users,
} from "lucide-react";
import { useEffect, useMemo } from "react";

type LocationRecord = {
  id: string;
  name: string;
  shortName: string;
  type: string;
  capacity: number;
  facilityNumber: string;
  address: string;
  phone: string;
  status: "Active" | "Planning";
};

const divisionTheme = locationThemes.Division;
const divisionLocationFallback: LocationRecord[] = [{
  id: "division",
  name: divisionTheme.fullName,
  shortName: "Division",
  type: divisionTheme.programType,
  capacity: divisionTheme.capacity,
  facilityNumber: "Add facility number",
  address: "Add site address",
  phone: "(760) 382-5742",
  status: "Active",
}];

const featureCards = [
  { title: "Program Overview", description: "Hours, location details, capacity, and the School Age Center at a glance.", href: "#program-overview", icon: Users, tone: "blue", action: "View Overview" },
  { title: "Enrollment", description: "Children, enrollment readiness, attendance, and family information.", href: "/children", icon: ClipboardCheck, tone: "green", action: "Manage Enrollment" },
  { title: "Transportation", description: "Routes, pickups, drop-offs, schools, drivers, and vehicle readiness.", href: "/transportation", icon: Bus, tone: "yellow", action: "View Transportation" },
  { title: "Homework & Help", description: "Keep staff support, homework goals, and school-age responsibilities organized.", href: "/work-plans", icon: BookOpenCheck, tone: "purple", action: "Open Work Plans" },
  { title: "Activities", description: "Plan enrichment, recreation, special projects, and program experiences.", href: "/work-plans", icon: Star, tone: "teal", action: "Plan Activities" },
] as const;

const toneStyles = {
  blue: { card: "bg-[#eef6ff] border-[#cfe5ff]", icon: "bg-[#dcecff] text-[#1769d2]", link: "text-[#1769d2]" },
  green: { card: "bg-[#f2faeb] border-[#d9efc8]", icon: "bg-[#dff2d1] text-[#5e9f2e]", link: "text-[#4e8f25]" },
  yellow: { card: "bg-[#fff9e8] border-[#f6e4a5]", icon: "bg-[#fff0bd] text-[#d99b00]", link: "text-[#c58a00]" },
  purple: { card: "bg-[#f8f1ff] border-[#ead7f8]", icon: "bg-[#ead8f7] text-[#893bbb]", link: "text-[#893bbb]" },
  teal: { card: "bg-[#ecfbfb] border-[#ccefee]", icon: "bg-[#d2f3f1] text-[#12949a]", link: "text-[#11858b]" },
} as const;

export default function SchoolAgeCenterHomePage() {
  const { profile, isSystemOwner } = useAuth();
  const { setLocation } = useHubLocation();
  const [children] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const [childSchedules] = usePersistentState<ChildScheduleRecord[]>("tcs-child-schedules-v2", starterChildSchedules);
  const [routes] = usePersistentState<TransportationRoute[]>("tcs-routes", starterRoutes);
  const [tasks] = usePersistentState<WorkTask[]>("tcs-work-tasks", starterTasks);
  const [hours] = usePersistentState<LocationHoursRecord[]>("tcs-location-hours-v2", starterLocationHours);
  const [locations] = usePersistentState<LocationRecord[]>("tcs-locations-v2", divisionLocationFallback);

  useEffect(() => {
    setLocation("Division");
  }, [setLocation]);

  const assignedToDivision = isSystemOwner || (profile?.locations ?? []).some((location) => location === "All Locations" || normalizeLocation(location) === "Division");

  const activeChildren = useMemo(() => children.filter((child) => child.enrollmentStatus !== "Archived"), [children]);
  const divisionChildren = useMemo(() => activeChildren.filter((child) => childAttendsLocation(child, childSchedules.find((record) => record.childId === child.id), "Division")), [activeChildren, childSchedules]);
  const present = divisionChildren.filter((child) => child.attendanceToday === "Present").length;
  const attendancePercent = divisionChildren.length ? Math.round((present / divisionChildren.length) * 100) : 100;
  const divisionRoutes = useMemo(() => routes.filter((route) => normalizeLocation(route.location) === "Division" && route.status !== "Not Riding"), [routes]);
  const routesNeedingReview = divisionRoutes.filter((route) => route.status === "Needs Review").length;
  const divisionTasks = useMemo(() => tasks.filter((task) => task.location === "All Sites" || normalizeLocation(task.location) === "Division"), [tasks]);
  const openTasks = divisionTasks.filter((task) => !task.completed).length;
  const divisionLocation = locations.find((location) => normalizeLocation(location.shortName) === "Division" || normalizeLocation(location.name) === "Division") ?? divisionLocationFallback[0];
  const availableSpaces = Math.max(divisionLocation.capacity - divisionChildren.length, 0);
  const todayName = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date()) as DayName;
  const divisionHours = hours.find((record) => record.location === "Division") ?? starterLocationHours.find((record) => record.location === "Division")!;
  const todayHours = divisionHours.days[todayName];

  const announcements = [
    {
      title: routesNeedingReview ? `${routesNeedingReview} transportation route${routesNeedingReview === 1 ? " needs" : "s need"} review` : "Transportation routes are caught up",
      body: routesNeedingReview ? "Open Transportation to review route details before the next pickup window." : `${divisionRoutes.length} active School Age Center route${divisionRoutes.length === 1 ? " is" : "s are"} currently on the Hub.`,
      icon: Bus,
      tone: routesNeedingReview ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    {
      title: "Today’s attendance snapshot",
      body: divisionChildren.length ? `${present} of ${divisionChildren.length} School Age Center children are marked present right now.` : "No active School Age Center children are currently visible to this account.",
      icon: CheckCircle2,
      tone: "bg-blue-50 text-blue-700 border-blue-200",
    },
    {
      title: openTasks ? `${openTasks} open program task${openTasks === 1 ? "" : "s"}` : "Program work plan is caught up",
      body: openTasks ? "Use Work Plans to keep homework support, enrichment prep, and site responsibilities moving." : "There are no open School Age Center work-plan items visible to this account.",
      icon: Trophy,
      tone: "bg-purple-50 text-purple-700 border-purple-200",
    },
  ];

  if (!assignedToDivision) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-2xl rounded-3xl border border-red-200 bg-white p-8 text-center shadow-lg">
          <ShieldCheck className="mx-auto h-12 w-12 text-red-600" />
          <h1 className="mt-4 text-2xl font-black text-slate-950">School Age Center access is location-restricted</h1>
          <p className="mt-3 leading-7 text-slate-600">This homepage is for staff assigned to the Division School Age Center and company Owners/Admins.</p>
          <Link href="/" className="mt-6 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Return to Dashboard</Link>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1540px] space-y-5 pb-12">
        <section className="relative overflow-hidden rounded-[2rem] border border-[#d7e7f8] bg-white shadow-[0_20px_55px_rgba(16,67,128,0.14)]">
          <div className="absolute -left-16 -top-16 h-44 w-44 rounded-full bg-[#13a9b7]" />
          <div className="absolute -right-12 -top-10 h-40 w-40 rounded-full bg-[#ffc21b]" />
          <div className="absolute -bottom-14 -left-10 h-28 w-[48%] -rotate-2 rounded-[50%] bg-[#65b832]" />
          <div className="absolute -bottom-16 right-0 h-28 w-[42%] rotate-2 rounded-[50%] bg-[#8b3fb0]" />
          <div className="absolute right-[18%] top-16 h-4 w-4 rounded-full bg-[#ef4f4f]" />
          <div className="absolute right-[33%] top-24 h-3 w-3 rounded-full bg-[#15a9b2]" />
          <div className="absolute left-[42%] top-10 h-3 w-3 rounded-full bg-[#6ab733]" />
          <div className="relative grid min-h-[350px] gap-8 p-7 sm:p-10 lg:grid-cols-[1.18fr_.82fr] lg:items-center lg:p-12">
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 rounded-full bg-[#eef6ff] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#1769d2]"><Sparkles className="h-4 w-4" /> TCS School Age Program</div>
              <div className="mt-5 max-w-3xl">
                <p className="text-lg font-black text-[#102a56] sm:text-xl">The</p>
                <h1 className="-mt-1 text-5xl font-black tracking-[-0.055em] sm:text-7xl">
                  <span className="text-[#1769d2]">School </span><span className="text-[#68ad31]">Age</span>
                </h1>
                <p className="mt-1 text-2xl font-black tracking-[0.24em] text-[#102a56] sm:text-3xl">CENTER</p>
              </div>
              <div className="mt-6 flex flex-wrap gap-x-3 gap-y-2 text-sm font-black sm:text-base">
                <span className="text-[#1769d2]">Safe</span><span className="text-[#13a9b7]">•</span><span className="text-[#e75a4e]">Fun</span><span className="text-[#ffc21b]">•</span><span className="text-[#8b3fb0]">Learning</span><span className="text-[#68ad31]">•</span><span className="text-[#12949a]">Growth</span>
              </div>
              <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-slate-600">One bright home for the Division School Age Center — enrollment, transportation, attendance, homework support, activities, and day-to-day program operations.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                {canAccessRoute(profile, "/daily-care") && <Link href="/daily-care" className="inline-flex items-center gap-2 rounded-xl bg-[#13a9b7] px-5 py-3 text-sm font-black text-white shadow-lg"><ClipboardCheck className="h-4 w-4" /> Program Actions <ArrowRight className="h-4 w-4" /></Link>}
                <a href="#program-overview" className="inline-flex items-center gap-2 rounded-xl border border-[#cfe1f4] bg-white px-5 py-3 text-sm font-black text-[#102a56]"><MapPin className="h-4 w-4" /> Site Overview</a>
              </div>
            </div>

            <div className="relative z-10 flex min-h-64 items-center justify-center">
              <div className="relative h-64 w-72">
                <div className="absolute left-1/2 top-6 h-40 w-48 -translate-x-1/2 rounded-[3rem] bg-[#eef6ff] shadow-xl ring-8 ring-white">
                  <div className="absolute left-1/2 top-5 -translate-x-1/2 text-7xl">🏠</div>
                  <div className="absolute bottom-5 left-0 right-0 flex justify-center gap-3 text-3xl"><span>📚</span><span>🎨</span><span>⚽</span><span>🌱</span></div>
                </div>
                <Heart className="absolute right-1 top-8 h-10 w-10 fill-[#ef4f4f] text-[#ef4f4f]" />
                <Star className="absolute left-2 top-20 h-10 w-10 fill-[#ffc21b] text-[#ffc21b]" />
                <Palette className="absolute bottom-4 right-3 h-12 w-12 text-[#8b3fb0]" />
                <GraduationCap className="absolute bottom-3 left-1 h-12 w-12 text-[#1769d2]" />
                <p className="absolute bottom-0 left-1/2 w-full -translate-x-1/2 text-center text-lg font-black text-[#1769d2]">Where Kids Belong! 💚</p>
              </div>
            </div>
          </div>
        </section>

        <section id="program-overview" className="flex flex-col gap-4 rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#eff8e8] text-[#68ad31]"><Users className="h-7 w-7" /></span>
            <div><h2 className="text-2xl font-black text-[#102a56]">School Age Center</h2><p className="mt-1 font-semibold text-slate-500">Safe. Fun. Learning. Growth. Every Day.</p></div>
          </div>
          <div className="rounded-2xl bg-[#eef6ff] px-5 py-3 text-sm font-bold text-[#102a56]"><strong>{todayName}:</strong> {todayHours.closed ? "Closed" : `${formatClock(todayHours.open)}–${formatClock(todayHours.close)}`} • {divisionLocation.status}</div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {featureCards.map((card) => {
            const Icon = card.icon;
            const styles = toneStyles[card.tone];
            const internalAnchor = card.href.startsWith("#");
            const allowed = internalAnchor || canAccessRoute(profile, card.href);
            const content = <><span className={`grid h-12 w-12 place-items-center rounded-2xl ${styles.icon}`}><Icon className="h-6 w-6" /></span><h3 className="mt-4 text-base font-black text-[#102a56]">{card.title}</h3><p className="mt-2 min-h-16 text-sm font-semibold leading-6 text-slate-600">{card.description}</p><span className={`mt-4 inline-flex items-center gap-1 text-xs font-black ${styles.link}`}>{allowed ? card.action : "Access not enabled"} {allowed && <ArrowRight className="h-3.5 w-3.5" />}</span></>;
            return allowed ? <Link key={card.title} href={card.href} className={`rounded-3xl border p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg ${styles.card}`}>{content}</Link> : <article key={card.title} className={`rounded-3xl border p-5 opacity-70 ${styles.card}`}>{content}</article>;
          })}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.15fr_1fr_.78fr]">
          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><Megaphone className="h-6 w-6 text-[#1769d2]" /><h3 className="text-xl font-black text-[#102a56]">Announcements</h3></div><span className="text-xs font-black text-slate-400">LIVE STATUS</span></div>
            <div className="mt-4 space-y-3">
              {announcements.map((item) => { const Icon = item.icon; return <div key={item.title} className={`rounded-2xl border p-4 ${item.tone}`}><div className="flex gap-3"><span className="mt-0.5"><Icon className="h-5 w-5" /></span><div><p className="font-black">{item.title}</p><p className="mt-1 text-sm font-semibold leading-6 opacity-80">{item.body}</p></div></div></div>; })}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><CalendarDays className="h-6 w-6 text-[#1769d2]" /><h3 className="text-xl font-black text-[#102a56]">Upcoming Events</h3></div></div>
            <div className="mt-5 rounded-2xl border border-dashed border-[#cfe1f4] bg-[#f7fbff] p-7 text-center">
              <CalendarDays className="mx-auto h-10 w-10 text-[#13a9b7]" />
              <p className="mt-3 font-black text-[#102a56]">Program calendar ready</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">No School Age Center events have been published in the Hub yet. We’re keeping this empty instead of showing sample dates as live information.</p>
              {canAccessRoute(profile, "/work-plans") && <Link href="/work-plans" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#1769d2] px-4 py-2.5 text-sm font-black text-white">Open Program Planning <ArrowRight className="h-4 w-4" /></Link>}
            </div>
          </article>

          <div className="space-y-5">
            <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-black text-[#102a56]">Quick Stats</h3>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  { label: "Enrolled", value: divisionChildren.length, icon: Users, bg: "bg-[#eef6ff]", text: "text-[#1769d2]" },
                  { label: "Attendance", value: `${attendancePercent}%`, icon: CheckCircle2, bg: "bg-[#f2faeb]", text: "text-[#5e9f2e]" },
                  { label: "Active Routes", value: divisionRoutes.length, icon: Bus, bg: "bg-[#fff9e8]", text: "text-[#d99b00]" },
                  { label: "Open Tasks", value: openTasks, icon: Trophy, bg: "bg-[#f8f1ff]", text: "text-[#893bbb]" },
                ].map(({ label, value, icon: Icon, bg, text }) => <div key={label} className={`rounded-2xl p-3 text-center ${bg}`}><Icon className={`mx-auto h-6 w-6 ${text}`} /><p className="mt-2 text-2xl font-black text-[#102a56]">{value}</p><p className="text-[11px] font-black text-slate-500">{label}</p></div>)}
              </div>
              <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-center text-xs font-bold text-slate-500">{availableSpaces} capacity spaces currently unfilled</div>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-red-50 text-red-500"><HelpCircle className="h-6 w-6" /></span><div><h3 className="font-black text-[#102a56]">Need Help?</h3><p className="mt-1 text-sm font-semibold leading-6 text-slate-500">Use the Employee Lounge for team support, quick links, and connection.</p></div></div>
              <Link href="/employee-lounge" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#eef6ff] px-4 py-3 text-sm font-black text-[#1769d2]">Open Employee Lounge <ArrowRight className="h-4 w-4" /></Link>
            </article>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-3xl bg-[#102a56] px-6 py-6 text-white shadow-lg sm:px-8">
          <div className="absolute -bottom-10 left-0 h-20 w-[45%] rounded-[50%] bg-[#13a9b7]" />
          <div className="absolute -bottom-12 right-0 h-20 w-[42%] rounded-[50%] bg-[#68ad31]" />
          <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xl font-black">Play. Learn. Belong. 💚</p><p className="mt-1 text-sm font-semibold text-white/75">Stronger kids. Brighter communities.</p></div><div className="flex items-center gap-2 text-sm font-black text-[#ffc21b]"><Sparkles className="h-5 w-5" /> School Age Center • Division</div></div>
        </section>
      </div>
    </MainLayout>
  );
}
