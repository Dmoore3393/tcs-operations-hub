import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) return Response.json({ error: "Missing invitation session." }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return Response.json({ error: "The invitation link is invalid or expired." }, { status: 401 });

    const acceptedAt = new Date().toISOString();
    const { data: profile, error: profileError } = await admin
      .from("staff_access")
      .update({ accepted_at: acceptedAt, is_active: true })
      .eq("user_id", data.user.id)
      .select("organization_id,email")
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) return Response.json({ error: "No TCS invitation is connected to this account." }, { status: 403 });

    await admin.from("staff_invitations")
      .update({ status: "accepted", accepted_at: acceptedAt, auth_user_id: data.user.id })
      .eq("organization_id", profile.organization_id)
      .ilike("email", profile.email);

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not activate the account.";
    return Response.json({ error: message }, { status: 500 });
  }
}
