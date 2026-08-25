import type { ChildRecord } from "@/lib/children";
import type { ChildScheduleRecord } from "@/lib/child-schedules";
import type { Shift, TransportationRoute, VehicleRecord, WorkTask } from "@/lib/hub-data";
import type { WeeklyMenu } from "@/lib/meals";
import { menuDayOrder, mealTypes } from "@/lib/meals";
import type { LocationHoursRecord, LocationKey } from "@/lib/location-config";
import { locationThemes } from "@/lib/location-config";
import { buildCoverageWindows, type OperationsIntelligenceInput } from "@/lib/operations-intelligence";
import { escapeXml } from "@/lib/visual-export";

export type PrintableKind = "Daily Ratio Plan" | "Work Plan" | "Weekly Menu" | "Staff Notice" | "Transportation Board";

export type PrintableStudioInput = {
  kind: PrintableKind;
  location: Exclude<LocationKey, "All Locations">;
  date: string;
  variant: number;
  title: string;
  subtitle: string;
  message: string;
  owner: string;
  children: ChildRecord[];
  schedules: ChildScheduleRecord[];
  shifts: Shift[];
  hours: LocationHoursRecord[];
  tasks: WorkTask[];
  menus: WeeklyMenu[];
  routes: TransportationRoute[];
  vehicles: VehicleRecord[];
};

function wrap(value: string, maxChars: number, maxLines = 4) {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else line = next;
  });
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

