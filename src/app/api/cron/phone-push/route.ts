import {timingSafeEqual} from 'node:crypto';
import {createSupabaseAdminClient} from '@/lib/supabase/admin';
import {flushInboxPhonePushes} from '@/lib/server/notifications';
export const runtime='nodejs';export const maxDuration=60;
export async function POST(request:Request){
 const expected='Bearer '+(process.env.PHONE_PUSH_WORKER_SECRET||''),provided=request.headers.get('authorization')||'';
 if(!process.env.PHONE_PUSH_WORKER_SECRET||Buffer.byteLength(expected)!==Buffer.byteLength(provided)||!timingSafeEqual(Buffer.from(expected),Buffer.from(provided)))return Response.json({error:'Unauthorized'},{status:401});
 try{return Response.json({ok:true,...await flushInboxPhonePushes(createSupabaseAdminClient())},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Phone push delivery will retry'},{status:500});}
}
