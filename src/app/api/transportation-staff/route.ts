import {requireStaff,staffErrorResponse} from "@/lib/server/require-staff";
export async function GET(request:Request){try{
 const c=await requireStaff(request);
 if(!c.isOwner&&!c.isLicensee&&!c.profile.permissions.includes('transportation'))return Response.json({error:'Transportation access required.'},{status:403});
 const {data,error}=await c.admin.from('staff_lane_profiles').select('id,full_name,staff_user_id').eq('organization_id',c.profile.organization_id).eq('is_active',true).order('full_name');
 if(error)throw error;
 return Response.json({staff:(data||[]).map(row=>({id:row.id,name:row.full_name,hasLogin:Boolean(row.staff_user_id)}))},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return staffErrorResponse(error);}}
