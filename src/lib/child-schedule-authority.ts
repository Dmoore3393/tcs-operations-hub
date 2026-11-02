import {isOwnerAccessRole,isLicenseeAccessRole} from "@/lib/team-access";
export function canApproveChildSchedules(profile:{role:string;full_name:string;is_active?:boolean}|null){
 if(!profile || profile.is_active===false)return false;
 return isLicenseeAccessRole(profile.role) || (isOwnerAccessRole(profile.role) && ['danielle moore','jennifer thomason'].includes(profile.full_name.trim().toLowerCase()));
}
