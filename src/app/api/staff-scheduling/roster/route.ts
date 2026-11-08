import { normalizeLocation } from "@/lib/location-config";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await requireStaff(request);
    if (!auth.isOwner && !auth.isLicensee) {
      return Response.json({ error: "Staff scheduling access is required." }, { status: 403 });
    }

    // Account rows remain private. Schedulers receive only the fields needed
    // to select a colleague and check their effective location assignments.
    const organizationId = auth.profile.organization_id;
    const [staffResult, assignmentsResult, locationsResult] = await Promise.all([
      auth.admin.from("staff_access")
        .select("user_id,full_name,role")
        .eq("organization_id", organizationId).eq("is_active", true).order("full_name"),
      auth.admin.from("staff_location_assignments")
        .select("user_id,location_id").eq("organization_id", organizationId),
      auth.admin.from("locations")
        .select("id,name").eq("organization_id", organizationId).eq("is_active", true).order("name"),
    ]);

    const error = staffResult.error || assignmentsResult.error || locationsResult.error;
    if (error) throw error;

    const allowedLocations = new Set(auth.profile.locations.map(normalizeLocation));
    const locations = new Map((locationsResult.data ?? [])
      .filter(location => auth.isOwner || allowedLocations.has("All Locations") || allowedLocations.has(normalizeLocation(location.name)))
      .map(location => [location.id, location.name]));
    const staffLocations = new Map<string, string[]>();
    for (const assignment of assignmentsResult.data ?? []) {
      const name = locations.get(assignment.location_id);
      if (!name) continue;
      const assigned = staffLocations.get(assignment.user_id) ?? [];
      if (!assigned.includes(name)) assigned.push(name);
      staffLocations.set(assignment.user_id, assigned);
    }

    const staff = (staffResult.data ?? []).map(person => ({
      user_id: person.user_id,
      full_name: person.full_name,
      role: person.role,
      locations: staffLocations.get(person.user_id) ?? [],
    })).filter(person => auth.isOwner || person.locations.length > 0);

    return Response.json({ staff }, {
      headers: { "Cache-Control": "private, no-store", "Vary": "Authorization" },
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
