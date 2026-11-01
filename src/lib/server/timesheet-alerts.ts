import "server-only";
import {randomUUID} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {timesheetDeadline,timesheetDeadlineFlag,timesheetPolicyApplies} from "@/lib/timesheet-policy";
import {pacificToday,timesheetType,timesheetChildEligible} from "@/lib/timesheet-workflow";
import {previousTimesheetMonth} from "@/lib/timesheet-checklist";
import {isOwnerAccessRole} from "@/lib/team-access";
import {deliverStoredTimesheetAlert,loadNotificationState} from "@/lib/server/notifications";
import type {HubNotification} from "@/lib/notifications";
type Row=Record<string,unknown>;
const text=(v:unknown)=>typeof v==='string'?v:'';
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
export function timesheetAlertsForRows(forms:Row[],children:Row[],today:string,period:string) {
  const alerts=new Map<string,{type:string;status:string;count:number;owner?:string}>();
  const add=(type:string,status:string,tehachapi=false)=>{const key=`${period}:${type}:${status}:${tehachapi}`;const current=alerts.get(key);alerts.set(key,{type,status,count:(current?.count||0)+1,...(tehachapi?{owner:'Jennifer'}:{})});};
  const rows=forms.filter(row=>row.service_period===period);
  for(const row of rows){const data=object(row.record_data),type=timesheetType(data.timesheetType??row.funding_source);const submitted=Boolean(data.emailedAt&&data.emailEvidenceDocumentId&&!data.submissionIssue);const flag=timesheetDeadlineFlag(timesheetDeadline(period,type)||text(data.submissionDueDate),submitted,today);const tehachapi=row.locationSlug==='tehachapi';if(data.submissionIssue)add(type,'Correction required',tehachapi);else if(flag)add(type,flag,tehachapi);else if(submitted&&!tehachapi&&!data.jenReviewedAt)add(type,'Jen review');}
  const existing=new Set(rows.map(row=>text(row.child_id)));
  for(const child of children){
    const data=object(child.record_data);if(existing.has(text(child.id))||!timesheetChildEligible(child.enrollment_status,data,period))continue;
    const [month,year]=period.split(' ');const monthIndex=['January','February','March','April','May','June','July','August','September','October','November','December'].indexOf(month);
    const monthEnd=new Date(Date.UTC(Number(year),monthIndex+1,0,12)).toISOString().slice(0,10);
    if(text(data.plannedStartDate)>monthEnd)continue;
    const type=timesheetType(data.subsidy),flag=timesheetDeadlineFlag(timesheetDeadline(period,type),false,today);if(flag)add(type,flag,child.locationSlug==='tehachapi');
  }
  return [...alerts.values()];
}
export async function scanTimesheetAlerts(admin:SupabaseClient,organizationId?:string,now=new Date()) {
  const leadership=await admin.from('staff_access').select('user_id,organization_id,full_name,role').eq('is_active',true).in('full_name',['Danielle Moore','Jennifer Thomason']);
  if(leadership.error)throw new Error('Could not verify timesheet alert recipients.');
  const people=(leadership.data||[]).filter(person=>isOwnerAccessRole(person.role)&&(!organizationId||person.organization_id===organizationId));
  const organizations=[...new Set(people.map(person=>String(person.organization_id)))];let delivered=0,flagged=0;
  const recipientStates=new Map(await Promise.all(people.map(async person=>[person.user_id,await loadNotificationState(admin,person.user_id)] as const)));
  for(const org of organizations){
    const recipients=people.filter(person=>person.organization_id===org);
    if(recipients.filter(person=>person.full_name==='Danielle Moore').length!==1||recipients.filter(person=>person.full_name==='Jennifer Thomason').length!==1) continue;
    const [formsResult,childrenResult,sitesResult]=await Promise.all([admin.from('timesheets').select('child_id,location_id,service_period,funding_source,record_data').eq('organization_id',org),admin.from('children').select('id,location_id,enrollment_status,record_data').eq('organization_id',org),admin.from('locations').select('id,slug,name,full_name').eq('organization_id',org)]);
    if(formsResult.error||childrenResult.error||sitesResult.error)throw new Error('Could not check timesheet deadlines.');
    const sites=(sitesResult.data||[]) as Row[];
    const forms=(formsResult.data||[]).map(row=>({...row,locationSlug:sites.find(site=>site.id===row.location_id)?.slug}));
    const children=(childrenResult.data||[]).map(row=>{const data=object(row.record_data);const site=text(data.fundingLocationId) ? sites.find(site=>site.id===data.fundingLocationId) : text(data.fundingLocation) ? sites.find(site=>[site.slug,site.name,site.full_name].includes(data.fundingLocation)) : sites.find(site=>site.id===row.location_id);return {...row,locationSlug:site?.slug};});
    const previous=previousTimesheetMonth(now);const periods=new Set(forms.map(row=>text(row.service_period)));
    for(let cursor=new Date('2026-10-15T12:00:00Z'),count=0;cursor.toISOString().slice(0,7)<=previous.value&&count<120;cursor.setUTCMonth(cursor.getUTCMonth()+1),count++) periods.add(new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(cursor));
    const today=pacificToday(now);
    for(const period of periods){if(!timesheetPolicyApplies(period))continue;
      for(const alert of timesheetAlertsForRows(forms,children,today,period)){
        flagged+=alert.count;
        const title=alert.status==='Jen review'?'Timesheets ready for Jen’s review':alert.status==='Overdue'?'RED FLAG: overdue timesheets':alert.status==='Correction required'?'RED FLAG: timesheet correction needed':'RED FLAG: timesheets due today';
        const eventKey=`timesheet-alert:${org}:${period}:${alert.type}:${alert.status}${alert.owner==='Jennifer'?':tehachapi':''}:${today}`;
        const notification:HubNotification={id:randomUUID(),category:'system',severity:alert.status==='Jen review'?'attention':'urgent',title,body:`${alert.owner==='Jennifer'?'Tehachapi · Responsible: Jennifer · ':''}${period} · ${alert.type}: ${alert.count} form(s) ${alert.status==='Jen review'?'submitted and awaiting Jennifer’s review':'still need completed submission, including any missing forms'}. Open Timesheets to review.`,href:'/timesheets',location:alert.owner==='Jennifer'?'Tehachapi':'Other Locations',createdAt:now.toISOString(),readAt:'',eventKey};
        for(const recipient of people.filter(person=>person.organization_id===org&&((alert.owner!=='Jennifer'&&alert.status!=='Jen review')||person.full_name==='Jennifer Thomason'))){
          const saved=await admin.rpc('append_timesheet_alert',{p_org:org,p_user:recipient.user_id,p_event_key:eventKey,p_notification:notification,p_seed_inbox:recipientStates.get(recipient.user_id)?.inbox||[],p_seed_preferences:recipientStates.get(recipient.user_id)?.preferences||{}});
          if(saved.error)throw new Error('Could not record the timesheet alert.');
          if(saved.data===true){delivered++;try{await deliverStoredTimesheetAlert(admin,recipient.user_id,notification);}catch{console.warn("Timesheet alert saved; push delivery could not finish.");}}
        }
      }
    }
  }
  return {flagged,delivered};
}
