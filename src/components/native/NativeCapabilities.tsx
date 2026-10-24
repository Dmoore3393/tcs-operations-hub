"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { initializeNativeDevice, NativeDevice } from "@/lib/native-device";

export default function NativeCapabilities() {
  const { session, loading } = useAuth();
  const authenticated = Boolean(session);
  useEffect(() => {
    if (loading) return;
    let active = true;
    void initializeNativeDevice().then((available) => {
      if (available && active) return NativeDevice.sessionChanged({ authenticated });
    }).catch(() => { /* The regular email/password flow remains available. */ });
    return () => { active = false; };
  }, [authenticated, loading]);
  return null;
}