function textLines(lines: string[], x: number, y: number, lineHeight: number, attrs: string) {
  return lines.map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" ${attrs}>${escapeXml(line)}</text>`).join("");
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function decorations(variant: number, accent: string) {
  const options = [
    `<circle cx="975" cy="95" r="120" fill="${accent}" opacity=".20"/><circle cx="890" cy="70" r="22" fill="white" opacity=".24"/>`,
    `<path d="M760 0h320v230z" fill="${accent}" opacity=".22"/><path d="M920 48l18 38 42 6-30 29 7 42-37-20-37 20 7-42-30-29 42-6z" fill="white" opacity=".22"/>`,
    `<path d="M760 180 Q850 60 940 175 T1110 150 V0 H760 Z" fill="${accent}" opacity=".22"/><g fill="white" opacity=".18"><circle cx="870" cy="65" r="16"/><circle cx="945" cy="110" r="25"/><rect x="1005" y="40" width="34" height="34" rx="9"/></g>`,
    `<g fill="${accent}" opacity=".20"><circle cx="840" cy="42" r="14"/><circle cx="900" cy="96" r="24"/><circle cx="978" cy="45" r="36"/><rect x="1010" y="112" width="42" height="42" rx="12"/></g>`,
  ];
  return options[variant % options.length];
}

function baseStart(input: PrintableStudioInput, body: string, footer = "Generated in TCS Operations Hub • Internal staff use") {
  const theme = locationThemes[input.location];
  const displayTitle = input.title.trim() || input.kind.toUpperCase();
  const displaySubtitle = input.subtitle.trim() || `${theme.fullName} • ${dateLabel(input.date)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" style="width:100%;height:auto;display:block">
  <defs>
    <linearGradient id="hero" x1="0" x2="1"><stop offset="0" stop-color="${theme.primaryDark}"/><stop offset="1" stop-color="${theme.primary}"/></linearGradient>
    <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="2" fill="${theme.primary}" opacity=".07"/></pattern>
    <filter id="shadow"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-opacity=".12"/></filter>
  </defs>
  <rect width="1080" height="1350" fill="#f8fafc"/><rect width="1080" height="1350" fill="url(#dots)"/>
  <rect x="28" y="24" width="1024" height="205" rx="38" fill="url(#hero)" filter="url(#shadow)"/>
  ${decorations(input.variant, theme.accent)}
  <text x="70" y="70" font-family="Arial, sans-serif" font-size="15" font-weight="900" letter-spacing="2.2" fill="${theme.textOnPrimary}" opacity=".78">TCS AI PRINTABLE STUDIO</text>
  <text x="70" y="126" font-family="Arial, sans-serif" font-size="38" font-weight="900" fill="${theme.textOnPrimary}">${escapeXml(displayTitle)}</text>
  ${textLines(wrap(displaySubtitle, 88, 2), 70, 163, 24, `font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="${theme.textOnPrimary}" opacity=".9"`)}
  ${body}
  <text x="540" y="1320" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="800" fill="#64748b">${escapeXml(footer)}</text>
  </svg>`;
}

function ratioBody(input: PrintableStudioInput) {
  const ops: OperationsIntelligenceInput = {
    date: input.date,
    accessibleLocations: [input.location],
    children: input.children,
    schedules: input.schedules,
    shifts: input.shifts,
    routes: input.routes,
    vehicles: input.vehicles,
    hours: input.hours,
  };
  const theme = locationThemes[input.location];
  const windows = buildCoverageWindows(ops).filter((window) => window.location === input.location).slice(0, 11);
  const rows = windows.map((window, index) => {
    const y = 280 + index * 84;
    const childLines = wrap(window.childNames.join(", ") || "No children entered", 66, 2);
    return `<g>
      <rect x="55" y="${y}" width="970" height="72" rx="18" fill="${window.inRatio ? (index % 2 ? "#ffffff" : theme.primarySoft) : "#fff1f2"}" stroke="${window.inRatio ? theme.primaryLight : "#fb7185"}"/>
      <text x="78" y="${y + 29}" font-family="Arial, sans-serif" font-size="18" font-weight="900" fill="#0f172a">${escapeXml(`${clock(window.start)}–${clock(window.end)}`)}</text>
      ${textLines(childLines, 275, y + 25, 18, 'font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#334155"')}
      <text x="275" y="${y + 59}" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#64748b">Staff: ${escapeXml(window.staffNames.join(", ") || "No staff entered")}</text>
      <text x="918" y="${y + 28}" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="900" fill="#0f172a">${window.childCount}</text>
      <text x="918" y="${y + 49}" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="900" fill="${window.inRatio ? theme.primaryDark : "#be123c"}">${window.inRatio ? "IN RATIO" : `NEED ${window.requiredStaff} STAFF`}</text>
    </g>`;
  }).join("");
  if (!rows) return `<rect x="55" y="285" width="970" height="220" rx="28" fill="white" stroke="#cbd5e1"/><text x="540" y="385" text-anchor="middle" font-family="Arial, sans-serif" font-size="23" font-weight="900" fill="#334155">No schedule windows entered for this date.</text>`;
  return `<text x="55" y="267" font-family="Arial, sans-serif" font-size="13" font-weight="900" fill="#64748b" letter-spacing="1.2">TIME • WHO IS IN CARE • STAFF • RATIO</text>${rows}`;
}

function workPlanBody(input: PrintableStudioInput) {
  const theme = locationThemes[input.location];
  const tasks = input.tasks.filter((task) => (input.owner === "All Staff" || task.owner === input.owner) && (task.location === "All Sites" || task.location === input.location)).slice(0, 12);
  const rows = tasks.map((task, index) => {
    const y = 286 + index * 72;
    return `<g><rect x="55" y="${y}" width="970" height="60" rx="15" fill="${index % 2 ? "#ffffff" : theme.primarySoft}" stroke="${theme.primaryLight}"/><rect x="76" y="${y + 18}" width="24" height="24" rx="6" fill="white" stroke="${theme.primary}" stroke-width="2"/>${textLines(wrap(task.title, 68, 2), 120, y + 25, 17, 'font-family="Arial, sans-serif" font-size="14" font-weight="800" fill="#0f172a"')}<text x="810" y="${y + 25}" font-family="Arial, sans-serif" font-size="11" font-weight="800" fill="#64748b">${escapeXml(task.due)} • ${escapeXml(task.priority)}</text><line x1="900" y1="${y + 36}" x2="995" y2="${y + 36}" stroke="#64748b"/><text x="947" y="${y + 52}" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" font-weight="800" fill="#64748b">INITIALS</text></g>`;
  }).join("");
  return `${rows || `<text x="540" y="390" text-anchor="middle" font-family="Arial, sans-serif" font-size="23" font-weight="900" fill="#334155">No tasks entered for this employee and location.</text>`}<g><line x1="90" y1="1215" x2="385" y2="1215" stroke="#334155"/><text x="90" y="1238" font-family="Arial, sans-serif" font-size="11" font-weight="800" fill="#64748b">EMPLOYEE SIGNATURE</text><line x1="430" y1="1215" x2="675" y2="1215" stroke="#334155"/><text x="430" y="1238" font-family="Arial, sans-serif" font-size="11" font-weight="800" fill="#64748b">DATE</text><line x1="720" y1="1215" x2="990" y2="1215" stroke="#334155"/><text x="720" y="1238" font-family="Arial, sans-serif" font-size="11" font-weight="800" fill="#64748b">SUPERVISOR INITIALS</text></g>`;
}

function menuBody(input: PrintableStudioInput) {
  const theme = locationThemes[input.location];
  const menu = input.menus.find((item) => item.location === input.location);
  if (!menu) return `<text x="540" y="390" text-anchor="middle" font-family="Arial, sans-serif" font-size="23" font-weight="900" fill="#334155">No weekly menu has been entered for this location.</text>`;
  const dayWidth = 184;
  const mealRows = mealTypes.map((meal, mealIndex) => {
    const y = 360 + mealIndex * 158;
    return `${menuDayOrder.slice(0, 5).map((day, dayIndex) => {
      const slot = menu.days[day][meal];
      const x = 70 + dayIndex * 196;
      return `<g><rect x="${x}" y="${y}" width="${dayWidth}" height="136" rx="18" fill="${mealIndex % 2 ? "#ffffff" : theme.primarySoft}" stroke="${theme.primaryLight}"/><text x="${x + 14}" y="${y + 24}" font-family="Arial, sans-serif" font-size="11" font-weight="900" fill="${theme.primaryDark}">${escapeXml(meal.toUpperCase())}</text>${textLines(wrap(slot.plannedFoods || "Not entered", 22, 5), x + 14, y + 49, 17, 'font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#334155"')}</g>`;
    }).join("")}`;
  }).join("");
  const headers = menuDayOrder.slice(0, 5).map((day, index) => `<text x="${162 + index * 196}" y="315" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="900" fill="#0f172a">${escapeXml(day)}</text>`).join("");
  return `<text x="70" y="268" font-family="Arial, sans-serif" font-size="14" font-weight="900" fill="#64748b">WEEK OF ${escapeXml(menu.weekOf)}</text>${headers}${mealRows}`;
}

function noticeBody(input: PrintableStudioInput) {
  const theme = locationThemes[input.location];
  const lines = wrap(input.message || "Enter the staff notice message in the Printable Studio controls.", 62, 12);
  return `<rect x="70" y="290" width="940" height="760" rx="42" fill="white" stroke="${theme.primaryLight}" stroke-width="2" filter="url(#shadow)"/><circle cx="540" cy="380" r="62" fill="${theme.primarySoft}"/><text x="540" y="397" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" font-weight="900" fill="${theme.primaryDark}">!</text>${textLines(lines, 540, 505, 45, 'text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="800" fill="#0f172a"')}<rect x="255" y="1080" width="570" height="84" rx="24" fill="${theme.primary}"/><text x="540" y="1132" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="900" fill="${theme.textOnPrimary}">PLEASE REVIEW & INITIAL</text><line x1="250" y1="1225" x2="480" y2="1225" stroke="#334155"/><text x="250" y="1248" font-family="Arial, sans-serif" font-size="11" font-weight="800" fill="#64748b">STAFF INITIALS</text><line x1="600" y1="1225" x2="830" y2="1225" stroke="#334155"/><text x="600" y="1248" font-family="Arial, sans-serif" font-size="11" font-weight="800" fill="#64748b">DATE</text>`;
}

