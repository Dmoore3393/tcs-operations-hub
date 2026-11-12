import { locationFileSummary, type LocationPersonFile } from "@/lib/location-person-files";
import { normalizeLocation } from "@/lib/location-config";
export type FileSite = {id:string; name:string; full_name?:string; is_active:boolean; template?:string};
export type FileChild = {id:string; legacy_id:string|null; first_name:string; last_name:string; enrollment_status:string; location_id?:string};
export type FileMembership = {child_id:string; location_id:string; from_primary:boolean; from_schedule:boolean; from_kidkare:boolean};
export type LocationFileData = {locations:FileSite[]; files:LocationPersonFile[]; children:FileChild[]; memberships:FileMembership[]};
export type ReadinessRow = {key:string; location:FileSite; name:string; child:FileChild|null; kind:"Child"|"Staff"; file:LocationPersonFile|null; complete:boolean; missing:number; unchecked:number; expired:number; expiring:number};
/** A file at one site is never evidence for another site. Match database IDs, not names. */
export function locationReadiness(data:LocationFileData, selected:string, today:string):ReadinessRow[] {
 const sites=new Map(data.locations.filter(s=>s.is_active&&(selected==="All Locations"||normalizeLocation(s.name)===normalizeLocation(selected))).map(s=>[s.id,s]));
 const children=new Map(data.children.map(c=>[c.id,c]));
 const rows=new Map<string,ReadinessRow>();
 const soon=new Date(today+"T12:00:00Z");soon.setUTCDate(soon.getUTCDate()+30);const soonDate=soon.toISOString().slice(0,10);
 for(const file of data.files){
  const site=sites.get(file.location_id);if(!site||file.archived)continue;
  const child=file.child_id?children.get(file.child_id)||null:null;
  if(child&&child.enrollment_status!=="Active")continue;
  const key=`${site.id}:${file.child_id?`child:${file.child_id}`:`staff:${file.staff_lane_id}`}`;
  const state=locationFileSummary(file,today);
  const expiring=file.items.filter(i=>i.status==="On File"&&i.expirationDate>=today&&i.expirationDate<=soonDate).length;
  rows.set(key,{key,location:site,name:child?`${child.last_name}, ${child.first_name}`:file.person_name,child,kind:file.child_id?"Child":"Staff",file,...state,expiring});
 }
 // Only explicit existing files or known active care memberships require assessment.
 const memberships=[...data.memberships,...data.children.filter(c=>c.location_id).map(c=>({child_id:c.id,location_id:c.location_id!,from_primary:true,from_schedule:false,from_kidkare:false}))];
 for(const m of memberships){
  const site=sites.get(m.location_id),child=children.get(m.child_id);
  if(!site||!child||child.enrollment_status!=="Active"||!(m.from_primary||m.from_schedule||m.from_kidkare))continue;
  const key=`${site.id}:child:${child.id}`;if(rows.has(key))continue;
  rows.set(key,{key,location:site,name:`${child.last_name}, ${child.first_name}`,child,kind:"Child",file:null,complete:false,missing:0,unchecked:0,expired:0,expiring:0});
 }
 return [...rows.values()].sort((a,b)=>a.location.name.localeCompare(b.location.name)||a.kind.localeCompare(b.kind)||a.name.localeCompare(b.name));
}
export function readinessTotals(rows:ReadinessRow[]){
 const complete=rows.filter(r=>r.complete).length;
 return{total:rows.length,complete,percent:rows.length?Math.round(complete/rows.length*100):null,notStarted:rows.filter(r=>!r.file).length,missing:rows.reduce((n,r)=>n+r.missing,0),unchecked:rows.reduce((n,r)=>n+r.unchecked,0),expired:rows.reduce((n,r)=>n+r.expired,0),expiring:rows.reduce((n,r)=>n+r.expiring,0)};
}
