'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {useAuth} from '@/components/providers/AuthProvider';
import {hubRequest} from '@/lib/hub-request';
import TransportationAccountability from './TransportationAccountability';
import MainLayout from '@/components/layout/MainLayout';
/** Fail closed while checking the server-owned rollout flag: never expose two active workflows. */
export default function TransportationWorkflowGate({legacy,initialView='Plan',location}:{legacy:ReactNode;initialView?:string;location?:string}){
 const {session}=useAuth();const [enabled,setEnabled]=useState<boolean|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;if(!session?.access_token)return;hubRequest<{enabled:boolean}>('/api/transportation-accountability?configuration=1',session.access_token).then(p=>{if(active){setEnabled(p.enabled);setError('');}}).catch(()=>{if(active)setError('Could not verify the active transportation system. Refresh before recording pickups or handoffs.');});return()=>{active=false;};},[session?.access_token,retry]);
 if(error)return <p role="alert" className="rounded-xl bg-red-50 p-4">{error}<button className="ml-3 min-h-11 underline" onClick={()=>setRetry(r=>r+1)}>Retry</button></p>;
 if(enabled===null)return <p role="status" className="p-4">Loading transportation workflow…</p>;
 return enabled?(initialView==='My Route'?<MainLayout><div className="mx-auto max-w-7xl p-4"><TransportationAccountability initialView={initialView} location={location}/></div></MainLayout>:<TransportationAccountability initialView={initialView} location={location}/>):legacy;
}
