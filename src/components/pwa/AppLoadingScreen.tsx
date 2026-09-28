"use client";

export default function AppLoadingScreen() {
  return (
    <main
      className="relative min-h-[100dvh] overflow-hidden bg-[#06291c] bg-cover bg-center"
      style={{ backgroundImage: "url('/branding/tcs-hub-loading.webp')" }}
      role="status"
      aria-live="polite"
      aria-label="Loading The Hub"
    >
      <span className="sr-only">Loading The Hub…</span>
    </main>
  );
}
