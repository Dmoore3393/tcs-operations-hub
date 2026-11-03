import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendPendingStaffSetup } from "@/lib/server/staff-setup-links";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email)) return Response.json({ error: "Enter your invitation email address." }, { status: 400, headers });
    const admin = createSupabaseAdminClient();
    const result = await admin.from("staff_access").select("user_id,organization_id,email,invited_at")
      .ilike("email", email).eq("is_active", true).is("accepted_at", null).maybeSingle();
    if (result.error) throw result.error;
    if (result.data) {
      try { await sendPendingStaffSetup(admin, result.data, process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin); }
      catch (error) { if (!(error instanceof Response && error.status === 429)) throw error; }
    }
    // Unknown, paused, completed and pending accounts all receive the same response.
    return Response.json({ ok: true }, { headers });
  } catch {
    return Response.json({ error: "The setup email could not be requested. Please try again later or contact Danielle or Jennifer." }, { status: 503, headers });
  }
}
