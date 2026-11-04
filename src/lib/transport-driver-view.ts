import type { TransportationRoute } from "./hub-data";

export type TransportDriver = { id: string; name: string };
type DriverRoute = TransportationRoute & { coveringDriver?: string; coveringDate?: string };
type DriverProfile = { lane_profile_id?: string | null } | null;

/** Use the day's assignment, including coverage, without confusing equal names. */
export function transportDriverFor(route: DriverRoute, date: string, staff: TransportDriver[] = []) {
  const covering = route.coveringDate === date ? route.coveringDriver?.trim() : "";
  const name = covering || route.driver?.trim() || "Driver not assigned";
  let laneId = covering ? "" : route.driverLaneId || "";
  if (!laneId) {
    const matches = staff.filter(driver => driver.name.trim() === name);
    if (matches.length === 1) laneId = matches[0].id;
  }
  return { key: laneId ? `staff:${laneId}` : `name:${name}`, laneId, name };
}

export function isMyTransportRoute(route: DriverRoute, profile: DriverProfile, date: string, staff: TransportDriver[] = []) {
  return Boolean(profile?.lane_profile_id) && transportDriverFor(route, date, staff).laneId === profile?.lane_profile_id;
}

export function transportDriverChoices(routes: DriverRoute[], date: string, staff: TransportDriver[] = []) {
  return [...new Map(routes.map(route => {
    const driver = transportDriverFor(route, date, staff);
    return [driver.key, driver] as const;
  })).values()].sort((a, b) => a.name.localeCompare(b.name));
}
