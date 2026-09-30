"use client";

import { FunDoodles, GatorGuide } from "@/components/brand/HubJoy";

export default function AppLoadingScreen() {
  return (
    <main
      className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#06291c]"
      role="status"
      aria-live="polite"
      aria-label="Loading The Hub"
    >
      <div
        className="absolute inset-0 bg-center bg-no-repeat opacity-35"
        style={{
          backgroundImage: "url('/branding/tcs-hub-loading.webp')",
          backgroundSize: "contain",
        }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#2d8a55_0%,transparent_38%),linear-gradient(155deg,rgba(6,41,28,.82),rgba(2,20,14,.96))]" />
      <FunDoodles className="opacity-70" />

      <section className="tcs-soft-pop relative z-10 mx-5 w-full max-w-md rounded-[34px] border border-white/15 bg-white/10 p-7 text-center text-white shadow-2xl backdrop-blur-xl">
        <div className="mx-auto flex justify-center">
          <GatorGuide size="lg" />
        </div>
        <p className="mt-1 text-[10px] font-black uppercase tracking-[.22em] text-emerald-200">The Hub</p>
        <h1 className="mt-2 text-3xl font-black">Getting everything ready ✨</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm font-semibold leading-6 text-emerald-50/80">Schedules, care updates, team tools, and all the little things that keep TCS moving.</p>
        <div className="mx-auto mt-6 h-2 w-44 overflow-hidden rounded-full bg-white/10">
          <div className="tcs-shimmer h-full w-full rounded-full bg-gradient-to-r from-emerald-300 via-yellow-300 to-rose-300" />
        </div>
      </section>

      <span className="sr-only">Loading The Hub…</span>
    </main>
  );
}
