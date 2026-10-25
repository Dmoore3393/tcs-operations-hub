"use client";

import { usePathname } from "next/navigation";
import { normalizeHubPathname } from "@/lib/route-pathname";

export function useHubPathname() {
  return normalizeHubPathname(usePathname());
}
