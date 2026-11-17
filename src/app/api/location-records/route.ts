import {requireStaff,staffErrorResponse} from '@/lib/server/require-staff';
import {requireLocationRecords,loadLocationRoster,databaseError} from '@/lib/server/location-rosters';
import {validateLocationFileEdit,type LocationPersonFile} from '@/lib/location-person-files';
import {validFileDate} from '@/lib/location-person-files';
const headers={'Cache-Control':'private, no-store','Vary':'Authorization'};
const json=(v:unknown,status=200)=>Response.json(v,{status,headers});
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v);
const text=(v:unknown,max=1000)=>typeof v==='string'?v.trim().slice(0,max):'';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const params=new URL(request.url).searchParams;
 if(params.get('tasks')==='mine'){
  const c=await requireStaff(request);const r=await c.userClient.from('location_file_findings').select('id,location_id,file_id,item_id,item_name,child_name,legacy_task_id,assigned_user_id,due_date,correction,notes,status,updated_at,locations(name),children(first_name,last_name)').eq('organization_id',c.profile.organization_id).eq('assigned_user_id',c.user.id).order('due_date');databaseError(r.error);return json({tasks:r.data||[]});
 }
 const {c,site}=await requireLocationRecords(request,params.get('locationId')||'');const data=await loadLocationRoster(c,site);
 const childId=params.get('childId');let targets:unknown[]=[],sourceDocuments:unknown[]=[];
 if(childId&&data.enrollments.some(e=>e.child_id===childId)){
  const files=await c.userClient.from('location_person_files').select('id,child_id,location_id,person_name,archived,locations(name)').eq('organization_id',c.profile.organization_id).eq('child_id',childId);databaseError(files.error);targets=files.data||[];
  const docs=await c.userClient.from('document_records').select('id,location_id,document_type,original_filename,location_file_id,locations(name)').eq('organization_id',c.profile.organization_id).eq('child_id',childId).neq('status','Deleted');databaseError(docs.error);sourceDocuments=docs.data||[];
 }
 return json({...data,copyTargets:targets,sourceDocuments});
 }catch(e){return staffErrorResponse(e);}}
