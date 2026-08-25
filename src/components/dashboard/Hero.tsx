"use client";

import { canAccessRoute, useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import dashboardBanner from "@/assets/dashboard/tcs-dashboard-younger-school-age.png";
import { Bot, CalendarDays, ClipboardCheck, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardHero() {
  const { profile } = useAuth();
  const { location, theme } = useHubLocation();
  const now = new Date();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || "TCS Team";
  const greeting = greetingForHour(now.getHours());
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(now);

  const actions = [
    canAccessRoute(profile, "/children")
      ? { href: "/children", label: "Add Child", icon: UserPlus, primary: true }
      : null,
    canAccessRoute(profile, "/ratios")
      ? { href: "/ratios", label: "Today’s Ratios", icon: ShieldCheck }
      : null,
    canAccessRoute(profile, "/shift-reports")
      ? { href: "/shift-reports", label: "Opening / Closing", icon: ClipboardCheck }
      : null,
    canAccessRoute(profile, "/ai-director")
      ? { href: "/ai-director", label: "Ask TCS AI", icon: Bot }
      : null,
  ].filter(Boolean) as Array<{ href: string; label: string; icon: typeof UserPlus; primary?: boolean }>;

  return (
    <section
      className="tcs-pop relative isolate min-h-[430px] overflow-hidden rounded-[2rem] border bg-white shadow-[0_26px_70px_-35px_rgba(15,23,42,.55)] md:min-h-[370px]"
      style={{ borderColor: `${theme.primary}33` }}
    >
      <Image
        src={dashboardBanner}
        alt="A split childcare scene with younger children creating art and building, and school-age children reading, studying, and working on STEM activities."
        fill
        priority
        sizes="(max-width: 768px) 100vw, 1500px"
        className="object-cover object-[68%_center] md:object-center"
      />

      <div className="absolute inset-0 bg-gradient-to-r from-white via-white/95 to-white/20 md:via-white/90 md:to-transparent" />
      <div
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ background: `linear-gradient(180deg, ${theme.primary}, ${theme.accent})` }}
      />
      <div
        className="absolute -left-16 -top-20 h-56 w-56 rounded-full opacity-20 blur-3xl"
        style={{ background: theme.primary }}
      />

      <div className="relative z-10 flex min-h-[430px] max-w-2xl flex-col justify-center px-7 py-9 sm:px-9 md:min-h-[370px] md:px-12">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em]"
            style={{ background: theme.primarySoft, borderColor: `${theme.primary}35`, color: theme.ink }}
          >
            <Sparkles className="h-3.5 w-3.5" /> {greeting}, {firstName}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm backdrop-blur">
            <CalendarDays className="h-3.5 w-3.5" /> {dateLabel}
          </span>
        </div>

        <h1 className="mt-5 max-w-xl text-4xl font-black leading-[0.98] tracking-[-0.045em] text-slate-950 sm:text-5xl md:text-6xl">
          TCS Operations Hub
        </h1>
        <p className="mt-4 max-w-xl text-base font-semibold leading-7 text-slate-700 sm:text-lg">
          Childcare operations, simplified—from little learners to school-age care.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <span
            className="inline-flex items-center rounded-full px-3.5 py-2 text-sm font-black shadow-sm"
            style={{ background: theme.primary, color: theme.textOnPrimary }}
          >
            {location === "All Locations" ? theme.fullName : theme.label}
          </span>
          <span className="rounded-full border border-slate-200 bg-white/85 px-3.5 py-2 text-sm font-bold text-slate-600 shadow-sm backdrop-blur">
            {theme.programType}
          </span>
        </div>

        <div className="mt-7 flex flex-wrap gap-2.5">
          {actions.map(({ href, label, icon: Icon, primary }) => (
            <Link
              key={href}
              href={href}
              className="tcs-hover-lift inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-black shadow-sm backdrop-blur transition"
              style={primary
                ? { background: theme.primary, borderColor: theme.primary, color: theme.textOnPrimary }
                : { background: "rgba(255,255,255,.9)", borderColor: `${theme.primary}38`, color: theme.ink }}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
