import sharp from "sharp";
import { requireStaff } from "@/lib/server/require-staff";
import { requireParent } from "@/lib/server/require-parent";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };
async function owner(request: Request) {
  try { return await requireStaff(request); }
  catch (error) {
    if (!(error instanceof Response) || ![401,403].includes(error.status)) throw error;
    return await requireParent(request);
  }
}
function failure(error: unknown) {
  return error instanceof Response ? error : Response.json({error:"Could not update your photo. Please try again."},{status:500,headers});
}
export async function GET(request: Request) {
  try {
    const {admin,user} = await owner(request);
    const folder = `account-profiles/${user.id}`;
    const bucket = admin.storage.from("child-media");
    const listed = await bucket.list(folder, {search:"profile.jpg",limit:10});
    if(listed.error) throw listed.error;
    if(!listed.data.some(item=>item.name==="profile.jpg")) return Response.json({url:null},{headers});
    const signed = await bucket.createSignedUrl(`${folder}/profile.jpg`,300);
    if(signed.error) throw signed.error;
    return Response.json({url:signed.data.signedUrl},{headers});
  } catch(error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const {admin,user} = await owner(request);
    if(Number(request.headers.get("content-length")||0)>9*1024*1024) return Response.json({error:"Choose an image under 8 MB."},{status:413,headers});
    const form = await request.formData(); const file = form.get("file");
    if(!(file instanceof File)||!['image/jpeg','image/png','image/webp'].includes(file.type)) return Response.json({error:"Choose a JPG, PNG or WebP photo."},{status:415,headers});
    if(!file.size||file.size>8*1024*1024) return Response.json({error:"Choose an image under 8 MB."},{status:413,headers});
    let bytes: Buffer;
    try {
      // Decode and re-encode: strip location metadata and reject malformed images.
      bytes = await sharp(Buffer.from(await file.arrayBuffer()),{limitInputPixels:25000000}).rotate().resize(512,512,{fit:"cover"}).jpeg({quality:85}).toBuffer();
    } catch {return Response.json({error:"This image could not be opened. Choose another JPG, PNG or WebP."},{status:400,headers});}
    const saved = await admin.storage.from("child-media").upload(`account-profiles/${user.id}/profile.jpg`,bytes,{contentType:"image/jpeg",upsert:true,cacheControl:"0"});
    if(saved.error) throw saved.error;
    return Response.json({ok:true},{headers});
  } catch(error) {return failure(error);}
}
export async function DELETE(request: Request) {
  try {
    const {admin,user}=await owner(request);
    const result=await admin.storage.from("child-media").remove([`account-profiles/${user.id}/profile.jpg`]);
    if(result.error) throw result.error;
    return Response.json({ok:true},{headers});
  } catch(error) {return failure(error);}
}