export async function POST(request:Request){try{
 const body=await request.json();
 if(body.action==='submit_task'){
  const c=await requireStaff(request);if(!uuid(body.id)||!text(body.notes)||!text(body.expectedUpdatedAt))return json({error:'Enter correction notes and reopen the latest task'},400);
  const r=await c.userClient.from('location_file_findings').update({status:'Awaiting review',notes:text(body.notes,6000)}).eq('id',body.id).eq('organization_id',c.profile.organization_id).eq('assigned_user_id',c.user.id).eq('updated_at',body.expectedUpdatedAt).select('id').maybeSingle();databaseError(r.error);if(!r.data)return json({error:'Task changed or is not assigned to you. Refresh.'},409);return json({ok:true});
 }
 const {c,site}=await requireLocationRecords(request,body.locationId),db=c.userClient,org=c.profile.organization_id;
 if(body.action==='settings'){
  const value=body.settings;if(!value||!Number.isInteger(value.reminder_days)||value.reminder_days<1||value.reminder_days>180)return json({error:'Choose a reminder interval from 1 to 180 days'},400);
  const name=text(value.facility_name,200),license=text(value.license_number,20),source=text(value.verification_source);
  if(value.verify===true&&(!name||!/^\d{9}$/.test(license)||!source))return json({error:'Verified facility settings need the licensed name, nine-digit number, and verification source'},400);
  if(value.responsible_user_id){const staff=await c.admin.from('staff_access').select('user_id').eq('organization_id',org).eq('user_id',value.responsible_user_id).eq('is_active',true).maybeSingle();databaseError(staff.error);if(!staff.data)return json({error:'Choose an active responsible person'},400);}
  const current=await db.from('location_roster_settings').select('*').eq('location_id',site.id).maybeSingle();databaseError(current.error);
  if((current.data?.updated_at||null)!==(body.expectedUpdatedAt||null))return json({error:'Facility settings changed. Refresh before saving'},409);
  const values={organization_id:org,location_id:site.id,facility_name:name,license_number:license,verified_at:value.verify?new Date().toISOString():(current.data?.facility_name===name&&current.data?.license_number===license&&current.data?.verification_source===source?current.data.verified_at:null),verified_by:value.verify?c.user.id:(current.data?.facility_name===name&&current.data?.license_number===license&&current.data?.verification_source===source?current.data.verified_by:null),verification_source:source,responsible_user_id:value.responsible_user_id||null,reminder_days:value.reminder_days,updated_at:new Date().toISOString()};
  const r=current.data?await db.from('location_roster_settings').update(values).eq('location_id',site.id).eq('updated_at',current.data.updated_at).select('location_id').maybeSingle():await db.from('location_roster_settings').insert(values).select('location_id').single();databaseError(r.error);if(!r.data)return json({error:'Facility settings changed. Refresh.'},409);return json({ok:true});
 }
 if(body.action==='enrollment'){
  if(!uuid(body.childId)||!['Enrolled','Departed','Review required'].includes(body.state)||body.dateEnrolled&&!validFileDate(body.dateEnrolled)||body.dateLeft&&!validFileDate(body.dateLeft))return json({error:'Check the child and enrollment/departure dates'},400);
  const current=await db.from('child_location_enrollments').select('*').eq('child_id',body.childId).eq('location_id',site.id).maybeSingle();databaseError(current.error);
  if((current.data?.updated_at||null)!==(body.expectedUpdatedAt||null))return json({error:'This enrollment changed. Refresh.'},409);
  const values={organization_id:org,location_id:site.id,child_id:body.childId,date_enrolled:body.dateEnrolled||null,date_left:body.dateLeft||null,state:body.state,source:'Staff confirmed location enrollment',notes:text(body.notes,4000)};
  const r=current.data?await db.from('child_location_enrollments').update(values).eq('id',current.data.id).eq('updated_at',current.data.updated_at).select('id').maybeSingle():await db.from('child_location_enrollments').insert(values).select('id').single();databaseError(r.error);if(!r.data)return json({error:'Enrollment changed. Refresh.'},409);return json({ok:true});
 }
 if(body.action==='contact'){
  if(!uuid(body.childId))return json({error:'Choose a shared child profile'},400);
  const enrollment=await db.from('child_location_enrollments').select('id').eq('child_id',body.childId).eq('location_id',site.id).maybeSingle();databaseError(enrollment.error);if(!enrollment.data)return json({error:'Child is not enrolled at this location'},403);
  const child=await db.from('children').select('id,record_data,updated_at').eq('id',body.childId).eq('organization_id',org).maybeSingle();databaseError(child.error);if(!child.data||child.data.updated_at!==body.expectedUpdatedAt)return json({error:'Shared profile changed. Refresh before editing.'},409);
  const v=body.contact;if(!v||!Array.isArray(v.guardians)||v.guardians.length>10||!text(body.reason))return json({error:'Provide guardian contacts and a reason/source for this shared correction'},400);
  if(v.birthdate&&!validFileDate(v.birthdate))return json({error:'Use a valid birthdate'},400);
  const guardians=v.guardians.map((g:{name:unknown;phone:unknown})=>({name:text(g.name,200),phone:text(g.phone,100)}));
  const record={...child.data.record_data,firstName:text(v.firstName,160),lastName:text(v.lastName,160),dateOfBirth:v.birthdate||'',homeAddress:text(v.address,2000),primaryGuardian:guardians[0]?.name||'',phone:guardians[0]?.phone||'',secondaryGuardian:guardians[1]?.name||'',secondaryGuardianPhone:guardians[1]?.phone||'',additionalGuardianContacts:guardians.slice(2).map((g:{name:string;phone:string},n:number)=>({...child.data!.record_data.additionalGuardianContacts?.[n],...g})),medicalProvider:text(v.physician,200),medicalProviderPhone:text(v.physicianPhone,100),contactsVerifiedAt:v.verify?new Date().toISOString():child.data.record_data.contactsVerifiedAt||'',contactsVerifiedBy:v.verify?c.user.id:child.data.record_data.contactsVerifiedBy||'',contactsVerificationSource:v.verify?text(body.reason):child.data.record_data.contactsVerificationSource||''};
  const r=await db.rpc('correct_location_child_contacts',{p_child:body.childId,p_location:site.id,p_expected:body.expectedUpdatedAt,p_values:record,p_verify:v.verify===true,p_reason:text(body.reason)});databaseError(r.error);if(!r.data)return json({error:'Shared profile changed. Nothing was overwritten.'},409);return json({ok:true});
 }
 if(body.action==='audit'){
  const file=await db.from('location_person_files').select('id').eq('id',body.fileId).eq('location_id',site.id).maybeSingle();databaseError(file.error);if(!file.data)return json({error:'File is not in this location'},403);
  if(!validFileDate(body.dueDate))return json({error:'Choose a valid correction due date'},400);
  const r=await db.rpc('audit_location_child_file',{p_file:body.fileId,p_due:body.dueDate,p_assignee:body.assignee||null,p_notes:text(body.notes,4000)});databaseError(r.error);return json({ok:true,findings:r.data});
 }
 if(body.action==='review_finding'){
  if(body.confirmed!==true||!text(body.notes))return json({error:'Verify the correction and record review notes before closing'},400);
  const r=await db.from('location_file_findings').update({status:'Resolved',notes:text(body.notes,6000)}).eq('id',body.id).eq('location_id',site.id).eq('updated_at',body.expectedUpdatedAt).select('id').maybeSingle();databaseError(r.error);if(!r.data)return json({error:'Finding changed. Refresh.'},409);return json({ok:true});
 }
 if(body.action==='template'){
  const blank={items:[],template_confirmed:false} as unknown as LocationPersonFile;let edit;try{edit=validateLocationFileEdit({items:body.items,notes:'',review_date:null},blank);}catch(e){return json({error:e instanceof Error?e.message:'Invalid template'},400);}
  const items=edit.items.map(i=>({...i,status:'Not Checked',dateChecked:'',expirationDate:'',note:''}));
  if(!['All','Infant','Toddler','Preschool','School Age','Unknown'].includes(body.ageGroup)||!text(body.title,200))return json({error:'Choose an age group and template title'},400);
  const current=await db.from('location_file_templates').select('id,updated_at').eq('location_id',site.id).eq('age_group',body.ageGroup).maybeSingle();databaseError(current.error);
  if((current.data?.updated_at||null)!==(body.expectedUpdatedAt||null))return json({error:'Template changed. Refresh.'},409);
  const values={organization_id:org,location_id:site.id,age_group:body.ageGroup,title:text(body.title,200),items,updated_at:new Date().toISOString()};const r=current.data?await db.from('location_file_templates').update(values).eq('id',current.data.id).eq('updated_at',current.data.updated_at).select('id').maybeSingle():await db.from('location_file_templates').insert(values).select('id').single();databaseError(r.error);if(!r.data)return json({error:'Template changed. Refresh.'},409);return json({ok:true});
 }
 if(body.action==='apply_template'){
  const f=await db.from('location_person_files').select('*').eq('id',body.fileId).eq('location_id',site.id).maybeSingle();databaseError(f.error);
  const t=await db.from('location_file_templates').select('items').eq('id',body.templateId).eq('location_id',site.id).maybeSingle();databaseError(t.error);
  if(!f.data||!t.data||f.data.archived||f.data.updated_at!==body.expectedUpdatedAt)return json({error:'Open the latest active file and choose this location’s template'},409);
  const ids=new Set(f.data.items.map((i:{id:string})=>i.id));const items=[...f.data.items,...t.data.items.filter((i:{id:string})=>!ids.has(i.id)).map((i:Record<string,unknown>)=>({...i,status:'Not Checked',note:'',dateChecked:'',expirationDate:''}))];
  if(items.length>100)return json({error:'Keep at most 100 requirements; review applicability individually'},400);
  const r=await db.from('location_person_files').update({items,template_confirmed:false}).eq('id',f.data.id).eq('updated_at',body.expectedUpdatedAt).select('id').maybeSingle();databaseError(r.error);if(!r.data)return json({error:'File changed. Refresh.'},409);return json({ok:true});
 }
 if(body.action==='review_document'){
  if(!uuid(body.documentId)||!['Accepted','Correction required'].includes(body.status)||!text(body.note)||body.confirmed!==true)return json({error:'Review signatures, dates and correctness, and enter specific review notes'},400);
  const r=await db.from('document_records').update({review_status:body.status,review_note:text(body.note,4000)}).eq('id',body.documentId).eq('location_id',site.id).eq('review_status',body.expectedStatus).eq('review_note',body.expectedNote).not('location_file_id','is',null).select('id').maybeSingle();databaseError(r.error);if(!r.data)return json({error:'Document changed or is not accessible. Refresh before reviewing.'},409);return json({ok:true});
 }
 if(body.action==='map_document'){
  if(!uuid(body.documentId)||!uuid(body.fileId)||!text(body.reason))return json({error:'Choose the confirmed child/location file and record the ownership source'},400);
  const f=await db.from('location_person_files').select('*').eq('id',body.fileId).eq('location_id',site.id).maybeSingle();databaseError(f.error);if(!f.data?.child_id)return json({error:'Choose a child file at this location'},403);
  const doc=await db.from('document_records').select('child_id,location_file_id').eq('id',body.documentId).eq('location_id',site.id).maybeSingle();databaseError(doc.error);if(!doc.data||doc.data.location_file_id&&doc.data.location_file_id!==f.data.id||doc.data.child_id&&doc.data.child_id!==f.data.child_id)return json({error:'This document belongs to another child/file. Its ownership was not changed.'},409);
  if(body.itemId&&!f.data.items.some((i:{id:string})=>i.id===body.itemId))return json({error:'Choose an item in this file'},400);
  const r=await db.from('document_records').update({child_id:f.data.child_id,location_file_id:f.data.id,document_scope:'Child',confidentiality:'Location Leadership',checklist_item_id:body.itemId||null,review_status:'Awaiting review',review_note:'Ownership confirmed: '+text(body.reason)}).eq('id',body.documentId).select('id').maybeSingle();databaseError(r.error);if(!r.data)return json({error:'Document changed. Refresh.'},409);return json({ok:true});
 }
 return json({error:'Unsupported location-record action'},400);
 }catch(e){return staffErrorResponse(e);}}
