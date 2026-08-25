"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  BriefcaseBusiness,
  Building2,
  Bus,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Cloud,
  CloudAlert,
  CloudCheck,
  FileText,
  HeartPulse,
  Lock,
  Utensils,
  FolderOpen,
  Home,
  Info,
  LoaderCircle,
  LogOut,
  Megaphone,
  Menu,
  Printer,
  Settings,
  ScrollText,
  ShieldCheck,
  Users,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { type LocationKey } from "@/lib/location-config";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { canAccessRoute, staffInitials, useAuth } from "@/components/providers/AuthProvider";
import { HUB_SYNC_EVENT, type HubSyncDetail } from "@/lib/sync-events";
import MobileQuickActions from "@/components/layout/MobileQuickActions";

const navItems = [
  { label: "Dashboard", href: "/", icon: Home },
  { label: "Families", href: "/families", icon: Users },
  { label: "Children", href: "/children", icon: UserRound },
  { label: "Child Schedules", href: "/child-schedules", icon: CalendarClock },
  { label: "Daily Care", href: "/daily-care", icon: Utensils },
  { label: "Meals & Menus", href: "/meals", icon: Utensils },
  { label: "KidKare", href: "/kidkare", icon: ShieldCheck },
  { label: "Timesheets", href: "/timesheets", icon: FileText },
  { label: "Opening / Closing", href: "/shift-reports", icon: FileText },
  { label: "Health & Safety", href: "/health-safety", icon: HeartPulse },
  { label: "Employees", href: "/employees", icon: BriefcaseBusiness },
  { label: "Team Access", href: "/team-access", icon: Lock },
  { label: "Staff Scheduling", href: "/scheduling", icon: CalendarDays },
  { label: "Transportation", href: "/transportation", icon: Bus },
  { label: "Transportation Fees", href: "/transportation-fees", icon: Bus },
  { label: "Ratios", href: "/ratios", icon: ShieldCheck },
  { label: "Work Plans", href: "/work-plans", icon: ClipboardCheck },
  { label: "Compliance Center", href: "/compliance", icon: ShieldCheck },
  { label: "Files", href: "/files", icon: FolderOpen },
  { label: "Digital Forms", href: "/digital-forms", icon: FileText },
  { label: "Enrollment Pipeline", href: "/enrollment-pipeline", icon: Users },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Marketing", href: "/marketing", icon: Megaphone },
  { label: "Printable Studio", href: "/print-studio", icon: Printer },
  { label: "AI Director", href: "/ai-director", icon: Bot },
  { label: "Locations", href: "/locations", icon: Building2 },
  { label: "Audit Log", href: "/audit-log", icon: ScrollText },
  { label: "Settings", href: "/settings", icon: Settings },
];

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Operations Dashboard", subtitle: "Today across Thomason Childcare Solutions" },
  "/families": { title: "Family Accounts", subtitle: "Guardians, billing, subsidies, and communication" },
  "/children": { title: "Children", subtitle: "Enrollment, health alerts, and child files" },
  "/child-schedules": { title: "Child Schedules", subtitle: "Exact daily care times that drive ratios" },
  "/daily-care": { title: "Daily Care", subtitle: "Bottles, diapers, potty progress, rest, and daily notes" },
  "/meals": { title: "Meals & Menus", subtitle: "Weekly menus, food served, and individual child intake" },
  "/kidkare": { title: "KidKare Enrollment", subtitle: "Track every child at every location they attend" },
  "/timesheets": { title: "Timesheets", subtitle: "Signatures, handoffs, completion, scanning, and department submission" },
  "/shift-reports": { title: "Opening & Closing Reports", subtitle: "Private staff handoffs and pickup reminders" },
  "/health-safety": { title: "Health & Safety", subtitle: "Incidents, illness, medication, and follow-up" },
  "/employees": { title: "Employees", subtitle: "Staff records, qualifications, and assignments" },
  "/team-access": { title: "Team Access", subtitle: "Email invitations, staff roles, locations, and employee permissions" },
  "/scheduling": { title: "Staff Scheduling", subtitle: "Coverage, shifts, and classroom assignments" },
  "/transportation": { title: "Transportation", subtitle: "Routes, schools, drivers, and vehicle readiness" },
  "/transportation-fees": { title: "Transportation Fees", subtitle: "Weekly route-to-billing audit and family payment tracking" },
  "/ratios": { title: "Ratios & Daily Plan", subtitle: "Who is in care, when, and required coverage" },
  "/work-plans": { title: "Work Plans", subtitle: "Weekly goals, initials, and printable task sheets" },
  "/compliance": { title: "Compliance Center", subtitle: "Private child, employee, form, and expiration oversight" },
  "/files": { title: "Compliance Files", subtitle: "Missing documents, signatures, and expirations" },
  "/digital-forms": { title: "Digital Forms", subtitle: "Prepare, sign, correct, and verify form workflows" },
  "/enrollment-pipeline": { title: "Enrollment Pipeline", subtitle: "Inquiries, tours, follow-ups, applications, and enrollment" },
  "/reports": { title: "Reports", subtitle: "Enrollment, attendance, staffing, and operations" },
  "/marketing": { title: "Marketing Studio", subtitle: "Generate captions and printable image ads" },
  "/print-studio": { title: "AI Printable Studio", subtitle: "Ratio plans, work plans, menus, notices, and transportation boards" },
  "/ai-director": { title: "AI Director", subtitle: "Draft, plan, review, and organize daily operations" },
  "/locations": { title: "Locations", subtitle: "Daily open/closed times, capacity, licensing, and colors" },
  "/audit-log": { title: "Audit Log", subtitle: "Immutable create, update, review, export, and deletion history" },
  "/settings": { title: "Hub Settings", subtitle: "Policies, defaults, notifications, and system setup" },
};

