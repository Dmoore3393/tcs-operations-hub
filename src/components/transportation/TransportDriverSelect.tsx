"use client";
import {useEffect,useState} from "react";
import {useAuth} from "@/components/providers/AuthProvider";
import {hubRequest} from "@/lib/hub-request";
import {inputClass} from "@/components/hub/HubUI";
type StaffOption={id:string;name:string;hasLogin:boolean};
export default function TransportDriverSelect({driver,driverLaneId,onChange}:{driver:string;driverLaneId?:string;onChange:(driver:string,id:string)=>void}){
 const {session}=useAuth();const token=session?.access_token;
 const [staff,setStaff]=useState<StaffOption[]>([]),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[loaded,setLoaded]=useState(false);
 useEffect(()=>{if(!token)return;let current=true;hubRequest<{staff:StaffOption[]}>('/api/transportation-staff',token).then(data=>{if(current){setStaff(data.staff);setLoaded(true);setError('');}}).catch(reason=>{if(current)setError(reason instanceof Error?reason.message:'Could not load staff.');});return()=>{current=false;};},[token,attempt]);
 const matches=staff.filter(row=>row.name===driver);
 const selected=driverLaneId&&staff.some(row=>row.id===driverLaneId)?driverLaneId:matches.length===1?matches[0].id:driver?'legacy':'';
 return <><select aria-label="Driver" required value={selected} className={`${inputClass} mt-1 min-h-11 w-full text-base`} onChange={event=>{const row=staff.find(item=>item.id===event.target.value);onChange(row?.name||'',row?.id||'');}}><option value="">{loaded?'Choose staff driver':'Loading staff…'}</option>{selected==='legacy'&&<option value="legacy">{driver} — existing assignment</option>}{staff.map(row=><option key={row.id} value={row.id}>{row.name}{row.hasLogin?'':' — no Hub login yet'}</option>)}</select>{error&&<span role="alert" className="mt-2 block text-red-900">{error} <button type="button" className="min-h-11 underline" onClick={()=>setAttempt(attempt+1)}>Try again</button></span>}<span className="mt-1 block text-sm font-normal text-slate-700">Assignments notify the selected driver after saving. Staff without a Hub login receive the alert when their account is linked. Phone alerts require notifications to be enabled.</span></>;
}
