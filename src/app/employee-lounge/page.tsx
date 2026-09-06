"use client";

import MainLayout from "@/components/layout/MainLayout";
import { canAccessRoute, useAuth } from "@/components/providers/AuthProvider";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Bot,
  Bus,
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Coffee,
  HeartPulse,
  Home,
  Printer,
  ShieldCheck,
  Star,
  Users,
  Utensils,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const NAVY = "#071b2e";
const GREEN = "#0f6b4f";
const GOLD = "#d6aa46";
const CREAM = "#fbf6e8";

const quickTools = [
  { href: "/daily-care", label: "Daily Care", helper: "Bottles, diapers, potty, rest & notes", icon: ClipboardCheck },
  { href: "/meals", label: "Meals & Menus", helper: "See the menu and record meal service", icon: Utensils },
  { href: "/work-plans", label: "My Work Plan", helper: "Review tasks and mark work complete", icon: CheckCircle2 },
  { href: "/shift-reports", label: "Opening / Closing", helper: "Complete private shift handoffs", icon: Home },
  { href: "/transportation", label: "Transportation", helper: "Routes, schools and vehicle readiness", icon: Bus },
  { href: "/health-safety", label: "Health & Safety", helper: "Incidents, illness, medication & follow-up", icon: HeartPulse },
  { href: "/ratios", label: "Ratios", helper: "Check today’s coverage plan", icon: ShieldCheck },
  { href: "/ai-director", label: "TCS AI", helper: "Draft, organize and plan your next steps", icon: Bot },
  { href: "/print-studio", label: "Printable Studio", helper: "Approved staff notices and printables", icon: Printer },
];

const starterChecklist = [
  "Check my assigned location for today",
  "Read today’s announcements and reminders",
  "Review the tools I need for my shift",
  "Check for transportation or coverage updates",
];

