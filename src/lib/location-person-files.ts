import { staffFileTemplate } from "@/lib/staff-file-templates";
import { documentsForTemplate, type ChildFileAuditTemplate } from "@/lib/child-file-audits";

export const fileItemStatuses = ["Not Checked", "On File", "Missing", "N/A"] as const;
export type FileItemStatus = typeof fileItemStatuses[number];
export type LocationFileItem = { id: string; name: string; section: string; requirement: string; status: FileItemStatus; dateChecked: string; expirationDate: string; note: string };
export type LocationPersonFile = {
 id: string; location_id: string; child_id: string | null; staff_lane_id: string | null; person_name: string;
 template: ChildFileAuditTemplate; items: LocationFileItem[]; notes: string; reviewed_by: string; review_date: string | null;
 follow_up: string; template_confirmed: boolean; archived: boolean; updated_at: string;
};
export function initialLocationItems(type: "Child" | "Staff", template: ChildFileAuditTemplate): LocationFileItem[] {
 const rows = type === "Child" ? documentsForTemplate(template).map(d => ({id:`child-${d.id}`,name:d.name,section:d.sectionTitle,requirement:[d.requirement,d.appliesWhen].filter(Boolean).join(" · ")})) : staffFileTemplate(template);
 return rows.map(row=>({...row,status:"Not Checked",dateChecked:"",expirationDate:"",note:""}));
}
export function validFileDate(value: unknown) {
 if (typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
 const date=new Date(value+"T12:00:00Z");return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;
}
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const text=(v:unknown,max:number)=>typeof v==="string"?v.trim().slice(0,max):"";
export function validateLocationFileEdit(value: unknown, existing: LocationPersonFile) {
 const raw=object(value);
 if (!Array.isArray(raw.items)||raw.items.length===0||raw.items.length>100) throw new Error("Keep between 1 and 100 checklist items.");
 const ids=new Set<string>();
 const items=raw.items.map((input):LocationFileItem=>{
  const row=object(input),id=text(row.id,100),name=text(row.name,250),status=row.status as FileItemStatus;
  if(!id||!name||ids.has(id)||!fileItemStatuses.includes(status)) throw new Error("Each item needs a unique ID, name and valid status.");
  ids.add(id);const expirationDate=text(row.expirationDate,10),dateChecked=text(row.dateChecked,10),note=text(row.note,1000);
  if(dateChecked&&!validFileDate(dateChecked)) throw new Error("Use a valid checked date.");
  if(expirationDate&&!validFileDate(expirationDate)) throw new Error("Use a valid expiration date.");
  if(status==="N/A"&&!note) throw new Error("Add a reason for each N/A item.");
  return{id,name,section:text(row.section,150),requirement:text(row.requirement,500),status,dateChecked,expirationDate,note};
 });
 // Do not silently delete prior evidence. Mark an item N/A with a note instead.
 if(existing.items.some(item=>!ids.has(item.id))) throw new Error("Keep existing checklist items; use N/A with a reason instead of removing them.");
 const reviewDate=text(raw.review_date,10);
 if(reviewDate&&!validFileDate(reviewDate)) throw new Error("Use a valid review date.");
 const reviewedBy=text(raw.reviewed_by,160);
 if(raw.template_confirmed===true&&(!reviewDate||!reviewedBy)) throw new Error("Enter the reviewer and review date before confirming the checklist.");
 return{items,notes:text(raw.notes,6000),reviewed_by:reviewedBy,review_date:reviewDate||null,follow_up:text(raw.follow_up,4000),template_confirmed:raw.template_confirmed===true,archived:raw.archived===true};
}
export function locationFileSummary(file:Pick<LocationPersonFile,"items"|"template_confirmed">,today:string) {
 const applicable=file.items.filter(i=>i.status!=="N/A");
 const missing=applicable.filter(i=>i.status==="Missing").length;
 const unchecked=applicable.filter(i=>i.status==="Not Checked").length;
 const expired=applicable.filter(i=>i.status==="On File"&&i.expirationDate&&i.expirationDate<today).length;
 const invalidNA=file.items.some(i=>i.status==="N/A"&&!i.note.trim());
 return{missing,unchecked,expired,complete:file.template_confirmed&&file.items.length>0&&!missing&&!unchecked&&!expired&&!invalidNA};
}
