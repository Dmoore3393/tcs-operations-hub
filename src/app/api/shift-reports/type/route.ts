import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { defaultShiftWindow } from "@/lib/shift-report-type";
export async function PATCH(request:Request) {
 try {
  const {userClient,user,profile}=await requireStaff(request);
  const body=await request.json();
  if(typeof body.id!=='string'||!['Opening','Closing'].includes(body.type)||!['Opening','Closing'].includes(body.expectedType)) return Response.json({error:'Choose Opening or Closing.'},{status:400});
  const result=await userClient.from('shift_reports').select('*').eq('organization_id',profile.organization_id).eq('legacy_id',body.id).maybeSingle();
  if(result.error)throw result.error;
  const row=result.data;
  if(!row) return Response.json({error:'Report not found or access denied.'},{status:404});
  if(!['Draft','Submitted'].includes(row.status))return Response.json({error:'Reviewed reports cannot be changed.'},{status:409});
  if(row.report_type===body.type)return Response.json({ok:true});
  if(row.report_type!==body.expectedType)return Response.json({error:'This report changed. Refresh Report History and try again.'},{status:409});
  const data=row.record_data;
  const record={...data,type:body.type,shiftWindow:data.shiftWindow===defaultShiftWindow(row.report_type)?defaultShiftWindow(body.type):data.shiftWindow,
   typeCorrections:[...(Array.isArray(data.typeCorrections)?data.typeCorrections:[]),{from:row.report_type,to:body.type,by:user.id,at:new Date().toISOString(),originalChecklist:data.checklist}]};
  // Use the caller's RLS permissions and optimistic version check. No service-role write.
  const updated=await userClient.from('shift_reports').update({report_type:body.type,record_data:record}).eq('id',row.id).eq('updated_at',row.updated_at).eq('status',row.status).select('id').maybeSingle();
  if(updated.error)throw updated.error;
  if(!updated.data)return Response.json({error:'The report changed or you do not have permission to edit it. Refresh and try again.'},{status:409});
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return staffErrorResponse(error);}
}
