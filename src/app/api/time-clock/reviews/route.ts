import {normalizeLocation} from "@/lib/location-config";
import {requireStaff,staffErrorResponse} from "@/lib/server/require-staff";

export async function GET(request:Request){
 try{
  const {admin,profile,isOwner,isLicensee}=await requireStaff(request);
  if(!isOwner&&!isLicensee) return Response.json({error:"Leadership access required."},{status:403});
  let query=admin.from("clock_schedule_reviews").select("*").eq("organization_id",profile.organization_id);
  if(!isOwner){
   if(!profile.primary_location)return Response.json({reviews:[]});
   const sites=await admin.from("locations").select("id,name,slug,full_name").eq("organization_id",profile.organization_id);
   if(sites.error)throw sites.error;
   const ids=(sites.data||[]).filter(site=>normalizeLocation(`${site.name} ${site.slug} ${site.full_name}`)===normalizeLocation(profile.primary_location!)).map(site=>site.id);
   if(!ids.length)return Response.json({reviews:[]});
   query=query.in("location_id",ids);
  }
  // Pending flags never age out. Explained records remain visible for the last 30 days.
  const since=new Date(Date.now()-30*86400000).toISOString();
  const result=await query.or(`explained_at.is.null,explained_at.gte.${since}`).order("explained_at",{ascending:true,nullsFirst:true}).order("occurred_at",{ascending:false}).limit(500);
  if(result.error)throw result.error;
  return Response.json({reviews:result.data||[]},{headers:{"Cache-Control":"no-store"}});
 }catch(error){return staffErrorResponse(error);}
}
export async function POST(request:Request){
 try{
  const {admin,profile,user,isOwner,isLicensee}=await requireStaff(request);
  if(!isOwner&&!isLicensee)return Response.json({error:"Leadership access required."},{status:403});
  const body=await request.json();
  if(!/^\d+$/.test(String(body.eventId))||typeof body.note!=="string"||!body.note.trim()||body.note.trim().length>2000)
   return Response.json({error:"Choose a flag and enter an explanation (up to 2000 characters)."},{status:400});
  const result=await admin.rpc("explain_clock_schedule_review",{p_org:profile.organization_id,p_actor:user.id,p_event:String(body.eventId),p_note:body.note.trim()});
  if(result.error)return Response.json({error:result.error.message},{status:result.error.code==="42501"?403:409});
  return Response.json({saved:true});
 }catch(error){return staffErrorResponse(error);}
}
