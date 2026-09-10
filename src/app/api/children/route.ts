import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

export const runtime = "nodejs";

const LOCATION_SLUGS = ["halcom", "21st-street", "division", "33rd-street", "42nd-street", "tehachapi"] as const;
type DbRow = Record<string, unknown>;

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function fundingSource(value: unknown) {
  const source = text(value);
  if (/^private pay$/i.test(source)) return "Cash Pay";
  return source;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
}

function locationSlug(value: unknown) {
  const source = text(value).toLowerCase();
  if (source.includes("halcom") || source.includes("moore family")) return "halcom";
  if (source.includes("21st") || source.includes("cathers")) return "21st-street";
  if (source.includes("division") || source.includes("school age center")) return "division";
  if (source.includes("33rd") || source.includes("cornejo")) return "33rd-street";
  if (source.includes("42nd") || source.includes("lara")) return "42nd-street";
  if (source.includes("tehachapi")) return "tehachapi";
  return "";
}

function stableNumericId(value: string) {
  const numeric = Number(value);
  if (Number.isSafeInteger(numeric) && numeric > 0) return numeric;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) || 1;
}

function normalizeChild(row: DbRow) {
  const record = object(row.record_data);
  const legacyId = text(row.legacy_id);
  return {
    ...record,
    id: typeof record.id === "number" ? record.id : stableNumericId(legacyId),
    firstName: text(record.firstName) || text(row.first_name),
    lastName: text(record.lastName) || text(row.last_name),
    age: text(record.age) || "Age not entered",
    dateOfBirth: text(record.dateOfBirth) || text(row.date_of_birth),
    ageGroup: text(record.ageGroup) || text(row.age_group) || "Infant",
    location: text(record.location),
    classroom: text(record.classroom),
    primaryGuardian: text(record.primaryGuardian) || text(row.guardian_name),
    secondaryGuardian: text(record.secondaryGuardian) || undefined,
    phone: text(record.phone),
    familyId: typeof record.familyId === "number" ? record.familyId : undefined,
    familyName: text(record.familyName) || undefined,
    guardianEmail: text(record.guardianEmail) || undefined,
    subsidy: fundingSource(record.subsidy) || "",
    weeklySchedule: text(record.weeklySchedule),
    transportation: text(record.transportation) || "No transportation",
    allergies: text(record.allergies) || "None reported",
    medicalNotes: text(record.medicalNotes) || "No current medical notes",
    licensingStatus: text(record.licensingStatus) || "Complete",
    missingDocuments: stringArray(record.missingDocuments),
    enrollmentStatus: text(record.enrollmentStatus) || text(row.enrollment_status) || "Active",
    attendanceToday: text(record.attendanceToday) || text(row.attendance_status) || "Not Scheduled",
    updatedAt: text(row.updated_at),
  };
}

function normalizeLocation(row: DbRow) {
  const parsedCapacity = Number(row.capacity);
  return {
    id: text(row.id),
    slug: text(row.slug),
    name: text(row.name),
    fullName: text(row.full_name),
    capacity: Number.isFinite(parsedCapacity) && parsedCapacity >= 0 ? parsedCapacity : 0,
    programType: text(row.program_type) || "Family Childcare",
    colorPrimary: text(row.color_primary) || "#506447",
    colorSecondary: text(row.color_secondary) || "#b95d3b",
  };
}

async function activeLocations(
  admin: Awaited<ReturnType<typeof requireStaff>>["admin"],
  organizationId: string,
) {
  const result = await admin
    .from("locations")
    .select("id,slug,name,full_name,capacity,program_type,color_primary,color_secondary")
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  if (result.error) throw result.error;
  return (result.data ?? []) as unknown as DbRow[];
}

async function resolveLocationId(
  admin: Awaited<ReturnType<typeof requireStaff>>["admin"],
  organizationId: string,
  locationValue: unknown,
) {
  const slug = locationSlug(locationValue);
  if (!slug || !(LOCATION_SLUGS as readonly string[]).includes(slug)) {
    throw new Response("Choose a valid TCS location.", { status: 400 });
  }
  const locations = await activeLocations(admin, organizationId);
  const location = locations.find((item) => text(item.slug) === slug);
  if (!location?.id) throw new Response("That TCS location is not active in the live database.", { status: 400 });
  return text(location.id);
}

function validateChild(value: unknown) {
  const child = object(value);
  if (!text(child.firstName) || !text(child.lastName)) throw new Response("Child first and last name are required.", { status: 400 });
  if (!text(child.primaryGuardian)) throw new Response("At least one parent or guardian is required.", { status: 400 });
  if (!text(child.location)) throw new Response("A childcare location is required.", { status: 400 });
  if (!text(child.ageGroup)) throw new Response("An age group is required.", { status: 400 });
  const funding = fundingSource(child.subsidy);
  if (!funding) throw new Response("Choose a funding source.", { status: 400 });
  if (/^ccrc$/i.test(funding)) throw new Response("CCRC must be identified as Stage 1 or Stage 2.", { status: 400 });
  child.subsidy = funding;
  return child;
}

