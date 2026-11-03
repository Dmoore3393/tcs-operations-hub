"use client";

import {authEmailErrorMessage} from "@/lib/auth-email-errors";
import {useEmailCooldown} from "@/hooks/useEmailCooldown";
import { useAuth } from "@/components/providers/AuthProvider";
import StaffContactFields from "@/components/StaffContactFields";
import { readStaffContact, validateStaffContact } from "@/lib/staff-contact";
import { createInvitationClient, supabase } from "@/lib/supabase/client";
import { AlertTriangle, CheckCircle2, KeyRound, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {InvitationSessionError,prepareInvitationSession} from "@/lib/invitation-session";
import {hubRequest} from "@/lib/hub-request";
import { useRouter } from "next/navigation";

const fieldClass = "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100";

export default function AcceptInvitePage() {
  const router = useRouter();
  const emailCooldown = useEmailCooldown();
  const { session, profile, loading, refreshProfile, signOut } = useAuth();
  const [contact, setContact] = useState(() => readStaffContact(session?.user.user_metadata, profile?.full_name));
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [complete, setComplete] = useState(false);
  const [needsNewLink,setNeedsNewLink]=useState(false),[setupEmail,setSetupEmail]=useState(session?.user.email||""),[sendingLink,setSendingLink]=useState(false),[linkSent,setLinkSent]=useState(false),[signInRequired,setSignInRequired]=useState(false);
  const passwordSaved=useRef(false),prefilledUser=useRef("");
  useEffect(()=>{if(!session||!profile||prefilledUser.current===session.user.id)return;const timer=window.setTimeout(()=>{if(prefilledUser.current===session.user.id)return;prefilledUser.current=session.user.id;setContact(readStaffContact(session.user.user_metadata,profile.full_name));setSetupEmail(session.user.email||profile.email);},0);return()=>window.clearTimeout(timer);},[session,profile]);
  async function requestSetupLink(event:FormEvent){event.preventDefault();if(!supabase||sendingLink||emailCooldown.remaining)return;emailCooldown.start();setSendingLink(true);setError("");try{const {error:sendError}=await supabase.auth.resetPasswordForEmail(setupEmail.trim(),{redirectTo:window.location.origin+"/accept-invite"});if(sendError)throw sendError;setLinkSent(true);}catch(reason){setError(authEmailErrorMessage(reason));}finally{setSendingLink(false);}}


  const checkingInvitation=loading&&!(session&&profile);

  async function finishSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!supabase || !session || !profile) {
      setNeedsNewLink(true);setError(new InvitationSessionError().message);
      return;
    }
    const validated = validateStaffContact(contact);
    if (validated.error) {
      setError(validated.error);
      return;
    }
    const email = session.user.email?.trim() ?? "";
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("This invitation needs a valid email address. Contact an admin for a new invitation.");
      return;
    }
    if (password.length < 10) {
      setError("Create a password with at least 10 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const isolated=createInvitationClient();
      let activeSession=await prepareInvitationSession(supabase,isolated,session);
      if(!passwordSaved.current){const {error:passwordError}=await isolated.auth.updateUser({password});if(passwordError&&passwordError.code!=="same_password")throw passwordError;passwordSaved.current=true;}
      const updated=await isolated.auth.getSession();if(updated.data.session)activeSession=updated.data.session;
      await hubRequest("/api/team-access/accept",activeSession.access_token,{method:"POST",body:JSON.stringify({email,contact:validated.contact})});
      // Activation already succeeded. A storage failure must not tell staff to create another account.
      try{const restored=await supabase.auth.setSession({access_token:activeSession.access_token,refresh_token:activeSession.refresh_token});if(restored.error)throw restored.error;const stored=await supabase.auth.getSession();if(!stored.data.session)throw new InvitationSessionError();await refreshProfile();}
      catch{setSignInRequired(true);setPassword("");setConfirmPassword("");setComplete(true);return;}
      setPassword("");setConfirmPassword("");setComplete(true);
      window.setTimeout(() => {
        router.replace("/");
        router.refresh();
      }, 900);
    } catch (setupError) {
      if(setupError instanceof InvitationSessionError||/auth session missing|refresh token|session.*expired|link.*expired/i.test(setupError instanceof Error?setupError.message:"")){setNeedsNewLink(true);setError(new InvitationSessionError().message);}
      else setError((passwordSaved.current?"Your password was saved. Please retry to finish activation. ":"")+(setupError instanceof Error?setupError.message:"The account could not be activated. Please retry."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 p-4 sm:p-8 [&_input]:min-h-12 [&_input]:text-base [&_select]:text-base">
      <section className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl">
        <div className="bg-emerald-50 px-6 py-7 text-center sm:px-9">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-200">
            {complete ? <CheckCircle2 className="h-8 w-8" /> : <ShieldCheck className="h-8 w-8" />}
          </div>
          <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">TCS Operations Hub</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{complete ? "Account activated!" : "Finish your staff account setup"}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{complete ? "Your secure login is ready." : "Confirm your contact details and create your own password. Birthday is optional."}</p>
        </div>

        {complete&&<div className="px-6 py-7 text-center"><p className="mb-3 text-base text-slate-700">{signInRequired?"Your account is activated. Sign in with the password you just created.":"Opening The Hub…"}</p><Link href="/login" className="inline-flex min-h-12 items-center rounded-xl bg-emerald-800 px-5 py-3 font-bold text-white">Go to Sign In</Link></div>}
        {!complete&&checkingInvitation&&<p role="status" className="p-6 text-base">Checking your invitation…</p>}
        {!complete&&!checkingInvitation&&(!session||needsNewLink)&&<form onSubmit={requestSetupLink} className="space-y-4 px-6 py-7 text-base"><h2 className="text-xl font-black">Open a fresh staff setup link</h2><p>Your invitation session is no longer available. Request a new email and open its newest link in the same browser. Your employee profile will stay the same.</p><label className="block font-bold">Staff invitation email<input required type="email" autoComplete="email" value={setupEmail} onChange={event=>{setSetupEmail(event.target.value);setLinkSent(false);}} className={`${fieldClass} mt-2`}/></label>{error&&<p role="alert" className="text-red-900">{error}</p>}{linkSent?<p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-950">If this address has a Hub account, a new setup email has been requested. Check the inbox and Spam, and use only the newest link.</p>:<button disabled={sendingLink||emailCooldown.remaining>0} className="min-h-12 rounded-xl bg-emerald-800 px-5 py-3 font-bold text-white">{sendingLink?"Requesting email…":emailCooldown.remaining?"Wait before requesting another email":"Request new setup email"}</button>}<Link href="/login" className="block min-h-11 py-3 font-bold text-emerald-800 underline">Return to Sign In</Link></form>}
        {!complete&&!checkingInvitation&&session&&!profile&&!needsNewLink&&<div role="alert" className="p-6 text-base">Your staff access could not be verified. Contact Danielle or Jennifer, or <button onClick={()=>void signOut()} className="font-bold underline">sign out</button> and reopen your newest invitation.</div>}
        {!complete && !checkingInvitation && session && profile && !needsNewLink && (
          <form onSubmit={finishSetup} className="space-y-5 px-6 py-7 sm:px-9">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 text-emerald-700" />
                <div>
                  <p className="font-black text-slate-950"><span translate="no" className="contents">{profile?.full_name || "Invited staff member"}</span></p>
                  <p className="mt-0.5 text-sm text-slate-600"><span translate="no" className="contents">{profile?.email || session?.user.email}</span></p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-900">{profile?.role}</span>
                    {(profile?.locations ?? []).map((location) => <span key={location} className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">{location}</span>)}
                  </div>
                </div>
              </div>
            </div>

            <StaffContactFields value={contact} onChange={setContact} email={session?.user.email ?? ""} disabled={saving} />

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">Create password</span>
              <span className="relative block">
                <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-600" />
                <input required minLength={10} disabled={saving} className={`${fieldClass} pl-10`} type="password" autoComplete="new-password" value={password} onChange={(event) => {passwordSaved.current=false;setPassword(event.target.value);}} placeholder="At least 10 characters" />
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">Confirm password</span>
              <span className="relative block">
                <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-600" />
                <input required minLength={10} disabled={saving} className={`${fieldClass} pl-10`} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter it again" />
              </span>
            </label>

            {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

            <button type="submit" disabled={saving} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
              {saving ? "Activating Account…" : "Create Account & Enter Hub"}
            </button>

            <button type="button" onClick={() => void signOut()} className="w-full text-center text-xs font-bold text-slate-500 hover:text-slate-800">This invitation is not for me</button>
            <p className="text-center text-xs leading-5 text-slate-500">Your access is limited by the role, locations, and permissions assigned by Danielle or Jennifer.</p>
          </form>
        )}
      </section>
    </main>
  );
}
