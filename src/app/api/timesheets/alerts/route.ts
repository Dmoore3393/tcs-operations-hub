import {requireStaff,staffErrorResponse} from "@/lib/server/require-staff";
import {scanTimesheetAlerts} from "@/lib/server/timesheet-alerts";
export async function POST(request:Request){try{
 const {admin,profile,isOwner}=await requireStaff(request);
 if(!isOwner||!['Danielle Moore','Jennifer Thomason'].includes(profile.full_name))return Response.json({error:'Timesheet leadership access required.'},{status:403});
 return Response.json({ok:true,...await scanTimesheetAlerts(admin,profile.organization_id)});
}catch(error){return staffErrorResponse(error);}}
