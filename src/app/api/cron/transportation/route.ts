import {isOwnerAccessRole} from '@/lib/team-access';
import {timingSafeEqual} from 'node:crypto';
import {createSupabaseAdminClient} from '@/lib/supabase/admin';
import {accountabilityEnabled,transportLedgerActive,loadTransportAccountability,scanAccountabilityAlerts} from '@/lib/server/transport-accountability';
import type {AuthorizedStaff} from '@/lib/server/require-staff';
import {transportServiceDate} from '@/lib/transportation-day';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request){
 const secret=process.env.TRANSPORT_CRON_SECRET||process.env.CRON_SECRET,provided=request.headers.get('authorization')||'',expected=`Bearer ${secret||''}`;
 if(!secret||Buffer.byteLength(provided)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return Response.json({error:'Unauthorized'},{status:401});
 if(!accountabilityEnabled())return Response.json({enabled:false});
 try{
  const admin=createSupabaseAdminClient(),planners=await admin.from('staff_access').select('user_id,organization_id,email,full_name,role,permissions,locations,is_active').eq('is_active',true).ilike('email',process.env.TCS_TRANSPORT_PLANNER_EMAIL||'youngmoore19@gmail.com');
  if(planners.error)throw planners.error;
  let scanned=0,prepared=0,preparedTrips=0;
  for(const profile of planners.data||[]){
   if(!isOwnerAccessRole(profile.role))continue;
   const c={admin,userClient:admin,user:{id:profile.user_id},profile,isOwner:true,isLicensee:false} as AuthorizedStaff;
   if(!await transportLedgerActive(c)){const rollout=await admin.from('transport_accountability_rollout').select('enabled_from').eq('organization_id',profile.organization_id).maybeSingle();if(rollout.error)throw rollout.error;if(rollout.data){const future=await loadTransportAccountability(c,rollout.data.enabled_from);prepared++;preparedTrips+=future.day.trips.length;}continue;}
   const days=await admin.from('transport_accountability_days').select('service_date').eq('organization_id',profile.organization_id).eq('document->>closedAt','');if(days.error)throw days.error;
   for(const date of new Set([transportServiceDate(),...(days.data||[]).map(d=>d.service_date)])){
    const loaded=await loadTransportAccountability(c,date);await scanAccountabilityAlerts(admin,profile.organization_id,loaded.day,loaded.context);scanned++;
   }
  }
  return Response.json({ok:true,scanned,prepared,preparedTrips});
 }catch{return Response.json({error:'Transportation alert scan could not finish. Pending alerts remain for retry.'},{status:500});}
}
