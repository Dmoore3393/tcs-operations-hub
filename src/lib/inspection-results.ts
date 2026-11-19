import type {InspectionDocument} from './pop-up-inspections';
export type InspectionCorrection={id:string;inspection_id:string;item_id:string;item_name:string;correction:string;urgent:boolean;assigned_user_id:string;assignee_name:string;due_date:string;status:'Open'|'Awaiting review'|'Resolved';submission:string;review_note:string;version:number;updated_at:string};
export type ReleasedInspection={id:string;location_id:string;location_name:string;inspection_date:string;released_at:string;released_by:string;document:InspectionDocument};
/** Overall notes and follow-up are leadership-only. Release only checklist observations. */
export function releasedInspectionDocument(document:InspectionDocument):InspectionDocument{return {...document,notes:'',followUp:''};}
export function sameInspectionLocation(assigned:string[],site:string,normalize:(v:string)=>string){const normalized=normalize(site);return assigned.some(value=>value===site||(normalized!=='All Locations'&&normalize(value)===normalized));}
