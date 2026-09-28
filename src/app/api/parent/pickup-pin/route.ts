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
    if (!["set", "clear"].includes(action)) throw new Response("Choose a valid attendance PIN action.", { status: 400 });
    if (action === "set" && !/^\d{4,6}$/.test(pin)) {
      throw new Response("Attendance PIN must be 4 to 6 numbers.", { status: 400 });
    }

    const child = children.find((item) => item.legacyId === childId);
    if (!child) throw new Response("This child is not linked to your Parent Portal account.", { status: 403 });
    if (!child.access.permissions.managePickup) throw new Response("Attendance PIN changes are not enabled for your family access.", { status: 403 });

    const linkedChildren = children.filter((item) => item.access.permissions.managePickup);
    const updatedAt = action === "set" ? new Date().toISOString() : "";
    const digest = action === "set" ? digestPin(pin) : "";

    for (const linkedChild of linkedChildren) {
      const current = await admin
        .from("children")
        .select("id,organization_id,location_id,record_data")
        .eq("id", linkedChild.rowId)
        .maybeSingle();

      if (current.error) throw current.error;
      if (!current.data) continue;

      const record = object(current.data.record_data);
      const next = { ...record };

      if (action === "clear") {
        delete next.pickupPinDigest;
        delete next.pickupPinUpdatedAt;
      } else {
        next.pickupPinDigest = digest;
        next.pickupPinUpdatedAt = updatedAt;
      }

      const updated = await admin
        .from("children")
        .update({ record_data: next })
        .eq("id", linkedChild.rowId)
        .select("id")
        .maybeSingle();

      if (updated.error) throw updated.error;
      if (!updated.data) throw new Error("A family attendance PIN change was not returned.");

      await admin.from("audit_log").insert({
        organization_id: linkedChild.organizationId,
        location_id: linkedChild.locationId || null,
        actor_user_id: user.id,
        action: "UPDATE",
        table_name: "children",
        row_id: linkedChild.rowId,
        metadata: {
          kind: "parent_portal_family_attendance_pin",
          action,
          childId: linkedChild.legacyId,
        },
      });
    }

    return Response.json({
      ok: true,
      configured: action === "set",
      updatedAt,
      childrenUpdated: linkedChildren.length,
    });
  } catch (error) {
    return parentErrorResponse(error);
  }
}
