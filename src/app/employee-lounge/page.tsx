"use client";

import Link from "next/link";
import {
  BookOpen,
  CakeSlice,
  CalendarDays,
  Coffee,
  Heart,
  HeartHandshake,
  Leaf,
  Lightbulb,
  Megaphone,
  PartyPopper,
  RefreshCw,
  Send,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import MainLayout from "@/components/layout/MainLayout";
import { canAccessRoute, useAuth } from "@/components/providers/AuthProvider";

type ShoutOut = {
  id: number;
  from: string;
  message: string;
};

const starterShoutOuts: ShoutOut[] = [
  {
    id: 1,
    from: "TCS Leadership Team",
    message: "Thank you for the heart you bring to this work every day. Safe, happy, nurturing spaces happen because of you.",
  },
  {
    id: 2,
    from: "Team TCS",
    message: "Shout-out to everyone who jumps in when another classroom, route, or teammate needs support. That teamwork matters.",
  },
];

const breakIdeas = [
  "Play your favorite song and dance it out for three minutes.",
  "Take a five-minute nature walk and leave your phone in your pocket.",
  "Grab water, stretch your shoulders, and reset before the next transition.",
  "Share something funny with a teammate who could use a smile.",
  "Read a chapter, doodle, or do something that has nothing to do with work for five minutes.",
  "Tell a teammate one thing you appreciate about how they show up for the team.",
];

const wellnessCards = [
  { title: "Mindfulness & Calm", note: "60-second reset", icon: Heart },
  { title: "Movement & Energy", note: "Stretch or walk", icon: Sparkles },
  { title: "Mental Health Support", note: "Use your support system", icon: HeartHandshake },
  { title: "Healthy Living", note: "Water + real fuel", icon: Leaf },
  { title: "Work-Life Balance", note: "Protect your off time", icon: Coffee },
];

const quickLinks = [
  { label: "Our People", href: "/employees", icon: Users },
  { label: "My Schedule", href: "/scheduling", icon: CalendarDays },
  { label: "My Work", href: "/work-plans", icon: Trophy },
  { label: "Health & Safety", href: "/health-safety", icon: HeartHandshake },
  { label: "Printable Studio", href: "/print-studio", icon: BookOpen },
  { label: "TCS AI", href: "/ai-director", icon: Lightbulb },
];

export default function EmployeeLoungePage() {
  const { profile } = useAuth();
  const [shoutOuts, setShoutOuts] = useState<ShoutOut[]>(starterShoutOuts);
  const [newShoutOut, setNewShoutOut] = useState("");
  const [showShoutOutForm, setShowShoutOutForm] = useState(false);
  const [breakIdeaIndex, setBreakIdeaIndex] = useState(0);

  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || "Team Member";
  const visibleLinks = useMemo(
    () => quickLinks.filter((item) => canAccessRoute(profile, item.href)),
    [profile],
  );

  function submitShoutOut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = newShoutOut.trim();
    if (!message) return;
    setShoutOuts((current) => [
      { id: Date.now(), from: profile?.full_name || "TCS Team Member", message },
      ...current,
    ]);
    setNewShoutOut("");
    setShowShoutOutForm(false);
  }

  function nextBreakIdea() {
    setBreakIdeaIndex((current) => (current + 1) % breakIdeas.length);
  }

  return (
    <MainLayout>
      <div className="min-h-full bg-[#f7f0e3] pb-12">
        <section className="relative overflow-hidden rounded-[2rem] border border-[#e4d2b0] bg-[#fffaf1] shadow-xl">
          <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-emerald-900/10" />
          <div className="absolute -right-10 bottom-0 text-[10rem] leading-none opacity-[0.08]">🌿</div>
          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.4fr_0.6fr] lg:p-10">
            <div className="relative z-10">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#b77713]">Good team • Great vibes • Stronger together</p>
              <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight text-[#0b3153] sm:text-5xl lg:text-6xl">
                Welcome to the <span className="font-serif italic text-[#2f6b37]">Employee Lounge</span>
              </h1>
              <p className="mt-4 max-w-3xl text-base font-semibold leading-7 text-slate-700 sm:text-lg">
                A space to connect, celebrate, recharge, and support one another. You make TCS a great place to be, {firstName}. 💚
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setShowShoutOutForm(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-[#d89a23] px-5 py-3 text-sm font-black text-[#0b3153] shadow-lg transition hover:-translate-y-0.5"
                >
                  <Megaphone className="h-4 w-4" /> Give a Shout-Out
                </button>
                {canAccessRoute(profile, "/work-plans") && (
                  <Link href="/work-plans" className="inline-flex items-center gap-2 rounded-full bg-[#0b3153] px-5 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5">
                    <Trophy className="h-4 w-4" /> My Work
                  </Link>
                )}
              </div>
            </div>

            <div className="relative z-10 flex items-center justify-center">
              <div className="relative flex h-64 w-full max-w-sm items-center justify-center rounded-[2rem] border-4 border-white bg-[#0b3153] p-5 text-center shadow-2xl">
                <div className="absolute -right-3 -top-6 rotate-6 rounded-2xl bg-[#d89a23] px-4 py-2 text-xs font-black text-[#0b3153] shadow-lg">YOU BELONG HERE ♥</div>
                <div>
                  <div className="text-8xl">🐊</div>
                  <p className="mt-2 text-xl font-black text-white">TCS Team Gator</p>
                  <p className="mt-1 text-sm font-bold text-emerald-200">Teamwork makes brighter tomorrows.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-5 xl:grid-cols-3">
          <section className="rounded-3xl border border-[#e8dcc8] bg-white p-5 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#dfead7] text-[#2f6b37]"><Megaphone className="h-5 w-5" /></span>
                <div><h2 className="text-lg font-black text-[#0b3153]">Team Shout-Outs</h2><p className="text-xs font-semibold text-slate-500">Good people doing great things.</p></div>
              </div>
              <button type="button" onClick={() => setShowShoutOutForm(true)} className="text-xs font-black text-[#0b3153] underline">Add one</button>
            </div>
            <div className="mt-4 space-y-3">
              {shoutOuts.slice(0, 3).map((item) => (
                <article key={item.id} className="rounded-2xl bg-[#fff8ed] p-4">
                  <p className="text-sm font-semibold italic leading-6 text-slate-700">“{item.message}”</p>
                  <p className="mt-2 text-xs font-black text-[#2f6b37]">— {item.from}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-[#e8dcc8] bg-white p-5 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff0c9] text-[#b77713]"><CakeSlice className="h-5 w-5" /></span>
              <div><h2 className="text-lg font-black text-[#0b3153]">Birthdays This Month</h2><p className="text-xs font-semibold text-slate-500">Celebrate our amazing team.</p></div>
            </div>
            <div className="mt-5 rounded-2xl border border-dashed border-[#d8c49c] bg-[#fffaf1] p-5 text-center">
              <PartyPopper className="mx-auto h-9 w-9 text-[#d89a23]" />
              <p className="mt-3 text-sm font-black text-[#0b3153]">Birthday board ready</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">Team birthdays can populate here from employee profiles once the birthday field is connected.</p>
            </div>
            {canAccessRoute(profile, "/employees") && (
              <Link href="/employees" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#d89a23] px-4 py-3 text-sm font-black text-[#0b3153]">
                <Users className="h-4 w-4" /> Open Our People
              </Link>
            )}
          </section>

          <section className="rounded-3xl border border-[#e8dcc8] bg-white p-5 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff0c9] text-[#b77713]"><Heart className="h-5 w-5" /></span>
              <div><h2 className="text-lg font-black text-[#0b3153]">You Make a Difference</h2><p className="text-xs font-semibold text-slate-500">Kind words. Stronger together.</p></div>
            </div>
            <blockquote className="mt-5 rounded-2xl bg-[#f8f1e5] p-5 text-sm font-semibold italic leading-7 text-slate-700">
              “Thank you for the heart you bring to this work every single day. You create safe, happy, nurturing spaces for children, and that changes lives.”
              <footer className="mt-3 font-black not-italic text-[#0b3153]">— TCS Leadership Team</footer>
            </blockquote>
          </section>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr] xl:grid-cols-3">
          <section className="rounded-3xl border border-[#e8dcc8] bg-white p-5 shadow-lg xl:col-span-1">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#dfead7] text-[#2f6b37]"><Leaf className="h-5 w-5" /></span>
              <div><h2 className="text-lg font-black text-[#0b3153]">Wellness & Recharge</h2><p className="text-xs font-semibold text-slate-500">Take care of you, too.</p></div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5 lg:grid-cols-2 xl:grid-cols-2">
              {wellnessCards.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-2xl bg-[#fffaf1] p-3 text-center">
                    <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#2f6b37] shadow"><Icon className="h-5 w-5" /></span>
                    <p className="mt-2 text-xs font-black text-[#0b3153]">{item.title}</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">{item.note}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-[#e8dcc8] bg-white p-5 shadow-lg xl:col-span-1">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff0c9] text-[#b77713]"><Coffee className="h-5 w-5" /></span>
              <div><h2 className="text-lg font-black text-[#0b3153]">Break-Time Ideas</h2><p className="text-xs font-semibold text-slate-500">Small breaks make a difference.</p></div>
            </div>
            <div className="mt-5 flex min-h-44 flex-col justify-between rounded-2xl bg-[#fff8ed] p-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b77713]">Reset • Refuel • Return stronger</p>
                <p className="mt-3 text-lg font-black leading-7 text-[#0b3153]">{breakIdeas[breakIdeaIndex]}</p>
              </div>
              <button type="button" onClick={nextBreakIdea} className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-[#d89a23] px-4 py-3 text-sm font-black text-[#0b3153]">
                <RefreshCw className="h-4 w-4" /> Give Me Another Idea
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-[#e8dcc8] bg-white p-5 shadow-lg lg:col-span-2 xl:col-span-1">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#dbe9f2] text-[#0b3153]"><Sparkles className="h-5 w-5" /></span>
              <div><h2 className="text-lg font-black text-[#0b3153]">Quick Team Links</h2><p className="text-xs font-semibold text-slate-500">Your go-to Hub tools.</p></div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {visibleLinks.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-black text-[#0b3153] transition hover:-translate-y-0.5 hover:border-[#d89a23] hover:shadow-md">
                    <Icon className="h-4 w-4" /> {item.label}
                  </Link>
                );
              })}
            </div>
          </section>
        </div>

        <footer className="mt-6 rounded-3xl bg-[#0b3153] px-6 py-5 text-center text-white shadow-xl">
          <p className="text-xl font-black">We’re better together. 💚</p>
          <p className="mt-1 text-sm font-semibold text-white/75">Take a moment to relax, recharge, and celebrate all that makes TCS special.</p>
        </footer>
      </div>

      {showShoutOutForm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={() => setShowShoutOutForm(false)}>
          <form onSubmit={submitShoutOut} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff0c9] text-[#b77713]"><Megaphone className="h-5 w-5" /></span>
              <div><h2 className="text-xl font-black text-[#0b3153]">Give a Team Shout-Out</h2><p className="text-sm text-slate-500">Celebrate something a teammate did well.</p></div>
            </div>
            <textarea
              value={newShoutOut}
              onChange={(event) => setNewShoutOut(event.target.value)}
              rows={5}
              autoFocus
              placeholder="Example: Huge shout-out to the closing team for jumping in and helping each other today…"
              className="mt-5 w-full rounded-2xl border border-slate-300 p-4 text-sm leading-6 outline-none focus:border-[#d89a23] focus:ring-4 focus:ring-amber-100"
            />
            <p className="mt-2 text-xs text-slate-500">Shout-outs are currently session-only until the shared Employee Lounge feed is connected.</p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setShowShoutOutForm(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-600">Cancel</button>
              <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-[#0b3153] px-5 py-2.5 text-sm font-black text-white"><Send className="h-4 w-4" /> Post Shout-Out</button>
            </div>
          </form>
        </div>
      )}
    </MainLayout>
  );
}
