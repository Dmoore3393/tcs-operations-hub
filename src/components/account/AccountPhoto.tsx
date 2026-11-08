"use client";
import { useCallback, useEffect, useState } from "react";
export default function AccountPhoto({token,name="Your profile",editable=false}:{token?:string;name?:string;editable?:boolean}) {
 const [url,setUrl]=useState<string|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  if(!token){setUrl(null);return;}
  const response=await fetch('/api/account-photo',{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal});
  if(!response.ok) throw new Error('Could not load your profile photo.');
  const data=await response.json();if(!signal?.aborted)setUrl(data.url);
 },[token]);
 useEffect(()=>{let active=true;const controller=new AbortController();setUrl(null);if(!token)return;const load=()=>{if(active)void refresh(controller.signal).catch(()=>{});};load();const timer=setInterval(load,240000);window.addEventListener('hub-profile-photo',load);return()=>{active=false;controller.abort();clearInterval(timer);window.removeEventListener('hub-profile-photo',load);};},[token,refresh]);
 async function save(file?:File){if(!token)return;setBusy(true);setMessage('');try{
  if(file&&file.size>8*1024*1024)throw new Error('Choose a photo under 8 MB.');
  const body=new FormData();if(file)body.append('file',file);
  const response=await fetch('/api/account-photo',{method:file?'POST':'DELETE',headers:{Authorization:`Bearer ${token}`},body:file?body:undefined});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not save photo.');
  await refresh();window.dispatchEvent(new Event('hub-profile-photo'));setMessage(file?'Profile photo saved.':'Photo removed.');
 }catch(error){setMessage(error instanceof Error?error.message:'Could not save photo.');}finally{setBusy(false);}}
 const picture=<span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 font-black text-emerald-950 ${editable?'h-24 w-24 text-2xl':'h-10 w-10 text-sm'}`}>{url?<img src={url} alt={`${name} profile`} className="h-full w-full object-cover" onError={()=>setUrl(null)}/>:<span aria-label={name}>{name.split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase()}</span>}</span>;
 if(!editable)return picture;
 return <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><h2 className="text-xl font-black">Your profile photo</h2><p className="mt-2 text-sm text-slate-700">Add a staff portrait or parent/family picture. This is separate from your child’s photo. Optional • JPG, PNG or WebP • up to 8 MB • cropped square.</p><div className="mt-4 flex flex-wrap items-center gap-4">{picture}<label className={`cursor-pointer rounded-xl bg-emerald-800 px-4 py-3 font-bold text-white ${busy?'opacity-50':''}`}>{busy?'Saving…':url?'Change photo':'Add photo'}<input aria-label="Choose your profile photo" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(file)void save(file);event.target.value='';}}/></label>{url&&<button type="button" disabled={busy} onClick={()=>void save()} className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-bold">Remove photo</button>}</div>{message&&<p role="status" className="mt-3 text-sm">{message}</p>}</section>;
}
