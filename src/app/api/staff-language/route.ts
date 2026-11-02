import {requireStaff,staffErrorResponse} from '@/lib/server/require-staff';
export async function POST(request:Request){try{
 const c=await requireStaff(request),body=await request.json();
 if(body.language!=='en'&&body.language!=='es')return Response.json({error:'Choose English or Spanish.'},{status:400});
 const {error}=await c.admin.auth.admin.updateUserById(c.user.id,{user_metadata:{tcs_language:body.language}});
 if(error)throw error;
 return Response.json({ok:true,language:body.language});
}catch(error){return staffErrorResponse(error);}}
