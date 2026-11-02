import {employeeCanAccessRoute,isOwnerAccessRole,isLicenseeAccessRole,isEmployeeAccessRole} from "@/lib/team-access";
import {normalizeLocation} from "@/lib/location-config";
import type {HubNotification} from "@/lib/notifications";
type Profile={role:string;permissions?:string[];locations?:string[];is_active?:boolean};
export function isSetupFileReminder(item:Pick<HubNotification,'eventKey'>){return (item.eventKey||'').startsWith('child-file-audit:none:');}
const ownerOnly=new Set(['/staff-schedules','/settings','/team-access','/locations','/audit-log','/app-readiness','/marketing','/executive-dashboard','/payroll-ops','/account-deletion-requests']);
function locationKey(value:string){const normalized=normalizeLocation(value);return normalized==='All Locations'?value.trim().toLowerCase():normalized;}
/** Apply current trusted access before exposing an inbox item or sending a push. */
export function canReceiveHubNotification(profile:Profile,item:Pick<HubNotification,'category'|'href'|'location'|'eventKey'|'title'>){
 if(profile.is_active===false||isSetupFileReminder(item))return false;
 if(isOwnerAccessRole(profile.role))return true;
 const assigned=profile.locations||[];
 if(item.location&&item.location!=='All Locations'&&!assigned.includes('All Locations')&&!assigned.some(value=>locationKey(value)===locationKey(item.location)))return false;
 let path:string;try{const url=new URL(item.href||'/notifications','https://hub.invalid');if(url.origin!=='https://hub.invalid')return false;path=url.pathname.replace(/\/+$/,'')||'/';}catch{return false;}
 if(isLicenseeAccessRole(profile.role))return ![...ownerOnly].some(root=>path===root||path.startsWith(root+'/'));
 if(!isEmployeeAccessRole(profile.role))return false;
 const permissions=profile.permissions||[];
 if((item.eventKey||'').startsWith('child-file-audit:')||['/files','/child-file-audits'].includes(path)||item.category==='tour')return false;
 if(item.category==='transportation')return (permissions.includes('transportation')&&employeeCanAccessRoute(permissions,path))||(['/transportation','/transportation-v2'].includes(path)&&item.title==='Child arrived'&&['children_basic','daily_care','schedules','ratios'].some(permission=>permissions.includes(permission)));
 if(path==='/scheduling'&&item.category==='schedule')path='/my-schedule';
 return employeeCanAccessRoute(permissions,path);
}
export function visibleHubNotifications(profile:Profile,inbox:HubNotification[]){return inbox.filter(item=>!item.archivedAt&&canReceiveHubNotification(profile,item));}
