"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { initialChildren, type ChildRecord } from "@/lib/children";
import { starterKidKareEnrollments, type KidKareEnrollment } from "@/lib/compliance-ops";
import { starterMealServices, starterWeeklyMenus, type MealServiceRecord, type WeeklyMenu } from "@/lib/meals";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  FileWarning,
  UtensilsCrossed,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

function matchesLocation(value: string, selected: string) {
  if (selected === "All Locations") return true;
  return value.toLowerCase().includes(selected.toLowerCase()) || selected.toLowerCase().includes(value.toLowerCase());
}

export default function CacfpCommandCenterPage() {
  const { location } = useHubLocation();
  const [children] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const [kidKare] = usePersistentState<KidKareEnrollment[]>("tcs-kidkare-enrollments-v1", starterKidKareEnrollments);
  const [mealServices] = usePersistentState<MealServiceRecord[]>("tcs-meal-services-v1", starterMealServices);
  const [menus] = usePersistentState<WeeklyMenu[]>("tcs-weekly-menus-v1", starterWeeklyMenus);

  const activeChildren = children.filter((child) =>
    child.enrollmentStatus !== "Archived" && matchesLocation(child.location, location),
  );
  const kidKareRows = kidKare.filter((row) => matchesLocation(row.location, location));
  const mealRows = mealServices.filter((row) => matchesLocation(row.location, location));
  const menuRows = menus.filter((row) => location === "All Locations" || row.location === location);

  const requiredKidKare = kidKareRows.filter((row) => row.required);
  const enrolled = requiredKidKare.filter((row) => row.status === "Enrolled");
  const kidKareAttention = requiredKidKare.filter((row) => row.status !== "Enrolled");
  const mealLoggedChildren = mealRows.reduce((sum, row) => sum + row.childrenLogged, 0);

  const attention = useMemo(() => {
    const items: string[] = [];
    if (kidKareAttention.length) items.push(`${kidKareAttention.length} KidKare enrollment record${kidKareAttention.length === 1 ? "" : "s"} need attention`);
    if (!menuRows.length) items.push("No weekly menu is stored for the selected location");
    if (!mealRows.length) items.push("No meal-service entries are stored for the selected location");
    return items;
  }, [kidKareAttention.length, mealRows.length, menuRows.length]);

  return <MainLayout><div className="mx-auto max-w-[1450px] space-y-6 pb-12">
    <section className="overflow-hidden rounded-[30px] bg-gradient-to-br from-[#72411f] via-[#a65b28] to-[#315537] p-6 text-white shadow-xl sm:p-8">
      <div><p className="text-xs font-black uppercase tracking-[.18em] text-orange-100">CACFP + meal accountability</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">CACFP Command Center</h1><p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-orange-50/80">Bring KidKare enrollment status, menus, meal-service records, and attendance-related meal counts into one review screen before claims are finalized.</p></div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric icon={<Users className="h-5 w-5" />} label="Active Children" value={activeChildren.length} tone="blue" />
      <Metric icon={<ClipboardCheck className="h-5 w-5" />} label="KidKare Enrolled" value={enrolled.length} tone="green" />
      <Metric icon={<FileWarning className="h-5 w-5" />} label="KidKare Attention" value={kidKareAttention.length} tone={kidKareAttention.length ? "amber" : "green"} />
      <Metric icon={<UtensilsCrossed className="h-5 w-5" />} label="Meal Service Entries" value={mealRows.length} tone="orange" />
      <Metric icon={<BarChart3 className="h-5 w-5" />} label="Children Logged in Meals" value={mealLoggedChildren} tone="purple" />
    </section>

    {attention.length > 0 ? <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-800" /><div><h2 className="font-black text-amber-950">Claim-readiness attention</h2><div className="mt-2 space-y-1">{attention.map((item) => <p key={item} className="text-sm font-semibold text-amber-900">• {item}</p>)}</div></div></div></section> :
      <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5"><CheckCircle2 className="mr-2 inline h-5 w-5 text-emerald-700" /><strong className="text-emerald-950">No obvious CACFP setup gaps found in the currently entered Hub records.</strong></section>}

    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-black text-slate-950">KidKare enrollment status</h2><p className="mt-1 text-xs text-slate-500">Children who still need setup, correction, or submission.</p></div><Link href="/kidkare" className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">Open KidKare</Link></div>
        <div className="mt-4 space-y-2">{kidKareAttention.length === 0 ? <p className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900">All required KidKare records in this scope are marked Enrolled.</p> : kidKareAttention.slice(0, 15).map((row) => <div key={row.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-slate-900">{row.childName}</strong><p className="mt-1 text-[10px] text-slate-500">{row.location}</p></div><span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-black text-amber-900">{row.status}</span></div></div>)}</div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-black text-slate-950">Meal documentation</h2><p className="mt-1 text-xs text-slate-500">Weekly menus and recorded meal services for the selected scope.</p></div><Link href="/meals" className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">Open Meals</Link></div>
        <div className="mt-4 grid grid-cols-2 gap-3"><Info label="Weekly Menus Stored" value={String(menuRows.length)} /><Info label="Meal Services Stored" value={String(mealRows.length)} /><Info label="Total Child Meal Logs" value={String(mealLoggedChildren)} /><Info label="Locations Represented" value={String(new Set(mealRows.map((row) => row.location)).size)} /></div>
      </section>
    </div>

    <div className="grid gap-4 md:grid-cols-3">
      <Quick href="/kidkare" title="KidKare Enrollment" helper="Enrollment status, corrections, child IDs, verification" />
      <Quick href="/meals" title="Menus & Meal Service" helper="Planned foods, actual foods, components, substitutions" />
      <Quick href="/daily-care" title="Daily Care / Meal Intake" helper="Child-level meal participation and care logs" />
    </div>
  </div></MainLayout>;
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "blue" | "green" | "amber" | "orange" | "purple" }) {
  const styles = { blue: "bg-blue-100 text-blue-800", green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-900", orange: "bg-orange-100 text-orange-800", purple: "bg-purple-100 text-purple-800" };
  return <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`grid h-10 w-10 place-items-center rounded-xl ${styles[tone]}`}>{icon}</span><div><strong className="block text-2xl font-black text-slate-950">{value}</strong><span className="text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</span></div></div>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-4 text-center"><span className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</span><strong className="mt-1 block text-xl font-black text-slate-900">{value}</strong></div>;
}
function Quick({ href, title, helper }: { href: string; title: string; helper: string }) {
  return <Link href={href} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:bg-slate-50"><strong className="text-sm text-slate-950">{title}</strong><p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p></Link>;
}
