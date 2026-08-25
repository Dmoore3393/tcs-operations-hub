type AnyRecord = Record<string, unknown>;

function mapLocationKey(value: unknown) {
  if (typeof value !== "string") return value;
  if (value === "Astor") return "Division";
  if (value === "Cornejo") return "33rd Street";
  if (value === "Lara") return "42nd Street";
  return value;
}

export function migrateActiveLocation(value: string | null) {
  if (!value) return value;
  return mapLocationKey(value) as string;
}

function updateLocationText(value: unknown) {
  if (typeof value !== "string") return value;
  if (value === "Cornejo") return "33rd Street";
  if (value === "Lara") return "42nd Street";
  if (value === "Astor" || value === "Astor School Age Site") return "Division";
  if (value === "Cornejo Family Childcare") return "Cornejo Family Childcare • 33rd Street";
  if (value === "Lara Family Childcare") return "Lara Family Childcare • 42nd Street";
  return value
    .replace(/\bAstor\b/g, "Division")
    .replace(/\bCornejo\b(?! Family Childcare)/g, "33rd Street")
    .replace(/\bLara\b(?! Family Childcare)/g, "42nd Street")
    .replace(/\b33rd\b(?! Street)/g, "33rd Street");
}

function migrateLocations(value: unknown) {
  if (!Array.isArray(value)) return value;
  const merged = new Map<string, AnyRecord>();
  const priorities = new Map<string, number>();

  value.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const record = { ...(entry as AnyRecord) };
    const original = String(record.shortName ?? "");
    if (original === "Astor") return;
    const shortName = String(mapLocationKey(original));
    const priority = original === "Cornejo" ? 2 : original === "33rd Street" ? 1 : 1;
    const existing = merged.get(shortName);

    const next: AnyRecord = { ...record, shortName };
    if (shortName === "33rd Street") {
      next.id = "cornejo-33rd-street";
      next.name = "Cornejo Family Childcare • 33rd Street";
      next.type = "Family Childcare";
      next.capacity = Math.max(Number(record.capacity ?? 0), 14);
    }
    if (shortName === "42nd Street") {
      next.id = "lara-42nd-street";
      next.name = "Lara Family Childcare • 42nd Street";
      next.type = "Family Childcare";
      next.capacity = Math.max(Number(record.capacity ?? 0), 14);
    }

    if (!existing) {
      merged.set(shortName, next);
      priorities.set(shortName, priority);
      return;
    }

    const existingPriority = priorities.get(shortName) ?? 0;
    const preferred = priority >= existingPriority ? next : existing;
    merged.set(shortName, {
      ...preferred,
      enrolled: Math.max(Number(existing.enrolled ?? 0), Number(next.enrolled ?? 0)),
      present: Math.max(Number(existing.present ?? 0), Number(next.present ?? 0)),
      capacity: Math.max(Number(existing.capacity ?? 0), Number(next.capacity ?? 0)),
    });
    priorities.set(shortName, Math.max(existingPriority, priority));
  });

  return [...merged.values()];
}

function migrateHours(value: unknown) {
  if (!Array.isArray(value)) return value;
  const merged = new Map<string, AnyRecord>();
  const priorities = new Map<string, number>();
  value.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const record = { ...(entry as AnyRecord) };
    const original = String(record.location ?? "");
    if (original === "Astor") return;
    const location = String(mapLocationKey(original));
    const priority = original === "Cornejo" ? 2 : original === "33rd Street" ? 1 : 1;
    if (!merged.has(location) || priority >= (priorities.get(location) ?? 0)) {
      merged.set(location, { ...record, location });
      priorities.set(location, priority);
    }
  });
  return [...merged.values()];
}

function migrateChildSchedules(value: unknown) {
  if (!Array.isArray(value)) return value;
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const record: AnyRecord = { ...(entry as AnyRecord), defaultLocation: mapLocationKey((entry as AnyRecord).defaultLocation) };
    if (!record.days || typeof record.days !== "object") return record;
    record.days = Object.fromEntries(Object.entries(record.days as AnyRecord).map(([day, dayValue]) => {
      if (!dayValue || typeof dayValue !== "object") return [day, dayValue];
      const dayRecord = { ...(dayValue as AnyRecord) };
      if (Array.isArray(dayRecord.blocks)) {
        dayRecord.blocks = dayRecord.blocks.map((block) => block && typeof block === "object" ? { ...(block as AnyRecord), location: mapLocationKey((block as AnyRecord).location) } : block);
      }
      return [day, dayRecord];
    }));
    return record;
  });
}


function migrateRoutes(value: unknown) {
  if (!Array.isArray(value)) return value;
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const record = { ...(entry as AnyRecord) };
    if (record.vehicle === "Ford Flex") record.vehicle = "Ford Flex 1";
    if (record.school === "Fulton & Alsbury") record.school = "Fulton & Alsbury Academy";
    return record;
  });
}

function migrateTextRecords(value: unknown) {
  if (!Array.isArray(value)) return value;
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    return Object.fromEntries(Object.entries(entry as AnyRecord).map(([field, fieldValue]) => [field, typeof fieldValue === "string" ? updateLocationText(fieldValue) : fieldValue]));
  });
}

export function migratePersistentValue<T>(key: string, value: T): T {
  let migrated: unknown = value;
  if (key === "tcs-locations-v2") migrated = migrateLocations(value);
  if (key === "tcs-location-hours-v2") migrated = migrateHours(value);
  if (key === "tcs-child-schedules-v2") migrated = migrateChildSchedules(value);
  if (key === "tcs-routes") migrated = migrateRoutes(value);
  if (["tcs-employees", "tcs-families", "tcs-shifts", "tcs-kidkare-enrollments-v1", "tcs-timesheets-v1", "tcs-timesheet-department-routes-v1"].includes(key)) migrated = migrateTextRecords(value);
  return migrated as T;
}
