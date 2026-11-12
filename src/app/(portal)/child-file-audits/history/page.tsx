"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import {useAuth} from "@/components/providers/AuthProvider";
import {documentsForAudit,retiredHomeAuditDocuments,type ChildFileAudit} from "@/lib/child-file-audits";
import {compareChildrenByLastName} from "@/lib/child-sort";
import {withRequestTimeout} from "@/lib/request-timeout";
import type {ChildRecord} from "@/lib/children";

export default function EarlierAuditHistory(){
 const {session,profile,isSystemOwner,isLocationLicensee}=useAuth(),token=session?.access_token,userId=profile?.user_id;
 const [result,setResult]=useState<{user:string;children:ChildRecord[]}|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[search,setSearch]=useState("");
 const generation=useRef(0),allowed=isSystemOwner||isLocationLicensee;
 const load=useCallback(async()=>{
  if(!token||!userId||!allowed)return;
  const request=++generation.current;setLoading(true);setError("");
  try{
   const response=await withRequestTimeout(signal=>fetch("/api/children",{signal,cache:"no-store",headers:{Authorization:`Bearer ${token}`}}));
   const body=await response.json();if(!response.ok||!Array.isArray(body.children))throw new Error(body.error||"Could not load earlier audits.");
   if(request===generation.current)setResult({user:userId,children:body.children});
  }catch(reason){if(request===generation.current)setError(reason instanceof Error?reason.message:"Could not load earlier audits.");}
  finally{if(request===generation.current)setLoading(false);}
 },[token,userId,allowed]);
 useEffect(()=>{const counter=generation;const timer=window.setTimeout(()=>void load(),0);return()=>{counter.current++;window.clearTimeout(timer);};},[load]);
 const children=(allowed&&result?.user===userId?result?.children||[]:[]).filter(child=>child.fileAudits?.length&&`${child.firstName} ${child.lastName}`.toLowerCase().includes(search.toLowerCase())).sort(compareChildrenByLastName);
 return <MainLayout><div className="mx-auto max-w-6xl space-y-4"><header className="rounded-3xl border border-slate-200 bg-white p-5"><h1 className="text-2xl font-black">Earlier child-level audit history</h1><p className="mt-3 text-slate-700">These earlier audits are preserved as read-only history. Their original checklist, dates and notes have not been moved or assumed to apply to another location. Start or update a location-specific audit from Child File Audits.</p><Link href="/child-file-audits" className="mt-4 inline-flex min-h-11 items-center rounded-xl border px-4 font-bold">Back to location-specific audits</Link></header>
 {!allowed?<p>Only Owners/Admins and Licensees can review confidential file audits.</p>:<><label className="block font-bold">Find a child<input className="mt-1 block min-h-11 w-full rounded-xl border p-3" value={search} onChange={event=>setSearch(event.target.value)}/></label>
 {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-900">{error}</p>}
 {loading?<p role="status">Loading earlier audits…</p>:children.map(child=><section key={child.legacyId||child.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"><h2 className="text-xl font-black" translate="no">{child.lastName}, {child.firstName}</h2>{[...(child.fileAudits||[])].sort((a,b)=>(b.auditDate||b.updatedAt).localeCompare(a.auditDate||a.updatedAt)).map(audit=><AuditHistory key={audit.id} audit={audit}/>)}</section>)}
 {!loading&&!error&&!children.length&&<p className="rounded-xl bg-white p-4">No earlier audits match this search.</p>}
 </>}
 </div></MainLayout>;
}
function AuditHistory({audit}:{audit:ChildFileAudit}){
 const documents=[...documentsForAudit(audit),...(audit.template!=="School Age Center"?retiredHomeAuditDocuments:[])];
 return <details className="rounded-xl border border-slate-200 p-3"><summary className="min-h-11 cursor-pointer font-bold">{audit.auditDate||"Date not recorded"} · {audit.template||"Earlier in-home checklist"} · {audit.auditedBy||"Reviewer not recorded"}</summary><div className="space-y-3 pt-3"><p>Next audit date recorded: {audit.nextAuditDue||"Not recorded"}</p>{audit.notes&&<p className="whitespace-pre-wrap">{audit.notes}</p>}<ul className="space-y-2">{audit.items.map(item=><li key={item.documentId} className="rounded-lg bg-slate-50 p-3"><p className="font-bold">{documents.find(document=>document.id===item.documentId)?.name||`Earlier item ${item.documentId}`} — {item.status}</p><p className="text-sm">Checked: {item.dateChecked||"Not recorded"} · Expiration: {item.expirationDate||"Not recorded"}</p>{item.note&&<p className="whitespace-pre-wrap text-sm">{item.note}</p>}</li>)}</ul></div></details>;
}
