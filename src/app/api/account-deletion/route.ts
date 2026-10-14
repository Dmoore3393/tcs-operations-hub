import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { safeFamilyAccess } from "@/lib/family-access";
export const dynamic = "force-dynamic";
async function requester(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new Response("Sign in to manage your account.", { status: 401 });
  const admin = createSupabaseAdminClient();
  const result = await admin.auth.getUser(token);
  if (result.error || !result.data.user) throw new Response("Your session has expired. Please sign in again.", { status: 401 });
  return { admin, user: result.data.user };
}
function failure(error: unknown) {
  return error instanceof Response ? error : Response.json({ error: "The account request could not be saved. Please try again." }, { status: 500 });
}
export async function GET(request: Request) {
  try {
    const {admin,user} = await requester(request);
    const result = await admin.from("account_deletion_requests").select("id,status,requested_at,due_at,completed_at").eq("requester_id",user.id).maybeSingle();
    if (result.error) throw result.error;
    return Response.json({ email:user.email, request:result.data }, { headers:{"Cache-Control":"no-store"} });
  } catch(error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const {admin,user} = await requester(request);
    const body = await request.json().catch(()=>({}));
    if (body.confirm !== true || typeof body.email !== "string" || !user.email || body.email.trim().toLowerCase() !== user.email.toLowerCase()) return Response.json({error:"Confirm your account email and acknowledge account deletion."},{status:400});
    const existing=await admin.from("account_deletion_requests").select("id,status,requested_at,due_at").eq("requester_id",user.id).maybeSingle();
    if(existing.error) throw existing.error;
    if(existing.data) return Response.json({request:existing.data});
    const [staff,children]=await Promise.all([
      admin.from("staff_access").select("organization_id").eq("user_id",user.id).maybeSingle(),
      admin.from("children").select("organization_id,record_data"),
    ]);
    if(staff.error || children.error) throw staff.error ?? children.error;
    const ids=new Set<string>();
    if(staff.data?.organization_id) ids.add(staff.data.organization_id);
    for(const child of children.data ?? []) {
      if(safeFamilyAccess(child.record_data?.familyAccess).some(link=>link.email.toLowerCase()===user.email!.toLowerCase())) ids.add(child.organization_id);
    }
    if(!ids.size) {
      const org=await admin.from("organizations").select("id").eq("name","Thomason Childcare Solutions").maybeSingle();
      if(org.error || !org.data) throw org.error ?? new Error("No responsible organization");
      ids.add(org.data.id);
    }
    const result=await admin.from("account_deletion_requests").upsert({requester_id:user.id,requester_email:user.email,organization_ids:[...ids]}, {onConflict:"requester_id",ignoreDuplicates:true}).select("id,status,requested_at,due_at").maybeSingle();
    if(result.error) throw result.error;
    const saved=result.data ?? (await admin.from("account_deletion_requests").select("id,status,requested_at,due_at").eq("requester_id",user.id).single()).data;
    if(!saved) throw new Error("Missing saved request");
    return Response.json({request:saved});
  } catch(error) { return failure(error); }
}
