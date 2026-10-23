import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { STAFF_CONTACT_METADATA_KEY, validateStaffContact } from "@/lib/staff-contact";
import { isSupportedAccessRole } from "@/lib/team-access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) return Response.json({ error: "Missing invitation session." }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return Response.json({ error: "The invitation link is invalid or expired." }, { status: 401 });

    const { data: profile, error: profileError } = await admin
      .from("staff_access")
      .select("organization_id,email,is_active,role,accepted_at")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) return Response.json({ error: "No TCS invitation is connected to this account." }, { status: 403 });
    if (!profile.is_active || !isSupportedAccessRole(profile.role)) return Response.json({ error: "This staff account is paused or needs an admin to update its access." }, { status: 403 });

    const body = await request.json().catch(() => null) as { email?: unknown; contact?: unknown } | null;
    const email = data.user.email?.trim().toLowerCase() ?? "";
    if (!/^\S+@\S+\.\S+$/.test(email) || typeof body?.email !== "string" || body.email.trim().toLowerCase() !== email || profile.email.trim().toLowerCase() !== email) {
      return Response.json({ error: "Use the email address associated with this staff invitation." }, { status: 400 });
    }
    const validated = validateStaffContact(body.contact);
    if (validated.error) return Response.json({ error: validated.error }, { status: 400 });

    // Contact names are never used for authorization. The admin-approved staff name,
    // role, location assignments, and permissions stay in staff_access.
    const saved = await admin.auth.admin.updateUserById(data.user.id, {
      user_metadata: { [STAFF_CONTACT_METADATA_KEY]: validated.contact },
    });
    if (saved.error) throw saved.error;

    const acceptedAt = profile.accepted_at || new Date().toISOString();
    const invitation = await admin.from("staff_invitations")
      .update({ status: "accepted", accepted_at: acceptedAt, auth_user_id: data.user.id })
      .eq("organization_id", profile.organization_id)
      .ilike("email", profile.email);
    if (invitation.error) throw invitation.error;

    const accepted = await admin.from("staff_access")
      .update({ accepted_at: acceptedAt })
      .eq("user_id", data.user.id)
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true)
      .select("user_id")
      .maybeSingle();
    if (accepted.error) throw accepted.error;
    if (!accepted.data) return Response.json({ error: "This staff account is no longer active. Contact an admin." }, { status: 403 });

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not activate the account.";
    return Response.json({ error: message }, { status: 500 });
  }
}
