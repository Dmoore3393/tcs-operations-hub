import 'server-only';
import {requireStaff,type AuthorizedStaff} from './require-staff';
import {initialLocationItems,type LocationPersonFile} from '../location-person-files';
import {rosterRow,type RosterChild,type Enrollment,type Facility} from '../location-rosters/model';
export function databaseError(error:{message:string}|null){if(error)throw new Error(error.message);}
export async function requireLocationRecords(request:Request,id:string){
 const c=await requireStaff(request);if(!c.isOwner&&!c.isLicensee)throw new Response('Assigned location leadership required',{status:403});
 if(!/^[0-9a-f-]{36}$/i.test(id))throw new Response('Choose a location',{status:400});
 const site=await c.userClient.from('locations').select('id,name,full_name,program_type,is_active').eq('id',id).eq('organization_id',c.profile.organization_id).maybeSingle();databaseError(site.error);
 const access=await c.userClient.rpc('can_access_location',{p_location_id:id});databaseError(access.error);
 if(!site.data||!access.data||/maintenance/i.test(site.data.program_type||''))throw new Response('Location not accessible',{status:403});
 return {c,site:site.data};
}
export async function allRows<T>(query:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:{message:string}|null}>){const data:T[]=[];for(let start=0;;start+=500){const r=await query(start,start+499);databaseError(r.error);data.push(...r.data||[]);if((r.data||[]).length<500)return data;}}
export async function loadLocationRoster(c:AuthorizedStaff,site:{id:string;name:string;full_name:string},ensure=true){
 const db=c.userClient,org=c.profile.organization_id;
 if(ensure){const ensured=await db.rpc('ensure_location_roster_files',{p_location:site.id,p_home:initialLocationItems('Child','In-Home'),p_center:initialLocationItems('Child','School Age Center')});databaseError(ensured.error);}
 const [enrollments,childData,files,settings,documents,findings,templates,snapshots,history,memberships,people,legacy]=await Promise.all([
  allRows((from,to)=>db.from('child_location_enrollments').select('*').eq('organization_id',org).eq('location_id',site.id).order('id').range(from,to)),
  allRows((from,to)=>db.from('children').select('id,legacy_id,guardian_name,first_name,last_name,date_of_birth,age_group,enrollment_status,record_data,updated_at').eq('organization_id',org).order('id').range(from,to)),
  allRows((from,to)=>db.from('location_person_files').select('*').eq('organization_id',org).eq('location_id',site.id).not('child_id','is',null).order('id').range(from,to)),
  db.from('location_roster_settings').select('*').eq('location_id',site.id).maybeSingle(),
  allRows((from,to)=>db.from('document_records').select('id,child_id,location_file_id,checklist_item_id,document_type,original_filename,review_status,review_note,reviewed_at,copied_from_document_id,created_at').eq('organization_id',org).eq('location_id',site.id).or('document_scope.eq.Child,child_id.not.is.null').neq('status','Deleted').order('id').range(from,to)),
  allRows((from,to)=>db.from('location_file_findings').select('*').eq('organization_id',org).eq('location_id',site.id).order('id').range(from,to)),
  db.from('location_file_templates').select('*').eq('organization_id',org).eq('location_id',site.id),
  allRows((from,to)=>db.from('lic9040_snapshots').select('id,created_at,retain_until,sha256').eq('organization_id',org).eq('location_id',site.id).order('created_at',{ascending:false}).order('id').range(from,to)),
  db.from('location_record_events').select('id,child_id,file_id,actor_id,action,created_at').eq('organization_id',org).eq('location_id',site.id).order('created_at',{ascending:false}).limit(100),
  db.from('child_location_memberships').select('child_id').eq('organization_id',org).eq('location_id',site.id),
  c.admin.from('staff_access').select('user_id,full_name,role,is_active').eq('organization_id',org).eq('is_active',true),
  db.from('hub_state').select('state_value').eq('organization_id',org).eq('state_key','tcs-work-tasks').maybeSingle(),
 ]);
 for(const result of [settings,templates,history,memberships,people,legacy])databaseError(result.error);
 const children=childData as RosterChild[],entries=enrollments as Enrollment[],locationFiles=files as LocationPersonFile[];
 const facility:Facility=settings.data||{facility_name:site.full_name||site.name,license_number:'',verified_at:null,verification_source:'',responsible_user_id:null,reminder_days:30};
 const halcomPeople=(people.data||[]).filter(p=>['latrice moore','miss latrice','latrice'].includes(p.full_name.toLowerCase()));if(!settings.data&&site.name.toLowerCase().includes('halcom')&&halcomPeople.length===1)facility.responsible_user_id=halcomPeople[0].user_id;
 const rows=entries.flatMap(e=>{const child=children.find(ch=>ch.id===e.child_id);return child?[rosterRow(child,e)]:[];});
 const missingChildren=(memberships.data||[]).filter(m=>children.some(ch=>ch.id===m.child_id&&ch.enrollment_status==='Active')&&!entries.some(e=>e.child_id===m.child_id));
 const rosterMissingIdentities=entries.filter(e=>!children.some(ch=>ch.id===e.child_id));
 const oldTasks=Array.isArray(legacy.data?.state_value)?legacy.data.state_value.filter(t=>!t.completed&&(t.location===site.name||t.locationId===site.id)&&t.locationFileId&&t.checklistItemId):[];
 return {site,facility,enrollments:entries,children,rows,files:locationFiles,documents,findings,templates:templates.data||[],snapshots,history:history.data||[],missingChildren,rosterMissingIdentities,people:people.data||[],legacyTasks:oldTasks};
}
