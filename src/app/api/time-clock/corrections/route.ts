import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
export async function POST(request: Request) {
  try {
    const {admin,user,profile,isOwner,isLicensee} = await requireStaff(request);
    if (!isOwner && !isLicensee) return Response.json({error:"Only administration and location licensees can correct clock times."},{status:403});
    const body = await request.json();
    const result = await admin.rpc("correct_staff_clock_time", {
      p_org:profile.organization_id,p_actor:user.id,p_event:body.eventId,
      p_expected:body.expectedAt,p_time:body.correctedAt,p_reason:body.reason,
    });
    if (result.error) return Response.json({error:result.error.message},{status:result.error.code === "42501" ? 403 : 409});
    return Response.json({saved:true});
  } catch(error) {return staffErrorResponse(error);}
}
