"use client";

import Link from "next/link";
import { FileSignature } from "lucide-react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";

export default function TransportationConsentShortcut() {
  const pathname = usePathname();
  const { canManageSystem, isLocationLicensee } = useAuth();
  const onTransportation = pathname === "/transportation" || pathname === "/transportation-v2";
  if (!onTransportation || (!canManageSystem && !isLocationLicensee)) return null;

  return <Link href="/transportation-consents" className="fixed bottom-24 right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#ffc72c] px-4 py-3 text-sm font-black text-[#102a56] shadow-[0_12px_35px_rgba(16,42,86,.28)] ring-2 ring-white transition hover:-translate-y-0.5 sm:bottom-6 sm:right-6"><FileSignature className="h-5 w-5" /> Consent Forms</Link>;
}
