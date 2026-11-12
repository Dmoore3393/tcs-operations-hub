"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { Modal, inputClass } from "@/components/hub/HubUI";
import { normalizeLocation } from "@/lib/location-config";
import { localIsoDate } from "@/lib/date-utils";
import { withRequestTimeout } from "@/lib/request-timeout";
import { fileItemStatuses, locationFileSummary, type LocationFileItem, type LocationPersonFile } from "@/lib/location-person-files";
import { staffTemplateSource } from "@/lib/staff-file-templates";

type Site = { id:string; name:string; full_name:string; is_active:boolean; template:"In-Home"|"School Age Center" };
type Person = {id:string; name:string; inactive:boolean};
type Data = {locations:Site[];files:LocationPersonFile[];children:Array<{id:string;first_name:string;last_name:string;enrollment_status:string}>;staff:Array<{id:string;full_name:string;is_active:boolean}>};
type VaultDoc = {id:string;document_type:string;original_filename:string;created_at:string;status:string};
const button="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 font-bold text-slate-900 disabled:opacity-50";
async function checkedResponse(response:Response) {
 const text=await response.text();let value:Record<string,unknown>={};try{value=text?JSON.parse(text):{};}catch{throw new Error(response.ok?"The save response could not be verified. Refresh before trying again.":text.slice(0,300)||"Request failed.");}
 if(!response.ok)throw new Error(typeof value.error==="string"?value.error:text.slice(0,300)||"Could not save.");return value;
}
export default function LocationFilesPanel() {
 const {session}=useAuth(),token=session?.access_token;
 const {location:activeLocation}=useHubLocation();
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(false);
 const [siteId,setSiteId]=useState(""),[kind,setKind]=useState<"Child"|"Staff">("Child"),[search,setSearch]=useState("");
 const [showArchived,setShowArchived]=useState(false),[adding,setAdding]=useState(false),[personId,setPersonId]=useState(""),[confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false),[editing,setEditing]=useState<LocationPersonFile|null>(null);
 const inFlight=useRef(false);
 const load=useCallback(async()=>{
  if(!token)return;setLoading(true);
  try{const value=await checkedResponse(await withRequestTimeout(signal=>fetch("/api/location-files",{signal,headers:{Authorization:`Bearer ${token}`},cache:"no-store"})));
   if(!Array.isArray(value.locations)||!Array.isArray(value.files)||!Array.isArray(value.children)||!Array.isArray(value.staff))throw new Error("Location files could not be verified.");
   setData(value as unknown as Data);setError("");
  }catch(e){setError(e instanceof Error?e.message:"Could not load location files.");}finally{setLoading(false);}
 },[token]);
 useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[load]);
 const preferred=data?.locations.find(site=>normalizeLocation(site.name)===normalizeLocation(activeLocation));
 const chosenSite=data?.locations.find(site=>site.id===siteId)||preferred||data?.locations[0];
 const people:Person[]=useMemo(()=>!data?[]:kind==="Child"?data.children.map(p=>({id:p.id,name:`${p.last_name}, ${p.first_name}`,inactive:p.enrollment_status==="Archived"})):data.staff.map(p=>({id:p.id,name:p.full_name,inactive:!p.is_active})),[data,kind]);
 const files=(data?.files||[]).filter(file=>file.location_id===chosenSite?.id&&(kind==="Child"?Boolean(file.child_id):Boolean(file.staff_lane_id))&&(showArchived||!file.archived)&&file.person_name.toLowerCase().includes(search.trim().toLowerCase()));
 const create=async(event:FormEvent)=>{
  event.preventDefault();if(inFlight.current||!chosenSite||!token)return;inFlight.current=true;setBusy(true);setError("");
  try{const value=await checkedResponse(await withRequestTimeout(signal=>fetch("/api/location-files",{method:"POST",signal,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({locationId:chosenSite.id,personId,type:kind,confirmLocation:confirmed})})));
   if(!value.file)throw new Error("The created file could not be verified.");const file=value.file as LocationPersonFile;
   setData(current=>current?{...current,files:[...current.files,file]}:current);setAdding(false);setEditing(file);
  }catch(e){setError(e instanceof Error?e.message:"Could not create file.");}finally{inFlight.current=false;setBusy(false);}
 };
 return <section id="location-files" className="space-y-4 rounded-3xl border border-emerald-200 bg-emerald-50/40 p-4 sm:p-6">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-black text-emerald-950">Child & Staff Files by Location</h2><p className="mt-2 max-w-3xl text-base text-slate-700">One person, one separate file at each location they use. Checklists and uploads stay with that location; adding a file does not enroll the person or change schedules.</p></div><button className={button} disabled={loading||busy} onClick={()=>void load()}>Refresh files</button></div>
  {error&&!adding&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-900">{error}</p>}
  <div className="flex flex-wrap items-end gap-3">
   <label className="block font-bold">Location<select className={`${inputClass} mt-1 block min-h-11`} value={chosenSite?.id||""} onChange={e=>setSiteId(e.target.value)}><option value="" disabled>Choose a location</option>{data?.locations.map(site=><option key={site.id} value={site.id}>{site.name}{site.is_active?"":" (inactive — history)"}</option>)}</select></label>
   <label className="block font-bold">File type<select className={`${inputClass} mt-1 block min-h-11`} value={kind} onChange={e=>{setKind(e.target.value as "Child"|"Staff");setPersonId("");}}><option>Child</option><option>Staff</option></select></label>
   <label className="block font-bold">Search<input className={`${inputClass} mt-1 block min-h-11`} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name" /></label>
   <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/>Include archived files</label>
   <button className={`${button} border-emerald-800 bg-emerald-800 text-white`} disabled={!data||!chosenSite?.is_active||loading} onClick={()=>{setPersonId("");setConfirmed(false);setError("");setAdding(true);}}>Add {kind.toLowerCase()} file here</button>
  </div>
  {chosenSite&&<p className="text-sm text-slate-700"><strong>{chosenSite.name}</strong> · {chosenSite.template} checklist · Only files explicitly added here appear below.</p>}
  {loading&&!data?<p role="status">Loading location files…</p>:<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{files.map(file=>{const summary=locationFileSummary(file,localIsoDate());return <article key={file.id} className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="text-lg font-black" translate="no">{file.person_name}</h3><p className="mt-1 text-sm">{file.archived?"Archived — retained":summary.complete?"Checklist complete":"Needs review"} · {file.template}</p><p className="mt-2 text-sm text-slate-700">{summary.missing} missing · {summary.unchecked} not checked · {summary.expired} expired</p><button className={`${button} mt-3`} onClick={()=>{setError("");setEditing(file);}}>Open location file</button></article>})}</div>}
  {data&&!files.length&&<p className="rounded-xl bg-white p-4 text-slate-700">No {kind.toLowerCase()} files in this view. Add a file only for someone who needs records at this location. Existing uploads and earlier audits below have not been moved or deleted.</p>}
  {adding&&chosenSite&&<Modal title={`Add ${kind.toLowerCase()} file · ${chosenSite.name}`} onClose={()=>{if(!busy)setAdding(false);}}>
   <form className="space-y-4" onSubmit={create}><label className="block font-bold">{kind} <select required disabled={busy} className={inputClass} value={personId} onChange={e=>setPersonId(e.target.value)}><option value="">Choose a person…</option>{people.map(p=><option key={p.id} value={p.id}>{p.name}{p.inactive?" (inactive)":""}</option>)}</select></label>
    <p>{chosenSite.template} checklist. This will not mark any document complete or create a file at another location.</p>
    <label className="flex items-start gap-3"><input type="checkbox" required disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1 h-5 w-5"/><span>I confirm this person needs a file at <strong>{chosenSite.name}</strong>.</span></label>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-900">{error}</p>}<button className={button} disabled={busy}>{busy?"Creating…":"Create location file"}</button>
   </form>
  </Modal>}
  {editing&&token&&<LocationFileEditor key={editing.id} file={editing} site={data?.locations.find(s=>s.id===editing.location_id)} token={token} onClose={()=>setEditing(null)} onSaved={file=>{setData(current=>current?{...current,files:current.files.map(f=>f.id===file.id?file:f)}:current);setEditing(null);}}/>}
 </section>;
}
function LocationFileEditor({file,site,token,onClose,onSaved}:{file:LocationPersonFile;site?:Site;token:string;onClose:()=>void;onSaved:(file:LocationPersonFile)=>void}) {
 const [draft,setDraft]=useState<LocationPersonFile>(()=>({...file,items:file.items.map(i=>({...i}))}));
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[docs,setDocs]=useState<VaultDoc[]>([]);
 const [attachment,setAttachment]=useState<File|null>(null),[documentType,setDocumentType]=useState(file.items[0]?.name||"Signed document");
 const [extra,setExtra]=useState("");const flight=useRef(false);
 const loadDocs=useCallback(async()=>{
  const value=await checkedResponse(await withRequestTimeout(signal=>fetch(`/api/documents?locationFileId=${encodeURIComponent(file.id)}`,{signal,headers:{Authorization:`Bearer ${token}`},cache:"no-store"})));
  if(!Array.isArray(value.documents))throw new Error("Uploaded documents could not be verified.");setDocs(value.documents as VaultDoc[]);
 },[file.id,token]);
 useEffect(()=>{let active=true;const timer=window.setTimeout(()=>{void loadDocs().catch(e=>{if(active)setError(e instanceof Error?e.message:"Could not load uploads.");});},0);return()=>{active=false;window.clearTimeout(timer);};},[loadDocs]);
 function changeItem(id:string,patch:Partial<LocationFileItem>){setDraft(current=>({...current,items:current.items.map(item=>item.id===id?{...item,...patch}:item)}));}
 async function save(event:FormEvent){event.preventDefault();if(flight.current)return;flight.current=true;setBusy(true);setError("");try{const value=await checkedResponse(await withRequestTimeout(signal=>fetch("/api/location-files",{method:"PATCH",signal,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({id:file.id,expectedUpdatedAt:file.updated_at,file:draft})})));if(!value.file)throw new Error("Save could not be confirmed.");onSaved(value.file as LocationPersonFile);}catch(e){setError(e instanceof Error?e.message:"Could not save. Your entries remain here.");}finally{flight.current=false;setBusy(false);}}
 async function upload(){if(!attachment||!site||flight.current)return;flight.current=true;setBusy(true);setError("");setNotice("");try{const body=new FormData();body.set("file",attachment);body.set("location",site.name);body.set("locationFileId",file.id);body.set("documentType",documentType);await checkedResponse(await withRequestTimeout(signal=>fetch("/api/documents",{method:"POST",signal,headers:{Authorization:`Bearer ${token}`},body}),90000));setAttachment(null);await loadDocs();setNotice("Uploaded to this location file. Review the document before marking the checklist On File.");}catch(e){setError(e instanceof Error?e.message:"Upload could not be confirmed.");}finally{flight.current=false;setBusy(false);}}
 async function download(doc:VaultDoc){if(flight.current)return;flight.current=true;setBusy(true);try{const response=await withRequestTimeout(signal=>fetch(`/api/documents/${encodeURIComponent(doc.id)}/download`,{signal,headers:{Authorization:`Bearer ${token}`}}));if(!response.ok){await checkedResponse(response);return;}const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=doc.original_filename;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError(e instanceof Error?e.message:"Download failed.");}finally{flight.current=false;setBusy(false);}}
 const close=()=>{if(!flight.current)onClose();};
 return <Modal title={`${file.person_name} · ${site?.name||"Location file"}`} description={`${file.child_id?"Child":"Staff"} file · ${file.template}. Changes apply only here.`} onClose={close} footer={<><button className={button} disabled={busy} onClick={close}>Cancel</button><button className={`${button} border-emerald-800 bg-emerald-800 text-white`} form="save-location-file" type="submit" disabled={busy}>{busy?"Working…":"Save this location file"}</button></>}>
  {error&&<p role="alert" className="mb-4 rounded-xl border border-red-300 bg-red-50 p-3 font-bold text-red-900">{error}</p>}{notice&&<p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-emerald-950">{notice}</p>}
  <p className="mb-4 text-sm text-slate-700">{file.staff_lane_id?staffTemplateSource(file.template):"Child checklist uses the separate in-home / center templates, including LIC 9150 where applicable and Extended Hours Care. N/A requires a reason and is excluded from missing and expiration alerts. Older audit entries remain in their original records."}</p>
  <form id="save-location-file" onSubmit={save}><fieldset disabled={busy} className="min-w-0 space-y-4">
   {draft.items.map(item=><section key={item.id} className="rounded-2xl border border-slate-200 p-3"><p className="text-sm font-bold text-emerald-800">{item.section}</p><h3 className="mt-1 font-black">{item.name}</h3><p className="mt-1 text-sm text-slate-600">{item.requirement}</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label>Status<select className={`${inputClass} block`} value={item.status} onChange={e=>changeItem(item.id,{status:e.target.value as LocationFileItem["status"],dateChecked:e.target.value==="Not Checked"?"":item.dateChecked||localIsoDate()})}>{fileItemStatuses.map(s=><option key={s}>{s}</option>)}</select></label><label>Date checked<input type="date" className={`${inputClass} block`} value={item.dateChecked||""} onChange={e=>changeItem(item.id,{dateChecked:e.target.value})}/></label><label>Expiration (only if applicable)<input type="date" className={`${inputClass} block`} value={item.expirationDate} onChange={e=>changeItem(item.id,{expirationDate:e.target.value})}/></label><label>Notes / N/A reason<input required={item.status==="N/A"} className={`${inputClass} block`} value={item.note} onChange={e=>changeItem(item.id,{note:e.target.value})} placeholder="Signature date, paper-file location, or N/A reason"/></label></div></section>)}
   <div className="rounded-xl border border-dashed p-3"><label>Additional site-specific item<input className={inputClass} value={extra} onChange={e=>setExtra(e.target.value)} maxLength={250}/></label><button type="button" className={`${button} mt-2`} disabled={!extra.trim()||draft.items.length>=100} onClick={()=>{setDraft(c=>({...c,items:[...c.items,{id:`custom-${crypto.randomUUID()}`,name:extra.trim(),section:"Additional location requirements",requirement:"Review applicability",status:"Not Checked",dateChecked:"",expirationDate:"",note:""}]}));setExtra("");}}>Add checklist item</button></div>
   <section className="space-y-3 rounded-2xl bg-slate-100 p-4"><h3 className="font-black">Staff Review</h3><label className="block">Reviewed by<input className={inputClass} value={draft.reviewed_by} onChange={e=>setDraft({...draft,reviewed_by:e.target.value})}/></label><label className="block">Review date<input type="date" className={inputClass} value={draft.review_date||""} onChange={e=>setDraft({...draft,review_date:e.target.value||null})}/></label><label className="block">Missing items / follow-up<textarea className={inputClass} value={draft.follow_up} onChange={e=>setDraft({...draft,follow_up:e.target.value})}/></label><label className="block">File notes<textarea className={inputClass} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label><label className="flex gap-3"><input type="checkbox" checked={draft.template_confirmed} onChange={e=>setDraft({...draft,template_confirmed:e.target.checked})}/><span>I reviewed this checklist’s applicability for this person, role and location.</span></label><label className="flex gap-3"><input type="checkbox" checked={draft.archived} onChange={e=>setDraft({...draft,archived:e.target.checked})}/><span>Archive this location file (keep its history and documents).</span></label></section>
  </fieldset></form>
  <section className="mt-6 space-y-3 border-t pt-4"><h3 className="text-lg font-black">Signed forms & uploads — this location only</h3><p className="text-sm text-slate-700">Uploads are kept in the existing encrypted leadership vault. They are retained until an authorized retention review; uploading does not automatically mark a checklist complete.</p>
   <label className="block">Document / checklist item<select className={inputClass} value={documentType} onChange={e=>setDocumentType(e.target.value)} disabled={busy}>{draft.items.map(i=><option key={i.id} value={i.name}>{i.name}</option>)}</select></label>
   <input aria-label="Signed form upload" type="file" accept="application/pdf,image/jpeg,image/png,image/heic,image/heif" disabled={busy||file.archived} onChange={e=>setAttachment(e.target.files?.[0]||null)}/><button type="button" className={button} disabled={busy||!attachment||file.archived} onClick={()=>void upload()}>Upload to this file</button>
   {docs.filter(d=>d.status!=="Deleted").map(doc=><div key={doc.id} className="rounded-xl bg-slate-50 p-3"><p className="font-bold">{doc.document_type}</p><p className="break-words text-sm">{doc.original_filename}</p><button className={`${button} mt-2`} disabled={busy} onClick={()=>void download(doc)}>Open / download</button></div>)}
  </section>
 </Modal>;
}
