import {randomUUID} from 'node:crypto';
import {requireLocationRecords,databaseError} from '@/lib/server/location-rosters';
import {staffErrorResponse} from '@/lib/server/require-staff';
import {encryptDocument,decryptDocument} from '@/lib/server/document-crypto';
export const runtime='nodejs';
export async function POST(request:Request){try{
 const body=await request.json();const {c,site}=await requireLocationRecords(request,body.locationId);
 if(body.confirmed!==true||typeof body.reason!=='string'||!body.reason.trim()||!/^[0-9a-f-]{36}$/i.test(body.sourceDocumentId)||!/^[0-9a-f-]{36}$/i.test(body.targetFileId))return Response.json({error:'Confirm this intentional copy and its applicability at the receiving location'},{status:400});
 const source=await c.userClient.from('document_records').select('*').eq('id',body.sourceDocumentId).eq('organization_id',c.profile.organization_id).neq('status','Deleted').maybeSingle();databaseError(source.error);
 const target=await c.userClient.from('location_person_files').select('*').eq('id',body.targetFileId).eq('location_id',site.id).eq('organization_id',c.profile.organization_id).maybeSingle();databaseError(target.error);
 const sourceFile=source.data?.location_file_id?await c.userClient.from('location_person_files').select('child_id,staff_lane_id').eq('id',source.data.location_file_id).eq('organization_id',c.profile.organization_id).maybeSingle():null;
 if(sourceFile)databaseError(sourceFile.error);
 const samePerson=target.data?.child_id?source.data?.child_id===target.data.child_id:Boolean(target.data?.staff_lane_id&&sourceFile?.data?.staff_lane_id===target.data.staff_lane_id);
 if(!source.data||!target.data||target.data.archived||!samePerson||source.data.location_id===site.id)return Response.json({error:'You must have access to both locations and select the same person’s active receiving file'},{status:403});
 const sourceAccess=await c.userClient.rpc('can_access_location',{p_location_id:source.data.location_id});databaseError(sourceAccess.error);if(!sourceAccess.data)return Response.json({error:'Source location access required'},{status:403});
 const item=target.data.items.find((i:{id:string})=>i.id===body.itemId);if(!item)return Response.json({error:'Choose the receiving checklist item'},{status:400});
 const bytes=await c.admin.storage.from('tcs-sensitive-documents').download(source.data.storage_path);databaseError(bytes.error);if(!bytes.data)throw new Error('Source upload unavailable');
 const plain=decryptDocument(Buffer.from(await bytes.data.arrayBuffer()),source.data.encryption_iv),encrypted=encryptDocument(plain),id=randomUUID(),path=`${c.profile.organization_id}/${site.id}/${id}.enc`;
 const saved=await c.admin.storage.from('tcs-sensitive-documents').upload(path,encrypted.encrypted,{contentType:'application/octet-stream',upsert:false});databaseError(saved.error);
 const row=await c.userClient.from('document_records').insert({id,organization_id:c.profile.organization_id,location_id:site.id,child_id:target.data.child_id,location_file_id:target.data.id,checklist_item_id:item.id,copied_from_document_id:source.data.id,review_status:'Awaiting review',review_note:'Copied for receiving-location review: '+body.reason.trim().slice(0,1000),document_type:item.name,original_filename:source.data.original_filename,storage_path:path,mime_type:source.data.mime_type,size_bytes:plain.length,sha256:encrypted.sha256,encryption_algorithm:'AES-256-GCM',encryption_iv:encrypted.iv,encryption_version:1,retention_policy_id:source.data.retention_policy_id,retention_until:source.data.retention_until,legal_hold:true,status:'Active',uploaded_by:c.user.id,document_scope:target.data.staff_lane_id?'Staff':'Child',confidentiality:'Location Leadership',source_system:'Location copy',source_reference:source.data.id}).select('id').single();
 if(row.error){await c.admin.storage.from('tcs-sensitive-documents').remove([path]);throw new Error(row.error.message);}
 return Response.json({ok:true,id:row.data.id,reviewStatus:'Awaiting review'},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return staffErrorResponse(e);}}
