import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { tcsLocationSlug } from "@/lib/server/location-slug";
import { createTransportationConsentToken } from "@/lib/server/transportation-consent-token";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { userClient, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!isOwner && !isLicensee) throw new Response("Transportation consent links are restricted to Owners and Licensees.", { status: 403 });

    const body = await request.json() as { childLegacyId?: string | number; location?: string };
    const childLegacyId = String(body.childLegacyId ?? "").trim();
    const locationName = String(body.location ?? "").trim();
    const locationSlug = tcsLocationSlug(locationName);
    if (!childLegacyId || !locationSlug) return Response.json({ error: "Choose a child and location." }, { status: 400 });

    const { data: location, error: locationError } = await userClient
      .from("locations")
      .select("id,name,full_name,slug")
      .eq("slug", locationSlug)
      .maybeSingle();
    if (locationError) throw locationError;
    if (!location) throw new Response("You do not have access to that location.", { status: 403 });

    const { data: child, error: childError } = await userClient
      .from("children")
      .select("id,legacy_id,first_name,last_name")
      .eq("legacy_id", childLegacyId)
      .maybeSingle();
    if (childError) throw childError;
    if (!child) throw new Response("The selected child is not available to this account.", { status: 403 });

    const { data: membership, error: membershipError } = await userClient
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
