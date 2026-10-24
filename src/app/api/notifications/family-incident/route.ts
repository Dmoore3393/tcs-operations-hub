import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { notifyAuthorizedFamily } from "@/lib/server/family-native-notifications";

export async function POST(request: Request) {
  try {
    const { admin, userClient, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!isOwner && !isLicensee && !profile.permissions.includes("health_safety")) throw new Response("Health and Safety access is required.", { status: 403 });
    const body = await request.json() as { recordId?: unknown };
    if (typeof body.recordId !== "string" || !body.recordId || body.recordId.length > 160) throw new Response("Choose a saved incident entry.", { status: 400 });
    // User-scoped RLS checks the staff member's actual location access.
    const incident = await userClient.from("incidents").select("id,child_id,organization_id,legacy_id")
      .eq("organization_id", profile.organization_id).eq("legacy_id", body.recordId).maybeSingle();
    if (incident.error) throw incident.error;
    if (!incident.data?.child_id) throw new Response("This entry is unavailable or is still saving. Wait a moment, then try again.", { status: 404 });
    const result = await notifyAuthorizedFamily({ admin, organizationId: profile.organization_id, childRowId: String(incident.data.child_id), event: "incident", eventKey: `family-incident:${incident.data.id}` });
    return Response.json(result);
  } catch (error) { return staffErrorResponse(error); }
}
