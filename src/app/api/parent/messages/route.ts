import { parentErrorResponse, requireParent } from "@/lib/server/require-parent";

type DbRow = Record<string, unknown>;

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeMessages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(-250).map((entry) => {
    const message = object(entry);
    return {
      id: text(message.id).slice(0, 120),
      direction: text(message.direction) === "Family to TCS" ? "Family to TCS" : "TCS to Family",
      subject: text(message.subject).slice(0, 160),
      body: text(message.body).slice(0, 5000),
      createdAt: text(message.createdAt).slice(0, 40),
      createdBy: text(message.createdBy).slice(0, 160),
      readAt: text(message.readAt).slice(0, 40),
    };
  });
}

export async function POST(request: Request) {
  try {
    const { admin, user, email, children } = await requireParent(request);
    const body = object(await request.json().catch(() => ({})));
    const childId = text(body.childId);
    const subject = text(body.subject).slice(0, 160);
    const messageBody = text(body.body).slice(0, 5000);

    if (!childId || !subject || !messageBody) {
      throw new Response("Choose a child and enter a subject and message.", { status: 400 });
    }

    const child = children.find((item) => item.legacyId === childId);
    if (!child) throw new Response("That child is not linked to your Parent Portal account.", { status: 403 });
    if (!child.access.permissions.messageStaff) throw new Response("Messaging is not enabled for your access to this child.", { status: 403 });

    const record = object(child.record);
    const message = {
      id: `family-message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      direction: "Family to TCS",
      subject,
      body: messageBody,
      createdAt: new Date().toISOString(),
      createdBy: email,
      readAt: "",
    };
    const nextMessages = [...safeMessages(record.familyMessages), message].slice(-250);
    const nextRecord = { ...record, familyMessages: nextMessages };

    const updated = await admin
      .from("children")
      .update({ record_data: nextRecord, updated_by: user.id })
      .eq("id", child.rowId)
      .select("id")
      .maybeSingle();

    if (updated.error) throw updated.error;
    if (!updated.data) throw new Error("The family message was not returned after saving.");

    await admin.from("audit_log").insert({
      organization_id: child.organizationId,
      location_id: child.locationId || null,
      actor_user_id: user.id,
      action: "UPDATE",
      table_name: "children",
      row_id: child.rowId,
      metadata: {
        kind: "parent_portal_family_message",
        childLegacyId: child.legacyId,
      },
    });

    return Response.json({ ok: true, message });
  } catch (error) {
    return parentErrorResponse(error);
  }
}
