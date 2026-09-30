import {
  parsePushSubscriptions,
  pushDeviceId,
  savePushSubscriptions,
} from "@/lib/server/notifications";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import {
  parseNativePushRegistrations,
  saveNativePushRegistrations,
} from "@/lib/server/native-push";

type StaffRow = {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  organization_id: string;
  is_active: boolean;
};

export async function GET(request: Request) {
  try {
    const { admin, profile, isOwner } = await requireStaff(request);
    if (!isOwner) throw new Response("Only Owner/Admin accounts can manage team devices.", { status: 403 });

    const { data: staff, error } = await admin
      .from("staff_access")
      .select("user_id,full_name,email,role,organization_id,is_active")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true)
      .order("full_name", { ascending: true });
    if (error) throw error;

    const rows: Array<{
      userId: string;
      fullName: string;
      email: string;
      role: string;
      devices: Array<{
        id: string;
        createdAt: string;
        lastSeenAt: string;
        userAgent: string;
        expirationTime: number | null;
        kind?: "web" | "ios";
      }>;
    }> = [];

    for (const record of (staff ?? []) as StaffRow[]) {
      const { data } = await admin.auth.admin.getUserById(record.user_id);
      if (!data.user) continue;
      const webDevices = parsePushSubscriptions(data.user).map((item) => ({
        id: pushDeviceId(item.endpoint),
        createdAt: item.createdAt,
        lastSeenAt: item.lastSeenAt,
        userAgent: item.userAgent,
        expirationTime: item.expirationTime,
        kind: "web" as const,
      }));
      const nativeDevices = parseNativePushRegistrations(data.user).map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        lastSeenAt: item.lastSeenAt,
        userAgent: `The Hub iPhone app • v${item.appVersion || "1.0"}`,
        expirationTime: null,
        kind: "ios" as const,
      }));
      const devices = [...nativeDevices, ...webDevices];
      if (!devices.length) continue;
      rows.push({
        userId: record.user_id,
        fullName: record.full_name || record.email || "TCS Staff",
        email: record.email || "",
        role: record.role || "",
        devices,
      });
    }

    return Response.json({ staffDevices: rows }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { admin, userClient, profile, isOwner } = await requireStaff(request);
    if (!isOwner) throw new Response("Only Owner/Admin accounts can revoke team devices.", { status: 403 });

    const body = await request.json() as { userId?: string; deviceId?: string };
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
    if (!userId || !deviceId) throw new Response("Choose a registered staff device.", { status: 400 });

    const { data: staff, error: staffError } = await admin
      .from("staff_access")
      .select("user_id,organization_id")
      .eq("user_id", userId)
      .eq("organization_id", profile.organization_id)
      .maybeSingle();
    if (staffError) throw staffError;
    if (!staff) throw new Response("That staff account is outside this organization.", { status: 403 });

    const { data: authData, error: authError } = await admin.auth.admin.getUserById(userId);
    if (authError || !authData.user) throw authError ?? new Error("Staff account not found.");

    const webCurrent = parsePushSubscriptions(authData.user);
    const nativeCurrent = parseNativePushRegistrations(authData.user);
    const webNext = webCurrent.filter((item) => pushDeviceId(item.endpoint) !== deviceId);
    const nativeNext = nativeCurrent.filter((item) => item.id !== deviceId);

    if (webNext.length === webCurrent.length && nativeNext.length === nativeCurrent.length) {
      throw new Response("Registered device not found.", { status: 404 });
    }

    if (webNext.length !== webCurrent.length) {
      await savePushSubscriptions(admin, authData.user, webNext);
    } else {
      await saveNativePushRegistrations(admin, authData.user, nativeNext);
    }

    await userClient.rpc("record_audit_event", {
      p_action: "REVIEW",
      p_table_name: "notifications",
      p_row_id: null,
      p_location_id: null,
      p_metadata: {
        kind: "team_push_device_revoked",
        staffUserId: userId,
        deviceId,
      },
    });

    return Response.json({ ok: true, remainingDevices: webNext.length + nativeNext.length });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
