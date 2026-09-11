import { type HubNotificationEventType, type HubNotificationPreferences } from "@/lib/notifications";
import { dispatchHubNotification, loadNotificationState, saveNotificationState } from "@/lib/server/notifications";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

const allowedEvents = new Set<HubNotificationEventType>([
  "transportation_update",
  "emergency_record_attention",
  "tour_board_update",
  "tour_follow_up",
  "schedule_update",
]);

function canDispatch(
  roleOwner: boolean,
  roleLicensee: boolean,
  permissions: string[],
  eventType: HubNotificationEventType,
) {
  if (roleOwner || roleLicensee) return true;
  if (eventType === "transportation_update") return permissions.includes("transportation");
  if (eventType === "emergency_record_attention") {
    return ["children_basic", "transportation", "health_safety"].some((permission) => permissions.includes(permission));
  }
  if (eventType === "schedule_update") return permissions.includes("schedules");
  return false;
}

function locationAllowed(profileLocations: string[], location: string, isOwner: boolean) {
  if (isOwner || !location || location === "All Locations") return true;
  if (profileLocations.includes("All Locations")) return true;
  const requested = location.trim().toLowerCase();
  return profileLocations.some((item) => item.trim().toLowerCase() === requested);
}

export async function GET(request: Request) {
  try {
    const { admin, user } = await requireStaff(request);
    const state = await loadNotificationState(admin, user.id);
    return Response.json({
      notifications: state.inbox,
      preferences: state.preferences,
      unreadCount: state.inbox.filter((item) => !item.readAt).length,
    }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { admin, user } = await requireStaff(request);
    const body = await request.json() as {
      readIds?: string[];
      markAllRead?: boolean;
      preferences?: Partial<HubNotificationPreferences>;
    };
    const state = await loadNotificationState(admin, user.id);
    const now = new Date().toISOString();
    const ids = new Set(Array.isArray(body.readIds) ? body.readIds.filter((id): id is string => typeof id === "string") : []);

    const inbox = state.inbox.map((item) => {
      if (item.readAt) return item;
      if (body.markAllRead || ids.has(item.id)) return { ...item, readAt: now };
      return item;
    });

    const preferences: HubNotificationPreferences = {
      ...state.preferences,
      ...(body.preferences ?? {}),
    };

    await saveNotificationState(admin, state.user, inbox, preferences);
    return Response.json({
      notifications: inbox,
      preferences,
      unreadCount: inbox.filter((item) => !item.readAt).length,
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { admin, userClient, user, profile, isOwner, isLicensee } = await requireStaff(request);
    const body = await request.json() as {
      eventType?: HubNotificationEventType;
      location?: string;
      eventKey?: string;
    };

    const eventType = body.eventType;
    if (!eventType || !allowedEvents.has(eventType)) {
      throw new Response("Unsupported notification event.", { status: 400 });
    }

    const permissions = Array.isArray(profile.permissions) ? profile.permissions : [];
    if (!canDispatch(isOwner, isLicensee, permissions, eventType)) {
      throw new Response("This staff account cannot send this type of notification.", { status: 403 });
    }

    const location = (body.location || "All Locations").trim();
    const profileLocations = Array.isArray(profile.locations) ? profile.locations : [];
    if (!locationAllowed(profileLocations, location, isOwner)) {
      throw new Response("This notification is outside the staff member's assigned location.", { status: 403 });
    }

    const result = await dispatchHubNotification({
      admin,
      senderUserId: user.id,
      organizationId: profile.organization_id,
      eventType,
      location,
      eventKey: body.eventKey,
    });

    await userClient.rpc("record_audit_event", {
      p_action: "REVIEW",
      p_table_name: "notifications",
      p_row_id: null,
      p_location_id: null,
      p_metadata: {
        kind: "automatic_hub_notification",
        eventType,
        location,
        delivered: result.delivered,
      },
    });

    return Response.json(result);
  } catch (error) {
    return staffErrorResponse(error);
  }
}
