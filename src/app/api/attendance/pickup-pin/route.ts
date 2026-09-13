import { randomBytes, scryptSync } from "node:crypto";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

type DbRow = Record<string, unknown>;

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function digestPin(pin: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return `${salt.toString("base64url")}.${hash.toString("base64url")}`;
}

export async function POST(request: Request) {
  try {
    const { userClient, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!isOwner && !isLicensee) {
      throw new Response("Only Owner/Admin or an assigned Licensee can set a pickup PIN.", { status: 403 });
    }

    const body = object(await request.json().catch(() => ({})));
    const childId = text(body.childId);
    const pin = text(body.pin);
    const action = text(body.action) || "set";

    if (!childId) throw new Response("Choose a child record.", { status: 400 });
    if (!["set", "clear"].includes(action)) throw new Response("Choose a valid pickup PIN action.", { status: 400 });
    if (action === "set" && !/^\d{4,6}$/.test(pin)) {
      throw new Response("Pickup PIN must be 4 to 6 numbers.", { status: 400 });
    }

    const current = await userClient
      .from("children")
      .select("id,record_data,location_id")
      .eq("organization_id", profile.organization_id)
      .eq("legacy_id", childId)
      .maybeSingle();

    if (current.error) throw current.error;
    if (!current.data) throw new Response("That child record is not available to this account.", { status: 404 });

    const record = object(current.data.record_data);
    const next = { ...record };
    if (action === "clear") {
      delete next.pickupPinDigest;
      delete next.pickupPinUpdatedAt;
    } else {
      next.pickupPinDigest = digestPin(pin);
      next.pickupPinUpdatedAt = new Date().toISOString();
    }

    const updated = await userClient
      .from("children")
      .update({ record_data: next })
      .eq("id", current.data.id)
      .select("legacy_id,record_data")
      .maybeSingle();

    if (updated.error) throw updated.error;
    if (!updated.data) throw new Error("The pickup PIN update was not returned.");

    await userClient.rpc("record_audit_event", {
      p_action: "UPDATE",
      p_table_name: "children",
      p_row_id: current.data.id,
      p_location_id: current.data.location_id,
      p_metadata: {
        kind: "pickup_pin",
        action,
        childId,
      },
    });

    return Response.json({
      ok: true,
      configured: action === "set",
      updatedAt: action === "set" ? text(object(updated.data.record_data).pickupPinUpdatedAt) : "",
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
