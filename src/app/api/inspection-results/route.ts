import {requireStaff,staffErrorResponse} from '@/lib/server/require-staff';
import {canUsePopUpInspections,isLicenseeAccessRole} from '@/lib/team-access';
import {normalizeLocation} from '@/lib/location-config';
import {sameInspectionLocation,type InspectionCorrection,type ReleasedInspection} from '@/lib/inspection-results';
import {validTransportDate} from '@/lib/transportation-day';
import {inspectionReportPdf} from '@/lib/server/inspection-report-pdf';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Vary':'Authorization'};
const json=(v:unknown,status=200)=>Response.json(v,{headers,status});
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
async function context(request:Request){
 const c=await requireStaff(request),leader=canUsePopUpInspections(c.profile);
 if(!leader&&!c.isLicensee)throw new Response('Inspection results require assigned licensee access',{status:403});
 // Read saved assignments, not temporary all-location backup coverage.
 const [staff,sites]=await Promise.all([c.admin.from('staff_access').select('user_id,full_name,role,locations').eq('organization_id',c.profile.organization_id).eq('is_active',true),c.admin.from('locations').select('id,name').eq('organization_id',c.profile.organization_id)]);
 if(staff.error)throw staff.error;if(sites.error)throw sites.error;
 const mine=staff.data?.find(p=>p.user_id===c.user.id);
 const locations=(sites.data||[]).filter(s=>leader||sameInspectionLocation(mine?.locations||[],s.name,normalizeLocation));
 const people=(staff.data||[]).filter(p=>isLicenseeAccessRole(p.role)).map(p=>({...p,location_ids:(sites.data||[]).filter(s=>sameInspectionLocation(p.locations||[],s.name,normalizeLocation)).map(s=>s.id)}));
 return {c,leader,locations,people};
}
export async function GET(request:Request){try{
 const {c,leader,locations,people}=await context(request),params=new URL(request.url).searchParams,id=params.get('id');
 if(!locations.length)return json({releases:[],tasks:[],people:[],leader});
 let query=c.admin.from('inspection_releases').select('*').eq('organization_id',c.profile.organization_id).in('location_id',locations.map(l=>l.id)).order('released_at',{ascending:false});
 if(id){if(!uuid(id))return json({error:'Invalid inspection'},400);query=query.eq('id',id);}
 const r=await query;if(r.error)throw r.error;
 if(id&&!r.data?.length)return json({error:'Released inspection not accessible'},404);
 const ids=(r.data||[]).map(r=>r.id),t=ids.length?await c.admin.from('inspection_corrections').select('*').in('inspection_id',ids).order('due_date'):{data:[],error:null};if(t.error)throw t.error;
 if(params.get('format')==='pdf'){
  if(!id||!r.data?.[0])return json({error:'Choose a released inspection'},400);
  const pdf=await inspectionReportPdf(r.data[0] as ReleasedInspection,t.data as InspectionCorrection[]);
  return new Response(new Uint8Array(pdf),{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="inspection-${id}.pdf"`}});
 }
 return json({releases:r.data,tasks:t.data,people:leader?people:[],leader});
}catch(e){return staffErrorResponse(e);}}
export async function POST(request:Request){try{
 const {c,leader,locations,people}=await context(request),b=await request.json();
 if(!uuid(b.id))return json({error:'Choose a valid inspection or correction'},400);
 if(b.action==='release'){
  if(!leader) return json({error:'Only inspection leadership can release results'},403);
  const v=await c.admin.from('pop_up_inspections').select('location_id').eq('organization_id',c.profile.organization_id).eq('id',b.id).maybeSingle();if(v.error)throw v.error;
  if(!v.data||!people.some(p=>p.user_id===b.assignee&&p.location_ids.includes(v.data?.location_id||'')))return json({error:'Choose a licensee assigned to this location'},400);
  if(typeof b.due!=='string'||!validTransportDate(b.due))return json({error:'Choose a correction due date'},400);
  const r=await c.admin.rpc('release_inspection',{p_org:c.profile.organization_id,p_actor:c.user.id,p_id:b.id,p_assignee:b.assignee,p_due:b.due});if(r.error)return json({error:r.error.message},400);
 }else{
  if(!['submit','accept','return'].includes(b.action)||!Number.isInteger(b.version)||typeof b.note!=='string'||b.note.length>6000)return json({error:'Check correction action and notes'},400);
  const t=await c.admin.from('inspection_corrections').select('inspection_id,assigned_user_id').eq('id',b.id).maybeSingle();if(t.error)throw t.error;
  const r=t.data?await c.admin.from('inspection_releases').select('location_id').eq('organization_id',c.profile.organization_id).eq('id',t.data.inspection_id).maybeSingle():null;if(r?.error)throw r.error;
  if(!r?.data||!locations.some(l=>l.id===r.data?.location_id)||(!leader&&(b.action!=='submit'||t.data?.assigned_user_id!==c.user.id)))return json({error:'Correction not accessible'},403);
  const update=await c.admin.rpc('update_inspection_correction',{p_org:c.profile.organization_id,p_actor:c.user.id,p_id:b.id,p_version:b.version,p_action:b.action,p_note:b.note.trim()});if(update.error)return json({error:update.error.message},409);
 }
 return json({ok:true});
}catch(e){return staffErrorResponse(e);}}
