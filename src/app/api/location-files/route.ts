import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { initialLocationItems, validateLocationFileEdit, type LocationPersonFile } from "@/lib/location-person-files";
import { templateForChildLocation } from "@/lib/child-file-audits";
export const runtime = "nodejs";
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const json = (value: unknown, status = 200) => Response.json(value, {status,headers:{"Cache-Control":"no-store, private"}});
async function context(request: Request) {
 const c=await requireStaff(request);
 if(!c.isOwner&&!c.isLicensee)throw new Response("Location files are restricted to Owners/Admins and Licensees.",{status:403});
 return c;
}
export async function GET(request: Request) {
 try {
  const c=await context(request), db=c.userClient, org=c.profile.organization_id;
  const [sites,files,children,staff]=await Promise.all([
   db.from("locations").select("id,name,full_name,slug,program_type,is_active").eq("organization_id",org).order("name"),
   db.from("location_person_files").select("*").eq("organization_id",org).order("person_name"),
   db.from("children").select("id,first_name,last_name,legacy_id,enrollment_status").eq("organization_id",org).order("last_name").order("first_name"),
   db.from("staff_lane_profiles").select("id,full_name,is_active").eq("organization_id",org).order("full_name"),
  ]);
  for(const result of [sites,files,children,staff])if(result.error)throw result.error;
  const locations=(await Promise.all((sites.data||[]).filter(site=>!/maintenance/i.test(site.program_type||"")).map(async site=>{
   const access=await db.rpc("can_access_location",{p_location_id:site.id});if(access.error)throw access.error;
   return access.data?{...site,template:templateForChildLocation(`${site.name} ${site.full_name}`)}:null;
  }))).filter(Boolean);
  return json({locations,files:files.data||[],children:children.data||[],staff:staff.data||[]});
 }catch(e){return staffErrorResponse(e);}
}
export async function POST(request: Request) {
 try {
  const c=await context(request),body=await request.json(), db=c.userClient,org=c.profile.organization_id;
  if(!uuid(body.locationId)||!uuid(body.personId)||!["Child","Staff"].includes(body.type))return json({error:"Choose a location and a child or staff member."},400);
  if(body.confirmLocation!==true)return json({error:"Confirm this person needs a file at the selected location."},400);
  const site=await db.from("locations").select("id,name,full_name,program_type,is_active").eq("organization_id",org).eq("id",body.locationId).maybeSingle();
  if(site.error)throw site.error;
  const access=await db.rpc("can_access_location",{p_location_id:body.locationId});if(access.error)throw access.error;
  if(!site.data||!access.data||!site.data.is_active||/maintenance/i.test(site.data.program_type||""))return json({error:"That care location is not available to this account."},403);
  const type=body.type as "Child"|"Staff";
  const person= type==="Child"? await db.from("children").select("id,first_name,last_name").eq("organization_id",org).eq("id",body.personId).maybeSingle():await db.from("staff_lane_profiles").select("id,full_name").eq("organization_id",org).eq("id",body.personId).maybeSingle();
  if(person.error)throw person.error;if(!person.data)return json({error:"Person not available to this account."},403);
  const name="full_name" in person.data?person.data.full_name:`${person.data.first_name} ${person.data.last_name}`;
  const template=templateForChildLocation(`${site.data.name} ${site.data.full_name}`);
  const result=await db.from("location_person_files").insert({organization_id:org,location_id:site.data.id,child_id:type==="Child"?body.personId:null,staff_lane_id:type==="Staff"?body.personId:null,person_name:name,template,items:initialLocationItems(type,template)}).select("*").single();
  if(result.error){if(result.error.code==="23505")return json({error:"This person already has a file here. Open the existing file, including archived files."},409);throw result.error;}
  return json({file:result.data},201);
 }catch(e){return staffErrorResponse(e);}
}
export async function PATCH(request: Request) {
 try {
  const c=await context(request),body=await request.json(),db=c.userClient;
  if(!uuid(body.id)||typeof body.expectedUpdatedAt!=="string")return json({error:"Reopen the location file before saving."},400);
  const current=await db.from("location_person_files").select("*").eq("organization_id",c.profile.organization_id).eq("id",body.id).maybeSingle();
  if(current.error)throw current.error;if(!current.data)return json({error:"Location file not found or not accessible."},404);
  if(current.data.updated_at!==body.expectedUpdatedAt)return json({error:"Someone changed this file. Your entries are still in the form; copy them before reopening the latest file."},409);
  let changes;try{changes=validateLocationFileEdit(body.file,current.data as LocationPersonFile);}catch(e){return json({error:e instanceof Error?e.message:"Invalid checklist."},400);}
  const result=await db.from("location_person_files").update(changes).eq("id",body.id).eq("organization_id",c.profile.organization_id).eq("updated_at",body.expectedUpdatedAt).select("*").maybeSingle();
  if(result.error)throw result.error;if(!result.data)return json({error:"The location file changed before saving. Reopen it; nothing was overwritten."},409);
  return json({file:result.data});
 }catch(e){return staffErrorResponse(e);}
}
