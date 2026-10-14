import { requireOwner, responseFromThrown } from "@/lib/server/require-owner";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  try {
    const {admin,profile}=await requireOwner(request);
    const result=await admin.from("account_deletion_requests").select("id,requester_id,requester_email,status,requested_at,due_at,completed_at,retention_summary").contains("organization_ids",[profile.organization_id]).order("requested_at",{ascending:false});
    if(result.error) throw result.error;
    return Response.json({requests:result.data ?? []},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {return responseFromThrown(error);}
}
export async function POST(request:Request) {
  try {
    const {admin,profile,user}=await requireOwner(request);
    const body=await request.json().catch(()=>({}));
    if(typeof body.id!=="string" || !["review","complete"].includes(body.action)) return Response.json({error:"Choose a valid request and action."},{status:400});
    const found=await admin.from("account_deletion_requests").select("id,requester_id,status").eq("id",body.id).contains("organization_ids",[profile.organization_id]).maybeSingle();
    if(found.error) throw found.error;
    if(!found.data) return Response.json({error:"Request not found."},{status:404});
    if(found.data.status==="Completed") return Response.json({error:"This request is already complete."},{status:409});
    let patch:Record<string,unknown>={status:"In Review",reviewed_by:user.id};
    if(body.action==="complete") {
      if(body.personalDataRemoved!==true || body.userNotified!==true || typeof body.retentionSummary!=="string" || !body.retentionSummary.trim() || body.retentionSummary.length>2000) return Response.json({error:"Confirm personal-data removal and user notification, and describe retained records without personal details."},{status:400});
      const account=await admin.auth.admin.getUserById(found.data.requester_id);
      if(account.data?.user) return Response.json({error:"The authentication account still exists. Removing access or disabling the account does not count as deletion."},{status:400});
      if(account.error && account.error.status!==404) throw account.error;
      patch={...patch,status:"Completed",completed_at:new Date().toISOString(),requester_id:null,requester_email:null,retention_summary:body.retentionSummary.trim()};
    }
    const result=await admin.from("account_deletion_requests").update(patch).eq("id",body.id).contains("organization_ids",[profile.organization_id]).eq("status",found.data.status).select("id").maybeSingle();
    if(result.error) throw result.error;
    if(!result.data) return Response.json({error:"This request changed. Refresh before continuing."},{status:409});
    return Response.json({ok:true});
  } catch(error) {return responseFromThrown(error);}
}
