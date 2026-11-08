"use client";

import {groupHubTools,toolSectionOpen} from "@/lib/hub-tool-groups";
import { canAccessRoute, useAuth } from "@/components/providers/AuthProvider";
import { locationOptionLabel } from "@/lib/location-config";
import { useHubLocation } from "@/components/providers/LocationProvider";
import {
  BadgeDollarSign,
  Bell,
  BookOpen,
  Bot,
  BriefcaseBusiness,
  Bus,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  ClipboardCheck,
  Coffee,
  FileText,
  FolderOpen,
  HeartPulse,
  Home,
  Lock,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Store,
  Trophy,
  UserRound,
  Users,
  Utensils,
  X,
} from "lucide-react";
import Link from "next/link";
import { useHubPathname } from "@/hooks/useHubPathname";
import { useEffect, useMemo, useRef, useState } from "react";

type ToolItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const toolGroups: Array<{ title: string; items: ToolItem[] }> = [
  {
    title: "My Work",
    items: [
      { href: "/communications", label: "Communications", icon: Bell },
      { href: "/family-communications", label: "Family Messages", icon: Users },
      { href: "/employee-lounge", label: "Employee Lounge", icon: Coffee },
      { href: "/time-off", label: "Time Off", icon: CalendarOff },
      { href: "/employee-bulletin", label: "Bulletin Board", icon: Bell },
      { href: "/training-center", label: "Training Center", icon: BookOpen },
      { href: "/team-store", label: "Team Store", icon: Store },
      { href: "/organization", label: "TCS Lanes", icon: Users },
    ],
  },
  {
    title: "Children & Care",
    items: [
      { href: "/children", label: "Children", icon: UserRound },
      { href: "/attendance", label: "Check-In / Out", icon: ClipboardCheck },
      { href: "/daily-care", label: "Daily Care", icon: ClipboardCheck },
      { href: "/meals", label: "Meals & Menus", icon: Utensils },
      { href: "/kidkare", label: "KidKare", icon: ShieldCheck },
      { href: "/health-safety", label: "Health & Safety", icon: HeartPulse },
      { href: "/emergency-cards", label: "Emergency Cards", icon: HeartPulse },
      { href: "/child-schedules", label: "Child Schedules", icon: CalendarClock },
      { href: "/school-age-support", label: "School Age Support", icon: BookOpen },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/transportation-v2", label: "Transportation", icon: Bus },
      { href: "/scheduling", label: "Staffing", icon: CalendarDays },
      { href: "/ratios", label: "Ratios", icon: ShieldCheck },
      { href: "/work-plans", label: "Work Plans", icon: ClipboardCheck },
      { href: "/shift-reports", label: "Opening / Closing", icon: FileText },
      { href: "/files", label: "Files", icon: FolderOpen },
      { href: "/digital-forms", label: "Digital Forms", icon: FileText },
      { href: "/compliance", label: "Compliance", icon: ShieldCheck },
      { href: "/ai-director", label: "TCS AI", icon: Bot },
    ],
  },
  {
    title: "Leadership & Admin",
    items: [
      { href: "/employees", label: "Employees", icon: BriefcaseBusiness },
      { href: "/staff-onboarding", label: "New-Hire Onboarding", icon: ClipboardCheck },
      { href: "/staff-performance", label: "Staff Performance", icon: Trophy },
      { href: "/team-access", label: "Team Access", icon: Lock },
      { href: "/timesheets", label: "Timesheets", icon: FileText },
      { href: "/payroll-ops", label: "Payroll Hours", icon: CalendarClock },
      { href: "/billing-command-center", label: "Billing & Subsidy", icon: BadgeDollarSign },
      { href: "/transportation-fees", label: "Transportation Fees", icon: Bus },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export default function MobileQuickActions() {
  const navigationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const navigation = navigationRef.current;
    if (!navigation) return;
    // Measure the safe-area padding and wrapped labels as well as the icons.
    const measure = () => document.documentElement.style.setProperty(
      "--hub-mobile-nav-height", `${navigation.getBoundingClientRect().height}px`,
    );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(navigation);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--hub-mobile-nav-height");
    };
  }, []);

  const { profile } = useAuth();
  const { location, theme } = useHubLocation();
  const pathname = useHubPathname();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const groups=useMemo(()=>groupHubTools(toolGroups.flatMap(group=>group.items).filter(item=>canAccessRoute(profile,item.href)),search),[profile,search]);

  const bottomItems = [
    { href: "/", label: "Home", icon: Home },
    { href: "/my-schedule", label: "Schedule", icon: CalendarDays },
    { href: "/time-clock", label: "Clock", icon: CalendarClock, featured: true },
    { href: "/notifications", label: "Alerts", icon: Bell },
  ].filter((item) => canAccessRoute(profile, item.href));

  function active(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[90] bg-slate-950/45 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)}>
          <section
            className="absolute inset-x-0 bottom-0 flex max-h-[86dvh] flex-col overflow-hidden rounded-t-[32px] border-t border-white/70 bg-[#f7f8f5] shadow-[0_-20px_60px_rgba(15,23,42,.28)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-slate-300" />
            <div className="shrink-0 border-b border-slate-200/80 bg-[#f7f8f5]/95 px-5 pb-4 pt-3 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-base font-black uppercase tracking-[0.18em]" style={{ color: theme.primary }}>The Hub • {locationOptionLabel(location)}</p>
                  <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">All your tools</h2>
                  <p className="mt-1 text-base text-slate-700">Search or choose a section.</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-slate-700 shadow-sm" aria-label="Close tools"><X className="h-5 w-5" /></button>
              </div>
              <label className="relative mt-4 block">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Find a staff tool"
                  placeholder="Find a tool…"
                  className="w-full rounded-2xl border border-slate-200 bg-white min-h-12 py-3 pl-10 pr-4 text-base font-semibold text-slate-900 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                />
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
              {groups.map((group) => (
                <details key={group.title} open={toolSectionOpen(group,pathname,search)} className="mb-3 rounded-2xl border border-slate-200 bg-white p-3">
                  <summary className="min-h-11 cursor-pointer py-3 text-lg font-black text-slate-950">{group.title}</summary>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const selected = active(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => { setOpen(false); setSearch(""); }}
                          className={`flex min-h-[92px] flex-col justify-between rounded-[20px] border p-3 shadow-sm transition active:scale-[.97] ${selected ? "border-transparent text-white" : "border-slate-200 bg-white text-slate-800"}`}
                          style={selected ? { background: `linear-gradient(145deg, ${theme.primary}, ${theme.primaryDark})` } : undefined}
                        >
                          <span className={`grid h-9 w-9 place-items-center rounded-xl ${selected ? "bg-white/15" : "bg-slate-100"}`}><Icon className="h-5 w-5" /></span>
                          <span className="text-base font-bold leading-5">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </details>
              ))}
              {!groups.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm font-bold text-slate-500">No matching tools.</div>}
            </div>
          </section>
        </div>
      )}

      <nav
        ref={navigationRef}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 pb-[max(.45rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-10px_35px_rgba(15,23,42,.13)] backdrop-blur-xl lg:hidden"
        aria-label="Primary app navigation"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5 px-2">
          {bottomItems.map((item) => {
            const Icon = item.icon;
            const selected = active(item.href);
            if (item.featured) {
              return (
                <Link key={item.href} href={item.href} className="relative flex min-h-[66px] flex-col items-center justify-end gap-1 pb-1 text-base font-black text-slate-700">
                  <span className="-mt-5 grid h-14 w-14 place-items-center rounded-[20px] border-4 border-white text-white shadow-lg" style={{ background: `linear-gradient(145deg, ${theme.primary}, ${theme.primaryDark})` }}><Icon className="h-6 w-6" /></span>
                  <span>{item.label}</span>
                </Link>
              );
            }
            return (
              <Link key={item.href} href={item.href} className={`flex min-h-[66px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-base font-black transition ${selected ? "text-slate-950" : "text-slate-600"}`}>
                <span className={`grid h-8 w-8 place-items-center rounded-xl ${selected ? "bg-slate-100" : ""}`}><Icon className="h-4.5 w-4.5" /></span>
                {item.label}
              </Link>
            );
          })}
          <button type="button" onClick={() => setOpen(true)} className={`flex min-h-[66px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-base font-black ${open ? "text-slate-950" : "text-slate-600"}`}>
            <span className={`grid h-8 w-8 place-items-center rounded-xl ${open ? "bg-slate-100" : ""}`}><Menu className="h-4.5 w-4.5" /></span>
            Tools
          </button>
        </div>
      </nav>
    </>
  );
}
