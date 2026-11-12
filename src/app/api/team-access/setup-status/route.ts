import {requireOwner,responseFromThrown} from "@/lib/server/require-owner";
export const runtime="nodejs";
export async function GET(request:Request){
 try{
  const {admin,profile}=await requireOwner(request),id=new URL(request.url).searchParams.get("userId");
  if(!id||!/^[0-9a-f-]{36}$/i.test(id))return Response.json({error:"Choose a staff account."},{status:400});
  const account=await admin.from("staff_access").select("user_id,full_name,email,is_active,invited_at,accepted_at").eq("organization_id",profile.organization_id).eq("user_id",id).maybeSingle();
  if(account.error)throw account.error;if(!account.data)return Response.json({error:"Staff account not found."},{status:404});
  const links=await admin.from("staff_setup_links").select("created_at,expires_at,ready_at,revoked_at,last_exchange_at").eq("organization_id",profile.organization_id).eq("auth_user_id",id).order("created_at",{ascending:false}).limit(1);
  if(links.error)throw links.error;
  return Response.json({account:account.data,latestLink:links.data?.[0]||null,delivery:"not_tracked"},{headers:{"Cache-Control":"no-store, private"}});
 }catch(e){return responseFromThrown(e);}
}
