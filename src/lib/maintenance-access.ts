import {isOwnerAccessRole,isLicenseeAccessRole,isEmployeeAccessRole} from "@/lib/team-access";
type Profile={role:string;permissions:string[];is_active?:boolean};
export function canManageMaintenance(profile:Profile|null){return Boolean(profile&&profile.is_active!==false&&(isOwnerAccessRole(profile.role)||isLicenseeAccessRole(profile.role)||(isEmployeeAccessRole(profile.role)&&(profile.permissions.includes('maintenance_manage')||(!profile.permissions.includes('maintenance_view')&&profile.permissions.includes('health_safety'))))));}
export function canViewMaintenance(profile:Profile|null){return canManageMaintenance(profile)||Boolean(profile&&profile.is_active!==false&&isEmployeeAccessRole(profile.role)&&profile.permissions.includes('maintenance_view'));}
