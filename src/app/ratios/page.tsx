"use client";

import MainLayout from "@/components/layout/MainLayout";
import { PageIntro, PrimaryButton, SecondaryButton, SectionCard, StatCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { initialChildren, type ChildRecord } from "@/lib/children";
import { compactTime, starterChildSchedules, type ChildScheduleRecord } from "@/lib/child-schedules";
import { localIsoDate } from "@/lib/date-utils";
import { formatClock, locationThemes, normalizeLocation, starterLocationHours, type LocationHoursRecord, type LocationKey } from "@/lib/location-config";
import {
  buildCoverageWindows,
  checkedInAtLocation,
  locationKeyForDbLocation,
  type CoverageWindow,
  type StaffActivityRow,
  type StaffShiftRow,
  type StaffingLocation,
  type StaffingRuleRow,
} from "@/lib/staffing-command";
import { supabase } from "@/lib/supabase/client";
import { recordAuditEvent } from "@/lib/audit";
import { downloadSvg, downloadSvgAsPng, escapeXml, printSvg } from "@/lib/visual-export";
import { AlertTriangle, CheckCircle2, Download, Image as ImageIcon, LoaderCircle, Palette, Printer, RefreshCw, ShieldAlert, ShieldCheck, Smartphone, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

function wrapText(value: string, maxChars: number) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else current = next;
  });
  if (current) lines.push(current);
  return lines;
}

function svgTextLines(lines: string[], x: number, y: number, lineHeight: number, attrs: string) {
  return lines.map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" ${attrs}>${escapeXml(line)}</text>`).join("");
}

function ruleLabel(window: CoverageWindow) {
  if (window.status === "rule-needed") return "RULE NEEDED";
  if (window.status === "over-capacity") return "OVER CAPACITY";
  if (window.status === "gap") return `NEED ${window.requiredStaff ?? "?"} STAFF`;
  if (window.status === "tight") return "AT MINIMUM";
  return "COVERED";
}

