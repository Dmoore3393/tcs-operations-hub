"use client";

export default function AppLoadingScreen() {
  return (
    <main
      className="relative flex min-h-[100dvh] items-end justify-center overflow-hidden bg-[#06291c] text-white"
      role="status"
      aria-live="polite"
      aria-label="Opening The Hub"
    >
      <img
        src="/branding/tcs-hub-launch.webp"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#031a12]/88" />
      <div className="relative z-10 mb-[max(2rem,env(safe-area-inset-bottom))] flex items-center gap-3 rounded-full border border-white/15 bg-black/25 px-5 py-3 shadow-2xl backdrop-blur-md">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-yellow-300 shadow-[0_0_18px_rgba(253,224,71,.95)]" />
        <span className="text-xs font-black uppercase tracking-[.16em]">Opening The Hub</span>
      </div>
    </main>
  );
}
