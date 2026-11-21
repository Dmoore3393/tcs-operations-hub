"use client";
import Link from "next/link";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {createInvitationClient,isSupabaseConfigured} from "@/lib/supabase/client";
import {authEmailErrorMessage} from "@/lib/auth-email-errors";
import {useEmailCooldown} from "@/hooks/useEmailCooldown";
import {readRecoveryProof,verifyRecoveryProof,requestStaffPasswordReset,type RecoveryProof} from "@/lib/staff-password-recovery";
type Step="loading"|"ready"|"verifying"|"verified"|"saving"|"done"|"invalid";
export default function StaffPasswordRecovery(){
 const [step,setStep]=useState<Step>("loading"),[error,setError]=useState(""),[password,setPassword]=useState(""),[confirm,setConfirm]=useState("");
 const [email,setEmail]=useState(""),[sending,setSending]=useState(false),[sent,setSent]=useState(false);
 const cooldown=useEmailCooldown(),sendingRef=useRef(false);
 // Isolated memory-only session: never change the signed-in account on a shared device.
 const [client]=useState(()=>isSupabaseConfigured?createInvitationClient():null);
 const proof=useRef<RecoveryProof|null>(null);
 useEffect(()=>{
  // Retain the captured proof across React's effect replay; strip all secrets from the URL.
  if(!proof.current){proof.current=readRecoveryProof(location.hash);history.replaceState(history.state,"",location.pathname);}
  const valid=proof.current.kind!=="invalid";
  const id=setTimeout(()=>setStep(valid?"ready":"invalid"),0);
  return()=>clearTimeout(id);
 },[]);
 async function verify(){
  if(step!=="ready"||!proof.current||!client)return;
  setStep("verifying");setError("");
  try{await verifyRecoveryProof(client,proof.current);setStep("verified");}
  catch(problem){setError(problem instanceof Error?problem.message:"This link cannot be verified.");setStep("invalid");}
  finally{proof.current={kind:"invalid"};}
 }
 async function requestLink(e:FormEvent){
  e.preventDefault();if(!client||sendingRef.current||cooldown.remaining)return;
  sendingRef.current=true;setSending(true);setError("");setSent(false);cooldown.start();
  try{await requestStaffPasswordReset(client,email);setSent(true);}
  catch(problem){setError(authEmailErrorMessage(problem,"The reset email could not be sent. Please try again later."));}
  finally{sendingRef.current=false;setSending(false);}
 }
 async function save(e:FormEvent){e.preventDefault();if(step!=="verified"||!client)return;
  if(password.length<10){setError("Use at least 10 characters.");return;}
  if(password!==confirm){setError("Passwords do not match.");return;}
  setStep("saving");setError("");
  try{
   const {error:problem}=await client.auth.updateUser({password});
   if(problem)throw problem;
   setPassword("");setConfirm("");setStep("done");
   // Password saving already succeeded; cleanup must not report a false save failure.
   void client.auth.signOut({scope:"local"}).catch(()=>{});
  }catch(problem){setError(problem instanceof Error?problem.message:"Your password could not be saved. Please retry.");setStep("verified");}
 }
 const input="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950";
 const button="min-h-12 w-full rounded-xl bg-emerald-800 p-3 font-bold text-white focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:opacity-50";
 return <main className="flex min-h-screen items-center justify-center bg-emerald-50 p-4"><section className="w-full max-w-md space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg sm:p-9">
 <p className="text-sm font-black uppercase tracking-wide text-emerald-800">TCS Operations Hub</p>
 <h1 className="text-2xl font-black text-slate-950">Reset your password</h1>
 {!client&&<p role="alert">Secure sign-in is unavailable. Please contact a TCS Owner/Admin.</p>}
 {step==="loading"&&<p role="status">Checking recovery link…</p>}
 {step==="ready"&&<><p>This is a one-time link for the account holder. Select Verify to start.</p><button disabled={!client} className={button} onClick={()=>void verify()}>Verify my reset link</button></>}
 {step==="verifying"&&<p role="status">Verifying your link…</p>}
 {(step==="verified"||step==="saving")&&<form onSubmit={e=>void save(e)} className="space-y-4">
 <p>Link verified. Set a new password for this account.</p>
 <label className="block font-semibold">New password<input className={input} autoComplete="new-password" type="password" minLength={10} required disabled={step==="saving"} value={password} onChange={e=>setPassword(e.target.value)}/></label>
 <label className="block font-semibold">Confirm password<input className={input} autoComplete="new-password" type="password" minLength={10} required disabled={step==="saving"} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
 <button className={button} disabled={step==="saving"}>{step==="saving"?"Saving…":"Save new password"}</button></form>}
 {step==="invalid"&&<form onSubmit={e=>void requestLink(e)} className="space-y-4">
 <p>Forgot your password, or is your link expired or already used? Request a new link for your existing staff account. Your role, locations, and permissions stay the same.</p>
 <label className="block font-semibold">Staff email<input required type="email" autoComplete="email" className={input} value={email} onChange={e=>{setEmail(e.target.value);setSent(false);}} disabled={sending}/></label>
 <button className={button} disabled={!client||sending||cooldown.remaining>0}>{sending?"Sending…":cooldown.remaining?`Wait ${cooldown.remaining}s before resending`:"Send new reset link"}</button>
 {sent&&<p role="status" className="rounded-xl bg-emerald-50 p-3">If this email has an account, a reset link has been requested. Check your inbox and Spam, and open the newest email. If it does not arrive, contact a TCS Owner/Admin.</p>}
 </form>}
 {step==="done"&&<p role="status" className="rounded-xl bg-emerald-50 p-3">Password updated. Sign in with your new password.</p>}
 {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-900">{error}</p>}
 <Link className="inline-flex min-h-11 items-center font-bold text-emerald-900 underline" href="/login">Staff sign-in</Link>
 </section></main>;
}
