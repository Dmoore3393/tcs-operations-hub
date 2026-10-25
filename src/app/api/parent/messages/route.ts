import { parentErrorResponse, requireParent } from "@/lib/server/require-parent";
import { uuidPattern } from "@/lib/communications";

const text = (value: unknown, max = 5000) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function POST(request: Request) {
  try {
    const { admin, user, email, children } = await requireParent(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Response("Enter a valid message request.", { status: 400 });
    const childId = text(String(body.childId ?? ""), 120);
    const child = children.find((item) => item.legacyId === childId);
    if (!child || !child.access.permissions.messageStaff) throw new Response("Messaging is not enabled for your access to this child.", { status: 403 });
    const subject = text(body.subject, 160), messageBody = text(body.body);
    if (!subject || !messageBody) throw new Response("Enter a subject and message.", { status: 400 });
    // Existing packaged clients omit id; new clients keep the same id for retries.
    const id = uuidPattern.test(text(body.id, 36)) ? text(body.id, 36) : crypto.randomUUID();
    const message = { id, direction: "Family to TCS", subject, body: messageBody, createdAt: new Date().toISOString(), createdBy: email, readAt: "" };
    const updated = await admin.rpc("hub_update_family_messages", { p_child: child.rowId, p_actor: user.id, p_message: message });
    if (updated.error) throw updated.error;
    return Response.json({ ok: true, message });
  } catch (error) { return parentErrorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const { admin, user, children } = await requireParent(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Response("Enter a valid message request.", { status: 400 });
    const child = children.find((item) => item.legacyId === String(body.childId));
    if (!child || !child.access.permissions.viewMessages) throw new Response("This family conversation is unavailable to your account.", { status: 403 });
    const ids = Array.isArray(body.ids) ? body.ids.filter((id: unknown): id is string => typeof id === "string").slice(0, 500) : [];
    const updated = await admin.rpc("hub_update_family_messages", { p_child: child.rowId, p_actor: user.id, p_read_ids: ids, p_read_direction: "TCS to Family" });
    if (updated.error) throw updated.error;
    return Response.json({ ok: true });
  } catch (error) { return parentErrorResponse(error); }
}
