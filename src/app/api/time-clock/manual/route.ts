import {requireStaff,staffErrorResponse} from '@/lib/server/require-staff';
import {pacificWorkedTime} from '@/lib/manual-worked-hours';
export async function GET(request:Request) {
 try {
  const {admin,profile,isOwner}=await requireStaff(request);
  if(!isOwner)return Response.json({error:'Only administration can add worked hours.'},{status:403});
  const [staff,locations]=await Promise.all([
   admin.from('staff_access').select('user_id,full_name').eq('organization_id',profile.organization_id).eq('is_active',true).order('full_name'),
   admin.from('locations').select('id,name').eq('organization_id',profile.organization_id).eq('is_active',true).order('name'),
  ]);
  if(staff.error||locations.error)throw new Error('Could not load employees and work locations.');
  return Response.json({staff:staff.data,locations:locations.data},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return staffErrorResponse(error);}
}
export async function POST(request:Request) {
 try {
  const {admin,user,profile,isOwner}=await requireStaff(request);
  if(!isOwner)return Response.json({error:'Only administration can add worked hours.'},{status:403});
  const body=await request.json().catch(()=>null);
  if(!body||typeof body!=='object')return Response.json({error:'Enter the shift details.'},{status:400});
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(typeof body.staffId!=='string'||!uuid.test(body.staffId)||typeof body.locationId!=='string'||!uuid.test(body.locationId))return Response.json({error:'Choose an employee and work location.'},{status:400});
  let start:string,end:string;
  try{start=pacificWorkedTime(body.start);end=pacificWorkedTime(body.end);}catch(error){return Response.json({error:error instanceof Error?error.message:'Enter valid dates and times.'},{status:400});}
  if(typeof body.reason!=='string'||body.reason.trim().length<3||body.reason.length>1000)return Response.json({error:'Enter a reason (3–1000 characters).'},{status:400});
  const result=await admin.rpc('add_staff_worked_hours',{p_org:profile.organization_id,p_actor:user.id,p_staff:body.staffId,p_location:body.locationId,p_start:start,p_end:end,p_reason:body.reason});
  if(result.error)return Response.json({error:result.error.message},{status:result.error.code==='42501'?403:409});
  return Response.json(result.data);
 }catch(error){return staffErrorResponse(error);}
}
