import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await requireStaff(request);
    if (!auth.isOwner) throw new Response("Owner/Admin access is required for private personnel records.", { status: 403 });
    const { data, error } = await auth.admin.from("staff_personnel_imports")
      .select("id,source_name,lane_id,details,imported_at,staff_lane_profiles(full_name,is_active,job_title,primary_location)")
      .eq("organization_id", auth.profile.organization_id).order("source_name").limit(500);
    if (error) throw error;
    return Response.json({ records: data ?? [] }, { headers: { "Cache-Control": "private, no-store", "Vary": "Authorization" } });
  } catch (error) { return staffErrorResponse(error); }
}
