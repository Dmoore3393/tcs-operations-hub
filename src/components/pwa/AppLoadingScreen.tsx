"use client";

export default function AppLoadingScreen() {
  return (
    <main
      className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#06291c]"
      role="status"
      aria-live="polite"
      aria-label="Loading The Hub"
    >
      <div
        className="absolute inset-0 bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('/branding/tcs-hub-loading.webp')",
          backgroundSize: "contain",
        }}
        aria-hidden="true"
      />
      <span className="sr-only">Loading The Hub…</span>
    </main>
  );
}
