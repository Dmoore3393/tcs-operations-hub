"use client";
import Link from "next/link";
import {useEffect,useState,type FormEvent} from "react";
import {createInvitationClient} from "@/lib/supabase/client";
type Step="loading"|"ready"|"verifying"|"verified"|"saving"|"done"|"invalid";
export default function StaffPasswordRecovery(){
 const [step,setStep]=useState<Step>("loading"),[proof,setProof]=useState(""),[error,setError]=useState(""),[password,setPassword]=useState(""),[confirm,setConfirm]=useState("");
 // Isolated memory-only session: never accidentally change the currently signed-in account on a shared device.
 const [client]=useState(()=>createInvitationClient());
 useEffect(()=>{
  const hash=new URLSearchParams(location.hash.slice(1));
  const token=hash.get("token_hash")||"";
  const valid=hash.get("type")==="recovery"&&/^[A-Za-z0-9_-]{20,256}$/.test(token);
  history.replaceState(history.state,"",location.pathname);
  const id=setTimeout(()=>{if(valid){setProof(token);setStep("ready");}else setStep("invalid");},0);
  return()=>clearTimeout(id);
 },[]);
 async function verify(){
  if(step!=="ready"||!proof)return;
  setStep("verifying");setError("");
  const {data,error:problem}=await client.auth.verifyOtp({type:"recovery",token_hash:proof});
  setProof("");
  if(problem||!data.user||!data.session){setError(problem?.message||"This link cannot be verified.");setStep("invalid");return;}
  setStep("verified");
 }
 async function save(e:FormEvent){e.preventDefault();if(step!=="verified")return;
  if(password.length<10){setError("Use at least 10 characters.");return;}
  if(password!==confirm){setError("Passwords do not match.");return;}
  setStep("saving");setError("");
  const {error:problem}=await client.auth.updateUser({password});
  if(problem){setError(problem.message);setStep("verified");return;}
  setPassword("");setConfirm("");await client.auth.signOut({scope:"local"});setStep("done");
 }
 const input="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950";
 return <main className="flex min-h-screen items-center justify-center bg-emerald-50 p-4"><section className="w-full max-w-md space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg sm:p-9">
 <p className="text-sm font-black uppercase tracking-wide text-emerald-800">TCS Operations Hub</p>
 <h1 className="text-2xl font-black text-slate-950">Reset your password</h1>
 {step==="loading"&&<p role="status">Checking recovery link…</p>}
 {step==="ready"&&<><p>This is a one-time link for the account holder. Select Verify to start.</p><button className="min-h-12 w-full rounded-xl bg-emerald-800 p-3 font-bold text-white" onClick={()=>void verify()}>Verify my reset link</button></>}
 {step==="verifying"&&<p role="status">Verifying your link…</p>}
 {(step==="verified"||step==="saving")&&<form onSubmit={e=>void save(e)} className="space-y-4">
 <p>Link verified. Set a new password for this account.</p>
 <label className="block font-semibold">New password<input className={input} autoComplete="new-password" type="password" minLength={10} required disabled={step==="saving"} value={password} onChange={e=>setPassword(e.target.value)}/></label>
 <label className="block font-semibold">Confirm password<input className={input} autoComplete="new-password" type="password" minLength={10} required disabled={step==="saving"} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
 <button className="min-h-12 w-full rounded-xl bg-emerald-800 p-3 font-bold text-white disabled:opacity-50" disabled={step==="saving"}>{step==="saving"?"Saving…":"Save new password"}</button></form>}
 {step==="invalid"&&<p className="rounded-xl bg-amber-50 p-3">This link is missing, expired, or already used. Request a new password reset.</p>}
 {step==="done"&&<p role="status" className="rounded-xl bg-emerald-50 p-3">Password updated. Sign in with your new password.</p>}
 {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-900">{error}</p>}
 <Link className="inline-flex min-h-11 items-center font-bold text-emerald-900 underline" href="/login">Staff sign-in</Link>
 </section></main>;
}
