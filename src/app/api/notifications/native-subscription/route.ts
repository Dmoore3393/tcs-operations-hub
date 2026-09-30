import {
  parseNativePushRegistrations,
  saveNativePushRegistrations,
  upsertNativePushRegistration,
} from "@/lib/server/native-push";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(request: Request) {
  try {
    const { admin, user } = await requireStaff(request);
    const state = await admin.auth.admin.getUserById(user.id);
    if (state.error || !state.data.user) throw state.error || new Error("Could not load native notification devices.");

    const devices = parseNativePushRegistrations(state.data.user);
    return Response.json({
      devices: devices.map((item) => ({
        id: item.id,
        platform: item.platform,
        environment: item.environment,
        bundleId: item.bundleId,
        appVersion: item.appVersion,
        createdAt: item.createdAt,
        lastSeenAt: item.lastSeenAt,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { admin, user } = await requireStaff(request);
    const body = await request.json() as Record<string, unknown>;

    const deviceToken = clean(body.deviceToken, 300).toLowerCase();
    const environment = clean(body.environment, 20) === "sandbox" ? "sandbox" : "production";
    const bundleId = clean(body.bundleId, 180) || "com.thomasonchildcaresolutions.thehub";
    const appVersion = clean(body.appVersion, 40) || "1.0.0";

    if (!/^[a-f0-9]{64,256}$/i.test(deviceToken)) {
      throw new Response("Invalid native push token.", { status: 400 });
    }

    const state = await admin.auth.admin.getUserById(user.id);
    if (state.error || !state.data.user) throw state.error || new Error("Could not load native notification devices.");

    const next = upsertNativePushRegistration({
      current: parseNativePushRegistrations(state.data.user),
      deviceToken,
      environment,
      bundleId,
      appVersion,
    });
    await saveNativePushRegistrations(admin, state.data.user, next);

    return Response.json({
      ok: true,
      deviceId: next[0]?.id || "",
      deviceCount: next.length,
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { admin, user } = await requireStaff(request);
    const body = await request.json() as Record<string, unknown>;
    const deviceId = clean(body.deviceId, 80);
    if (!deviceId) throw new Response("Choose a native device to remove.", { status: 400 });

    const state = await admin.auth.admin.getUserById(user.id);
    if (state.error || !state.data.user) throw state.error || new Error("Could not load native notification devices.");

    const current = parseNativePushRegistrations(state.data.user);
    const next = current.filter((item) => item.id !== deviceId);
    await saveNativePushRegistrations(admin, state.data.user, next);

    return Response.json({ ok: true, deviceCount: next.length });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
