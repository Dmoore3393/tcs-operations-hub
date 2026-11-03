"use client";
import {useEffect, useState} from "react";
/** Prevent repeat taps; this does not replace the provider's sending limits. */
export function useEmailCooldown() {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!remaining) return;
    const timer = window.setTimeout(() => setRemaining(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining]);
  return {remaining, start: () => setRemaining(60)};
}
