import WeeklyCarePlanner from "@/components/scheduling/WeeklyCarePlanner";
import { plannerPageSelection, type PlannerQuery } from "@/lib/weekly-care-planner";

export default async function Page({ searchParams }: { searchParams: Promise<PlannerQuery> }) {
  const selection = plannerPageSelection(await searchParams);
  return <WeeklyCarePlanner {...selection} />;
}