type ThemeStyle = CSSProperties & {
  "--theme-50": string;
  "--theme-100": string;
  "--theme-300": string;
  "--theme-500": string;
  "--theme-600": string;
  "--theme-700": string;
  "--theme-800": string;
  "--theme-950": string;
  "--theme-on-primary": string;
  "--theme-accent": string;
};

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLocationHelp, setShowLocationHelp] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [sync, setSync] = useState<HubSyncDetail>({ state: "idle", message: "Secure shared data" });
  const { location, setLocation, availableLocations, locationLocked, theme } = useHubLocation();
  const { profile, user, signOut } = useAuth();
  const meta = useMemo(() => pageMeta[pathname] ?? pageMeta["/"], [pathname]);
  const visibleNavItems = useMemo(() => navItems.filter((item) => canAccessRoute(profile, item.href)), [profile]);
  useEffect(() => {
    function handleSync(event: Event) {
      const custom = event as CustomEvent<HubSyncDetail>;
      setSync(custom.detail);
    }
    window.addEventListener(HUB_SYNC_EVENT, handleSync);
    return () => window.removeEventListener(HUB_SYNC_EVENT, handleSync);
  }, []);

  const syncVisual = sync.state === "saving" || sync.state === "loading"
    ? { label: sync.state === "saving" ? "Saving" : "Loading", icon: <LoaderCircle className="h-4 w-4 animate-spin" />, className: "text-blue-700 bg-blue-50 border-blue-200" }
    : sync.state === "error" || sync.state === "conflict"
      ? { label: sync.state === "conflict" ? "Updated" : "Save issue", icon: <CloudAlert className="h-4 w-4" />, className: sync.state === "conflict" ? "text-amber-800 bg-amber-50 border-amber-200" : "text-red-700 bg-red-50 border-red-200" }
      : sync.state === "saved"
        ? { label: "Saved", icon: <CloudCheck className="h-4 w-4" />, className: "text-emerald-700 bg-emerald-50 border-emerald-200" }
        : { label: "Live", icon: <Cloud className="h-4 w-4" />, className: "text-slate-600 bg-slate-50 border-slate-200" };

  const themeStyle: ThemeStyle = {
    "--theme-50": theme.primarySoft,
    "--theme-100": theme.primarySoft,
    "--theme-300": theme.primaryLight,
    "--theme-500": theme.primary,
    "--theme-600": theme.primary,
    "--theme-700": theme.primaryDark,
    "--theme-800": theme.primaryDark,
    "--theme-950": theme.ink,
    "--theme-on-primary": theme.textOnPrimary,
    "--theme-accent": theme.accent,
  };

  if (!canAccessRoute(profile, pathname)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-5">
        <section className="w-full max-w-xl rounded-3xl bg-white p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-700"><Lock className="h-7 w-7" /></div>
          <h1 className="mt-5 text-2xl font-black text-slate-950">This tool is not included in your access</h1>
          <p className="mt-3 leading-7 text-slate-600">Your role, assigned locations, and individual permissions control which parts of the Hub you can open. Ask Danielle or Jennifer if your work assignment requires this tool.</p>
          <Link href="/" className="mt-6 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Return to Dashboard</Link>
        </section>
      </main>
    );
  }

  return (
    <div className="tcs-theme min-h-screen bg-slate-100 text-slate-950" style={themeStyle} data-location={location}>
      {sidebarOpen && <button aria-label="Close navigation" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-40 bg-slate-950/45 lg:hidden" />}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col text-white shadow-2xl transition-transform lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`} style={{ background: `linear-gradient(180deg, ${theme.primary} 0%, ${theme.primaryDark} 58%, ${theme.ink} 100%)`, color: theme.textOnPrimary }}>
        <div className="flex items-start justify-between border-b border-white/10 p-6">
          <div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-lg font-black">TCS</div>
            <h1 className="mt-3 text-xl font-black">Operations Hub</h1>
            <p className="mt-1 text-xs font-semibold opacity-75">{location === "All Locations" ? "Thomason Childcare Solutions" : theme.fullName}</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="rounded-xl p-2 hover:bg-white/10 lg:hidden" aria-label="Close menu"><X className="h-5 w-5" /></button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {visibleNavItems.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)} className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-bold transition ${active ? "bg-white shadow-lg" : "hover:bg-white/12"}`} style={active ? { color: theme.ink } : { color: theme.textOnPrimary }}>
                <Icon className="h-4.5 w-4.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-xs font-bold uppercase tracking-wider opacity-70">Weekly reminder</p>
            <p className="mt-1 text-sm font-bold">Family schedules due Friday at 6 PM</p>
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
          <div className="flex min-h-20 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button onClick={() => setSidebarOpen(true)} className="rounded-xl border border-slate-200 p-2.5 text-slate-700 lg:hidden" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-black text-slate-950 sm:text-2xl">{meta.title}</h2>
                <p className="hidden truncate text-sm text-slate-500 sm:block">{meta.subtitle}</p>
              </div>
            </div>

            <div className="relative flex items-center gap-2 sm:gap-3">
              <div className="relative">
                <label className="relative block">
                  <span className="sr-only">Selected location</span>
                  <select value={location} disabled={availableLocations.length === 1} onChange={(event) => setLocation(event.target.value as LocationKey)} className="appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-3.5 pr-9 text-xs font-bold text-slate-700 outline-none hover:bg-slate-100 sm:text-sm" title="Changes the Hub colors and sets the active location for schedules, ratios, and printable tools">
                    {availableLocations.map((item) => <option key={item}>{item}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                </label>
              </div>
              <button type="button" onClick={() => setShowLocationHelp((current) => !current)} className="hidden h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 md:flex" aria-label="What does the location selector do?"><Info className="h-4 w-4" /></button>
              <div title={sync.message} className={`hidden items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black sm:flex ${syncVisual.className}`}>{syncVisual.icon}{syncVisual.label}</div>
              <div className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-right xl:block">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Signed in</p>
                <p className="max-w-44 truncate text-sm font-black text-slate-800">{profile?.full_name || user?.email}</p>
              </div>
              <button onClick={() => setShowUserMenu((current) => !current)} className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-black" style={{ background: theme.primarySoft, color: theme.ink }} aria-label="Open user menu">{staffInitials(profile, user?.email)}</button>
              {showLocationHelp && <div className="absolute right-12 top-14 z-40 w-80 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600 shadow-xl"><p className="font-black text-slate-950">Active location selector</p><p className="mt-1">It changes the Hub’s colors and tells location-aware pages—such as Child Schedules, Meals, Ratios, Work Plans, and Marketing—which site you are working on. {locationLocked ? "Your login is limited to the location access assigned by Danielle or Jennifer. You cannot switch to another site or the company-wide view." : "Choose All Locations for company-wide information."}</p></div>}
              {showUserMenu && <div className="absolute right-0 top-14 z-40 w-72 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-xl"><p className="font-black text-slate-950">{profile?.full_name || "TCS Staff"}</p><p className="mt-1 truncate text-xs text-slate-500">{profile?.email || user?.email}</p><p className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{profile?.role}</p><button onClick={() => void signOut()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 font-black text-white"><LogOut className="h-4 w-4" /> Sign Out</button></div>}
            </div>
          </div>
        </header>

        <main className="p-4 pb-28 sm:p-6 sm:pb-28 lg:p-8">{children}</main>
      </div>
      <MobileQuickActions />
    </div>
  );
}
