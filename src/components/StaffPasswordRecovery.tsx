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
 const input="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slat...[truncated]