export default function EmployeeLoungePage() {
  const { profile } = useAuth();
  const [checked, setChecked] = useState<boolean[]>(starterChecklist.map(() => false));

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("tcs-employee-lounge-checklist-v1");
      if (saved) {
        const parsed = JSON.parse(saved) as boolean[];
        if (Array.isArray(parsed) && parsed.length === starterChecklist.length) setChecked(parsed);
      }
    } catch {
      // A checklist is a convenience only; the Lounge still works without browser storage.
    }
  }, []);

  function toggle(index: number) {
    setChecked((current) => {
      const next = current.map((item, itemIndex) => itemIndex === index ? !item : item);
      try { window.localStorage.setItem("tcs-employee-lounge-checklist-v1", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const visibleTools = useMemo(
    () => quickTools.filter((tool) => canAccessRoute(profile, tool.href)),
    [profile],
  );
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || "Team";
  const locations = profile?.locations?.length ? profile.locations.join(" • ") : "TCS Team";
  const completed = checked.filter(Boolean).length;

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1500px] space-y-6">
        <section className="relative overflow-hidden rounded-[2rem] border shadow-xl" style={{ borderColor: "#d6aa4666", background: `linear-gradient(135deg, ${NAVY} 0%, #0b2f35 55%, ${GREEN} 100%)` }}>
          <div className="absolute -right-12 -top-12 h-52 w-52 rounded-full border border-white/10 bg-white/5" />
          <div className="absolute -bottom-20 left-1/3 h-48 w-48 rounded-full" style={{ background: "radial-gradient(circle, rgba(214,170,70,.28), transparent 70%)" }} />
          <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-white/85"><Coffee className="h-4 w-4" /> Employee Lounge</div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">Hey {firstName} — welcome to your space. 💚</h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-white/75 sm:text-base">Catch up, get shift-ready, find your work tools, and see what the TCS team needs to know today.</p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs font-black">
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-white">{profile?.role || "TCS Staff"}</span>
                <span className="rounded-full px-3 py-1.5" style={{ background: GOLD, color: NAVY }}>{locations}</span>
              </div>
            </div>
            <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-[2rem] border-4 border-white/15 bg-white/10 text-7xl shadow-2xl lg:mx-0" aria-label="TCS gator mascot">🐊</div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div><p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: GREEN }}>Start here</p><h2 className="mt-1 text-2xl font-black text-slate-950">My Shift Starter</h2><p className="mt-1 text-sm text-slate-500">A fast reset before you jump into the day.</p></div>
              <div className="rounded-2xl px-4 py-2 text-center" style={{ background: CREAM }}><p className="text-2xl font-black" style={{ color: NAVY }}>{completed}/{starterChecklist.length}</p><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Ready</p></div>
            </div>
            <div className="mt-5 space-y-3">
              {starterChecklist.map((item, index) => (
                <button key={item} type="button" onClick={() => toggle(index)} className="flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md" style={{ borderColor: checked[index] ? "#0f6b4f55" : "#e2e8f0", background: checked[index] ? "#eef9f4" : "white" }}>
                  {checked[index] ? <CheckCircle2 className="h-6 w-6 shrink-0" style={{ color: GREEN }} /> : <Circle className="h-6 w-6 shrink-0 text-slate-300" />}
                  <span className={`font-bold ${checked[index] ? "text-slate-500 line-through" : "text-slate-800"}`}>{item}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">This little checklist saves on this device only.</p>
          </section>

          <section className="overflow-hidden rounded-[2rem] border shadow-sm" style={{ borderColor: "#b8894b55", background: "linear-gradient(135deg,#b78345,#d4aa72)" }}>
            <div className="border-b border-black/10 px-5 py-4 sm:px-6"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/75">Pinned for the team</p><h2 className="mt-1 text-2xl font-black text-white">Employee Bulletin Board</h2></div>
            <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
              <PinnedNote title="Weekly schedules" text="Family schedules are due Friday by 6 PM." icon={<CalendarDays className="h-5 w-5" />} rotate="-rotate-1" />
              <PinnedNote title="Morning route" text="Morning transportation departs at 7:00 AM." icon={<Bus className="h-5 w-5" />} rotate="rotate-1" />
              <PinnedNote title="Privacy matters" text="Keep child, medical and staff details inside the secure Hub." icon={<ShieldCheck className="h-5 w-5" />} rotate="rotate-1" />
              <PinnedNote title="Team standard" text="If something changes during your shift, document it before handoff." icon={<ClipboardCheck className="h-5 w-5" />} rotate="-rotate-1" />
            </div>
          </section>
        </div>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: GREEN }}>Get to work fast</p><h2 className="mt-1 text-2xl font-black text-slate-950">My Work Tools</h2><p className="mt-1 text-sm text-slate-500">You only see shortcuts your account is allowed to open.</p></div><span className="hidden rounded-full px-3 py-1.5 text-xs font-black sm:inline-flex" style={{ background: CREAM, color: NAVY }}>{visibleTools.length} available</span></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleTools.map((tool) => {
              const Icon = tool.icon;
              return <Link key={tool.href} href={tool.href} className="group flex min-h-32 flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-1 hover:border-emerald-300 hover:bg-white hover:shadow-lg"><div className="flex items-start justify-between gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-sm" style={{ background: GREEN }}><Icon className="h-5 w-5" /></span><ArrowRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-slate-600" /></div><div className="mt-4"><p className="font-black text-slate-950">{tool.label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{tool.helper}</p></div></Link>;
            })}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          <LoungeCard icon={<Bell className="h-6 w-6" />} title="Team Updates" kicker="Know what changed">
            <p>Use this space for the reminders that matter to the whole team — schedule deadlines, route changes, closures, trainings, and policy updates.</p>
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-950">Next build: leadership-posted announcements with staff acknowledgment.</div>
          </LoungeCard>
          <LoungeCard icon={<Star className="h-6 w-6" />} title="Recognition Wall" kicker="Catch people doing it right">
            <p>Celebrate great teamwork, clean handoffs, strong classroom support, safe transportation, and staff who jump in when coverage gets tight.</p>
            <div className="mt-4 flex items-center gap-3 rounded-2xl p-3" style={{ background: CREAM }}><span className="text-3xl">⭐</span><div><p className="font-black" style={{ color: NAVY }}>Team Win of the Week</p><p className="text-xs text-slate-600">Recognition posting is coming next.</p></div></div>
          </LoungeCard>
          <LoungeCard icon={<BookOpen className="h-6 w-6" />} title="Grow With TCS" kicker="Training & development">
            <p>Keep your required learning, coaching, goals, certifications, and skill-building easy to find from one staff-centered home.</p>
            <div className="mt-4 flex flex-wrap gap-2"><Tag>Training</Tag><Tag>Goals</Tag><Tag>Certificates</Tag><Tag>Badges</Tag></div>
          </LoungeCard>
        </div>

        <section className="rounded-[2rem] border p-5 shadow-sm sm:p-6" style={{ borderColor: "#d6aa4666", background: CREAM }}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-2xl text-3xl" style={{ background: NAVY }}>🐊</div><div><p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: GREEN }}>TCS Employee Lounge</p><h2 className="text-xl font-black" style={{ color: NAVY }}>One place for the team — not another boring staff portal.</h2></div></div><div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-slate-600 shadow-sm"><Users className="h-4 w-4" /> Staff only</div></div>
        </section>
      </div>
    </MainLayout>
  );
}

function PinnedNote({ title, text, icon, rotate }: { title: string; text: string; icon: React.ReactNode; rotate: string }) {
  return <article className={`${rotate} relative rounded-sm bg-[#fff4b8] p-4 shadow-lg`}><span className="absolute left-1/2 top-1 h-3 w-3 -translate-x-1/2 rounded-full bg-red-500 shadow" /><div className="mt-2 flex items-center gap-2 font-black text-slate-900">{icon}{title}</div><p className="mt-2 text-sm font-semibold leading-6 text-slate-700">{text}</p></article>;
}

function LoungeCard({ icon, title, kicker, children }: { icon: React.ReactNode; title: string; kicker: string; children: React.ReactNode }) {
  return <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ background: NAVY }}>{icon}</div><p className="mt-4 text-xs font-black uppercase tracking-[0.16em]" style={{ color: GREEN }}>{kicker}</p><h2 className="mt-1 text-xl font-black text-slate-950">{title}</h2><div className="mt-3 text-sm font-medium leading-6 text-slate-600">{children}</div></section>;
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full px-3 py-1.5 text-xs font-black" style={{ background: "#edf7f2", color: GREEN }}>{children}</span>;
}
