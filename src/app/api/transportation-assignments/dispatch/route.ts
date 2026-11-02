import {requireStaff,staffErrorResponse} from "@/lib/server/require-staff";
import {flushTransportAssignmentNotices} from "@/lib/server/transport-assignment-notifications";
export async function POST(request:Request){try{
 const c=await requireStaff(request);
 if(!c.isOwner&&!c.isLicensee&&!c.profile.permissions.includes('transportation'))return Response.json({error:'Transportation access required.'},{status:403});
 await flushTransportAssignmentNotices(c);
 return Response.json({ok:true});
}catch(error){return staffErrorResponse(error);}}
