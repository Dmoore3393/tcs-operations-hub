import { after } from "next/server";
import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { flushTransportAssignmentNotices } from "@/lib/server/transport-assignment-notifications";
import { flushTransportCustodyPushes } from "@/lib/server/transport-custody-push";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const context = await requireStaff(request);
    if (!context.isOwner && !context.isLicensee && !context.profile.permissions.includes("transportation")) {
      return Response.json({ error: "Transportation access is required." }, { status: 403 });
    }
    const body = await request.json();
    if (!Array.isArray(body?.changes) || body.changes.length > 500) {
      return Response.json({ error: "Choose valid trip changes." }, { status: 400 });
    }
    // The original RLS and optimistic concurrency checks run as the signed-in driver.
    const result = await context.userClient.rpc("patch_transport_records", { p_changes: body.changes });
    if (result.error) return Response.json({ error: result.error.message }, { status: /changed|no longer available/i.test(result.error.message) ? 409 : 400 });
    after(async () => {
      const results = await Promise.allSettled([
        flushTransportCustodyPushes(context.admin, context.profile.organization_id),
        flushTransportAssignmentNotices(context),
      ]);
      if (results.some(outcome => outcome.status === "rejected")) console.error("Transportation push dispatch will retry.");
    });
    return Response.json({ saved: result.data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return staffErrorResponse(error); }
}
