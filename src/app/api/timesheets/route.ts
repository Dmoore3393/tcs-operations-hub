import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";

export const runtime = "nodejs";

const COMMAND_TYPES = ["CCRC Stage 1", "CCRC Stage 2", "CCCC", "DCFS", "Respite"] as const;

export async function GET(request: Request) {
  try {
    const { profile } = await requireStaff(request);
    const routes = Object.fromEntries(COMMAND_TYPES.map((type) => [type, { department: "", email: "", deadline: "", fileNameFormat: "LastName_FirstName_ServiceMonth_Location.pdf" }]));
    return Response.json({
      records: [],
      routes,
      types: COMMAND_TYPES,
      collectors: [],
      actor: {
        name: profile.full_name,
        collectorSlug: null,
        canViewAll: true,
        canCreateBatch: false,
        canDynastyReview: false,
        canDynastyHandoff: false,
        canFillOut: false,
        canScan: false,
        canEmail: false,
        canManageRoutes: false,
      },
    });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireStaff(request);
    return Response.json({ ok: true });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
