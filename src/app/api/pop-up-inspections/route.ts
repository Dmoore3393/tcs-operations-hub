import {requireStaff,staffErrorResponse} from '@/lib/server/require-staff';
import {canUsePopUpInspections} from '@/lib/team-access';
import {inspectionScore,validInspectionDocument} from '@/lib/pop-up-inspections';
import {validTransportDate} from '@/lib/transportation-day';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
async function authorized(request:Request){const c=await requireStaff(request);if(!canUsePopUpInspections(c.profile))throw new Response('Private inspection access required',{status:403});return c;}
export async function GET(request:Request){try{
 const c=await authorized(request),org=c.profile.organization_id;
 const id=new URL(request.url).searchParams.get('id');
 if(id){
  if(!uuid(id))return Response.json({error:'Invalid inspection'},{status:400});
  const row=await c.admin.from('pop_up_inspections').select('*').eq('organization_id',org).eq('id',id).maybeSingle();if(row.error)throw row.error;if(!row.data)return Response.json({error:'Inspection not found'},{status:404});
  const history=await c.admin.from('pop_up_inspection_history').select('id,actor_id,created_at,after_data').eq('organization_id',org).eq('inspection_id',id).order('created_at',{ascending:false}).limit(100);if(history.error)throw history.error;
  return Response.json({inspection:row.data,history:history.data},{headers});
 }
 const [rows,locations]=await Promise.all([c.admin.from('pop_up_inspections').select('*').eq('organization_id',org).order('inspection_date',{ascending:false}).order('updated_at',{ascending:false}).limit(200),c.admin.from('locations').select('id,name,is_active,program_type').eq('organization_id',org).order('name')]);
 if(rows.error)throw rows.error;if(locations.error)throw locations.error;
 return Response.json({inspections:rows.data,locations:locations.data},{headers});
}catch(e){return staffErrorResponse(e);}}
export async function POST(request:Request){try{
 const c=await authorized(request),b=await request.json();
 if(!uuid(b.id)||!uuid(b.location_id)||!Number.isInteger(b.version)||b.version<0||typeof b.inspection_date!=='string'||!validTransportDate(b.inspection_date)||!['draft','completed'].includes(b.status)||!validInspectionDocument(b.document))return Response.json({error:'Check the location, date and checklist'},{status:400});
 if(b.status==='completed'&&inspectionScore(b.document.items).remaining)return Response.json({error:'Review each item or mark it Not applicable before completing. You can save a draft at any time.'},{status:400});
 const result=await c.admin.rpc('save_pop_up_inspection',{p_org:c.profile.organization_id,p_actor:c.user.id,p_id:b.id,p_version:b.version,p_location:b.location_id,p_date:b.inspection_date,p_status:b.status,p_document:b.document});
 if(result.error)return Response.json({error:result.error.message},{status:/changed|Completed/.test(result.error.message)?409:400});
 const saved=Array.isArray(result.data)?result.data[0]:result.data;
 if(!saved?.id)throw new Error('Inspection save could not be verified');
 return Response.json({inspection:saved},{headers});
}catch(e){return staffErrorResponse(e);}}
