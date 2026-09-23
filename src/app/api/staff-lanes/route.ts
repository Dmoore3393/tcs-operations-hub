import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await requireStaff(request);

    const [lanesResult, accessResult] = await Promise.all([
      auth.admin
        .from("staff_lane_profiles")
        .select("id,organization_id,staff_user_id,full_name,preferred_name,lane_level,lane_group,job_title,secondary_title,department,primary_location,reports_to_lane_id,reports_to_label,lane_summary,source_label,is_active,sort_order")
        .eq("organization_id", auth.profile.organization_id)
        .eq("is_active", true)
        .order("sort_order")
        .order("full_name"),
      auth.admin
        .from("staff_access")
        .select("user_id,role,is_active")
        .eq("organization_id", auth.profile.organization_id),
    ]);

    if (lanesResult.error) throw lanesResult.error;
    if (accessResult.error) throw accessResult.error;

    const accessMap = new Map((accessResult.data ?? []).map((row) => [String(row.user_id), row]));
    const lanes = (lanesResult.data ?? []).map((lane) => {
      const access = lane.staff_user_id ? accessMap.get(String(lane.staff_user_id)) : undefined;
      return {
        ...lane,
        access_role: access?.role ?? null,
        account_active: access ? Boolean(access.is_active) : null,
      };
    });

    return Response.json({
      lanes,
      currentUserId: auth.user.id,
      canManageLanes: auth.isOwner,
    }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
