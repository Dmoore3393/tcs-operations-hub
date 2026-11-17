'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {useAuth} from '@/components/providers/AuthProvider';
import {hubRequest} from '@/lib/hub-request';
import TransportationAccountability from './TransportationAccountability';
import MainLayout from '@/components/layout/MainLayout';
type Configuration={enabled:boolean;preparing?:boolean;planningDate?:string;operationalFrom?:string};
/** The dated database switch keeps today's existing trips intact while Danielle prepares the next day. */
export default function TransportationWorkflowGate({legacy,initialView='Plan',location}:{legacy:ReactNode;initialView?:string;location?:string}){
 const {session}=useAuth();const token=session?.access_token;
 const [snapshot,setSnapshot]=useState<{token:string;configuration:Configuration}|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[showExisting,setShowExisting]=useState(false);
 const config=snapshot&&snapshot.token===token?snapshot.configuration:null;
 useEffect(()=>{let active=true;if(!token)return;const requested=new URLSearchParams(window.location.search).get('routeDate')||'';const load=()=>hubRequest<Configuration>('/api/transportation-accountability?configuration=1'+(requested?'&date='+encodeURIComponent(requested):''),token).then(p=>{if(active){setSnapshot({token,configuration:p});setError('');}}).catch(()=>{if(active)setError('Could not verify the active transportation system. Refresh before recording pickups or handoffs.');});void load();const interval=window.setInterval(()=>void load(),30000);return()=>{active=false;window.clearInterval(interval);};},[token,retry]);
 if(error)return <p role="alert" className="rounded-xl bg-red-50 p-4">{error}<button className="ml-3 min-h-11 underline" onClick={()=>setRetry(r=>r+1)}>Retry</button></p>;
 if(!config)return <p role="status" className="p-4">Loading transportation workflow…</p>;
 if(!config.enabled)return legacy;
 const notice=config.preparing?<div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"><strong>New transportation workflow starts {config.operationalFrom}.</strong><p>Prepare and publish that day’s decisions here. Today’s existing trips remain in the current system.</p><button className="mt-2 min-h-11 rounded-lg border border-amber-700 px-4 font-bold" onClick={()=>setShowExisting(v=>!v)}>{showExisting?'Prepare the new daily plan':"Open today's existing trips"}</button></div>:null;
 if(config.preparing&&showExisting)return <>{notice}{legacy}</>;
 const content=<>{notice}<TransportationAccountability initialView={config.preparing?'Plan':initialView} initialDate={config.planningDate} location={location}/></>;
 return initialView==='My Route'?<MainLayout><div className="mx-auto max-w-7xl p-4">{content}</div></MainLayout>:content;
}
