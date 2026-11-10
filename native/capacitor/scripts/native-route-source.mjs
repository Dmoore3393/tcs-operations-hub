/** Transform only the throwaway native export copy, never the live website. */
export function nativeLayoutSource(source) {
  const cookieImport = 'import {cookies} from "next/headers";';
  const cookieLanguage = 'const language=(await cookies()).get("tcs_language")?.value==="es"?"es":"en";';
  if (!source.includes(cookieImport) || !source.includes(cookieLanguage))
    throw new Error('Review the root language layout before preparing the native export.');
  // Staff-language sync and the client language switch remain available.
  return source.replace(cookieImport, '').replace(cookieLanguage, 'const language="en" as const;');
}

export function nativePlannerPageSource(source, component) {
  if (!['WeeklyCarePlanner', 'DailyRatioPlan'].includes(component) ||
      !source.includes('plannerPageSelection(await searchParams)') ||
      !source.includes(`@/components/scheduling/${component}`))
    throw new Error('Review the dated planner entry before preparing its native route.');
  // Both native screens use the same dated planner as the website. Resolve the
  // selected date on the device, not the date when the package was built.
  return `"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Planner from "@/components/scheduling/${component}";
import { plannerPageSelection } from "@/lib/weekly-care-planner";
function SelectedPlanner() {
  const query = useSearchParams();
  const selection = plannerPageSelection(Object.fromEntries(query.entries()));
  return <Planner key={selection.initialDate + ":" + selection.initialLocation} {...selection} />;
}
export default function Page() {
  return <Suspense fallback={<p role="status">Loading schedules…</p>}><SelectedPlanner /></Suspense>;
}
`;
}
