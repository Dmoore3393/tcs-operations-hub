import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { tcsLocationSlug } from "@/lib/server/location-slug";
import { createTransportationConsentToken } from "@/lib/server/transportation-consent-token";

export const runtime = "nodejs";

function leadership(fullName: string, email: string) {
  const identity = `${fullName} ${email}`.toLowerCase();
  return identity.includes("danielle moore") || identity.includes("jennifer thomason");
}

function canUseLocation(locations: string[], slug: string, broadAccess: boolean) {
  return broadAccess || locations.some((value) => tcsLocationSlug(value) === slug);
}

export async function POST(request: Request) {
  try {
    const { admin, profile, isOwner, isLicensee } = await requireStaff(request);
    const isLeadership = leadership(profile.full_name, profile.email);
    if (!isOwner && !isLicensee && !isLeadership) throw new Response("Transportation consent links are restricted to authorized leadership and Location Licensees.", { status: 403 });

    const body = await request.json() as { childLegacyId?: string | number; location?: string };
    const childLegacyId = String(body.childLegacyId ?? "").trim();
    const locationName = String(body.location ?? "").trim();
    const locationSlug = tcsLocationSlug(locationName);
    if (!childLegacyId || !locationSlug) return Response.json({ error: "Choose a child and location." }, { status: 400 });
    if (!canUseLocation(profile.locations, locationSlug, isOwner || isLeadership)) throw new Response("You do not have access to that location.", { status: 403 });

    const { data: location, error: locationError } = await admin
      .from("locations")
      .select("id,name,full_name,slug")
      .eq("organization_id", profile.organization_id)
      .eq("slug", locationSlug)
      .maybeSingle();
    if (locationError) throw locationError;
    if (!location) throw new Response("That location is not available.", { status: 404 });

    const { data: child, error: childError } = await admin
      .from("children")
      .select("id,legacy_id,first_name,last_name")
      .eq("organization_id", profile.organization_id)
      .eq("legacy_id", childLegacyId)
      .maybeSingle();
    if (childError) throw childError;
    if (!child) throw new Response("The selected child is not available.", { status: 404 });

    const { data: membership, error: membershipError } = await admin
      .from("child_location_memberships")
      .select("id")
      .eq("child_id", child.id)
      .eq("location_id", location.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return Response.json({ error: "That child is not assigned to the selected location." }, { status: 400 });

    const token = createTransportationConsentToken({
      organizationId: profile.organization_id,
      childLegacyId,
      locationSlug,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    return Response.json({
      ok: true,
      path: `/transportation-consent/${token}`,
      childName: `${child.first_name} ${child.last_name}`,
      locationName: location.full_name || location.name,
      expiresInDays: 7,
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
