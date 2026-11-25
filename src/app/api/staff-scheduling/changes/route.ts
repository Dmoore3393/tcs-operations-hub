import {requireStaff,staffErrorResponse} from '@/lib/server/require-staff';
import {normalizeLocation} from '@/lib/location-config';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validDate=(s:unknown):s is string=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
async function context(request:Request){
 const auth=await requireStaff(request);
 if(!auth.isOwner&&!auth.isLicensee)throw new Response('Administration or licensee access required.',{status:403});
 const result=await auth.admin.from('locations').select('id,name,slug,is_active').eq('organization_id',auth.profile.organization_id).eq('is_active',true).order('name');
 if(result.error)throw result.error;
 // Backup worksite access must not broaden access to private personnel reasons.
 const original=auth.isOwner?null:await auth.admin.from('staff_access').select('locations').eq('organization_id',auth.profile.organization_id).eq('user_id',auth.user.id).maybeSingle();
 if(original?.error)throw original.error;
 const assigned:string[]=original?.data?.locations||[];
 const locations=(result.data||[]).filter(l=>auth.isOwner||assigned.some(name=>normalizeLocation(name)===normalizeLocation(l.name))); 
 return {...auth,locations};
}
export async function GET(request:Request){try{
 const {admin,profile,isOwner,locations}=await context(request);
 if(!locations.length)return Response.json({locations:[],staff:[],changes:[],canResolve:isOwner});
 const [people,changes,assignments]=await Promise.all([
 admin.from('staff_access').select('user_id,full_name').eq('organization_id',profile.organization_id).eq('is_active',true).order('full_name'),
 admin.from('staff_schedule_changes').select('*').eq('organization_id',profile.organization_id).in('location_id',locations.map(l=>l.id)).order('submitted_at',{ascending:false}).limit(200),
 admin.from('staff_location_assignments').select('user_id,location_id').eq('organization_id',profile.organization_id).in('location_id',locations.map(l=>l.id)),
 ]);
 if(people.error||changes.error||assignments.error)throw new Error('Could not load schedule changes.');
 const staff=(people.data||[]).filter(p=>isOwner||assignments.data?.some(a=>a.user_id===p.user_id));
 return Response.json({locations,staff,changes:changes.data,canResolve:isOwner},{headers:{'Cache-Control':'no-store'}});
}catch(error){return staffErrorResponse(error);}}
export async function POST(request:Request){try{
 const {admin,profile,user,isOwner,locations}=await context(request);const b=await request.json().catch(()=>null);
 if(!b||typeof b!=='object')return Response.json({error:'Enter the schedule change details.'},{status:400});
 if(b.action==='resolve'){
  if(!isOwner)return Response.json({error:'Only administration can close a change.'},{status:403});
  if(typeof b.id!=='string'||!uuid.test(b.id))return Response.json({error:'Select a change notice.'},{status:400});
  const r=await admin.rpc('resolve_staff_schedule_change',{p_org:profile.organization_id,p_actor:user.id,p_id:b.id,p_status:b.status,p_note:b.note});
  if(r.error)return Response.json({error:r.error.message},{status:409});return Response.json({saved:true});
 }
 if(!locations.some(l=>l.id===b.locationId))return Response.json({error:'Choose an accessible location.'},{status:403});
 if(!validDate(b.startDate)||!validDate(b.endDate)||b.endDate<b.startDate||(Date.parse(b.endDate)-Date.parse(b.startDate))/86400000>366)return Response.json({error:'Choose valid dates up to one year apart.'},{status:400});
 const time=/^([01]\d|2[0-3]):[0-5]\d$/;
 if(typeof b.isOff!=='boolean'||(!b.isOff&&(typeof b.startTime!=='string'||typeof b.endTime!=='string'||!time.test(b.startTime)||!time.test(b.endTime)||b.endTime<=b.startTime)))return Response.json({error:'Choose OFF or enter an end time after the start time.'},{status:400});
 if(typeof b.reason!=='string'||b.reason.trim().length<3||b.reason.length>2000||typeof b.department!=='string'||b.department.length>100)return Response.json({error:'Enter a reason (3–2000 characters) and department up to 100 characters.'},{status:400});
 if(typeof b.staffId!=='string'||!uuid.test(b.staffId))return Response.json({error:'Choose an active staff member.'},{status:400});
 const person=await admin.from('staff_access').select('full_name').eq('organization_id',profile.organization_id).eq('user_id',b.staffId).eq('is_active',true).maybeSingle();
 if(person.error||!person.data)return Response.json({error:'Active staff member not found.'},{status:400});
 if(!isOwner){const assigned=await admin.from('staff_location_assignments').select('user_id').eq('organization_id',profile.organization_id).eq('location_id',b.locationId).eq('user_id',b.staffId).maybeSingle();if(assigned.error||!assigned.data)return Response.json({error:'Choose staff assigned to that location.'},{status:403});}
 const r=await admin.from('staff_schedule_changes').insert({organization_id:profile.organization_id,location_id:b.locationId,department:b.department.trim(),staff_user_id:b.staffId,staff_name:person.data.full_name,start_date:b.startDate,end_date:b.endDate,is_off:b.isOff,start_time:b.isOff?null:b.startTime,end_time:b.isOff?null:b.endTime,reason:b.reason.trim(),submitted_by:user.id,submitted_by_name:profile.full_name});
 if(r.error)throw r.error;
 return Response.json({saved:true});
}catch(error){return staffErrorResponse(error);}}
