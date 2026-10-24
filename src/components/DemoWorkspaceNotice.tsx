"use client";

import { useAuth } from "@/components/providers/AuthProvider";

export default function DemoWorkspaceNotice() {
  const { profile } = useAuth();
  if (profile?.organization_id !== "7024880e-865a-4148-ad75-723099f83ff0") return null;
  return <aside className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-center text-base font-bold text-amber-950">Demo workspace · Synthetic examples only · Separate from live TCS operations</aside>;
}
