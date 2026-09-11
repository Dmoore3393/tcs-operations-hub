import { loadNotificationState, parsePushSubscriptions, savePushSubscriptions } from "@/lib/server/notifications";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { getVapidPublicKey, type StoredPushSubscription } from "@/lib/server/web-push";

type SubscriptionBody = {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

function validateSubscription(body: SubscriptionBody) {
  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh.trim() : "";
  const auth = typeof body.keys?.auth === "string" ? body.keys.auth.trim() : "";

  if (!endpoint.startsWith("https://") || endpoint.length > 2000) {
    throw new Response("Invalid push subscription endpoint.", { status: 400 });
  }
  if (!p256dh || p256dh.length > 500 || !auth || auth.length > 200) {
    throw new Response("Invalid push subscription keys.", { status: 400 });
  }

  return {
    endpoint,
    expirationTime: typeof body.expirationTime === "number" ? body.expirationTime : null,
    keys: { p256dh, auth },
  };
}

export async function GET(request: Request) {
  try {
    const { admin, user } = await requireStaff(request);
    const state = await loadNotificationState(admin, user.id);
    const subscriptions = parsePushSubscriptions(state.user);
    return Response.json({
      publicKey: getVapidPublicKey(),
      subscriptionCount: subscriptions.length,
      endpoints: subscriptions.map((item) => item.endpoint),
    }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { admin, user } = await requireStaff(request);
    const raw = await request.json() as SubscriptionBody;
    const validated = validateSubscription(raw);
    const state = await loadNotificationState(admin, user.id);
    const now = new Date().toISOString();

    const next: StoredPushSubscription = {
      ...validated,
      createdAt: parsePushSubscriptions(state.user).find((item) => item.endpoint === validated.endpoint)?.createdAt || now,
      lastSeenAt: now,
      userAgent: (request.headers.get("user-agent") || "Unknown device").slice(0, 300),
    };

    const current = parsePushSubscriptions(state.user).filter((item) => item.endpoint !== next.endpoint);
    await savePushSubscriptions(admin, state.user, [next, ...current]);

    return Response.json({
      ok: true,
      subscriptionCount: Math.min(8, current.length + 1),
      endpoint: next.endpoint,
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { admin, user } = await requireStaff(request);
    const body = await request.json() as { endpoint?: string };
    const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
    if (!endpoint) throw new Response("Push subscription endpoint is required.", { status: 400 });

    const state = await loadNotificationState(admin, user.id);
    const current = parsePushSubscriptions(state.user);
    const next = current.filter((item) => item.endpoint !== endpoint);
    await savePushSubscriptions(admin, state.user, next);

    return Response.json({ ok: true, subscriptionCount: next.length });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
