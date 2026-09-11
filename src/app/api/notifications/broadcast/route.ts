import {
  dispatchManualHubNotification,
  type ManualNotificationTargetGroup,
} from "@/lib/server/notifications";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import type { HubNotificationCategory } from "@/lib/notifications";

const allowedGroups = new Set<ManualNotificationTargetGroup>(["All Staff", "Transportation", "Program Staff", "Leadership"]);
const allowedCategories = new Set<HubNotificationCategory>(["system", "transportation", "schedule", "tour"]);

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  try {
    const { admin, userClient, user, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!isOwner && !isLicensee) {
      throw new Response("Only Owner/Admin and Licensee accounts can send targeted team alerts.", { status: 403 });
    }

    const body = await request.json() as Record<string, unknown>;
    const targetLocation = clean(body.targetLocation, 120) || "All Locations";
    const targetGroup = clean(body.targetGroup, 80) as ManualNotificationTargetGroup;
    const category = clean(body.category, 40) as HubNotificationCategory;
    const title = clean(body.title, 80);
    const message = clean(body.body, 240);
    const href = clean(body.href, 180) || "/notifications";

    if (!allowedGroups.has(targetGroup)) throw new Response("Choose a valid recipient group.", { status: 400 });
    if (!allowedCategories.has(category)) throw new Response("Choose a valid alert category.", { status: 400 });
    if (!title || !message) throw new Response("Enter an alert title and message.", { status: 400 });
    if (/[\r\n]/.test(title)) throw new Response("Alert titles must be one line.", { status: 400 });

    const assignedLocations = Array.isArray(profile.locations) ? profile.locations : [];
    if (!isOwner && targetLocation === "All Locations") {
      throw new Response("Licensee alerts must target an assigned location.", { status: 403 });
    }
    if (!isOwner && !assignedLocations.includes("All Locations") && !assignedLocations.includes(targetLocation)) {
      throw new Response("That location is outside this account's assignment.", { status: 403 });
    }

    const result = await dispatchManualHubNotification({
      admin,
      senderUserId: user.id,
      organizationId: profile.organization_id,
      targetLocation,
      targetGroup,
      category,
      title,
      body: message,
      href,
    });

    await userClient.rpc("record_audit_event", {
      p_action: "REVIEW",
      p_table_name: "notifications",
      p_row_id: null,
      p_location_id: null,
      p_metadata: {
        kind: "targeted_team_alert",
        targetLocation,
        targetGroup,
        category,
        delivered: result.delivered,
      },
    });

    return Response.json(result);
  } catch (error) {
    return staffErrorResponse(error);
  }
}
