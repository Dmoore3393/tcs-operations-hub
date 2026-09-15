import { randomBytes, scryptSync } from "node:crypto";
import { parentErrorResponse, requireParent } from "@/lib/server/require-parent";

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
    const { admin, user, children } = await requireParent(request);
    const body = object(await request.json().catch(() => ({})));
    const childId = text(body.childId);
    const action = text(body.action) || "set";
    const pin = text(body.pin);

    if (!childId) throw new Response("Choose a child record.", { status: 400 });
    if (!["set", "clear"].includes(action)) throw new Response("Choose a valid pickup PIN action.", { status: 400 });
    if (action === "set" && !/^\d{4,6}$/.test(pin)) {
      throw new Response("Pickup PIN must be 4 to 6 numbers.", { status: 400 });
    }

    const child = children.find((item) => item.legacyId === childId);
    if (!child) throw new Response("This child is not linked to your Parent Portal account.", { status: 403 });
    if (!child.access.permissions.managePickup) throw new Response("Pickup PIN changes are not enabled for your access to this child.", { status: 403 });

    const current = await admin
      .from("children")
      .select("id,organization_id,location_id,record_data")
      .eq("id", child.rowId)
      .maybeSingle();

    if (current.error) throw current.error;
    if (!current.data) throw new Response("The child record was not found.", { status: 404 });

    const record = object(current.data.record_data);
    const next = { ...record };

    if (action === "clear") {
      delete next.pickupPinDigest;
      delete next.pickupPinUpdatedAt;
    } else {
      next.pickupPinDigest = digestPin(pin);
      next.pickupPinUpdatedAt = new Date().toISOString();
    }

    const updated = await admin
      .from("children")
      .update({ record_data: next })
      .eq("id", child.rowId)
      .select("id,record_data")
      .maybeSingle();

    if (updated.error) throw updated.error;
    if (!updated.data) throw new Error("The pickup PIN change was not returned.");

    await admin.from("audit_log").insert({
      organization_id: child.organizationId,
      location_id: child.locationId || null,
      actor_user_id: user.id,
      action: "UPDATE",
      table_name: "children",
      row_id: child.rowId,
      metadata: {
        kind: "parent_portal_pickup_pin",
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
    return parentErrorResponse(error);
  }
}
