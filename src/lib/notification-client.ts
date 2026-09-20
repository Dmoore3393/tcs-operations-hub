import type { HubNotificationContext, HubNotificationEventType } from "@/lib/notifications";

export async function sendHubNotificationEvent(args: {
  accessToken?: string | null;
  eventType: HubNotificationEventType;
  location?: string;
  eventKey?: string;
  context?: HubNotificationContext;
}) {
  if (!args.accessToken) return false;
  try {
    const response = await fetch("/api/notifications", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        eventType: args.eventType,
        location: args.location || "All Locations",
        eventKey: args.eventKey || "",
        context: args.context ?? {},
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
