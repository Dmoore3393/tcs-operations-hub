import { locationSlug, normalizeLocation, type LocationKey } from "./location-config";

const posterSlugs = ["halcom", "33rd-street", "42nd-street", "division", "tehachapi"] as const;
export type StaffClockStation = (typeof posterSlugs)[number];
export type StaffClockAction = "clock_in" | "clock_out";

export function staffClockStation(value: string | null): StaffClockStation | null {
  const slug = value?.trim().toLowerCase();
  return posterSlugs.find(station => station === slug) ?? null;
}

export function stationPath(station: StaffClockStation, page: "/login" | "/time-clock" | "/accept-invite" = "/time-clock") {
  return `${page}?station=${station}`;
}

export function stationFromQuery(search: string) {
  const stations = new URLSearchParams(search).getAll("station");
  return stations.length === 1 ? staffClockStation(stations[0]) : null;
}

export function locationSlugFromQr(rawValue: string, currentPage: string) {
  try {
    const url = new URL(rawValue, currentPage);
    const local = new URL(currentPage);
    const knownHub = url.protocol === "https:" && ["thetcshub.com", "tcs-operations-hub.vercel.app"].includes(url.host);
    if (url.username || url.password || (!knownHub && (local.protocol !== url.protocol || local.host !== url.host))) return null;
    const path = url.pathname.replace(/\/$/, "");
    if (path === "/time-clock") return stationFromQuery(url.search);
    // Existing shared location signs remain usable from the staff scanner.
    if (path !== "/parent/check-in") return null;
    const locations = url.searchParams.getAll("location");
    return locations.length === 1 ? staffClockStation(locations[0]) : null;
  } catch {
    return null;
  }
}

export function stationAccessAllowed(location: LocationKey, assignments: string[], owner: boolean) {
  return owner || assignments.includes("All Locations") || assignments.some(item => normalizeLocation(item) === location);
}

export function stationClockAction(state: string, requested: StaffClockAction | "auto" | "", ready: boolean): StaffClockAction | "" {
  if (!ready || !requested) return "";
  if (requested !== "auto") return requested;
  if (state === "Off Clock") return "clock_in";
  return state === "Working" ? "clock_out" : "";
}

/** The canonical, active database row owns the schedule and payroll for this printed site. */
export function activeClockLocation<T extends { slug?: unknown; is_active?: unknown }>(rows: T[], location: Exclude<LocationKey, "All Locations">) {
  return rows.find(row => row.is_active === true && row.slug === locationSlug(location));
}
