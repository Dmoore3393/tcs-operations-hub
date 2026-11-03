"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import type { ChildRecord } from "@/lib/children";
import { hubRequest } from "@/lib/hub-request";

/** The child API restores imported names and stable legacy IDs from database columns. */
export function useTransportChildren() {
  const { session } = useAuth();
  const token = session?.access_token;
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef({value:0});
  const refresh = useCallback(async () => {
    if (!token) return;
    const current = ++generation.current.value;
    try {
      const result = await hubRequest<{ children: ChildRecord[] }>("/api/children", token);
      if (current !== generation.current.value) return;
      setChildren(result.children);
      setReady(true);
      setError("");
    } catch (reason) {
      if (current === generation.current.value) setError(reason instanceof Error ? reason.message : "Children could not be loaded. Try again.");
    }
  }, [token]);
  useEffect(() => {
    const sequence=generation.current;
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => { sequence.value++; window.clearTimeout(timer); };
  }, [refresh]);
  return { children, ready, error, refresh };
}
