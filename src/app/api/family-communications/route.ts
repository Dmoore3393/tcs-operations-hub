import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { uuidPattern } from "@/lib/communications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const text = (value: unknown, max = 5000) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function GET(request: Request) {
  try {
    const { userClient, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!isOwner && !isLicensee) throw new Response("Family messaging is available to Owner/Admin and assigned Licensees.", { status: 403 });
    const result = await userClient.from("children").select("legacy_id,first_name,last_name,guardian_name,record_data")
      .eq("organization_id", profile.organization_id).neq("enrollment_status", "Archived").order("last_name");
    if (result.error) throw result.error;
    const children = (result.data ?? []).map((row) => {
      const record = row.record_data || {};
      return { id: row.legacy_id, firstName: row.first_name, lastName: row.last_name, primaryGuardian: row.guardian_name || "", location: text(record.location, 160), guardianEmail: text(record.guardianEmail, 254), familyMessages: Array.isArray(record.familyMessages) ? record.familyMessages : [] };
    });
    return Response.json({ children }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return staffErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { admin, userClient, user, profile, isOwner, isLicensee } = await requireStaff(request);
    if (!isOwner && !isLicensee) throw new Response("Family messaging is available to Owner/Admin and assigned Licensees.", { status: 403 });
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Response("Enter a valid message request.", { status: 400 });
    const childId = text(String(body.childId ?? ""), 120);
    const row = await userClient.from("children").select("id").eq("organization_id", profile.organization_id).eq("legacy_id", childId).neq("enrollment_status", "Archived").maybeSingle();
    if (row.error) throw row.error;
    if (!row.data) throw new Response("This family conversation is unavailable to your account.", { status: 403 });
    const args: Record<string, unknown> = { p_child: row.data.id, p_actor: user.id };
    if (body.action === "read") {
      args.p_read_ids = Array.isArray(body.ids) ? body.ids.filter((id: unknown): id is string => typeof id === "string").slice(0, 500) : [];
      args.p_read_direction = "Family to TCS";
    } else if (body.action === "send") {
      const id = text(body.id, 36), subject = text(body.subject, 160), messageBody = text(body.body);
      if (!uuidPattern.test(id) || !subject || !messageBody) throw new Response("Enter a subject and message before sending.", { status: 400 });
      args.p_message = { id, direction: "TCS to Family", subject, body: messageBody, createdAt: new Date().toISOString(), createdBy: profile.full_name, readAt: "" };
    } else { throw new Response("Choose a supported message action.", { status: 400 }); }
    const saved = await admin.rpc("hub_update_family_messages", args);
    if (saved.error) throw saved.error;
    return Response.json({ ok: true, messages: saved.data });
  } catch (error) { return staffErrorResponse(error); }
}
