import type {StaffLaneProfile} from "@/lib/staff-lanes";
export function staffScheduleDepartment(name:string,userId:string|null,roster:StaffLaneProfile[]){
 const active=roster.filter(person=>person.is_active);
 const matches=active.filter(person=>userId?person.staff_user_id===userId:person.full_name.trim().toLowerCase()===name.trim().toLowerCase());
 return matches.length===1 ? matches[0].department || 'Unassigned' : 'Unassigned';
}
