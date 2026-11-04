"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {useAuth} from "@/components/providers/AuthProvider";
import {hubRequest} from "@/lib/hub-request";
import {mergeTransportDay,transportDayCallouts,type TransportCalloutReason,type DayRoute,type TransportDayStop} from "@/lib/transportation-day";
import type {TransportDriver} from "@/lib/transport-driver-view";
type Source={id:string;legacy_id:string;child_id:string|null};
type Payload={stops:TransportDayStop[];sources:Source[];drivers?:TransportDriver[];canPlan:boolean;canCallOut:boolean};
const noDrivers:TransportDriver[]=[];
export function useTransportDay<T extends DayRoute>(routes:T[],date:string){
 const {session}=useAuth();const token=session?.access_token;
 const [payload,setPayload]=useState<Payload>({stops:[],sources:[],canPlan:false,canCallOut:false});
 const [loadedDate,setLoadedDate]=useState(''),[error,setError]=useState(''),[actionError,setActionError]=useState(''),[saving,setSaving]=useState(false);
 const generation=useRef({value:0});
 const load=useCallback(async()=>{if(!token)return;const current=++generation.current.value;try{const data=await hubRequest<Payload>(`/api/transportation-day?date=${encodeURIComponent(date)}`,token);if(current===generation.current.value){setPayload(data);setLoadedDate(date);setError('');}}catch(reason){if(current===generation.current.value)setError(reason instanceof Error?reason.message:'Daily transportation could not be loaded.');}},[date,token]);
 useEffect(()=>{const sequence=generation.current;const timer=window.setTimeout(()=>void load(),0);const interval=window.setInterval(()=>void load(),15000);return()=>{sequence.value++;window.clearTimeout(timer);window.clearInterval(interval);};},[load]);
 const ready=loadedDate===date;
 const activeRoutes=useMemo(()=>ready?mergeTransportDay(routes,payload.stops,date):routes.filter(route=>route.runDate===date&&["Picked Up","Arrived"].includes(route.runStatus||"")),[ready,routes,payload.stops,date]);
 const callouts=useMemo(()=>ready?transportDayCallouts(routes,payload.stops,date):[],[ready,routes,payload.stops,date]);
 const sourceFor=(route:DayRoute)=>payload.sources.find(source=>source.legacy_id===String(route.id));
 const stopFor=(route:DayRoute)=>payload.stops.find(stop=>stop.service_date===date&&String(stop.snapshot.id)===String(route.id));
 async function change(route:DayRoute,action:'save'|'callout'|'restore',plan:Partial<DayRoute>={},expectedVersion=stopFor(route)?.version||0,reason:TransportCalloutReason='no_transportation'){
  if(!token||!ready||saving)return false;const source=sourceFor(route);if(!source){setActionError('This route needs to finish syncing before it can be changed. Refresh and try again.');return false;}
  setSaving(true);setActionError('');try{await hubRequest('/api/transportation-day',token,{method:'POST',body:JSON.stringify({routeId:source.id,date,action,plan,expectedVersion,reason})});await load();return true;}catch(reason){setActionError(reason instanceof Error?reason.message:'Could not update daily transportation.');return false;}finally{setSaving(false);}
 }
 return {ready,error,actionError,saving,activeRoutes,callouts,drivers:payload.drivers||noDrivers,stops:payload.stops.filter(stop=>stop.service_date===date),canPlan:payload.canPlan,canCallOut:payload.canCallOut,sourceFor,stopFor,change,refresh:load};
}
