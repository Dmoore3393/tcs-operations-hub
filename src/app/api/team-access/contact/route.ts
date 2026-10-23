import { requireOwner, responseFromThrown } from "@/lib/server/require-owner";
import { STAFF_CONTACT_METADATA_KEY, validateStaffContact } from "@/lib/staff-contact";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  try {
    const { admin, profile } = await requireOwner(request);
    const body = await request.json().catch(() => null) as { user_id?: unknown; contact?: unknown } | null;
    const userId = typeof body?.user_id === "string" ? body.user_id.trim() : "";
    if (!userId) return Response.json({ error: "Choose a staff account." }, { status: 400 });
    // Existing accounts can have incomplete contact details; admins may add just a birthday.
    const validated = validateStaffContact(body?.contact, false);
    if (validated.error) return Response.json({ error: validated.error }, { status: 400 });

    const { data: target, error } = await admin.from("staff_access")
      .select("user_id")
      .eq("user_id", userId)
      .eq("organization_id", profile.organization_id)
      .maybeSingle();
    if (error) throw error;
    if (!target) return Response.json({ error: "Staff account not found." }, { status: 404 });

    const result = await admin.auth.admin.updateUserById(target.user_id, {
      user_metadata: { [STAFF_CONTACT_METADATA_KEY]: validated.contact },
    });
    if (result.error) throw result.error;
    return Response.json({ ok: true, contact: validated.contact });
  } catch (error) {
    return responseFromThrown(error);
  }
}