function buildCoverageSvg(args: {
  location: StaffingLocation;
  locationKey: Exclude<LocationKey, "All Locations">;
  date: string;
  openingText: string;
  closingText: string;
  windows: CoverageWindow[];
  schoolNote: string;
  minimumDay: string;
  variant: number;
}) {
  const { location, locationKey, date, openingText, closingText, windows, schoolNote, minimumDay, variant } = args;
  const theme = locationThemes[locationKey];
  const displayDate = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00`));
  const rowHeight = Math.max(76, Math.min(104, Math.floor(850 / Math.max(1, Math.min(windows.length, 10)))));
  const rows = windows.slice(0, 10).map((window, index) => {
    const y = 300 + index * rowHeight;
    const statusColor = window.status === "covered" ? theme.primary : window.status === "tight" ? "#d97706" : window.status === "rule-needed" ? "#7c3aed" : "#be123c";
    const fill = index % 2 ? "#ffffff" : theme.primarySoft;
    const children = wrapText(window.children.map((child) => child.childName).join(", ") || "No children scheduled", 58).slice(0, 2);
    const staff = wrapText(window.staffNames.join(", ") || "No floor staff", 42).slice(0, 2);
    const offFloor = wrapText(window.offFloorNames.length ? `Off floor: ${window.offFloorNames.join(", ")}` : "", 42).slice(0, 1);
    return `<g>
      <rect x="46" y="${y}" width="988" height="${rowHeight - 8}" rx="18" fill="${fill}" stroke="${statusColor}" stroke-width="1.5"/>
      <text x="68" y="${y + 30}" font-family="Arial,sans-serif" font-size="18" font-weight="900" fill="#0f172a">${escapeXml(`${compactTime(window.start)}–${compactTime(window.end)}`)}</text>
      ${svgTextLines(children, 250, y + 26, 20, 'font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#334155"')}
      <text x="620" y="${y + 28}" font-family="Arial,sans-serif" font-size="22" font-weight="900" fill="#0f172a">${window.childCount}</text>
      <text x="620" y="${y + 49}" font-family="Arial,sans-serif" font-size="10" font-weight="900" fill="#64748b">CHILDREN</text>
      <text x="735" y="${y + 28}" font-family="Arial,sans-serif" font-size="22" font-weight="900" fill="#0f172a">${window.staffCount}</text>
      <text x="735" y="${y + 49}" font-family="Arial,sans-serif" font-size="10" font-weight="900" fill="#64748b">FLOOR STAFF</text>
      <text x="842" y="${y + 28}" font-family="Arial,sans-serif" font-size="22" font-weight="900" fill="#0f172a">${window.requiredStaff ?? "—"}</text>
      <text x="842" y="${y + 49}" font-family="Arial,sans-serif" font-size="10" font-weight="900" fill="#64748b">REQUIRED</text>
      <text x="1002" y="${y + 29}" text-anchor="end" font-family="Arial,sans-serif" font-size="12" font-weight="900" fill="${statusColor}">${escapeXml(ruleLabel(window))}</text>
      ${svgTextLines(staff, 250, y + rowHeight - 31, 17, 'font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#64748b"')}
      ${offFloor.length ? svgTextLines(offFloor, 620, y + rowHeight - 23, 16, 'font-family="Arial,sans-serif" font-size="10" font-weight="800" fill="#b45309"') : ""}
    </g>`;
  }).join("");

  const decoration = [
    `<circle cx="940" cy="94" r="100" fill="${theme.accent}" opacity=".18"/><circle cx="1000" cy="45" r="35" fill="white" opacity=".14"/>`,
    `<path d="M800 0h280v190z" fill="${theme.accent}" opacity=".2"/><circle cx="944" cy="72" r="48" fill="white" opacity=".11"/>`,
    `<path d="M770 175q95-120 190 0t190 0V0H770z" fill="${theme.accent}" opacity=".18"/>`,
  ][variant % 3];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1400" viewBox="0 0 1080 1400">
    <defs><linearGradient id="header" x1="0" x2="1"><stop offset="0" stop-color="${theme.primaryDark}"/><stop offset="1" stop-color="${theme.primary}"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="7" stdDeviation="12" flood-opacity=".13"/></filter></defs>
    <rect width="1080" height="1400" fill="#f8fafc"/>
    <rect x="28" y="24" width="1024" height="220" rx="34" fill="url(#header)" filter="url(#shadow)"/>
    ${decoration}
    <text x="64" y="68" font-family="Arial,sans-serif" font-size="14" font-weight="900" letter-spacing="2" fill="${theme.textOnPrimary}" opacity=".8">TCS LIVE STAFFING + RATIO PLAN</text>
    <text x="64" y="122" font-family="Arial,sans-serif" font-size="40" font-weight="900" fill="${theme.textOnPrimary}">${escapeXml(location.name)}</text>
    <text x="64" y="157" font-family="Arial,sans-serif" font-size="17" font-weight="800" fill="${theme.textOnPrimary}">${escapeXml(displayDate)}</text>
    <text x="64" y="188" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="${theme.textOnPrimary}" opacity=".9">${escapeXml(`${openingText}–${closingText} • Licensed/entered capacity ${location.capacity}`)}</text>
    <text x="64" y="217" font-family="Arial,sans-serif" font-size="12" font-weight="900" fill="${theme.accent}">Uses verified TCS staffing rules only • Transportation and other off-floor duties are subtracted</text>

    <text x="68" y="282" font-family="Arial,sans-serif" font-size="11" font-weight="900" fill="#64748b">TIME</text>
    <text x="250" y="282" font-family="Arial,sans-serif" font-size="11" font-weight="900" fill="#64748b">CHILDREN + FLOOR STAFF</text>
    <text x="620" y="282" font-family="Arial,sans-serif" font-size="11" font-weight="900" fill="#64748b">COUNTS</text>
    <text x="1002" y="282" text-anchor="end" font-family="Arial,sans-serif" font-size="11" font-weight="900" fill="#64748b">STATUS</text>
    ${rows}

    <rect x="46" y="1220" width="988" height="130" rx="22" fill="white" stroke="#e2e8f0"/>
    <text x="68" y="1252" font-family="Arial,sans-serif" font-size="12" font-weight="900" fill="${theme.primaryDark}">DAY NOTES</text>
    <text x="68" y="1282" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="#475569">School status: ${escapeXml(schoolNote || "Regular schedule")}</text>
    <text x="68" y="1308" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="#475569">Minimum day: ${escapeXml(minimumDay || "N/A")}</text>
    <text x="68" y="1334" font-family="Arial,sans-serif" font-size="10" font-weight="700" fill="#64748b">Live attendance must still be checked against the plan. “Rule Needed” means no verified staffing rule is configured for that interval.</text>
    <text x="1030" y="1380" text-anchor="end" font-family="Arial,sans-serif" font-size="10" font-weight="700" fill="#94a3b8">Generated in TCS Operations Hub</text>
  </svg>`;
}

