import type {AccessRole} from "@/lib/team-access";
/** Trusted staff registry recommendation; only an authenticated owner can prepare/send invites. */
export function recommendedStaffInviteRole(lane:{lane_level?:number|null;lane_group?:string|null;job_title?:string|null}):AccessRole{
 return lane.lane_level===1&&lane.lane_group?.trim().toLowerCase()==='executive'&&/\bowner\b/i.test(lane.job_title||'')?'Owner / Admin':'Employee';
}
