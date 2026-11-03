import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { flushTransportAssignmentNotices } from "@/lib/server/transport-assignment-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const context = await requireStaff(request);
    if (!context.isOwner && !context.isLicensee) return Response.json({ error: "Only administration and licensees can change children’s schools or route setup." }, { status: 403 });
    const body = await request.json().catch(() => null);
    if (!body || !["school", "routes"].includes(body.action)) return Response.json({ error: "Choose a school or school trip to save." }, { status: 400 });
    if (body.action === "school" && (typeof body.childId !== "string" || !body.childId || typeof body.school !== "string" || typeof body.expectedSchool !== "string")) return Response.json({ error: "Choose an existing child and school." }, { status: 400 });
    if (body.action === "routes" && (!Array.isArray(body.routes) || !body.routes.length || body.routes.length > 100)) return Response.json({ error: "Choose between one and 100 children." }, { status: 400 });
    const result = body.action === "school"
      ? await context.userClient.rpc("set_transport_child_school", { p_child_key: body.childId, p_school: body.school, p_expected_school: body.expectedSchool })
      : await context.userClient.rpc("save_transport_school_routes", { p_routes: body.routes, p_save_schools: body.saveSchools === true });
    if (result.error) return Response.json({ error: result.error.message || "Could not save transportation. Try again." }, { status: /changed|in transit/i.test(result.error.message) ? 409 : 400 });
    try { await flushTransportAssignmentNotices(context); } catch { console.error("Transportation saved; driver alerts remain queued."); }
    return Response.json({ ok: true, saved: result.data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return staffErrorResponse(error); }
}