export default function RatiosPage() {
  const { location: activeLocation, setLocation: setActiveLocation } = useHubLocation();
  const [schedules] = usePersistentState<ChildScheduleRecord[]>("tcs-child-schedules-v2", starterChildSchedules);
  const [children] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const [hours] = usePersistentState<LocationHoursRecord[]>("tcs-location-hours-v2", starterLocationHours);
  const [locations, setLocations] = useState<StaffingLocation[]>([]);
  const [shifts, setShifts] = useState<StaffShiftRow[]>([]);
  const [activities, setActivities] = useState<StaffActivityRow[]>([]);
  const [rules, setRules] = useState<StaffingRuleRow[]>([]);
  const [date, setDate] = useState(() => localIsoDate());
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [schoolNote, setSchoolNote] = useState("Regular school schedule");
  const [minimumDay, setMinimumDay] = useState("N/A");
  const [variant, setVariant] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [locationResult, shiftResult, activityResult, ruleResult] = await Promise.all([
      supabase.from("locations").select("id,slug,name,full_name,capacity,program_type").eq("is_active", true).order("name"),
      supabase.from("staff_shifts").select("id,location_id,user_id,staff_name,shift_date,start_time,end_time,status,position_label,notes").eq("shift_date", date).order("start_time"),
      supabase.from("staff_activity_intervals").select("id,location_id,shift_id,user_id,staff_name,activity_date,start_time,end_time,activity_type,counts_toward_floor,reason,source_key").eq("activity_date", date).order("start_time"),
      supabase.from("staffing_rules").select("id,location_id,rule_name,age_group,children_per_staff,minimum_staff,maximum_group_size,effective_from,effective_to,source_type,source_note,is_active").eq("is_active", true).order("effective_from", { ascending: false }),
    ]);
    const failure = locationResult.error || shiftResult.error || activityResult.error || ruleResult.error;
    if (failure) setError(failure.message);
    else {
      setError("");
      setLocations((locationResult.data ?? []) as StaffingLocation[]);
      setShifts((shiftResult.data ?? []) as StaffShiftRow[]);
      setActivities((activityResult.data ?? []) as StaffActivityRow[]);
      setRules((ruleResult.data ?? []) as StaffingRuleRow[]);
    }
    setLoading(false);
  }, [date]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("ratio-live-coverage")
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_shifts" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_activity_intervals" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "staffing_rules" }, () => void load())
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [load]);

  useEffect(() => {
    if (!locations.length) return;
    const preferred = activeLocation === "All Locations"
      ? locations[0]
      : locations.find((item) => locationKeyForDbLocation(item) === activeLocation);
    if (preferred && preferred.id !== selectedLocationId) setSelectedLocationId(preferred.id);
  }, [activeLocation, locations, selectedLocationId]);

  const selectedLocation = locations.find((item) => item.id === selectedLocationId) ?? locations[0] ?? null;
  const locationKey = selectedLocation ? locationKeyForDbLocation(selectedLocation) : null;
  const hoursRecord = locationKey ? hours.find((record) => record.location === locationKey) : null;
  const day = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date(`${date}T12:00:00`)) as keyof LocationHoursRecord["days"];
  const dailyHours = hoursRecord?.days[day] ?? { closed: false, open: "06:00", close: "18:00" };
  const windows = useMemo(() => selectedLocation ? buildCoverageWindows({
    date,
    location: selectedLocation,
    schedules,
    shifts,
    activities,
    rules,
  }) : [], [activities, date, rules, schedules, selectedLocation, shifts]);

  const peak = windows.reduce((max, window) => Math.max(max, window.childCount), 0);
  const flagged = windows.filter((window) => ["gap", "over-capacity", "rule-needed"].includes(window.status));
  const releaseWindows = windows.filter((window) => window.requiredStaff !== null && window.staffCount > window.requiredStaff);
  const maxExtraStaff = releaseWindows.reduce((max, window) => Math.max(max, window.staffCount - (window.requiredStaff ?? window.staffCount)), 0);
  const today = localIsoDate();
  const liveCheckedIn = selectedLocation && date === today ? checkedInAtLocation(children, selectedLocation, date).length : null;
  const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const currentWindow = date === today ? windows.find((window) => window.start <= currentMinutes && window.end > currentMinutes) : null;

  const svg = useMemo(() => {
    if (!selectedLocation || !locationKey) return "";
    return buildCoverageSvg({
      location: selectedLocation,
      locationKey,
      date,
      openingText: dailyHours.closed ? "Closed" : formatClock(dailyHours.open),
      closingText: dailyHours.closed ? "Closed" : formatClock(dailyHours.close),
      windows,
      schoolNote,
      minimumDay,
      variant,
    });
  }, [dailyHours, date, locationKey, minimumDay, schoolNote, selectedLocation, variant, windows]);

  const filename = selectedLocation ? `TCS-${selectedLocation.name.replaceAll(" ", "-")}-live-staffing-${date}` : `TCS-live-staffing-${date}`;

  async function exportPlan(format: "PNG" | "SVG" | "PRINT") {
    if (!selectedLocation || !locationKey || !svg) return;
    await recordAuditEvent({
      action: "EXPORT",
      tableName: "staffing_coverage",
      location: locationKey,
      metadata: { date, format, peakChildren: peak, coverageWindows: windows.length, flaggedWindows: flagged.length },
    });
    if (format === "PNG") await downloadSvgAsPng(svg, filename);
    else if (format === "SVG") downloadSvg(svg, filename);
    else printSvg(svg, `${selectedLocation.name} Live Staffing Plan`);
  }

  function chooseLocation(id: string) {
    setSelectedLocationId(id);
    const match = locations.find((item) => item.id === id);
    const key = match ? locationKeyForDbLocation(match) : null;
    if (key) setActiveLocation(key);
  }

  return <MainLayout><div className="mx-auto max-w-[1600px] space-y-6 pb-12">
    <PageIntro eyebrow="One staffing truth across the Hub" title="Live Ratio + Coverage Plan" description="This page now uses the same staffing engine as the Staffing Command Center. Child schedules create demand, verified rules calculate required staffing, and transportation/break/admin blocks remove staff from floor coverage." actions={<div className="flex flex-wrap gap-2"><SecondaryButton onClick={() => setVariant((current) => current + 1)}><Palette className="h-4 w-4" /> New Look</SecondaryButton><PrimaryButton onClick={() => void exportPlan("PNG")}><Smartphone className="h-4 w-4" /> Save PNG</PrimaryButton></div>} />

    <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm font-semibold leading-6 text-violet-950"><strong>No guessed ratios:</strong> if a verified staffing rule is not configured for a location/age group, the Hub shows <strong>Rule Needed</strong> instead of making up a number.</div>
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900">{error}</div>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard label="Peak Scheduled" value={peak} helper={selectedLocation ? `Capacity ${selectedLocation.capacity}` : "Loading location"} icon={<Users className="h-5 w-5" />} />
      <StatCard label="Checked In Now" value={liveCheckedIn ?? "—"} helper={date === today ? "Live Check-In / Check-Out" : "Select today for live count"} icon={<CheckCircle2 className="h-5 w-5" />} tone="emerald" />
      <StatCard label="Coverage Windows" value={windows.length} helper="Arrival, departure, shift, or duty changes" icon={<ShieldCheck className="h-5 w-5" />} tone="blue" />
      <StatCard label="Needs Attention" value={flagged.length} helper="Gap, capacity, or missing verified rule" icon={flagged.length ? <ShieldAlert className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />} tone={flagged.length ? "red" : "emerald"} />
      <StatCard label="Potential Extra Staff" value={maxExtraStaff} helper={releaseWindows.length ? `${releaseWindows.length} review window${releaseWindows.length === 1 ? "" : "s"}` : "No excess coverage calculated"} icon={<Users className="h-5 w-5" />} tone={maxExtraStaff ? "amber" : "emerald"} />
    </section>

    <SectionCard title="Build the Day" description="Location, date, school notes, and minimum-day information feed the daily printable view.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <label><span className="mb-1.5 block text-sm font-bold">Location</span><select className={inputClass} value={selectedLocationId} onChange={(event) => chooseLocation(event.target.value)}>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span className="mb-1.5 block text-sm font-bold">Date</span><input type="date" className={inputClass} value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label><span className="mb-1.5 block text-sm font-bold">School status</span><input className={inputClass} value={schoolNote} onChange={(event) => setSchoolNote(event.target.value)} /></label>
        <label><span className="mb-1.5 block text-sm font-bold">Minimum day</span><input className={inputClass} value={minimumDay} onChange={(event) => setMinimumDay(event.target.value)} /></label>
        <div><span className="mb-1.5 block text-sm font-bold">Operating hours</span><div className="rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm font-black text-slate-700">{dailyHours.closed ? "Closed" : `${formatClock(dailyHours.open)}–${formatClock(dailyHours.close)}`}</div></div>
      </div>
    </SectionCard>

    {loading ? <div className="flex min-h-72 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-sm font-black text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading live coverage…</div> : <div className="grid gap-6 2xl:grid-cols-[.78fr_1.22fr]">
      <div className="space-y-6">
        <SectionCard title="Live Coverage Timeline" description="The same intervals and rules used by the Staffing Command Center.">
          <div className="space-y-3">{windows.length ? windows.map((window) => {
            const tone = window.status === "covered" ? "green" : window.status === "tight" ? "amber" : "red";
            const rowClass = window.status === "covered" ? "border-emerald-200 bg-emerald-50/50" : window.status === "tight" ? "border-amber-200 bg-amber-50" : window.status === "rule-needed" ? "border-violet-200 bg-violet-50" : "border-red-200 bg-red-50";
            return <article key={`${window.start}-${window.end}`} className={`rounded-2xl border p-4 ${rowClass}`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div><p className="font-black text-slate-950">{compactTime(window.start)}–{compactTime(window.end)}</p><p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{window.children.map((child) => child.childName).join(", ") || "No children scheduled"}</p><p className="mt-2 text-xs font-bold text-slate-500">Floor staff: {window.staffNames.join(", ") || "None"}</p>{window.offFloorNames.length > 0 && <p className="mt-1 text-xs font-black text-amber-700">Off floor: {window.offFloorNames.join(", ")}</p>}</div>
                <div className="min-w-40 text-right"><p className="text-2xl font-black">{window.childCount} kids • {window.staffCount} staff</p><StatusBadge tone={tone}>{window.status === "rule-needed" ? "Rule Needed" : window.status === "over-capacity" ? "Over Capacity" : window.status === "gap" ? `Need ${window.requiredStaff ?? "?"} Staff` : window.status === "tight" ? "At Minimum" : "Covered"}</StatusBadge></div>
              </div>
            </article>;
          }) : <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500">No child schedules or staff shifts are entered for this location on this date.</div>}</div>
        </SectionCard>

        <SectionCard title="Right Now" description="Live operations view for today.">
          {date !== today ? <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">Select today to see the current coverage interval.</div> : currentWindow ? <div className={`rounded-2xl border p-5 ${currentWindow.status === "covered" ? "border-emerald-200 bg-emerald-50" : currentWindow.status === "tight" ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}><div className="flex items-start gap-3">{["covered","tight"].includes(currentWindow.status) ? <ShieldCheck className="mt-0.5 h-6 w-6 text-emerald-700" /> : <AlertTriangle className="mt-0.5 h-6 w-6 text-red-700" />}<div><p className="font-black text-slate-950">{compactTime(currentWindow.start)}–{compactTime(currentWindow.end)}</p><p className="mt-1 text-sm font-bold text-slate-700">{currentWindow.childCount} scheduled • {liveCheckedIn ?? 0} checked in • {currentWindow.staffCount} floor staff • {currentWindow.requiredStaff ?? "No verified requirement"} required</p></div></div></div> : <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">No active schedule window right now.</div>}
        </SectionCard>
      </div>

      <SectionCard title="Printable / Phone Coverage Plan" description="This export is built from the exact same live coverage windows—not a separate spreadsheet calculation.">
        {svg ? <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner"><div className="mx-auto max-w-[760px]" dangerouslySetInnerHTML={{ __html: svg }} /></div> : <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-slate-300 text-sm font-bold text-slate-500">Choose a location to generate the plan.</div>}
        <div className="mt-4 flex flex-wrap gap-3"><PrimaryButton onClick={() => void exportPlan("PNG")}><Download className="h-4 w-4" /> Save PNG for Phone</PrimaryButton><SecondaryButton onClick={() => void exportPlan("SVG")}><ImageIcon className="h-4 w-4" /> Save SVG</SecondaryButton><SecondaryButton onClick={() => void exportPlan("PRINT")}><Printer className="h-4 w-4" /> Print</SecondaryButton><SecondaryButton onClick={() => setVariant((current) => current + 1)}><RefreshCw className="h-4 w-4" /> New Look</SecondaryButton></div>
      </SectionCard>
    </div>}
  </div></MainLayout>;
}
