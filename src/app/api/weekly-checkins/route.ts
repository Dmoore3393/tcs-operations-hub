import { addIsoDays, mondayOfWeek } from "@/lib/family-care-calendar";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

type DbRow = Record<string, unknown>;
function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
}

async function accessibleLocations(
  admin: Awaited<ReturnType<typeof requireStaff>>["admin"],
  organizationId: string,
  userId: string,
  isOwner: boolean,
) {
  const locationResult = await admin
    .from("locations")
    .select("id,slug,name,full_name")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name");
  if (locationResult.error) throw locationResult.error;
  if (isOwner) return (locationResult.data ?? []) as unknown as DbRow[];

  const assignmentResult = await admin
    .from("staff_location_assignments")
    .select("location_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId);
  if (assignmentResult.error) throw assignmentResult.error;
  const allowed = new Set((assignmentResult.data ?? []).map((row) => String(row.location_id)));
  return ((locationResult.data ?? []) as unknown as DbRow[]).filter((row) => allowed.has(text(row.id)));
}

function canWrite(profile: { permissions: string[] }, isOwner: boolean, isLicensee: boolean) {
  return isOwner || isLicensee || profile.permissions.includes("daily_care") || profile.permissions.includes("children_basic");
}

export async function GET(request: Request) {
  try {
    const { admin, user, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!canWrite(profile, isOwner, isLicensee)) throw new Response("Weekly check-in access is required.", { status: 403 });

    const url = new URL(request.url);
    const requestedWeek = text(url.searchParams.get("weekOf"));
    const weekOf = /^\d{4}-\d{2}-\d{2}$/.test(requestedWeek) ? mondayOfWeek(requestedWeek) : mondayOfWeek(new Date().toISOString().slice(0, 10));
    const locations = await accessibleLocations(admin, profile.organization_id, user.id, isOwner);
    const locationIds = locations.map((row) => text(row.id)).filter(Boolean);

    const childResult = locationIds.length
      ? await admin
          .from("children")
          .select("id,legacy_id,location_id,first_name,last_name,age_group,enrollment_status,record_data")
          .eq("organization_id", profile.organization_id)
          .in("location_id", locationIds)
          .neq("enrollment_status", "Archived")
          .order("last_name")
      : { data: [], error: null };
    if (childResult.error) throw childResult.error;

    const checkinResult = locationIds.length
      ? await admin
          .from("child_weekly_checkins")
          .select("id,location_id,child_id,child_legacy_id,week_of,title,message,highlights,status,created_by_name,updated_at")
          .eq("organization_id", profile.organization_id)
          .in("location_id", locationIds)
          .eq("week_of", weekOf)
      : { data: [], error: null };
    if (checkinResult.error) throw checkinResult.error;

    return Response.json({
      weekOf,
      weekEnd: addIsoDays(weekOf, 6),
      locations: locations.map((row) => ({
        id: text(row.id),
        name: text(row.name) || text(row.full_name),
      })),
      children: ((childResult.data ?? []) as unknown as DbRow[]).map((row) => {
        const record = object(row.record_data);
        return {
          rowId: text(row.id),
          id: text(row.legacy_id),
          locationId: text(row.location_id),
          firstName: text(row.first_name),
          lastName: text(row.last_name),
          ageGroup: text(row.age_group),
          photoConsentStatus: text(record.photoConsentStatus),
        };
      }),
      checkins: ((checkinResult.data ?? []) as unknown as DbRow[]).map((row) => ({
        id: text(row.id),
        locationId: text(row.location_id),
        childRowId: text(row.child_id),
        childId: text(row.child_legacy_id),
        weekOf: text(row.week_of),
        title: text(row.title),
        message: text(row.message),
        highlights: strings(row.highlights),
        status: text(row.status),
        createdByName: text(row.created_by_name),
        updatedAt: text(row.updated_at),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { admin, user, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!canWrite(profile, isOwner, isLicensee)) throw new Response("Weekly check-in access is required.", { status: 403 });

    const body = object(await request.json().catch(() => ({})));
    const childLegacyId = text(body.childId);
    const weekOf = mondayOfWeek(text(body.weekOf));
    const title = text(body.title).slice(0, 160) || "This Week at TCS";
    const message = text(body.message).slice(0, 4000);
    const highlights = strings(body.highlights).slice(0, 8);
    const status = text(body.status) === "Draft" ? "Draft" : "Published";
    if (!childLegacyId || !/^\d{4}-\d{2}-\d{2}$/.test(weekOf) || !message) {
      throw new Response("Choose a child, week, and enter a weekly check-in message.", { status: 400 });
    }

    const childResult = await admin
      .from("children")
      .select("id,legacy_id,location_id,first_name,last_name")
      .eq("organization_id", profile.organization_id)
      .eq("legacy_id", childLegacyId)
      .maybeSingle();
    if (childResult.error) throw childResult.error;
    if (!childResult.data) throw new Response("That child was not found.", { status: 404 });

    if (!isOwner) {
      const assignment = await admin
        .from("staff_location_assignments")
        .select("location_id")
        .eq("organization_id", profile.organization_id)
        .eq("user_id", user.id)
        .eq("location_id", childResult.data.location_id)
        .maybeSingle();
      if (assignment.error) throw assignment.error;
      if (!assignment.data) throw new Response("This child is outside your assigned location.", { status: 403 });
    }

    const saved = await admin
      .from("child_weekly_checkins")
      .upsert({
        organization_id: profile.organization_id,
        location_id: childResult.data.location_id,
        child_id: childResult.data.id,
        child_legacy_id: childResult.data.legacy_id,
        week_of: weekOf,
        title,
        message,
        highlights,
        status,
        created_by: user.id,
        created_by_name: profile.full_name || profile.email,
      }, { onConflict: "organization_id,child_id,week_of" })
      .select("id,status")
      .single();
    if (saved.error) throw saved.error;

    return Response.json({
      ok: true,
      id: saved.data.id,
      status: saved.data.status,
      message: status === "Published" ? "Weekly family check-in published." : "Weekly check-in saved as a draft.",
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
