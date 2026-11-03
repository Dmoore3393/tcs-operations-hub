import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { exchangeStaffSetupLink, readStaffSetupLink } from "@/lib/server/staff-setup-links";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!["inspect", "exchange"].includes(body?.action)) return Response.json({ error: "Choose a setup action." }, { status: 400, headers });
    const admin = createSupabaseAdminClient();
    if (body.action === "exchange") return Response.json({ session: await exchangeStaffSetupLink(admin, body.token) }, { headers });
    const { link, profile } = await readStaffSetupLink(admin, body.token);
    return Response.json({ email: profile.email, fullName: profile.full_name, expiresAt: link.expires_at }, { headers });
  } catch (error) {
    if (error instanceof Response) return Response.json({ error: await error.text() }, { status: error.status, headers });
    return Response.json({ error: "The Hub could not verify your invitation. Please try again." }, { status: 503, headers });
  }
}
