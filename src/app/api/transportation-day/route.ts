import {flushTransportAssignmentNotices} from "@/lib/server/transport-assignment-notifications";
import {requireStaff,staffErrorResponse} from "@/lib/server/require-staff";
import {validTransportDate} from "@/lib/transportation-day";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{
 const c=await requireStaff(request);if(!c.isOwner&&!c.isLicensee&&!c.profile.permissions.includes('transportation'))return Response.json({error:'Transportation access required.'},{status:403});
 const date=new URL(request.url).searchParams.get('date')||'';if(!validTransportDate(date))return Response.json({error:'Choose a valid date.'},{status:400});
 const [result,sources,drivers]=await Promise.all([
  c.userClient.from('transportation_day_stops').select('*').eq('organization_id',c.profile.organization_id).eq('service_date',date),
  c.userClient.from('transportation_routes').select('id,legacy_id,child_id').eq('organization_id',c.profile.organization_id),
  c.userClient.from('staff_lane_profiles').select('id,full_name').eq('organization_id',c.profile.organization_id).eq('is_active',true),
 ]);
 for(const query of [result,sources,drivers])if(query.error)throw query.error;
 return Response.json({stops:result.data||[],sources:sources.data||[],drivers:(drivers.data||[]).map(row=>({id:row.id,name:row.full_name})),canPlan:c.isOwner,canCallOut:c.isOwner||c.isLicensee},{headers:{'Cache-Control':'private, no-store','Vary':'Authorization'}});
 }catch(error){return staffErrorResponse(error);}}
export async function POST(request:Request){try{
 const c=await requireStaff(request);if(!c.isOwner&&!c.isLicensee)return Response.json({error:'Only administration and assigned licensees can call out children.'},{status:403});
 const body=await request.json();if(!validTransportDate(body.date||'')||typeof body.routeId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.routeId)||!['save','callout','restore'].includes(body.action)||!Number.isInteger(body.expectedVersion)||body.expectedVersion<0)return Response.json({error:'Check the date and daily route selection.'},{status:400});
 if(body.action==='save'&&!c.isOwner)return Response.json({error:'Administration assigns daily routes. Licensees can call out or restore their children.'},{status:403});
 if(body.action==='callout'&&body.reason!==undefined&&!['sick','no_transportation'].includes(body.reason))return Response.json({error:'Choose Out sick or No transportation.'},{status:400});
 const result=await c.admin.rpc('save_transport_day_stop',{p_org:c.profile.organization_id,p_actor:c.user.id,p_route:body.routeId,p_day:body.date,p_action:body.action,p_plan:body.action==='callout'?{calloutReason:body.reason||'no_transportation'}:body.plan||{},p_expected_version:body.expectedVersion});
 if(result.error){const msg=result.error.message||'Could not update daily transportation.';return Response.json({error:msg},{status:/changed/.test(msg)?409:/assigned|Leadership|administration/.test(msg)?403:400});}
 // Dispatch from the saving request so the driver's app does not need to be open.
 try{await flushTransportAssignmentNotices(c);}catch(error){console.error('Daily transportation saved; alert dispatch failed',error instanceof Error?error.message:'dispatch failed');}
 return Response.json({ok:true,changedStops:result.data});
 }catch(error){return staffErrorResponse(error);}}
