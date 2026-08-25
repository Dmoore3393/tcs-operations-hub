"use client";

import Link from "next/link";
import { SectionCard, StatusBadge } from "@/components/hub/HubUI";
import type { EnrollmentLeadRecord } from "@/lib/admin-ops";
import type { Shift, TransportationRoute, WorkTask } from "@/lib/hub-data";
import { Bus, CalendarClock, CheckSquare2, Clock3, Coffee, GraduationCap, Utensils } from "lucide-react";

export type TodayAtTCSPermissions = {
  scheduling: boolean;
  transportation: boolean;
  workPlans: boolean;
  enrollment: boolean;
  meals: boolean;
};

type TimelineEvent = {
  id: string;
  time: string;
  sort: number;
  title: string;
  detail: string;
  href: string;
  kind: "Staff" | "Transportation" | "Meal" | "Tour" | "Task";
};

function minutes(time: string) {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return 24 * 60 + 1;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = match[3].toUpperCase();
  if (hour === 12) hour = 0;
  if (suffix === "PM") hour += 12;
  return hour * 60 + minute;
}

function routeRunsToday(days: string, weekday: string) {
  const value = days.toLowerCase().replace(/–/g, "-");
  const short = weekday.slice(0, 3).toLowerCase();
  if (value.includes("mon-fri") || value.includes("monday-friday")) return !["sat", "sun"].includes(short);
  if (value.includes("mon-sat")) return short !== "sun";
  const variants: Record<string, string[]> = {
    mon: ["mon", "monday"], tue: ["tue", "tues", "tuesday"], wed: ["wed", "wednesday"], thu: ["thu", "thur", "thurs", "thursday"], fri: ["fri", "friday"], sat: ["sat", "saturday"], sun: ["sun", "sunday"],
  };
  return (variants[short] ?? [short]).some((token) => value.includes(token));
}

function kindTone(kind: TimelineEvent["kind"]) {
  if (kind === "Transportation") return "purple" as const;
  if (kind === "Tour") return "blue" as const;
  if (kind === "Task") return "amber" as const;
  if (kind === "Meal") return "green" as const;
  return "slate" as const;
}

function KindIcon({ kind }: { kind: TimelineEvent["kind"] }) {
  if (kind === "Transportation") return <Bus className="h-4 w-4" />;
  if (kind === "Tour") return <GraduationCap className="h-4 w-4" />;
  if (kind === "Task") return <CheckSquare2 className="h-4 w-4" />;
  if (kind === "Meal") return <Utensils className="h-4 w-4" />;
  return <Clock3 className="h-4 w-4" />;
}

export default function TodayAtTCS({
  date,
  shifts,
  routes,
  tasks,
  leads,
  permissions,
}: {
  date: string;
  shifts: Shift[];
  routes: TransportationRoute[];
  tasks: WorkTask[];
  leads: EnrollmentLeadRecord[];
  permissions: TodayAtTCSPermissions;
}) {
  const dateObject = new Date(`${date}T12:00:00`);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(dateObject);
  const events: TimelineEvent[] = [];

  if (permissions.scheduling) {
    shifts.filter((shift) => shift.day === weekday).forEach((shift) => events.push({
      id: `shift-${shift.id}`,
      time: shift.start,
      sort: minutes(shift.start),
      title: `${shift.employee} starts`,
      detail: `${shift.location} • ${shift.assignment}`,
      href: "/scheduling",
      kind: "Staff",
    }));
  }

  if (permissions.transportation) {
    routes.filter((route) => route.status !== "Not Riding" && routeRunsToday(route.days, weekday)).forEach((route) => {
      if (minutes(route.pickup) <= 24 * 60) events.push({
        id: `route-${route.id}`,
        time: route.pickup,
        sort: minutes(route.pickup),
        title: `${route.child} transportation`,
        detail: `${route.school} • ${route.driver || "Driver TBD"}`,
        href: "/transportation",
        kind: "Transportation",
      });
    });
  }

  if (permissions.meals) {
    [
      ["7:30 AM", "Breakfast"],
      ["9:30 AM", "AM Snack"],
      ["11:30 AM", "Lunch"],
      ["2:30 PM", "PM Snack"],
      ["4:30 PM", "Dinner"],
    ].forEach(([time, meal]) => events.push({ id: `meal-${meal}`, time, sort: minutes(time), title: meal, detail: "Meal service window", href: "/meals", kind: "Meal" }));
  }

  if (permissions.enrollment) {
    leads.filter((lead) => lead.tourDate?.slice(0, 10) === date).forEach((lead) => {
      const tourDate = new Date(lead.tourDate);
      const time = tourDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      events.push({
        id: `tour-${lead.id}`,
        time,
        sort: tourDate.getHours() * 60 + tourDate.getMinutes(),
        title: `Tour • ${lead.familyName}`,
        detail: `${lead.location} • ${lead.childName || "Child information pending"}`,
        href: "/enrollment-pipeline",
        kind: "Tour",
      });
    });
  }

  if (permissions.workPlans) {
    tasks.filter((task) => !task.completed && task.due.toLowerCase() === weekday.toLowerCase()).slice(0, 4).forEach((task, index) => events.push({
      id: `task-${task.id}`,
      time: "Today",
      sort: 23 * 60 + index,
      title: task.title,
      detail: `${task.location} • ${task.priority} priority`,
      href: "/work-plans",
      kind: "Task",
    }));
  }

  events.sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
  const limited = events.slice(0, 14);

  return <SectionCard title="Today at TCS" description={`${weekday} • one timeline for staffing, transportation, meals, tours, and due work that your login is allowed to see.`} action={<CalendarClock className="h-5 w-5 text-slate-400" />}>
    {limited.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-7 text-center text-sm text-slate-500"><Coffee className="mx-auto mb-2 h-5 w-5" />Nothing is currently entered for today in the tools available to your login.</div> : <div className="relative space-y-1 before:absolute before:bottom-2 before:left-[4.15rem] before:top-2 before:w-px before:bg-slate-200">{limited.map((event) => <Link key={event.id} href={event.href} className="relative grid grid-cols-[56px_20px_1fr] items-start gap-3 rounded-xl px-2 py-2.5 transition hover:bg-slate-50"><p className="pt-1 text-right text-xs font-black text-slate-500">{event.time}</p><span className="relative z-10 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-slate-400 shadow-sm" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-900">{event.title}</p><StatusBadge tone={kindTone(event.kind)}><KindIcon kind={event.kind} /> <span className="ml-1">{event.kind}</span></StatusBadge></div><p className="mt-1 text-xs leading-5 text-slate-500">{event.detail}</p></div></Link>)}</div>}
  </SectionCard>;
}