function transportationBody(input: PrintableStudioInput) {
  const theme = locationThemes[input.location];
  const routes = input.routes.filter((route) => route.location === input.location || route.location === "All Sites").slice(0, 12);
  const rows = routes.map((route, index) => {
    const y = 300 + index * 72;
    return `<g><rect x="55" y="${y}" width="970" height="60" rx="15" fill="${index % 2 ? "#ffffff" : theme.primarySoft}" stroke="${theme.primaryLight}"/><text x="76" y="${y + 25}" font-family="Arial, sans-serif" font-size="15" font-weight="900" fill="#0f172a">${escapeXml(route.child)}</text><text x="76" y="${y + 46}" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#64748b">${escapeXml(route.school)} • ${escapeXml(route.days)}</text><text x="620" y="${y + 25}" font-family="Arial, sans-serif" font-size="12" font-weight="800" fill="#334155">${escapeXml(route.pickup)} • ${escapeXml(route.driver || "Driver TBD")}</text><text x="620" y="${y + 46}" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#64748b">${escapeXml(route.vehicle || "Vehicle TBD")}</text><text x="970" y="${y + 35}" text-anchor="end" font-family="Arial, sans-serif" font-size="11" font-weight="900" fill="${route.status === "Confirmed" ? theme.primaryDark : "#b45309"}">${escapeXml(route.status.toUpperCase())}</text></g>`;
  }).join("");
  return rows || `<text x="540" y="390" text-anchor="middle" font-family="Arial, sans-serif" font-size="23" font-weight="900" fill="#334155">No transportation routes entered for this location.</text>`;
}

function clock(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function buildPrintableSvg(input: PrintableStudioInput) {
  const body = input.kind === "Daily Ratio Plan"
    ? ratioBody(input)
    : input.kind === "Work Plan"
      ? workPlanBody(input)
      : input.kind === "Weekly Menu"
        ? menuBody(input)
        : input.kind === "Transportation Board"
          ? transportationBody(input)
          : noticeBody(input);
  return baseStart(input, body);
}
