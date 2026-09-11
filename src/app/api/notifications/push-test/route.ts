import { loadNotificationState, parsePushSubscriptions, savePushSubscriptions } from "@/lib/server/notifications";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { sendWebPush, type StoredPushSubscription } from "@/lib/server/web-push";

export async function POST(request: Request) {
  try {
    const { admin, user } = await requireStaff(request);
    const state = await loadNotificationState(admin, user.id);
    const subscriptions = parsePushSubscriptions(state.user);

    if (!subscriptions.length) {
      throw new Response("No background-push device is registered for this staff account.", { status: 409 });
    }

    let delivered = 0;
    const activeSubscriptions: StoredPushSubscription[] = [];
    const tag = `tcs-push-test:${Date.now()}`;

    for (const subscription of subscriptions) {
      try {
        const result = await sendWebPush(subscription, {
          title: "The Hub test notification",
          body: "Background notifications are working on this device.",
          href: "/notifications",
          tag,
        });
        if (result.ok) delivered += 1;
        if (!result.stale) activeSubscriptions.push(subscription);
      } catch {
        activeSubscriptions.push(subscription);
      }
    }

    if (activeSubscriptions.length !== subscriptions.length) {
      const refreshed = await admin.auth.admin.getUserById(user.id);
      if (refreshed.data.user) {
        await savePushSubscriptions(admin, refreshed.data.user, activeSubscriptions);
      }
    }

    return Response.json({
      ok: delivered > 0,
      delivered,
      registeredDevices: activeSubscriptions.length,
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}