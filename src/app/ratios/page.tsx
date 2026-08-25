"use client";

import MainLayout from "@/components/layout/MainLayout";
import { PageIntro, PrimaryButton, SecondaryButton, SectionCard, StatCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { starterShifts, type Shift } from "@/lib/hub-data";
import { dateToDayName, starterChildSchedules, timeToMinutes, compactTime, type ChildScheduleRecord } from "@/lib/child-schedules";
import { careLocations, formatClock, locationThemes, starterLocationHours, type LocationHoursRecord, type LocationKey } from "@/lib/location-config";
import { downloadSvg, downloadSvgAsPng, escapeXml, printSvg } from "@/lib/visual-export";
import { recordAuditEvent } from "@/lib/audit";
import { AlertTriangle, CalendarDays, Download, Image as ImageIcon, Palette, Printer, RefreshCw, ShieldCheck, Smartphone, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { localIsoDate } from "@/lib/date-utils";

type TimelineRow = {
  start: number;
  end: number;
  children: string[];
  staff: string[];
  infants: number;
  requiredStaff: number;
  safe: boolean;
};

const dayThemeNames = ["Fresh Start", "Creative Shapes", "Wellness Waves", "Think Big", "Fun Friday", "Weekend Adventure", "Calm Sunday"];

function requiredStaffFor(location: Exclude<LocationKey, "All Locations">, children: number, infants: number) {
  if (!children) return 0;
  if (location === "Division") return Math.ceil(children / 14);
  if (infants > 0) return Math.ceil(children / 6);
  return Math.ceil(children / 8);
}

function buildTimeline(records: ChildScheduleRecord[], shifts: Shift[], location: Exclude<LocationKey, "All Locations">, day: ReturnType<typeof dateToDayName>, opening: number, closing: number) {
  if (closing <= opening) return [] as TimelineRow[];
  const boundaries = new Set<number>([opening, closing]);
  records.forEach((record) => record.days[day].blocks.filter((block) => block.location === location).forEach((block) => {
    boundaries.add(Math.max(opening, timeToMinutes(block.start)));
    boundaries.add(Math.min(closing, timeToMinutes(block.end)));
  }));
  shifts.filter((shift) => shift.day === day && shift.location === location).forEach((shift) => {
    boundaries.add(Math.max(opening, timeToMinutes(shift.start)));
    boundaries.add(Math.min(closing, timeToMinutes(shift.end)));
  });

  const sorted = [...boundaries].filter((value) => value >= opening && value <= closing).sort((a, b) => a - b);
  const rows: TimelineRow[] = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    if (end <= start) continue;
    const midpoint = start + (end - start) / 2;
    const present = records.filter((record) => record.days[day].blocks.some((block) => block.location === location && timeToMinutes(block.start) <= midpoint && timeToMinutes(block.end) > midpoint));
    const staff = shifts.filter((shift) => shift.day === day && shift.location === location && timeToMinutes(shift.start) <= midpoint && timeToMinutes(shift.end) > midpoint).map((shift) => shift.employee);
    const infants = present.filter((record) => record.ageGroup === "Infant").length;
    const requiredStaff = requiredStaffFor(location, present.length, infants);
    const row: TimelineRow = { start, end, children: present.map((record) => record.childName), staff, infants, requiredStaff, safe: staff.length >= requiredStaff };
    const prior = rows.at(-1);
    if (prior && prior.end === row.start && prior.children.join("|") === row.children.join("|") && prior.staff.join("|") === row.staff.join("|") && prior.safe === row.safe) prior.end = row.end;
    else rows.push(row);
  }
  return rows.filter((row) => row.children.length > 0 || row.staff.length > 0);
}

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

function buildRatioSvg(args: {
  location: Exclude<LocationKey, "All Locations">;
  date: string;
  day: ReturnType<typeof dateToDayName>;
  openingText: string;
  closingText: string;
  capacity: number;
  timeline: TimelineRow[];
  contracted: { name: string; time: string }[];
  noCare: string[];
  schoolNote: string;
  minimumDay: string;
  variant: number;
}) {
  const { location, date, day, openingText, closingText, capacity, timeline, contracted, noCare, schoolNote, minimumDay, variant } = args;
  const theme = locationThemes[location];
  const displayDate = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00`));
  const headerHeight = 220;
  const tableX = 320;
  const tableWidth = 710;
  const maxRows = Math.min(timeline.length, 11);
  const rowHeight = Math.max(72, Math.min(96, Math.floor((1050 - headerHeight) / Math.max(maxRows, 1))));
  const svgHeight = 1350;
  const themedTitle = `${dayThemeNames[(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].indexOf(day) + variant) % 7]} • ${location}`;

  const decorations = [
    `<circle cx="1010" cy="72" r="86" fill="${theme.accent}" opacity=".18"/><circle cx="955" cy="130" r="35" fill="white" opacity=".16"/>`,
    `<path d="M840 0 L1080 0 L1080 170 Z" fill="${theme.accent}" opacity=".18"/><path d="M905 24 l18 38 42 6-30 29 7 41-37-20-37 20 7-41-30-29 42-6z" fill="white" opacity=".18"/>`,
    `<path d="M780 150 Q860 80 940 150 T1100 150 V0 H780 Z" fill="${theme.accent}" opacity=".18"/><circle cx="920" cy="62" r="28" fill="white" opacity=".15"/>`,
    `<g opacity=".22" fill="${theme.accent}"><circle cx="875" cy="48" r="10"/><circle cx="930" cy="105" r="16"/><rect x="985" y="35" width="25" height="25" rx="5"/><path d="M1040 105 l14 25 28 4-20 20 5 28-27-13-25 13 5-28-20-20 28-4z"/></g>`,
  ][variant % 4];

  const contractedLines = contracted.slice(0, 14).flatMap((item) => [item.name, `  ${item.time}`]);
  const noCareLines = noCare.length ? noCare.slice(0, 10) : ["None"];
  const timelineRows = timeline.slice(0, maxRows).map((row, index) => {
    const y = headerHeight + index * rowHeight;
    const names = wrapText(row.children.join(", ") || "No children scheduled", 55).slice(0, 3);
    const staff = row.staff.length ? row.staff.join(", ") : "No staff entered";
    const fill = row.safe ? (index % 2 ? "#ffffff" : theme.primarySoft) : "#fff1f2";
    return `<g>
      <rect x="${tableX}" y="${y}" width="${tableWidth}" height="${rowHeight - 6}" rx="15" fill="${fill}" stroke="${row.safe ? theme.primaryLight : "#fb7185"}" stroke-width="1.5"/>
      <text x="${tableX + 18}" y="${y + 30}" font-family="Arial, sans-serif" font-size="18" font-weight="800" fill="#0f172a">${escapeXml(`${compactTime(row.start)}–${compactTime(row.end)}`)}</text>
      ${svgTextLines(names, tableX + 175, y + 25, 19, 'font-family="Arial, sans-serif" font-size="14" font-weight="650" fill="#334155"')}
      <text x="${tableX + 175}" y="${y + rowHeight - 18}" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#64748b">Staff: ${escapeXml(staff)}</text>
      <text x="${tableX + 625}" y="${y + 30}" text-anchor="middle" font-family="Arial, sans-serif" font-size="23" font-weight="900" fill="#0f172a">${row.children.length}</text>
      <text x="${tableX + 625}" y="${y + 52}" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="800" fill="#64748b">CHILDREN</text>
      <text x="${tableX + 625}" y="${y + rowHeight - 15}" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="900" fill="${row.safe ? theme.primaryDark : "#be123c"}">${row.safe ? "IN RATIO" : `REVIEW • NEED ${row.requiredStaff}`}</text>
    </g>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block" width="1080" height="${svgHeight}" viewBox="0 0 1080 ${svgHeight}">
    <defs>
      <linearGradient id="header" x1="0" x2="1"><stop offset="0" stop-color="${theme.primaryDark}"/><stop offset="1" stop-color="${theme.primary}"/></linearGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="7" stdDeviation="10" flood-opacity=".12"/></filter>
      <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="2" fill="${theme.primary}" opacity=".08"/></pattern>
    </defs>
    <rect width="1080" height="${svgHeight}" fill="#f8fafc"/>
    <rect width="1080" height="${svgHeight}" fill="url(#dots)"/>
    <rect x="28" y="24" width="1024" height="176" rx="34" fill="url(#header)" filter="url(#shadow)"/>
    ${decorations}
    <text x="66" y="66" font-family="Arial, sans-serif" font-size="15" font-weight="900" letter-spacing="2" fill="${theme.textOnPrimary}" opacity=".82">TCS DAILY RATIO PLAN</text>
    <text x="66" y="116" font-family="Arial, sans-serif" font-size="38" font-weight="900" fill="${theme.textOnPrimary}">${escapeXml(location)}</text>
    <text x="66" y="148" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="${theme.textOnPrimary}" opacity=".92">${escapeXml(`${day}, ${displayDate} • ${openingText}–${closingText} • Capacity ${capacity}`)}</text>
    <text x="66" y="177" font-family="Arial, sans-serif" font-size="13" font-weight="800" fill="${theme.accent}">${escapeXml(themedTitle)}</text>

    <rect x="28" y="220" width="266" height="1098" rx="26" fill="white" stroke="${theme.primaryLight}" stroke-width="2" filter="url(#shadow)"/>
    <rect x="45" y="240" width="232" height="44" rx="13" fill="${theme.primary}"/>
    <text x="61" y="268" font-family="Arial, sans-serif" font-size="15" font-weight="900" fill="${theme.textOnPrimary}">CONTRACTED TIMES</text>
    ${svgTextLines(contractedLines, 58, 312, 24, 'font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#0f172a"')}
    <line x1="52" y1="${Math.min(760, 320 + contractedLines.length * 24)}" x2="270" y2="${Math.min(760, 320 + contractedLines.length * 24)}" stroke="#e2e8f0"/>
    <text x="58" y="${Math.min(800, 356 + contractedLines.length * 24)}" font-family="Arial, sans-serif" font-size="15" font-weight="900" fill="${theme.primaryDark}">NO CARE</text>
    ${svgTextLines(noCareLines, 58, Math.min(830, 386 + contractedLines.length * 24), 23, 'font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#475569"')}
    <rect x="45" y="1162" width="232" height="136" rx="18" fill="${theme.primarySoft}"/>
    <text x="60" y="1190" font-family="Arial, sans-serif" font-size="12" font-weight="900" fill="${theme.primaryDark}">DAY NOTES</text>
    <text x="60" y="1217" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#334155">School: ${escapeXml(schoolNote || "Regular schedule")}</text>
    <text x="60" y="1243" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#334155">Minimum day: ${escapeXml(minimumDay || "N/A")}</text>
    <text x="60" y="1274" font-family="Arial, sans-serif" font-size="10" font-weight="700" fill="#64748b">Verify live attendance and ages.</text>

    <text x="${tableX + 12}" y="214" font-family="Arial, sans-serif" font-size="13" font-weight="900" fill="#475569">TIME</text>
    <text x="${tableX + 175}" y="214" font-family="Arial, sans-serif" font-size="13" font-weight="900" fill="#475569">WHO IS IN CARE DURING THIS TIME</text>
    <text x="${tableX + 625}" y="214" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="900" fill="#475569">RATIO</text>
    ${timelineRows}
    <text x="1030" y="1328" text-anchor="end" font-family="Arial, sans-serif" font-size="10" font-weight="700" fill="#94a3b8">Generated in TCS Operations Hub • ${escapeXml(location)}</text>
  </svg>`;
}

export default function RatiosPage() {
  const { location: activeLocation, setLocation: setActiveLocation } = useHubLocation();
  const [schedules] = usePersistentState<ChildScheduleRecord[]>("tcs-child-schedules-v2", starterChildSchedules);
  const [hours] = usePersistentState<LocationHoursRecord[]>("tcs-location-hours-v2", starterLocationHours);
  const [shifts] = usePersistentState<Shift[]>("tcs-shifts", starterShifts);
  const [location, setLocation] = useState<Exclude<LocationKey, "All Locations">>(activeLocation === "All Locations" ? "Halcom" : activeLocation);
  const [date, setDate] = useState(() => localIsoDate());
  const [schoolNote, setSchoolNote] = useState("No School • Summer Break");
  const [minimumDay, setMinimumDay] = useState("N/A");
  const [variant, setVariant] = useState(0);

  useEffect(() => { const timeoutId = window.setTimeout(() => { if (activeLocation !== "All Locations") setLocation(activeLocation); }, 0); return () => window.clearTimeout(timeoutId); }, [activeLocation]);
  const day = dateToDayName(date);
  const hoursRecord = hours.find((record) => record.location === location) ?? starterLocationHours[0];
  const dailyHours = hoursRecord.days[day];
  const opening = dailyHours.closed ? 0 : timeToMinutes(dailyHours.open);
  const closing = dailyHours.closed ? 0 : timeToMinutes(dailyHours.close);
  const timeline = useMemo(() => buildTimeline(schedules, shifts, location, day, opening, closing), [schedules, shifts, location, day, opening, closing]);
  const relevant = schedules.filter((record) => record.defaultLocation === location || record.days[day].blocks.some((block) => block.location === location));
  const contracted = relevant.filter((record) => record.days[day].blocks.some((block) => block.location === location)).map((record) => ({ name: record.childName, time: record.days[day].blocks.filter((block) => block.location === location).map((block) => `${compactTime(timeToMinutes(block.start))}–${compactTime(timeToMinutes(block.end))}`).join(" + ") }));
  const noCare = relevant.filter((record) => !record.days[day].blocks.some((block) => block.location === location)).map((record) => record.childName);
  const peak = timeline.reduce((max, row) => Math.max(max, row.children.length), 0);
  const flagged = timeline.filter((row) => !row.safe).length;
  const theme = locationThemes[location];
  const svg = useMemo(() => buildRatioSvg({ location, date, day, openingText: dailyHours.closed ? "Closed" : formatClock(dailyHours.open), closingText: dailyHours.closed ? "Closed" : formatClock(dailyHours.close), capacity: theme.capacity, timeline, contracted, noCare, schoolNote, minimumDay, variant }), [location, date, day, dailyHours, theme.capacity, timeline, contracted, noCare, schoolNote, minimumDay, variant]);
  const filename = `TCS-${location.replaceAll(" ", "-")}-daily-ratios-${date}`;

  async function exportRatio(format: "PNG" | "SVG" | "PRINT") {
    await recordAuditEvent({ action: "EXPORT", tableName: "ratio_plans", location, metadata: { date, day, format, peakChildren: peak, timeBlocks: timeline.length } });
    if (format === "PNG") await downloadSvgAsPng(svg, filename);
    else if (format === "SVG") downloadSvg(svg, filename);
    else printSvg(svg, `${location} Daily Ratio Plan`);
  }

  return <MainLayout><div className="mx-auto max-w-[1600px] space-y-6">
    <PageIntro eyebrow="Printable daily operations" title="Daily Ratio Plan" description="This version uses the exact child schedules and staff shifts to show who is in care during every time block—not just the total headcount." actions={<div className="flex flex-wrap gap-2"><SecondaryButton onClick={() => setVariant((current) => current + 1)}><Palette className="h-4 w-4" /> Switch Theme</SecondaryButton><PrimaryButton onClick={() => void exportRatio("PNG")}><Smartphone className="h-4 w-4" /> Save PNG</PrimaryButton></div>} />

    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><strong>Planning support only:</strong> The image uses entered schedules and shifts. Always confirm live attendance, actual ages, staff qualifications, infant limits, and children moving between locations.</div>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Peak Children" value={peak} helper={`${theme.capacity} entered capacity`} icon={<Users className="h-5 w-5" />} />
      <StatCard label="Time Blocks" value={timeline.length} helper="Changes when a child or staff member arrives/leaves" icon={<CalendarDays className="h-5 w-5" />} tone="blue" />
      <StatCard label="Blocks to Review" value={flagged} icon={flagged ? <AlertTriangle className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />} tone={flagged ? "red" : "emerald"} />
      <StatCard label="Daily Theme" value={dayThemeNames[(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].indexOf(day) + variant) % 7]} helper={`${location} colors`} icon={<ImageIcon className="h-5 w-5" />} tone="purple" />
    </section>

    <SectionCard title="Build the Day" description="The selected location at the top changes the Hub colors. These controls change the ratio image itself.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <label><span className="mb-1.5 block text-sm font-bold">Location</span><select className={inputClass} value={location} onChange={(event) => { const next = event.target.value as Exclude<LocationKey, "All Locations">; setLocation(next); setActiveLocation(next); }}>{careLocations.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span className="mb-1.5 block text-sm font-bold">Date</span><input type="date" className={inputClass} value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label><span className="mb-1.5 block text-sm font-bold">School status</span><input className={inputClass} value={schoolNote} onChange={(event) => setSchoolNote(event.target.value)} /></label>
        <label><span className="mb-1.5 block text-sm font-bold">Minimum day</span><input className={inputClass} value={minimumDay} onChange={(event) => setMinimumDay(event.target.value)} /></label>
        <div><span className="mb-1.5 block text-sm font-bold">Operating hours</span><div className="rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm font-black text-slate-700">{dailyHours.closed ? "Closed" : `${formatClock(dailyHours.open)}–${formatClock(dailyHours.close)}`}</div></div>
      </div>
    </SectionCard>

    <div className="grid gap-6 2xl:grid-cols-[.75fr_1.25fr]">
      <div className="space-y-6">
        <SectionCard title={`${day} Timeline`} description="Automatically created from every arrival and departure"><div className="space-y-3">{timeline.length ? timeline.map((row) => <article key={`${row.start}-${row.end}`} className={`rounded-2xl border p-4 ${row.safe ? "border-slate-200 bg-white" : "border-red-300 bg-red-50"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black text-slate-950">{compactTime(row.start)}–{compactTime(row.end)}</p><p className="mt-2 text-sm leading-6 text-slate-600">{row.children.join(", ") || "No children scheduled"}</p><p className="mt-2 text-xs font-bold text-slate-500">Staff: {row.staff.join(", ") || "No staff entered"}</p></div><div className="text-right"><p className="text-2xl font-black">{row.children.length}</p><StatusBadge tone={row.safe ? "green" : "red"}>{row.safe ? "In Ratio" : `Need ${row.requiredStaff} staff`}</StatusBadge></div></div></article>) : <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">This location is closed or no schedules are entered for {day}.</div>}</div></SectionCard>
      </div>

      <SectionCard title="Printable / Phone Image" description="A different daily theme is combined with the selected location’s colors.">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner"><div className="mx-auto max-w-[720px]" dangerouslySetInnerHTML={{ __html: svg }} /></div>
        <div className="mt-4 flex flex-wrap gap-3"><PrimaryButton onClick={() => void exportRatio("PNG")}><Download className="h-4 w-4" /> Save PNG for Phone</PrimaryButton><SecondaryButton onClick={() => void exportRatio("SVG")}><ImageIcon className="h-4 w-4" /> Save SVG</SecondaryButton><SecondaryButton onClick={() => void exportRatio("PRINT")}><Printer className="h-4 w-4" /> Print</SecondaryButton><SecondaryButton onClick={() => setVariant((current) => current + 1)}><RefreshCw className="h-4 w-4" /> New Look</SecondaryButton></div>
      </SectionCard>
    </div>
  </div></MainLayout>;
}
