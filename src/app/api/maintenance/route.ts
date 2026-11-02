import {maintenanceRestSummary} from "@/lib/maintenance-rest";
import {requireStaff,staffErrorResponse} from "@/lib/server/require-staff";
import {canCreateMaintenance,canManageMaintenance,canViewMaintenance} from "@/lib/maintenance-access";
import {tcsLocationSlug} from "@/lib/server/location-slug";
import {normalizeLocation} from "@/lib/location-config";
import type {MaintenanceTicket} from "@/lib/maintenance";
import {vehicleServiceTypes} from "@/lib/maintenance";
export const runtime="nodejs";
type Row=Record<string,unknown>;
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
async function context(request:Request){
 const auth=await requireStaff(request);
 if(!canViewMaintenance(auth.profile))throw new Response('Maintenance access is required.',{status:403});
 const sites=await auth.admin.from('locations').select('id,name,full_name,slug').eq('organization_id',auth.profile.organization_id).eq('is_active',true);
 if(sites.error)throw sites.error;
 let allowed=(sites.data||[]) as Row[];
 if(!auth.isOwner){const assignments=await auth.admin.from('staff_location_assignments').select('location_id').eq('organization_id',auth.profile.organization_id).eq('user_id',auth.user.id);if(assignments.error)throw assignments.error;allowed=allowed.filter(site=>(assignments.data||[]).some(row=>row.location_id===site.id));}
 const board=await auth.admin.from('hub_state').select('state_value,version').eq('organization_id',auth.profile.organization_id).eq('state_key','tcs-maintenance-tickets-v1').maybeSingle();
 if(board.error)throw board.error;
 if(board.data&&!Array.isArray(board.data.state_value))throw new Error('Maintenance records need administrator review.');
 const tickets=(board.data?.state_value||[]) as MaintenanceTicket[];
 const siteFor=(location:string)=>allowed.find(site=>site.slug===tcsLocationSlug(location));
 return {...auth,allowed,tickets,version:Number(board.data?.version||0),siteFor,canCreate:canCreateMaintenance(auth.profile),canManage:canManageMaintenance(auth.profile)};
}
export async function GET(request:Request){try{
 const c=await context(request);const now=new Date();const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);const part=(type:string)=>parts.find(value=>value.type===type)?.value||'';const day=`${part('year')}-${part('month')}-${part('day')}`,clock=`${part('hour')}:${part('minute')}`;
 const rest=c.allowed.length ? await c.admin.from('daily_care_entries').select('id,child_id,location_id,entry_date,entry_time,result').eq('organization_id',c.profile.organization_id).eq('category','Rest').eq('entry_date',day).in('location_id',c.allowed.map(site=>site.id)) : {data:[],error:null};
 const restRows=rest.error?[]:rest.data||[];
 return Response.json({tickets:c.tickets.filter(ticket=>c.isOwner||c.siteFor(ticket.location)),version:c.version,canManage:c.canManage,canCreate:c.canCreate,locations:c.allowed.map(site=>({id:site.id,label:normalizeLocation(text(site.name)),name:site.full_name||site.name})),restSignals:c.allowed.map(site=>({locationId:site.id,location:normalizeLocation(text(site.name)),...maintenanceRestSummary(restRows,text(site.id),day,clock)})),restDataAvailable:!rest.error,checkedAt:now.toISOString()},{headers:{'Cache-Control':'private, no-store','Vary':'Authorization'}});
}catch(error){return staffErrorResponse(error);}}

export async function POST(request:Request){try{
 const c=await context(request);if(!c.canManage)return Response.json({error:'View-only maintenance access cannot change tickets.'},{status:403});
 const body=await request.json().catch(()=>({}));const raw=body.ticket||{};const id=text(raw.id),title=text(raw.title),site=c.siteFor(text(raw.location));
 if(!id||id.length>200||!title||title.length>200||!site||!Number.isInteger(body.expectedVersion)||body.expectedVersion<0)return Response.json({error:'Choose a permitted location and enter a ticket title.'},{status:400});
 if(!['Routine','Soon','Urgent','Safety Critical'].includes(raw.priority)||!['Open','Assigned','In Progress','Waiting on Parts','Completed'].includes(raw.status))return Response.json({error:'Choose a valid priority and status.'},{status:400});
 if(text(raw.description).length>5000||text(raw.completionNotes).length>5000||text(raw.assignedTo).length>200||text(raw.area).length>200||(text(raw.dueDate)&&!/^\d{4}-\d{2}-\d{2}$/.test(raw.dueDate)))return Response.json({error:'Check the ticket text and due date.'},{status:400});
 const previous=c.tickets.find(ticket=>ticket.id===id);if(!previous&&!c.canCreate)return Response.json({error:'Report new maintenance issues to your location licensee. Licensees and administration create tickets.'},{status:403});if(previous&&!c.isOwner&&!c.siteFor(previous.location))return Response.json({error:'That ticket is outside your assigned locations.'},{status:403});
 const kind=raw.kind||previous?.kind||'Facility';
 if(!['Facility','Vehicle'].includes(kind))return Response.json({error:'Choose facility or vehicle maintenance.'},{status:400});
 const vehicleFields:Partial<MaintenanceTicket>={kind};
 if(kind==='Vehicle'){
  if(!text(raw.vehicleName)||text(raw.vehicleName).length>200||!vehicleServiceTypes.includes(raw.serviceType))return Response.json({error:'Enter the vehicle name or plate and choose a service type.'},{status:400});
  for(const field of ['odometer','nextServiceMileage'] as const){if(raw[field]!==undefined&&raw[field]!==null&&raw[field]!==''){if(typeof raw[field]!=='number'||!Number.isSafeInteger(raw[field])||raw[field]<0||raw[field]>10000000)return Response.json({error:'Mileage must be a whole number of zero or more.'},{status:400});vehicleFields[field]=raw[field];}}
  const date=text(raw.nextServiceDate);
  if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date))return Response.json({error:'Choose a valid next service date.'},{status:400});
  Object.assign(vehicleFields,{vehicleName:text(raw.vehicleName),serviceType:raw.serviceType,nextServiceDate:date});
 }
 const now=new Date().toISOString();const ticket:MaintenanceTicket={id,title,location:normalizeLocation(text(site.name)),area:text(raw.area),description:text(raw.description),priority:raw.priority,status:raw.status,assignedTo:text(raw.assignedTo),dueDate:text(raw.dueDate),completionNotes:text(raw.completionNotes),reportedBy:previous?previous.reportedBy:c.profile.full_name,reportedAt:previous?previous.reportedAt:now,completedAt:raw.status==='Completed'?(previous?.completedAt||now):''};
 Object.assign(ticket,vehicleFields);
 const result=await c.admin.rpc('save_maintenance_ticket',{p_org:c.profile.organization_id,p_actor:c.user.id,p_location:site.id,p_previous_location:previous?c.siteFor(previous.location)?.id||null:null,p_ticket:ticket,p_expected_version:body.expectedVersion});
 if(result.error)return Response.json({error:result.error.message?.includes('changed')?'Maintenance changed while this ticket was open. Close it, refresh, and open it again before saving.':'The maintenance ticket could not be saved. Please try again.'},{status:result.error.message?.includes('changed')?409:500});
 return Response.json({ok:true,ticket,version:result.data});
}catch(error){return staffErrorResponse(error);}}
