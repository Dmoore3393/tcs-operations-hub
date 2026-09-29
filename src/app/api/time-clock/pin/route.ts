import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { staffClockPinConfigured, staffClockPinDigest } from "@/lib/server/staff-clock-pin";

type DbRow = Record<string, unknown>;

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  try {
    const { user } = await requireStaff(request);
    return Response.json({
      configured: staffClockPinConfigured(user),
      updatedAt: typeof user.app_metadata?.tcs_clock_pin_updated_at === "string"
        ? user.app_metadata.tcs_clock_pin_updated_at
        : "",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { admin, user, profile, isOwner } = await requireStaff(request);
    const body = object(await request.json().catch(() => ({})));
    const action = text(body.action) || "set";

    if (action === "set") {
      const pin = text(body.pin);
      if (!/^\d{4,6}$/.test(pin)) {
        throw new Response("Choose a 4–6 digit staff clock PIN.", { status: 400 });
      }

      const now = new Date().toISOString();
      const nextMetadata = {
        ...user.app_metadata,
        tcs_clock_pin_hmac: staffClockPinDigest(user.id, pin),
        tcs_clock_pin_updated_at: now,
      };

      const result = await admin.auth.admin.updateUserById(user.id, {
        app_metadata: nextMetadata,
      });
      if (result.error) throw result.error;

      await admin.from("audit_log").insert({
        organization_id: profile.organization_id,
        actor_user_id: user.id,
        action: "UPDATE",
        table_name: "staff_clock_pin",
        row_id: null,
        metadata: {
          kind: "staff_clock_pin_changed",
          staffUserId: user.id,
        },
      });

      return Response.json({ ok: true, configured: true, updatedAt: now });
    }

    if (action === "admin_reset") {
      if (!isOwner) {
        throw new Response("Only an Owner/Admin can reset another employee's clock PIN.", { status: 403 });
      }

      const targetUserId = text(body.targetUserId);
      if (!targetUserId) {
        throw new Response("Choose the staff account whose clock PIN should be reset.", { status: 400 });
      }

      const staffResult = await admin
        .from("staff_access")
        .select("user_id,full_name,is_active")
        .eq("organization_id", profile.organization_id)
        .eq("user_id", targetUserId)
        .maybeSingle();
      if (staffResult.error) throw staffResult.error;
      if (!staffResult.data) {
        throw new Response("That staff account was not found.", { status: 404 });
      }

      const targetResult = await admin.auth.admin.getUserById(targetUserId);
      if (targetResult.error || !targetResult.data.user) {
        throw new Response("That staff login was not found.", { status: 404 });
      }

      const targetUser = targetResult.data.user;
      const nextMetadata = { ...targetUser.app_metadata };
      delete nextMetadata.tcs_clock_pin_hmac;
      delete nextMetadata.tcs_clock_pin_updated_at;

      const updateResult = await admin.auth.admin.updateUserById(targetUserId, {
        app_metadata: nextMetadata,
      });
      if (updateResult.error) throw updateResult.error;

      await admin.from("audit_log").insert({
        organization_id: profile.organization_id,
        actor_user_id: user.id,
        action: "UPDATE",
        table_name: "staff_clock_pin",
        row_id: null,
        metadata: {
          kind: "staff_clock_pin_admin_reset",
          targetStaffUserId: targetUserId,
          targetStaffName: staffResult.data.full_name,
        },
      });

      return Response.json({
        ok: true,
        configured: false,
        targetUserId,
      });
    }

    throw new Response("Choose a valid staff clock PIN action.", { status: 400 });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
