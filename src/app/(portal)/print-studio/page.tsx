"use client";

import MainLayout from "@/components/layout/MainLayout";
import { PageIntro, PrimaryButton, SecondaryButton, SectionCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { canAccessRoute, useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { initialChildren, type ChildRecord } from "@/lib/children";
import { starterChildSchedules, type ChildScheduleRecord } from "@/lib/child-schedules";
import { starterRoutes, starterShifts, starterTasks, starterVehicles, type Shift, type TransportationRoute, type VehicleRecord, type WorkTask } from "@/lib/hub-data";
import { careLocations, starterLocationHours, type LocationHoursRecord, type LocationKey } from "@/lib/location-config";
import { starterWeeklyMenus, type WeeklyMenu } from "@/lib/meals";
import { buildPrintableSvg, type PrintableKind } from "@/lib/printable-studio";
import { recordAuditEvent } from "@/lib/audit";
import { downloadSvgAsPng, printSvg } from "@/lib/visual-export";
import { localIsoDate } from "@/lib/date-utils";
import { Bot, Bus, CalendarDays, ClipboardCheck, Download, FileText, Palette, Printer, Sparkles, Utensils } from "lucide-react";
import { useMemo, useState } from "react";

const kinds: Array<{ kind: PrintableKind; icon: typeof FileText; route?: string; helper: string }> = [
  { kind: "Daily Ratio Plan", icon: CalendarDays, route: "/ratios", helper: "Who is in care, staff entered, and ratio status by time block" },
  { kind: "Work Plan", icon: ClipboardCheck, route: "/work-plans", helper: "Tasks, initials lines, priorities, and signature area" },
  { kind: "Weekly Menu", icon: Utensils, route: "/meals", helper: "A polished five-day menu board using the current location menu" },
  { kind: "Transportation Board", icon: Bus, route: "/transportation", helper: "Children, schools, drivers, vehicles, pickup times, and route status" },
  { kind: "Staff Notice", icon: FileText, helper: "A bold internal reminder or team announcement with initials lines" },
];

export default function PrintStudioPage() {
  const { profile } = useAuth();
  const { location, availableLocations } = useHubLocation();
  const permittedCareLocations = careLocations.filter((item) => availableLocations.includes(item));
  const startingLocation = location === "All Locations" ? (permittedCareLocations[0] ?? "Halcom") : location;
  const availableKinds = kinds.filter((item) => !item.route || canAccessRoute(profile, item.route));
  const [kind, setKind] = useState<PrintableKind>(availableKinds[0]?.kind ?? "Staff Notice");
  const [selectedLocation, setSelectedLocation] = useState<Exclude<LocationKey, "All Locations">>(startingLocation as Exclude<LocationKey, "All Locations">);
  const [date, setDate] = useState(localIsoDate());
  const [variant, setVariant] = useState(0);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [message, setMessage] = useState("Please review today’s updates, complete assigned tasks, and add your initials before the end of your shift.");
  const [owner, setOwner] = useState("All Staff");

  const [children] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const [schedules] = usePersistentState<ChildScheduleRecord[]>("tcs-child-schedules-v2", starterChildSchedules);
  const [shifts] = usePersistentState<Shift[]>("tcs-shifts", starterShifts);
  const [hours] = usePersistentState<LocationHoursRecord[]>("tcs-location-hours-v2", starterLocationHours);
  const [tasks] = usePersistentState<WorkTask[]>("tcs-work-tasks", starterTasks);
  const [menus] = usePersistentState<WeeklyMenu[]>("tcs-weekly-menus-v1", starterWeeklyMenus);
  const [routes] = usePersistentState<TransportationRoute[]>("tcs-routes", starterRoutes);
  const [vehicles] = usePersistentState<VehicleRecord[]>("tcs-vehicles-v2", starterVehicles);

  const owners = useMemo(() => ["All Staff", ...new Set(tasks.map((task) => task.owner))], [tasks]);
  const svg = useMemo(() => buildPrintableSvg({ kind, location: selectedLocation, date, variant, title, subtitle, message, owner, children, schedules, shifts, hours, tasks, menus, routes, vehicles }), [children, date, hours, kind, menus, message, owner, routes, schedules, selectedLocation, shifts, subtitle, tasks, title, variant, vehicles]);
  const filename = `TCS-${selectedLocation.replaceAll(" ", "-")}-${kind.replaceAll(" ", "-")}-${date}`;

  async function exportPrintable(format: "PNG" | "PRINT") {
    await recordAuditEvent({ action: "EXPORT", tableName: "printable_studio", location: selectedLocation, metadata: { kind, format, date, variant } });
    if (format === "PNG") await downloadSvgAsPng(svg, filename);
    else printSvg(svg, `${selectedLocation} ${kind}`);
  }

  function applySuggestedCopy() {
    if (kind === "Daily Ratio Plan") {
      setTitle("TODAY’S CARE & RATIO PLAN");
      setSubtitle("Who is in care, when they are here, and the staffing entered for each time block");
    } else if (kind === "Work Plan") {
      setTitle(`${owner === "All Staff" ? "TEAM" : owner.toUpperCase()} WORK PLAN`);
      setSubtitle("Complete each task, add staff initials, and review the acknowledgment section");
    } else if (kind === "Weekly Menu") {
      setTitle("THIS WEEK’S MENU");
      setSubtitle("Meals and snacks planned for children in care");
    } else if (kind === "Transportation Board") {
      setTitle("SCHOOL TRANSPORTATION PLAN");
      setSubtitle("Drivers, vehicles, school pickups, and route status");
    } else {
      setTitle("TEAM REMINDER");
      setSubtitle("Internal staff notice • Please review and initial");
    }
  }

  return <MainLayout><div className="mx-auto max-w-[1550px] space-y-6">
    <PageIntro eyebrow="Graphics command center" title="AI Printable Studio" description="Turn live, authorized Hub information into polished phone-ready and printable graphics. Designs automatically use the selected location’s colors." actions={<><SecondaryButton onClick={applySuggestedCopy}><Bot className="h-4 w-4" /> Suggest Headline</SecondaryButton><PrimaryButton onClick={() => void exportPrintable("PNG")}><Download className="h-4 w-4" /> Save PNG</PrimaryButton></>} />

    <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4 text-sm leading-6 text-purple-950"><Sparkles className="mr-2 inline h-4 w-4" /><strong>One studio, multiple tools:</strong> create ratio plans, staff work plans, menus, internal notices, and transportation boards without rebuilding the design each time.</div>

    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <div className="space-y-6">
        <SectionCard title="1. Choose a printable" description="Only tools included in your role appear here.">
          <div className="space-y-2">{availableKinds.map((item) => { const Icon = item.icon; const active = item.kind === kind; return <button key={item.kind} type="button" onClick={() => setKind(item.kind)} className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${active ? "border-[var(--theme-500)] bg-[var(--theme-50)]" : "border-slate-200 hover:border-slate-300"}`}><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm"><Icon className="h-5 w-5 text-[var(--theme-700)]" /></div><div><p className="font-black text-slate-950">{item.kind}</p><p className="mt-1 text-xs leading-5 text-slate-500">{item.helper}</p></div></button>; })}</div>
        </SectionCard>

        <SectionCard title="2. Design controls" description="Change the location, wording, or look before exporting.">
          <div className="space-y-4">
            <label><span className="mb-1.5 block text-sm font-bold">Location</span><select className={inputClass} value={selectedLocation} onChange={(event) => setSelectedLocation(event.target.value as Exclude<LocationKey, "All Locations">)}>{permittedCareLocations.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span className="mb-1.5 block text-sm font-bold">Date</span><input className={inputClass} type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            {kind === "Work Plan" && <label><span className="mb-1.5 block text-sm font-bold">Employee</span><select className={inputClass} value={owner} onChange={(event) => setOwner(event.target.value)}>{owners.map((item) => <option key={item}>{item}</option>)}</select></label>}
            <label><span className="mb-1.5 block text-sm font-bold">Headline</span><input className={inputClass} placeholder="Use the automatic title or enter your own" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
            <label><span className="mb-1.5 block text-sm font-bold">Supporting line</span><textarea className={`${inputClass} min-h-20`} placeholder="Optional" value={subtitle} onChange={(event) => setSubtitle(event.target.value)} /></label>
            {kind === "Staff Notice" && <label><span className="mb-1.5 block text-sm font-bold">Notice message</span><textarea className={`${inputClass} min-h-40`} value={message} onChange={(event) => setMessage(event.target.value)} /></label>}
            <div className="flex flex-wrap gap-2"><SecondaryButton onClick={() => setVariant((current) => current + 1)}><Palette className="h-4 w-4" /> New Look</SecondaryButton><SecondaryButton onClick={() => void exportPrintable("PRINT")}><Printer className="h-4 w-4" /> Print</SecondaryButton></div>
            <StatusBadge tone="purple">Design variation {variant % 4 + 1} of 4</StatusBadge>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Live Preview" description="The image updates as soon as the source data or design controls change.">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 p-3 sm:p-5"><div className="mx-auto max-w-[760px] overflow-hidden rounded-2xl bg-white shadow-xl" dangerouslySetInnerHTML={{ __html: svg }} /></div>
      </SectionCard>
    </div>
  </div></MainLayout>;
}
