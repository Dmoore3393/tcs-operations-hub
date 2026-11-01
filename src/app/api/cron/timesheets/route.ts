import {timingSafeEqual} from "node:crypto";
import {createSupabaseAdminClient} from "@/lib/supabase/admin";
import {scanTimesheetAlerts} from "@/lib/server/timesheet-alerts";
export const runtime="nodejs";
export async function GET(request:Request){
  const secret=process.env.CRON_SECRET;
  const provided=request.headers.get('authorization')||'';
  const expected=`Bearer ${secret||''}`;
  if(!secret||Buffer.byteLength(provided)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return Response.json({error:'Unauthorized'},{status:401});
  try{return Response.json({ok:true,...await scanTimesheetAlerts(createSupabaseAdminClient())});}
  catch{return Response.json({error:'Timesheet deadline check could not finish.'},{status:500});}
}
