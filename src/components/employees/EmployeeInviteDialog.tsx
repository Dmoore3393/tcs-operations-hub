"use client";
import {useEffect,useState,useRef,type FormEvent} from "react";
import Link from "next/link";
import {Modal,inputClass} from "@/components/hub/HubUI";
import {useAuth} from "@/components/providers/AuthProvider";
import {hubRequest} from "@/lib/hub-request";
import {careLocations} from "@/lib/location-config";
import {toggleEmployeePermission,ACCESS_ROLES,DEFAULT_EMPLOYEE_PERMISSIONS,EMPLOYEE_PERMISSION_OPTIONS,type AccessRole} from "@/lib/team-access";
import type {StaffLaneProfile} from "@/lib/staff-lanes";

type InviteDetails={email:string;emailNeedsReview:boolean;employee:{id:string;full_name:string;job_title:string;department?:string|null;primary_location:string|null}};
export default function EmployeeInviteDialog({employee,onClose,onInvited}:{employee:StaffLaneProfile;onClose:()=>void;onInvited:()=>Promise<void>}){
 const {session}=useAuth();const token=session?.access_token;const prepared=useRef(false);
 const [details,setDetails]=useState<InviteDetails|null>(null),[email,setEmail]=useState("");
 const [role,setRole]=useState<AccessRole>("Employee"),[locations,setLocations]=useState<string[]>([]),[permissions,setPermissions]=useState<string[]>([...DEFAULT_EMPLOYEE_PERMISSIONS]);
 const [loading,setLoading]=useState(true),[sending,setSending]=useState(false),[error,setError]=useState(""),[retry,setRetry]=useState(0);
 useEffect(()=>{
  if(!token||prepared.current)return;let current=true;
  hubRequest<InviteDetails>(`/api/team-access/invite?lane=${encodeURIComponent(employee.id)}`,token).then(data=>{if(!current)return;prepared.current=true;setDetails(data);setEmail(data.email);if(data.employee.department?.toLowerCase()==="maintenance")setPermissions(["maintenance_view"]);setLocations(data.employee.department?.toLowerCase()==="maintenance" ? [...careLocations] : data.employee.primary_location && careLocations.some(site=>site===data.employee.primary_location)?[data.employee.primary_location]:[]);setError("");}).catch(reason=>{if(current)setError(reason instanceof Error?reason.message:"Could not prepare the invitation.");}).finally(()=>{if(current)setLoading(false);});
  return()=>{current=false;};
 },[employee.id,token,retry]);
 async function send(event:FormEvent){
  event.preventDefault();if(!token||!details||sending)return;setSending(true);setError("");
  try{await hubRequest("/api/team-access/invite",token,{method:"POST",body:JSON.stringify({lane_profile_id:details.employee.id,full_name:details.employee.full_name,email,role,locations:role==="Owner / Admin"?["All Locations"]:locations,permissions:role==="Employee"?permissions:[]})});await onInvited();}
  catch(reason){setError(reason instanceof Error?reason.message:"The invitation could not be sent.");setSending(false);}
 }
 function chooseRole(value:AccessRole){setRole(value);if(value==="Location Licensee")setLocations(current=>current.slice(0,1));}
 return <Modal title={`Invite ${employee.full_name} to The Hub`} description="Create a login linked to this existing employee profile. Confirm the email, Hub access and locations before sending." onClose={()=>{if(!sending)onClose();}}>
  <div className="space-y-4 text-base [&_input]:text-base [&_select]:min-h-11 [&_select]:text-base">
   {loading&&<p role="status">Loading saved contact details…</p>}
   {error&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-900">{error}{!details&&<button type="button" className="ml-3 min-h-11 rounded-xl border px-3 font-bold" onClick={()=>{setLoading(true);setRetry(value=>value+1);}}>Try again</button>}</div>}
   {details&&<form onSubmit={send} className="space-y-4">
    <div className="rounded-xl bg-emerald-50 p-4 text-emerald-950"><strong>{details.employee.full_name}</strong><p>{details.employee.job_title}</p><p>Department / work area: {details.employee.department || "Not assigned"}</p><p>This keeps the employee’s existing profile and history.</p></div>
    {details.emailNeedsReview&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-amber-950">More than one email is saved. Confirm the correct address before sending.</p>}
    <label className="block font-bold">Invitation email<input required type="email" autoComplete="off" disabled={sending} className={`${inputClass} mt-2 min-h-11`} value={email} onChange={event=>setEmail(event.target.value)}/></label>
    <label className="block font-bold">Hub access role<select disabled={sending} className={`${inputClass} mt-2 min-h-11`} value={role} onChange={event=>chooseRole(event.target.value as AccessRole)}>{ACCESS_ROLES.map(item=><option key={item} value={item}>{item==="Employee" && details.employee.department?.toLowerCase()==="maintenance" ? "Maintenance staff" : item}</option>)}</select></label>
    <p>The Hub access role controls app permissions. Their job title stays as recorded.</p>
    {role==="Employee" && <p className="rounded-xl bg-emerald-50 p-4 text-base text-emerald-950">All employees, including Maintenance staff, keep access to Employee Lounge, Communications, Bulletin Board, Training Center, Team Store, Notifications, My Schedule and Time Clock. These shared staff areas are included with either maintenance access choice.</p>}
    {role==="Employee" && details.employee.department?.toLowerCase()==="maintenance" && <fieldset className="space-y-2 rounded-xl border border-emerald-200 p-3"><legend className="font-bold">Maintenance access</legend><label className="flex min-h-11 items-center gap-3"><input type="radio" name="maintenance-access" disabled={sending} checked={permissions.includes("maintenance_view")&&!permissions.includes("maintenance_manage")} onChange={()=>setPermissions(["maintenance_view"])}/>View maintenance updates only</label><label className="flex min-h-11 items-center gap-3"><input type="radio" name="maintenance-access" disabled={sending} checked={permissions.includes("maintenance_manage")} onChange={()=>setPermissions(["maintenance_manage"])}/>Create and manage maintenance tickets</label><p>Maintenance access includes facility tickets, location rest-awareness signals and their own work schedule. It does not include child care records or child schedule approvals. All TCS locations are selected as service areas; adjust them if needed.</p></fieldset>}
    {role==="Owner / Admin"?<p className="rounded-xl bg-amber-50 p-3 text-amber-950">Owner/Admin grants access to all locations and administration tools.</p>:<fieldset className="space-y-2"><legend className="mb-2 font-bold">{role==="Location Licensee"?"Choose one location":details.employee.department?.toLowerCase()==="maintenance"?"Maintenance service areas":"Assigned Hub locations"}</legend>{careLocations.map(site=><label key={site} className="flex min-h-11 items-center gap-3 rounded-xl border p-3"><input type={role==="Location Licensee"?"radio":"checkbox"} name="invite-location" className="h-5 w-5" disabled={sending} checked={locations.includes(site)} onChange={()=>setLocations(current=>role==="Location Licensee"?[site]:current.includes(site)?current.filter(value=>value!==site):[...current,site])}/>{site}</label>)}</fieldset>}
    {role==="Employee" && details.employee.department?.toLowerCase()!=="maintenance" && <details className="rounded-xl border p-3"><summary className="min-h-11 cursor-pointer font-bold">Employee permissions</summary>{EMPLOYEE_PERMISSION_OPTIONS.map(option=><label key={option.key} className="mt-2 flex min-h-11 items-start gap-3 rounded-xl bg-slate-50 p-3"><input type="checkbox" className="mt-1 h-5 w-5" disabled={sending} checked={permissions.includes(option.key)} onChange={()=>setPermissions(current=>toggleEmployeePermission(current,option.key))}/><span><strong>{option.label}</strong><span className="block text-slate-700">{option.description}</span></span></label>)}</details>}
    <div className="flex flex-wrap gap-3"><button type="submit" disabled={sending||loading||!email.trim()||(role!=="Owner / Admin"&&!locations.length)} className="min-h-11 rounded-xl bg-emerald-800 px-5 py-3 font-bold text-white disabled:opacity-50">{sending?"Sending invitation…":"Send Staff Invitation"}</button><button type="button" disabled={sending} onClick={onClose} className="min-h-11 rounded-xl border px-5 py-3 font-bold">Cancel</button></div>
   </form>}
   {!loading&&!details&&<Link href="/team-access" className="inline-flex min-h-11 items-center font-bold text-emerald-800 underline">Manage existing Hub accounts</Link>}
  </div>
 </Modal>;
}
