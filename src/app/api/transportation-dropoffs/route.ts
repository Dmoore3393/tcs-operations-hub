import {after} from 'next/server';
import {requireStaff,staffErrorResponse} from '@/lib/server/require-staff';
import {flushTransportCustodyPushes} from '@/lib/server/transport-custody-push';
import {transportServiceDate} from '@/lib/transportation-day';
export const runtime='nodejs';
export async function POST(request:Request){try{
 const c=await requireStaff(request);
 if(!c.isOwner&&!c.isLicensee&&!c.profile.permissions.includes('transportation'))return Response.json({error:'Transportation access required.'},{status:403});
 const body=await request.json();
 if(body.confirmed!==true||body.date!==transportServiceDate()||!Array.isArray(body.stops)||body.stops.length<1||body.stops.length>30||!Array.isArray(body.group)||body.group.length!==5||body.group.some((v:unknown)=>typeof v!=='string'||v.length>1000)||body.stops.some((v:{id?:unknown;arrivedAt?:unknown})=>!v||typeof v.id!=='string'||!v.id||v.id.length>200||typeof v.arrivedAt!=='string'||!Number.isFinite(Date.parse(v.arrivedAt))))return Response.json({error:'Review today’s selected children and confirm their physical handoff.'},{status:400});
 const saved=await c.userClient.rpc('confirm_selected_transport_dropoffs',{p_day:body.date,p_stops:body.stops,p_group:body.group});
 if(saved.error)return Response.json({error:saved.error.message},{status:/changed|no longer|selection/.test(saved.error.message)?409:400});
 after(async()=>{try{await flushTransportCustodyPushes(c.admin,c.profile.organization_id);}catch{console.error('Saved handoff notifications will retry.');}});
 return Response.json({saved:saved.data},{headers:{'Cache-Control':'no-store'}});
}catch(error){return staffErrorResponse(error);}}
