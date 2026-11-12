"use client";
import {useEffect,useState} from "react";
import {Capacitor} from "@capacitor/core";
import {Modal} from "@/components/hub/HubUI";
import {HUB_SYNC_EVENT,readSyncEvidence,type HubSyncDetail} from "@/lib/sync-events";
import {withRequestTimeout} from "@/lib/request-timeout";
const screenBuild=process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.trim()||"";
export default function VersionSyncStatus(){
 const [open,setOpen]=useState(false),[online,setOnline]=useState(true),[evidence,setEvidence]=useState(()=>readSyncEvidence());
 const [server,setServer]=useState(""),[error,setError]=useState(""),[checking,setChecking]=useState(false),[nativeVersion,setNativeVersion]=useState("");
 useEffect(()=>{const state=()=>{setOnline(navigator.onLine);setEvidence(readSyncEvidence());};const sync=(e:Event)=>{const detail=(e as CustomEvent<HubSyncDetail>).detail;if(detail)setEvidence(readSyncEvidence());};const t=window.setTimeout(()=>{state();setNativeVersion(navigator.userAgent.match(/TheHubIOS\/([\d.]+)/)?.[1]||"");},0);window.addEventListener("online",state);window.addEventListener("offline",state);window.addEventListener(HUB_SYNC_EVENT,sync);return()=>{window.clearTimeout(t);window.removeEventListener("online",state);window.removeEventListener("offline",state);window.removeEventListener(HUB_SYNC_EVENT,sync);};},[]);
 async function check(){setChecking(true);setError("");try{const response=await withRequestTimeout(signal=>fetch("/api/app-version",{signal,cache:"no-store"}));const data=await response.json();if(!response.ok||typeof data.version!=="string")throw new Error("Could not verify the deployed website version.");setServer(data.gitSha||data.version);}catch(e){setError(e instanceof Error?e.message:"Version check failed.");}finally{setChecking(false);}}
 const native=Capacitor.isNativePlatform();
 return <><button type="button" onClick={()=>{setOpen(true);void check();}} className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800">Version & sync status</button>
 {open&&<Modal title="Version & sync status" protectChanges={false} onClose={()=>setOpen(false)}><div className="space-y-4 text-base">
  <p><strong>Using:</strong> {native?"Downloaded iPhone app":"Hub website"}</p><p><strong>Connection:</strong> {online?"Browser reports online":"Offline"}</p>
  {native&&<p><strong>Installed app version:</strong> {nativeVersion||"Not reported by this build"}. Native build number is not available here.</p>}
  <p className="break-words"><strong>These screens:</strong> {screenBuild?screenBuild.slice(0,12):"Build identifier not recorded"}</p><p className="break-words"><strong>Deployed website:</strong> {checking?"Checking…":server?server.slice(0,12):"Not verified"}</p>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-900">{error}</p>}
  {native?<p className="rounded-xl bg-amber-50 p-3">The downloaded app’s screens update through the App Store. Refreshing live records does not install newer app screens. This panel does not claim an App Store update is available.</p>:server&&screenBuild&&server!==screenBuild?<p className="rounded-xl bg-amber-50 p-3">A different website version is deployed. Save your work before refreshing this page.</p>:<p className="text-sm text-slate-600">A version check confirms the website release, not that every record has synchronized.</p>}
  <p><strong>Last confirmed operation observed in this tab:</strong> {evidence.lastSuccess?new Date(evidence.lastSuccess).toLocaleString():"None recorded yet"}</p><p>{evidence.pending} observed operation(s) still loading/saving · {evidence.errors} observed operation(s) need attention.</p>
  <p className="text-sm text-slate-600">This shows only operations that report their status. It does not prove every screen is current or every unsaved form has been saved.</p>
  <button type="button" disabled={checking} onClick={()=>void check()} className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 font-bold">Check website version again</button>
 </div></Modal>}
 </>;
}
