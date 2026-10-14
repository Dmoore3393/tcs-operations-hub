"use client";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCallback, useEffect, useState } from "react";
type DeletionRequest={id:string;status:string;requested_at:string;due_at:string};
export default function AccountPage(){
 const {session,loading,signOut}=useAuth();
 const token=session?.access_token;
 const [request,setRequest]=useState<DeletionRequest|null>(null);
 const [email,setEmail]=useState("");const [confirmed,setConfirmed]=useState(false);const [saving,setSaving]=useState(false);const [error,setError]=useState("");const [loaded,setLoaded]=useState(false);
 const call=useCallback(async(body?:Record<string,unknown>)=>{
  if(!token) throw new Error("Sign in to manage your account.");
  const response=await fetch("/api/account-deletion",{method:body?"POST":"GET",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined,cache:"no-store"});
  const data=await response.json();if(!response.ok) throw new Error(data.error||"Could not load your request.");return data;
 },[token]);
 useEffect(()=>{if(!token)return;let active=true;void call().then(data=>{if(active){setRequest(data.request);setLoaded(true);}}).catch(caught=>{if(active){setError(caught.message);setLoaded(true);}});return()=>{active=false;};},[token,call]);
 async function submit(event:React.FormEvent){event.preventDefault();setSaving(true);setError("");try{const data=await call({email,confirm:confirmed});setRequest(data.request);}catch(caught){setError(caught instanceof Error?caught.message:"Could not save your request.");}finally{setSaving(false);}}
 return <main className="min-h-screen bg-[#f4f0e7] p-4 py-10 text-slate-950"><section className="mx-auto max-w-2xl rounded-3xl bg-white p-6 shadow-lg sm:p-9">
  <p className="text-xs font-black uppercase tracking-widest text-emerald-700">The Hub • Your account</p><h1 className="mt-2 text-3xl font-black">Account & Privacy</h1>
  {loading?<p className="mt-6">Loading your account…</p>:!session?<div className="mt-6"><p>Sign in with the account you want to delete.</p><div className="mt-4 flex gap-3"><Link href="/login" className="rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white">Staff sign-in</Link><Link href="/parent-login" className="rounded-xl border px-4 py-3 font-bold">Parent sign-in</Link></div></div>:<>
   <p className="mt-3 break-all text-sm text-slate-600">Signed in as {session.user.email}</p>
   <h2 className="mt-7 text-xl font-black">Delete your account</h2>
   <p className="mt-3 leading-7">You can request permanent deletion here. TCS will review and complete your request within 30 days. This removes your Hub account and associated personal data that TCS is not required to retain.</p>
   <p className="mt-3 text-sm leading-6 text-slate-600">Childcare enrollment, attendance, billing/subsidy, incident, and employee compliance records may be retained when required under TCS’s record-retention obligations. TCS will explain any records retained when confirming completion. Submitting this request does not immediately delete your account or any child’s records.</p>
   {error&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
   {request?<div role="status" className="mt-5 rounded-2xl bg-emerald-50 p-5"><h3 className="font-black">Deletion request received</h3><p className="mt-2">Status: {request.status}</p><p className="mt-2">Completion due: {new Date(request.due_at).toLocaleDateString()}</p><p className="mt-2 text-sm">No separate phone call or email is needed to submit your request.</p></div>:loaded?<form onSubmit={submit} className="mt-5 space-y-4"><label className="block font-bold">Confirm your account email<input type="email" required autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-3"/></label><label className="flex gap-3 text-sm leading-6"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} className="mt-1"/><span>I want TCS to permanently delete this Hub account and its personal data, except records TCS is required to retain.</span></label><button disabled={saving||!confirmed||email.trim().toLowerCase()!==session.user.email?.toLowerCase()} className="w-full rounded-xl bg-red-700 p-3 font-black text-white disabled:opacity-40">{saving?"Submitting…":"Request Account Deletion"}</button></form>:<p className="mt-4">Checking for an existing request…</p>}
   <div className="mt-7 flex flex-wrap gap-3"><Link href="/parent" className="rounded-xl border p-3 font-bold">Parent Portal</Link><Link href="/" className="rounded-xl border p-3 font-bold">Staff Hub</Link><button onClick={()=>void signOut()} className="rounded-xl bg-slate-950 p-3 font-bold text-white">Sign Out</button></div>
  </>}
  <Link href="/privacy" className="mt-6 inline-block text-sm font-bold text-emerald-800 underline">Privacy Policy</Link>
 </section></main>;
}
