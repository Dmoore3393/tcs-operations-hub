import type { ReactNode } from "react";
import { localIsoDate } from "@/lib/date-utils";
import { groupSchoolPickupStops, type SchoolStopRoute, type SchoolPickupStop } from "@/lib/school-pickup-stops";

type DriverLabel = { key: string; name: string };
type Props<T extends SchoolStopRoute> = {
  routes: T[];
  children: (route: T) => ReactNode;
  driverFor?: (route: T) => DriverLabel;
  date?: string;
  entryLabelFor?: (route: T) => string | undefined;
  planning?: boolean;
};

const normalized = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

function dateLabel(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

/** Presentation only: never changes stop records, custody actions, or emergency checks. */
export default function SchoolStopGroups<T extends SchoolStopRoute>({
  routes, children, driverFor, date = localIsoDate(), entryLabelFor, planning = false,
}: Props<T>) {
  const thanksgiving = /^\d{4}-11-\d{2}$/.test(date);
  const identityFor = (route: T): DriverLabel => {
    const resolved = driverFor?.(route);
    return {
      key: resolved?.key || route.driverLaneId || normalized(route.driver || "") || "unassigned",
      name: resolved?.name?.trim() || route.driver?.trim() || "Driver not assigned",
    };
  };
  const drivers = new Map<string, { name: string; stops: SchoolPickupStop<T>[] }>();
  // Keep the established stop ordering. A return to a city starts a new city band,
  // rather than moving that stop ahead of an earlier scheduled stop in another city.
  for (const stop of groupSchoolPickupStops(routes, false, identityFor)) {
    const driver = identityFor(stop.routes[0]);
    const group = drivers.get(driver.key);
    if (group) group.stops.push(stop);
    else drivers.set(driver.key, { name: driver.name, stops: [stop] });
  }
  if (!routes.length) return null;

  return <div className="space-y-5" data-transport-schedule="driver-city" data-season={thanksgiving ? "thanksgiving" : "standard"}>
    <header className={`rounded-3xl border p-5 sm:p-6 ${thanksgiving ? "border-amber-300 bg-gradient-to-br from-amber-50 via-orange-50 to-white text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
      <p className="text-sm font-bold uppercase tracking-wider">{thanksgiving ? "Thankful for our transportation team" : "TCS transportation team"}</p>
      <h2 className="mt-2 text-2xl font-black sm:text-3xl"><span aria-hidden="true">{thanksgiving ? "🦃 🍂" : "🏫 🚌"}</span> School Transportation</h2>
      <p className="mt-2 text-lg font-bold"><time dateTime={date}>{dateLabel(date)}</time></p>
      <p className="mt-2 text-base">Driver → city → children, pickup time, and school.</p>
      <p className="mt-2 text-sm leading-6">{planning ? "Planning view: check each child’s date-specific status below. Entries marked No transportation or Not on this day are not pickups." : "Confirm each child below: Picked Up → Arrived → Drop-off / handoff. Review emergency information before pickup. Use route controls only while safely stopped."}</p>
    </header>

    {[...drivers].map(([driverKey, driver]) => {
      const bands: Array<{ key: string; city: string; period: string; stops: SchoolPickupStop<T>[] }> = [];
      for (const stop of driver.stops) {
        const cities = [...new Set(stop.routes.map(route => route.area?.trim() || "City not set"))];
        const city = cities.join(" / ");
        const period = stop.routes[0].tripPeriod === "Morning" ? "Morning · school drop-offs" : "Afternoon · school pickups";
        const previous = bands[bands.length - 1];
        if (previous && normalized(previous.city) === normalized(city) && previous.period === period) previous.stops.push(stop);
        else bands.push({ key: stop.key, city, period, stops: [stop] });
      }
      const vehicles = [...new Set(driver.stops.map(stop => stop.vehicle?.trim()).filter(Boolean))];
      const entries = driver.stops.reduce((total, stop) => total + stop.routes.length, 0);
      return <section key={driverKey} aria-label={`${driver.name} route`} className={`overflow-hidden rounded-3xl border shadow-sm ${thanksgiving ? "border-amber-300 bg-orange-50/40" : "border-emerald-200 bg-emerald-50/40"}`}>
        <header className={`p-5 sm:p-6 ${thanksgiving ? "bg-amber-950 text-amber-50" : "bg-emerald-950 text-emerald-50"}`}>
          <h3 className="text-2xl font-black"><span aria-hidden="true">{thanksgiving ? "🍁" : "🚌"}</span> <span translate="no">{driver.name}</span>{driverKey === "unassigned" ? "" : "’s Route"}</h3>
          <p className="mt-2 text-base">{vehicles.join(" • ") || "Vehicle not assigned"}</p>
          <p className="mt-1 text-sm">{driver.stops.length} {driver.stops.length === 1 ? "stop" : "stops"} · {entries} {entries === 1 ? "trip entry" : "trip entries"}</p>
        </header>
        <div className="space-y-6 p-3 sm:p-5">
          {bands.map(band => <section key={band.key} aria-label={`${band.city} — ${band.period}`} className="space-y-3">
            <header className={`rounded-2xl border px-4 py-3 ${thanksgiving ? "border-amber-200 bg-amber-100 text-amber-950" : "border-emerald-200 bg-emerald-100 text-emerald-950"}`}>
              <h4 className="text-xl font-black"><span aria-hidden="true">{thanksgiving ? "🍂" : "📍"}</span> <span translate="no">{band.city}</span>:</h4>
              <p className="mt-1 text-sm font-bold">{band.period}</p>
            </header>
            {band.stops.map(stop => <section key={stop.key} className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
              <header className="mb-4 border-b border-slate-200 pb-3 text-base leading-7 text-slate-900">
                <p className="text-lg font-bold"><span aria-hidden="true">{thanksgiving ? "🍁 " : "🚌 "}</span>{stop.routes.map((route, index) => <span key={route.id}>
                  {index > 0 ? ", " : ""}<span translate="no">{route.child || "Child name not entered"}</span>{entryLabelFor?.(route) ? <span className="ml-1 font-bold text-red-800">({entryLabelFor(route)})</span> : null}
                </span>)}<span> — <strong>{stop.pickup || "Pickup time not set"}</strong> </span><span translate="no">({stop.school || "School / pickup location not set"})</span></p>
                <p className="mt-1 text-sm text-slate-600">{stop.vehicle || "Vehicle not assigned"} · {stop.routes.length} {stop.routes.length === 1 ? "trip entry" : "trip entries"}</p>
              </header>
              <div className="grid gap-3 xl:grid-cols-2">
                {stop.routes.map(route => <div key={route.id} className="min-w-0">{children(route)}</div>)}
              </div>
            </section>)}
          </section>)}
        </div>
      </section>;
    })}
  </div>;
}
