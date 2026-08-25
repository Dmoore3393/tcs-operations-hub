const preserveStarterData = new Set([
  "tcs-settings",
  "tcs-locations-v2",
  "tcs-location-hours-v2",
  "tcs-schools-v2",
  "tcs-vehicles-v2",
  "tcs-vehicle-readiness-v2",
  "tcs-timesheet-department-routes-v1",
  "tcs-weekly-menus-v1",
]);

/**
 * Earlier development builds contained sample people, care logs, and workflow records.
 * A newly connected admin-pilot database must start clean so sample records
 * are never confused with live childcare records. Location configuration,
 * operating hours, school/vehicle setup, routing templates, and menus are
 * retained because they are editable system configuration.
 */
export function getProductionInitialValue<T>(key: string, starterValue: T): T {
  if (preserveStarterData.has(key)) return starterValue;
  if (Array.isArray(starterValue)) return [] as T;
  if (starterValue && typeof starterValue === "object") return {} as T;
  return starterValue;
}
