"use client";
import {inputClass} from "@/components/hub/HubUI";
import type {SchoolRecord} from "@/lib/hub-data";
export default function TransportSchoolSelect({value,schools,onChange}:{value:string;schools:SchoolRecord[];onChange:(value:string)=>void}){
 const options=Array.from(new Set([...schools.filter(row=>row.status==='Active'||row.school===value).map(row=>row.school),'Home Transportation','Dojo',...(value?[value]:[])])).sort((a,b)=>a.localeCompare(b));
 return <select aria-label="School / pickup location" required className={`${inputClass} mt-1 min-h-11 w-full text-base`} value={value} onChange={event=>onChange(event.target.value)}><option value="">Choose school / pickup location</option>{options.map(name=><option key={name} value={name}>{name}</option>)}</select>;
}
