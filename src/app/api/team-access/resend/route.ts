import { createClient } from "@supabase/supabase-js";
import { requireOwner, responseFromThrown } from "@/lib/server/require-owner";

export const runtime = "nodejs";

type ResendBody = { user_id?: string };

export async function POST(request: Request) {
  try {
    const { admin, user, profile } = await requireOwner(request);
    const body = (await request.json()) as ResendBody;
    const userId = body.user_id?.trim();
    if (!userId) return Response.json({ error: "Account ID is required." }, { status: 400 });

    const { data: account, error: accountError } = await admin
      .from("staff_access")
      .select("user_id,email,full_name,role,locations,permissions,accepted_at")
      .eq("user_id", userId)
      .eq("organization_id", profile.organization_id)
      .maybeSingle();

    if (accountError) throw accountError;
    if (!account) return Response.json({ error: "Staff account not found." }, { status: 404 });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || new URL(request.url).origin;
    const redirectTo = `${siteUrl}/accept-invite`;
    const sentAt = new Date().toISOString();

    let sentAs: "invite" | "password setup" = "invite";
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(account.email, {
      data: {
        tcs_full_name: account.full_name,
        tcs_role: account.role,
        tcs_locations: account.locations,
        tcs_permissions: account.permissions,
        tcs_organization_id: profile.organization_id,
        tcs_invited_by: user.id,
      },
      redirectTo,
    });

    if (inviteError) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !publishable) throw inviteError;
      const mailClient = createClient(url, publishable, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { error: recoveryError } = await mailClient.auth.resetPasswordForEmail(account.email, { redirectTo });
      if (recoveryError) throw recoveryError;
      sentAs = "password setup";
    }

    await admin.from("staff_access").update({ invited_at: sentAt, invited_by: user.id }).eq("user_id", userId);
    await admin.from("staff_invitations").update({ invited_at: sentAt, invited_by: user.id, status: account.accepted_at ? "accepted" : "pending" })
      .eq("organization_id", profile.organization_id)
      .ilike("email", account.email);

    return Response.json({ ok: true, sentAs });
  } catch (error) {
    return responseFromThrown(error);
  }
}
