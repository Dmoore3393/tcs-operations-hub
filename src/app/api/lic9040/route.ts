import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {requireLocationRecords,loadLocationRoster,databaseError} from '@/lib/server/location-rosters';
import {encryptDocument,decryptDocument} from '@/lib/server/document-crypto';
import {staffErrorResponse} from '@/lib/server/require-staff';
import {facilityIssues} from '@/lib/location-rosters/model';
import {createLic9040,createChecklistPdf} from '@/lib/location-rosters/pdf';
import {transportServiceDate,validTransportDate} from '@/lib/transportation-day';
export const runtime='nodejs';export const dynamic='force-dynamic';
function pdf(bytes:Uint8Array,filename:string,extra:Record<string,string>={}){return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="${filename}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...extra}});}
export async function GET(request:Request){try{
 const params=new URL(request.url).searchParams,{c,site}=await requireLocationRecords(request,params.get('locationId')||'');
 const r=await c.userClient.from('lic9040_snapshots').select('*').eq('id',params.get('snapshotId')||'').eq('location_id',site.id).eq('organization_id',c.profile.organization_id).maybeSingle();databaseError(r.error);if(!r.data)return Response.json({error:'Snapshot not accessible at this location'},{status:404});
 const blob=await c.admin.storage.from('tcs-sensitive-documents').download(r.data.storage_path);databaseError(blob.error);if(!blob.data)throw new Error('Saved snapshot bytes unavailable');
 const bytes=decryptDocument(Buffer.from(await blob.data.arrayBuffer()),r.data.encryption_iv);
 await c.userClient.rpc('record_audit_event',{p_action:'EXPORT',p_table_name:'lic9040_snapshots',p_row_id:r.data.id,p_location_id:site.id,p_metadata:{kind:'download_retained_roster_snapshot'}});
 return pdf(bytes,`LIC9040-${site.name.replace(/[^a-z0-9]/gi,'-')}-${r.data.created_at.slice(0,10)}.pdf`);
 }catch(e){return staffErrorResponse(e);}}
export async function POST(request:Request){try{
 const body=await request.json(),{c,site}=await requireLocationRecords(request,body.locationId),data=await loadLocationRoster(c,site);
 const date=body.date||transportServiceDate();if(!validTransportDate(date))return Response.json({error:'Choose a valid roster date/update'},{status:400});
 if(!Array.isArray(body.enrollmentIds)||new Set(body.enrollmentIds).size!==body.enrollmentIds.length||body.enrollmentIds.some((id:unknown)=>typeof id!=='string'||!data.rows.some(r=>r.enrollmentId===id)))return Response.json({error:'Select records from this location only'},{status:403});
 const rows=data.rows.filter(r=>body.enrollmentIds.includes(r.enrollmentId));
 const font=await readFile(path.join(process.cwd(),'public/forms/RosterSans.ttf'));
 if(body.action==='checklists'){
  const ids=new Set(rows.map(r=>r.childId)),files=data.files.filter(f=>ids.has(f.child_id||''));const bytes=await createChecklistPdf(font,data.facility,files,date);await c.userClient.rpc('record_audit_event',{p_action:'EXPORT',p_table_name:'location_person_files',p_row_id:null,p_location_id:site.id,p_metadata:{kind:'selected_location_checklists',file_ids:files.map(f=>f.id)}});return pdf(bytes,'Location-child-file-checklists.pdf');
 }
 if(!['preview','snapshot'].includes(body.action))return Response.json({error:'Choose Preview or a dated PDF snapshot'},{status:400});
 const warnings=[...facilityIssues(data.facility),...rows.flatMap(r=>r.missing.map(m=>r.name+': '+m))];
 const template=await readFile(path.join(process.cwd(),'public/forms/LIC9040-background.pdf'));const bytes=await createLic9040(template,font,data.facility,rows,date);
 const filename=`LIC9040-${site.name.replace(/[^a-z0-9]/gi,'-')}-${date}.pdf`;
 if(body.action==='preview')return pdf(bytes,filename,{'X-Roster-Warnings':String(warnings.length)});
 const id=randomUUID(),encrypted=encryptDocument(Buffer.from(bytes)),storagePath=`${c.profile.organization_id}/${site.id}/rosters/${id}.enc`;
 const upload=await c.admin.storage.from('tcs-sensitive-documents').upload(storagePath,encrypted.encrypted,{contentType:'application/octet-stream',upsert:false});databaseError(upload.error);
 const retain=new Date((date>transportServiceDate()?date:transportServiceDate())+'T12:00:00Z');retain.setUTCFullYear(retain.getUTCFullYear()+3);
 const saved=await c.admin.from('lic9040_snapshots').insert({id,organization_id:c.profile.organization_id,location_id:site.id,manifest:{facility:data.facility,rows,date,warnings,official_form:'LIC 9040 (10/05)'},storage_path:storagePath,encryption_iv:encrypted.iv,sha256:encrypted.sha256,created_by:c.user.id,retain_until:retain.toISOString().slice(0,10)});
 if(saved.error){await c.admin.storage.from('tcs-sensitive-documents').remove([storagePath]);throw new Error(saved.error.message);}
 await c.userClient.rpc('record_audit_event',{p_action:'EXPORT',p_table_name:'lic9040_snapshots',p_row_id:id,p_location_id:site.id,p_metadata:{kind:'dated_location_roster_snapshot',selected_enrollments:body.enrollmentIds,warning_count:warnings.length,sha256:encrypted.sha256}});
 return pdf(bytes,filename,{'X-Roster-Snapshot':id,'X-Roster-Warnings':String(warnings.length)});
 }catch(e){return staffErrorResponse(e);}}
