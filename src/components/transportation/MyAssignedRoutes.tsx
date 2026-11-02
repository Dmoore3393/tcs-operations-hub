"use client";
import {useState} from "react";
import {useSearchParams} from "next/navigation";
import {useAuth} from "@/components/providers/AuthProvider";
import {useTransportDay} from "@/hooks/useTransportDay";
import {localIsoDate} from "@/lib/date-utils";
import {validTransportDate,type DayRoute} from "@/lib/transportation-day";
import SchoolStopGroups from "./SchoolStopGroups";
export default function MyAssignedRoutes({routes}:{routes:DayRoute[]}){
 const {profile}=useAuth();const params=useSearchParams();const requested=params.get('routeDate')||'';
 const [date,setDate]=useState(()=>validTransportDate(requested)?requested:localIsoDate());
 const day=useTransportDay(routes,date);
 const mine=day.activeRoutes.filter(route=>Boolean(profile?.lane_profile_id)&&route.driverLaneId===profile?.lane_profile_id);
 return <section className="space-y-3 rounded-2xl border border-emerald-200 bg-white p-5 text-base"><h2 className="text-2xl font-black text-emerald-950">My assigned routes</h2><p>Review your assignments for today or an upcoming day. Confirm pickups and handoffs in today’s driver view below.</p><label className="block font-bold">Assignment date<input type="date" className="ml-3 min-h-11 rounded-xl border p-2 text-base" value={date} onChange={event=>setDate(event.target.value||localIsoDate())}/></label>{day.error?<p role="alert" className="text-red-900">{day.error} <button className="min-h-11 underline" onClick={()=>void day.refresh()}>Try again</button></p>:!day.ready?<p role="status">Loading your assignments…</p>:<><SchoolStopGroups routes={mine}>{route=><article key={route.id} className="rounded-xl border p-3"><strong>{route.child}</strong><p>{route.school} → {route.dropoffLocation||route.location}</p><p>Pickup {route.pickup||'not set'} • {route.vehicle||'Vehicle not set'}</p></article>}</SchoolStopGroups>{!mine.length&&<p>No routes assigned to your staff profile for this date. The shared driver view below still shows today’s accessible routes.</p>}</>}</section>;
}
