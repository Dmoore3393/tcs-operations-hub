import {requireOwner,responseFromThrown} from "@/lib/server/require-owner";
export const runtime="nodejs";
export async function POST(request:Request){
 try{
  const {admin,profile,user}=await requireOwner(request);
  const body=await request.json().catch(()=>({})) as {user_id?:unknown};
  const id=typeof body.user_id==="string"?body.user_id.trim():"";
  if(!/^[0-9a-f-]{36}$/i.test(id)||id===user.id)return Response.json({error:"Choose a different active staff account."},{status:400});
  const lookup=await admin.from("staff_access").select("user_id,email,full_name,is_active,accepted_at").eq("organization_id",profile.organization_id).eq("user_id",id).maybeSingle();
  if(lookup.error)throw lookup.error;
  const account=lookup.data;
  if(!account||!account.is_active||!account.accepted_at)return Response.json({error:"An active, accepted staff account is required."},{status:404});
  const auth=await admin.auth.admin.getUserById(account.user_id);
  if(auth.error||auth.data.user?.email?.toLowerCase()!==account.email.toLowerCase())return Response.json({error:"The saved staff account and login do not match."},{status:409});
  const recent=await admin.from("audit_log").select("id").eq("organization_id",profile.organization_id).eq("table_name","staff_password_recovery").eq("row_id",id).gte("occurred_at",new Date(Date.now()-60000).toISOString()).limit(1);
  if(recent.error)throw recent.error;
  if(recent.data?.length)return Response.json({error:"A link was just generated. Wait one minute before requesting another."},{status:429});
  const generated=await admin.auth.admin.generateLink({type:"recovery",email:account.email});
  if(generated.error)throw generated.error;
  if(generated.data.user?.id!==id||generated.data.properties?.verification_type!=="recovery"||!generated.data.properties?.hashed_token)throw new Error("Could not verify the recovery identity.");
  const url=new URL("/password-recovery",process.env.NEXT_PUBLIC_SITE_URL||new URL(request.url).origin);
  url.hash=new URLSearchParams({type:"recovery",token_hash:generated.data.properties.hashed_token}).toString();
  const log=await admin.from("audit_log").insert({organization_id:profile.organization_id,actor_user_id:user.id,action:"CREATE",table_name:"staff_password_recovery",row_id:id,metadata:{kind:"owner_generated_recovery_link",recipient:account.email}});
  if(log.error)throw log.error;
  return Response.json({ok:true,name:account.full_name,link:url.toString()}, {headers:{"Cache-Control":"no-store, private","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"}});
 }catch(e){return responseFromThrown(e);}
}