function safeChildRecord(child: DbRow, id: number) {
  const licensingStatus = text(child.licensingStatus) === "Missing Documents" ? "Missing Documents" : "Complete";
  const enrollmentStatus = ["Active", "Pending", "Archived"].includes(text(child.enrollmentStatus)) ? text(child.enrollmentStatus) : "Active";
  const attendanceToday = ["Present", "Not Scheduled", "Absent"].includes(text(child.attendanceToday)) ? text(child.attendanceToday) : "Not Scheduled";
  const ageGroup = ["Infant", "Toddler", "Preschool", "School Age"].includes(text(child.ageGroup)) ? text(child.ageGroup) : "Infant";
  return {
    id,
    firstName: text(child.firstName).slice(0, 100),
    lastName: text(child.lastName).slice(0, 100),
    age: (text(child.age) || "Age not entered").slice(0, 60),
    dateOfBirth: text(child.dateOfBirth).slice(0, 10),
    ageGroup,
    location: text(child.location).slice(0, 160),
    classroom: text(child.classroom).slice(0, 120),
    primaryGuardian: text(child.primaryGuardian).slice(0, 160),
    secondaryGuardian: text(child.secondaryGuardian).slice(0, 160) || undefined,
    phone: text(child.phone).slice(0, 50),
    familyId: typeof child.familyId === "number" ? child.familyId : undefined,
    familyName: text(child.familyName).slice(0, 160) || undefined,
    guardianEmail: text(child.guardianEmail).slice(0, 254) || undefined,
    subsidy: fundingSource(child.subsidy).slice(0, 100),
    weeklySchedule: text(child.weeklySchedule).slice(0, 1000),
    transportation: (text(child.transportation) || "No transportation").slice(0, 1000),
    allergies: (text(child.allergies) || "None reported").slice(0, 2000),
    medicalNotes: (text(child.medicalNotes) || "No current medical notes").slice(0, 4000),
    licensingStatus,
    missingDocuments: licensingStatus === "Missing Documents" ? stringArray(child.missingDocuments).slice(0, 50) : [],
    enrollmentStatus,
    attendanceToday,
  };
}

export async function GET(request: Request) {
  try {
    const { userClient } = await requireStaff(request);
    const [childrenResult, locationsResult] = await Promise.all([
      userClient
        .from("children")
        .select("legacy_id,first_name,last_name,date_of_birth,age_group,enrollment_status,attendance_status,guardian_name,record_data,updated_at")
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true }),
      userClient
        .from("locations")
        .select("id,slug,name,full_name,capacity,program_type,color_primary,color_secondary")
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);
    if (childrenResult.error) throw childrenResult.error;
    if (locationsResult.error) throw locationsResult.error;
    return Response.json({
      children: ((childrenResult.data ?? []) as unknown as DbRow[]).map(normalizeChild),
      locations: ((locationsResult.data ?? []) as unknown as DbRow[]).map(normalizeLocation),
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { admin, userClient, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!isOwner && !isLicensee) throw new Response("Only an Owner/Admin or assigned Licensee can create or edit child enrollment records.", { status: 403 });

    const body = object(await request.json().catch(() => ({})));
    const action = text(body.action) || "save";
    const rawChild = validateChild(body.child);
    const id = typeof rawChild.id === "number" && Number.isSafeInteger(rawChild.id) && rawChild.id > 0 ? rawChild.id : Date.now();
    const child = safeChildRecord(rawChild, id);
    const legacyId = String(id);
    const locationId = await resolveLocationId(admin, profile.organization_id, child.location);

    const existing = await userClient
      .from("children")
      .select("id,legacy_id,school_name")
      .eq("organization_id", profile.organization_id)
      .eq("legacy_id", legacyId)
      .maybeSingle();
    if (existing.error) throw existing.error;

    if (action === "archive") child.enrollmentStatus = child.enrollmentStatus === "Archived" ? "Active" : "Archived";

    const payload = {
      organization_id: profile.organization_id,
      location_id: locationId,
      legacy_id: legacyId,
      first_name: child.firstName,
      last_name: child.lastName,
      date_of_birth: child.dateOfBirth || null,
      age_group: child.ageGroup,
      enrollment_status: child.enrollmentStatus,
      attendance_status: child.attendanceToday,
      guardian_name: child.primaryGuardian,
      school_name: existing.data?.school_name ?? null,
      record_data: child,
    };

    let saved;
    if (existing.data?.id) {
      saved = await userClient
        .from("children")
        .update(payload)
        .eq("id", existing.data.id)
        .select("legacy_id,first_name,last_name,date_of_birth,age_group,enrollment_status,attendance_status,guardian_name,record_data,updated_at")
        .maybeSingle();
    } else {
      saved = await userClient
        .from("children")
        .insert(payload)
        .select("legacy_id,first_name,last_name,date_of_birth,age_group,enrollment_status,attendance_status,guardian_name,record_data,updated_at")
        .maybeSingle();
    }
    if (saved.error) throw saved.error;
    if (!saved.data) throw new Error("The child record was not returned after saving.");

    return Response.json({ ok: true, child: normalizeChild(saved.data as unknown as DbRow) });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
