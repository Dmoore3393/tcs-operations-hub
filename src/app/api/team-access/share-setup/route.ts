import {requireOwner,responseFromThrown} from "@/lib/server/require-owner";
import {issueStaffSetupLink,activateStaffSetupLink,revokeStaffSetupLink} from "@/lib/server/staff-setup-links";
import {isSupportedAccessRole} from "@/lib/team-access";
export const runtime="nodejs";
/** Owner-triggered private handoff. No email/text is sent and existing access is unchanged. */
export async function POST(request:Request){
 let revoke:(()=>Promise<void>)|null=null;
 try{
  const {admin,profile,user}=await requireOwner(request),body=await request.json();
  if(typeof body.userId!=="string"||!/^[0-9a-f-]{36}$/i.test(body.userId)||body.confirmPrivateSharing!==true)return Response.json({error:"Confirm that you will share this private link only with the named staff member."},{status:400});
  const result=await admin.from("staff_access").select("user_id,organization_id,email,full_name,role,is_active,accepted_at").eq("organization_id",profile.organization_id).eq("user_id",body.userId).maybeSingle();
  if(result.error)throw result.error;const account=result.data;
  if(!account||!account.is_active||account.accepted_at||!isSupportedAccessRole(account.role))return Response.json({error:"A private setup link is available only for an active staff account that has not completed setup."},{status:409});
  const auth=await admin.auth.admin.getUserById(account.user_id);
  if(auth.error||auth.data.user?.email?.toLowerCase()!==account.email.toLowerCase())return Response.json({error:"The staff account identity could not be verified."},{status:409});
  const invitation=await admin.from("staff_invitations").select("id").eq("organization_id",profile.organization_id).eq("auth_user_id",account.user_id).eq("status","pending").limit(1);
  if(invitation.error)throw invitation.error;if(!invitation.data?.length)return Response.json({error:"This account does not have a pending staff invitation."},{status:409});
  const recent=await admin.from("staff_setup_links").select("created_at").eq("organization_id",profile.organization_id).eq("auth_user_id",account.user_id).gte("created_at",new Date(Date.now()-60000).toISOString()).limit(1);
  if(recent.error)throw recent.error;if(recent.data?.length)return Response.json({error:"A setup link was just prepared. Wait one minute before creating another."},{status:429,headers:{"Retry-After":"60","Cache-Control":"no-store"}});
  const issued=await issueStaffSetupLink(admin,profile.organization_id,account.email,"https://thetcshub.com");
  revoke=()=>revokeStaffSetupLink(admin,issued.tokenHash);
  await activateStaffSetupLink(admin,issued.tokenHash,account.user_id);
  const proof=await admin.from("staff_setup_links").select("expires_at,ready_at,auth_user_id").eq("token_hash",issued.tokenHash).maybeSingle();
  if(proof.error)throw proof.error;if(!proof.data?.ready_at||proof.data.auth_user_id!==account.user_id)throw new Error("Setup link activation could not be verified.");
  const audit=await admin.from("audit_log").insert({organization_id:profile.organization_id,actor_user_id:user.id,action:"REVIEW",table_name:"staff_setup_links",row_id:null,metadata:{kind:"owner_private_setup_link",staff_user_id:account.user_id,expires_at:proof.data.expires_at}});
  if(audit.error)throw audit.error;
  return Response.json({url:issued.redirectTo,expiresAt:proof.data.expires_at,fullName:account.full_name,email:account.email,sent:false},{headers:{"Cache-Control":"no-store, private","Referrer-Policy":"no-referrer"}});
 }catch(e){if(revoke)await revoke().catch(()=>{});return responseFromThrown(e);}
}
