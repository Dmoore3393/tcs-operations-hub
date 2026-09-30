"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  LoaderCircle,
  UserRoundCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Checkin = {
  id: string;
  planId: string;
  staffUserId: string;
  milestoneDays: 30 | 60 | 90;
  dueDate: string;
  status: "Upcoming" | "Employee Submitted" | "Leadership Draft" | "Review Shared" | "Completed";
};
type Staff = { userId: string; fullName: string };
type Payload = {
  viewer: { userId: string; fullName: string; canManage: boolean };
  staff: Staff[];
  checkins: Checkin[];
};

function today() {
  return new Date().toISOString().slice(0, 10);
}
function diffDays(date: string) {
  const start = new Date(`${today()}T12:00:00`).getTime();
  const end = new Date(`${date}T12:00:00`).getTime();
  return Math.round((end - start) / 86400000);
}
function dueLabel(date: string) {
  const diff = diffDays(date);
  if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"} overdue`;
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  return `Due in ${diff} days`;
}

export default function EmployeeCheckinReminder() {
  const { session } = useAuth();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.access_token) return;
    let active = true;
    void fetch("/api/employee-checkins", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    })
      .then(async (response) => response.ok ? response.json() as Promise<Payload> : null)
      .then((payload) => { if (active && payload) setData(payload); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session?.access_token]);

  const reminders = useMemo(() => {
    if (!data) return [];
    const staffMap = new Map(data.staff.map((staff) => [staff.userId, staff.fullName]));
    return data.checkins
      .filter((item) => item.status !== "Completed")
      .map((item) => ({
        ...item,
        employeeName: staffMap.get(item.staffUserId) || (item.staffUserId === data.viewer.userId ? data.viewer.fullName : "Employee"),
        days: diffDays(item.dueDate),
      }))
      .filter((item) =>
        item.status === "Review Shared"
        || item.status === "Employee Submitted"
        || item.status === "Leadership Draft"
        || item.days <= 14
      )
      .sort((a, b) => a.days - b.days)
      .slice(0, data.viewer.canManage ? 5 : 2);
  }, [data]);

  if (loading) {
    return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3 text-sm font-black text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin text-emerald-700" />Checking employee check-ins…</div></section>;
  }

  if (!data) return null;

  if (!reminders.length) {
    return <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><CheckCircle2 className="h-6 w-6 text-emerald-700" /><div><p className="font-black text-emerald-950">{data.viewer.canManage ? "30/60/90 check-ins are on track" : "Your check-ins are on track"}</p><p className="text-xs font-semibold text-emerald-900/70">Nothing needs attention in the next 14 days.</p></div></div><Link href="/employee-checkins" className="inline-flex items-center gap-1 text-xs font-black text-emerald-800">Open Check-Ins <ChevronRight className="h-4 w-4" /></Link></div></section>;
  }

  return <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 via-white to-emerald-50 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-700 text-white"><UserRoundCheck className="h-5 w-5" /></span><div><p className="text-[10px] font-black uppercase tracking-wider text-violet-700">30/60/90 Check-In Reminder</p><h2 className="text-lg font-black text-slate-950">{data.viewer.canManage ? "Upcoming employee conversations" : "Your next check-in"}</h2></div></div>
      <Link href="/employee-checkins" className="inline-flex items-center gap-1 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white">Open Check-Ins <ChevronRight className="h-4 w-4" /></Link>
    </div>
    <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">{reminders.map((item) => {
      const overdue = item.days < 0;
      const shared = item.status === "Review Shared";
      const submitted = item.status === "Employee Submitted";
      const tone = overdue ? "border-red-200 bg-red-50" : shared ? "border-violet-200 bg-violet-50" : submitted ? "border-blue-200 bg-blue-50" : item.days <= 7 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50";
      const icon = overdue ? <AlertTriangle className="h-5 w-5 text-red-700" /> : shared ? <CheckCircle2 className="h-5 w-5 text-violet-700" /> : <Clock3 className="h-5 w-5 text-amber-700" />;
      return <Link href="/employee-checkins" key={item.id} className={`tcs-joy-card rounded-2xl border p-4 ${tone}`}>
        <div className="flex items-start justify-between gap-3"><div>{icon}</div><span className="rounded-full bg-white/80 px-2 py-1 text-[9px] font-black text-slate-600">{item.milestoneDays}-Day</span></div>
        <p className="mt-3 text-sm font-black text-slate-950">{data.viewer.canManage ? item.employeeName : `${item.milestoneDays}-Day Check-In`}</p>
        <p className={`mt-1 text-xs font-black ${overdue ? "text-red-700" : item.days <= 7 ? "text-amber-800" : "text-slate-600"}`}>{dueLabel(item.dueDate)}</p>
        <p className="mt-2 text-[10px] font-semibold text-slate-500">{shared ? "Review shared — employee acknowledgment needed." : submitted ? "Employee reflection submitted — leadership review is ready." : item.status === "Leadership Draft" ? "Leadership draft is waiting to be shared." : "Time to prepare for the next support conversation."}</p>
      </Link>;
    })}</div>
  </section>;
}
