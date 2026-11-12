"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import {useAuth} from "@/components/providers/AuthProvider";
import {useHubLocation} from "@/components/providers/LocationProvider";
import {locationReadiness,readinessTotals,type LocationFileData} from "@/lib/location-file-readiness";
import {localIsoDate} from "@/lib/date-utils";
import {withRequestTimeout} from "@/lib/request-timeout";
import {announceHubSync} from "@/lib/sync-events";
const button="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 font-bold";
type Loaded={token:string;data:LocationFileData;checkedAt:string};
export default function LocationCompliance({inspection=false}:{inspection?:boolean}){
 const {session}=useAuth(),token=session?.access_token;
 const {location}=useHubLocation();
 const [loaded,setLoaded]=useState<Loaded|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const generation=useRef(0);
 const refresh=useCallback(async()=>{
  if(!token)return;const id=++generation.current;setLoading(true);setError("");
  try{
   const response=await withRequestTimeout(signal=>fetch("/api/location-files",{signal,headers:{Authorization:`Bearer ${token}`},cache:"no-store"}));
   const body=await response.text();let data:LocationFileData&{error?:string};try{data=JSON.parse(body);}catch{throw new Error("Could not verify the location-file response.");}
   if(!response.ok)throw new Error(data.error||"Location files could not be loaded. Please sign in again or retry.");
   if(![data.locations,data.files,data.children,data.memberships].every(Array.isArray))throw new Error("The location-file data is incomplete. No readiness score was calculated.");
   if(id!==generation.current)return;
   setLoaded({token,data,checkedAt:new Date().toISOString()});
   announceHubSync({state:"saved",key:"location-file-readiness",operation:"load",message:"Location-file status refreshed"});
  }catch(reason){if(id===generation.current){setError(reason instanceof Error?reason.message:"Could not load location files.");setLoaded(null);}}
  finally{if(id===generation.current)setLoading(false);}
 },[token]);
 useEffect(()=>{const timer=window.setTimeout(()=>void refresh(),0);const update=()=>void refresh();window.addEventListener("focus",update);window.addEventListener("online",update);window.addEventListener("tcs-location-files-changed",update);return()=>{generation.current++;window.clearTimeout(timer);window.removeEventListener("focus",update);window.removeEventListener("online",update);window.removeEventListener("tcs-location-files-changed",update);};},[refresh]);
 const ready=Boolean(token&&loaded?.token===token&&!loading&&!error),rows=ready?locationReadiness(loaded!.data,location,localIsoDate()):[],totals=readinessTotals(rows);
 const status=error?"Unable to load":!ready?"Loading":totals.percent===null?"No records to assess":`${totals.percent}%`;
 return <MainLayout><div className="mx-auto max-w-[1500px] space-y-5 print:space-y-3">
  <header className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7"><p className="text-sm font-bold text-emerald-800">{inspection?"Licensing Inspection Mode":"Compliance Command Center"}</p><h1 className="mt-2 text-2xl font-black">Location file readiness · {location}</h1><p className="mt-2 text-slate-700">Children’s and staff paperwork is assessed separately at each assigned location. A completed file elsewhere does not complete this location’s file.</p><div className="mt-4 flex flex-wrap gap-3 print:hidden"><button className={button} disabled={loading||!token} onClick={()=>void refresh()}>Refresh status</button><Link className={button} href="/files">Manage location files</Link><button className={button} disabled={!ready} onClick={()=>window.print()}>Print this location view</button></div></header>
  {error&&<p role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-4 font-bold text-red-900">{error} No completion percentage is available until the records load successfully.</p>}
  <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-busy={!ready&&!error}>
   <Metric label="Location file completion" value={status} good={ready&&totals.total>0&&totals.complete===totals.total}/>
   <Metric label="Files not started" value={ready?totals.notStarted:"—"}/><Metric label="Missing documents" value={ready?totals.missing:"—"}/><Metric label="Not checked" value={ready?totals.unchecked:"—"}/><Metric label="Expired / due within 30 days" value={ready?`${totals.expired} / ${totals.expiring}`:"—"}/>
  </section>
  <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>This is a file-checklist measure, not a certification of licensing compliance.</strong> Only explicit location files and known active child-location assignments are assessed. Locations not assigned are not counted as missing. N/A items with a recorded reason are excluded from missing/expiration totals. No files are created or marked complete by this screen.</p>
  {ready&&<><p className="text-sm text-slate-600">{totals.complete} of {totals.total} location files complete · Refreshed {new Date(loaded!.checkedAt).toLocaleString()}.</p><section className="space-y-3">{rows.map(row=><article key={row.key} className="break-inside-avoid rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-black" translate="no">{row.name}</h2><p className="font-bold text-slate-700">{row.location.name} · {row.kind}</p></div><span className={`rounded-xl px-3 py-2 font-bold ${row.complete?"bg-emerald-100 text-emerald-950":"bg-amber-100 text-amber-950"}`}>{!row.file?"File not started":row.complete?"Checklist complete":"Needs review"}</span></div><p className="mt-2 text-sm">{!row.file?"No active location file is recorded here yet. Existing older audits have not been assumed to apply.":`${row.missing} missing · ${row.unchecked} not checked · ${row.expired} expired · ${row.expiring} due soon`}</p>{row.file?.follow_up&&<p className="mt-2 whitespace-pre-wrap text-sm">Follow-up: {row.file.follow_up}</p>}<Link className={`${button} mt-3 print:hidden`} href={`/files?fileLocation=${encodeURIComponent(row.location.id)}${row.file?`&fileId=${encodeURIComponent(row.file.id)}`:""}`}>{row.file?"Open":"Start"} {row.location.name} file</Link></article>)}</section>{!rows.length&&<p className="rounded-2xl border border-slate-200 bg-white p-5">No location files or active child-location assignments are available in this view. This is not a 100% completion result.</p>}</>}
  <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-black">Other records to review separately</h2><p className="mt-2 text-sm text-slate-700">Historical audits, prior file items, emergency readiness, immunizations and signature requests remain available. They are not silently substituted for the location files above.</p><div className="mt-3 flex flex-wrap gap-3"><Link className={button} href="/child-file-audits">Earlier child audits</Link><Link className={button} href="/files/legacy">Earlier file items & vault</Link><Link className={button} href="/emergency-cards">Emergency records</Link><Link className={button} href="/immunization-tracker">Immunization tracker</Link><Link className={button} href="/digital-forms">Forms & signatures</Link></div></section>
 </div></MainLayout>;
}
function Metric({label,value,good=false}:{label:string;value:string|number;good?:boolean}){return <div className={`rounded-2xl border p-4 ${good?"border-emerald-300 bg-emerald-50":"border-slate-200 bg-white"}`}><p className="text-sm font-bold text-slate-700">{label}</p><p className="mt-2 text-xl font-black" role="status">{value}</p></div>;}
