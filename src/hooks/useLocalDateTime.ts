"use client";

import { useMemo, useSyncExternalStore } from "react";

export function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function subscribe(onChange: () => void) {
  const timer = window.setInterval(onChange, 60_000);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}

// Server output is neutral. After hydration, use the device's local clock and
// refresh on the next minute or when the app returns to the foreground.
export function useLocalDateTime() {
  const minute = useSyncExternalStore(subscribe, () => Math.floor(Date.now() / 60_000), () => 0);
  return useMemo(() => minute ? new Date(minute * 60_000) : null, [minute]);
}
