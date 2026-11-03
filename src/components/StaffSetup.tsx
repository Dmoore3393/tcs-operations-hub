"use client";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import StaffContactFields from "@/components/StaffContactFields";
import { readStaffContact, validateStaffContact } from "@/lib/staff-contact";
import { useEmailCooldown } from "@/hooks/useEmailCooldown";

type Invitation = { email: string; fullName: string; expiresAt: string };
const fieldClass = "mt-2 min-h-12 w-full rounded-xl border border-slate-300 p-3 text-base";

async function setupRequest(body: object) {
  const response = await fetch("/api/team-access/setup", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    cache: "no-store", signal: AbortSignal.timeout(25000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Your invitation could not be checked. Please try again.");
  return payload;
}

export default function StaffSetup() {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [contact, setContact] = useState(() => readStaffContact({}));
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [complete, setComplete] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const cooldown = useEmailCooldown();
  const proof = useRef("");
  const verifiedSession = useRef<Session | null>(null);
  const client = useRef<SupabaseClient | null>(null);
  const [savedPassword, setSavedPassword] = useState(false);

  useEffect(() => {
    let active = true;
    const url = new URL(window.location.href);
    proof.current = url.searchParams.get("setup") || new URLSearchParams(url.hash.slice(1)).get("setup") || "";
    // Discard the provider's short-lived token/error. This page uses its own invitation proof.
    // Keep the proof in the fragment so a refresh works without sending it to app logs or referrers.
    url.searchParams.delete("setup");
    url.hash = proof.current ? `setup=${proof.current}` : "";
    window.history.replaceState(null, "", url);
    void setupRequest({ action: "inspect", token: proof.current }).then((value: Invitation) => {
      if (!active) return;
      setInvitation(value);
      setEmail(value.email);
      setContact(readStaffContact({}, value.fullName));
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Please reopen your staff invitation."); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  async function requestLink(event: FormEvent) {
    event.preventDefault();
    if (saving || cooldown.remaining) return;
    cooldown.start(); setSaving(true); setError("");
    try {
      const result = await fetch("/api/team-access/setup/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }), signal: AbortSignal.timeout(25000) });
      const payload = await result.json();
      if (!result.ok) throw new Error(payload.error);
      setSent(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Please try again later."); }
    finally { setSaving(false); }
  }

  async function finish(event: FormEvent) {
    event.preventDefault();
    if (saving || !invitation) return;
    const validated = validateStaffContact(contact);
    if (validated.error) { setError(validated.error); return; }
    if (password.length < 10 || password !== confirmPassword) { setError("Use a password with at least 10 characters and enter the same password twice."); return; }
    setSaving(true); setError("");
    try {
      if (!client.current) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !key) throw new Error("Secure sign-in is not configured.");
        client.current = createClient(url, key, { auth: { storageKey: "tcs-staff-setup-memory", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      }
      if (!verifiedSession.current) {
        const result = await setupRequest({ action: "exchange", token: proof.current });
        if (result.session?.user?.email?.toLowerCase() !== invitation.email.toLowerCase()) throw new Error("Please reopen the invitation for this email address.");
        const restored = await client.current.auth.setSession(result.session);
        if (restored.error || !restored.data.session) throw restored.error || new Error("Please retry your setup link.");
        verifiedSession.current = restored.data.session;
      }
      if (!savedPassword) {
        const updated = await client.current.auth.updateUser({ password });
        if (updated.error && updated.error.code !== "same_password") throw updated.error;
        setSavedPassword(true);
      }
      const current = await client.current.auth.getSession();
      const active = current.data.session;
      if (!active) { verifiedSession.current = null; throw new Error("Your setup session needs to be renewed. Please try again."); }
      const accepted = await fetch("/api/team-access/accept", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${active.access_token}` },
        body: JSON.stringify({ email: invitation.email, contact: validated.contact }), signal: AbortSignal.timeout(25000),
      });
      if (!accepted.ok) { const result = await accepted.json(); throw new Error(result.error || "Please retry to finish activation."); }
      // Setup is complete even if this browser cannot persist a session.
      proof.current = "";
      window.history.replaceState(null, "", window.location.pathname);
      setPassword(""); setConfirmPassword(""); setComplete(true);
      try {
        const { supabase } = await import("@/lib/supabase/client");
        if (supabase) await supabase.auth.setSession({ access_token: active.access_token, refresh_token: active.refresh_token });
      } catch { /* The Sign In link works with the password the employee just chose. */ }
    } catch (reason) {
      setError((savedPassword ? "Your password was saved. Please retry to finish activation. " : "") + (reason instanceof Error ? reason.message : "Setup could not be completed. Please try again."));
    } finally { setSaving(false); }
  }

  return <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 p-4 sm:p-8 [&_input]:text-base [&_select]:text-base [&_button]:min-h-12">
    <section className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl sm:p-9">
      <p className="text-sm font-black uppercase tracking-wide text-emerald-800">Thomason Childcare Solutions</p>
      <h1 className="mt-3 text-3xl font-black text-slate-950">{complete ? "Account activated!" : "Welcome to The Hub"}</h1>
      {complete ? <div className="mt-5 space-y-4"><p>Your staff account is ready. Use your email and the password you just created to sign in.</p><Link href="/login" className="inline-flex min-h-12 items-center rounded-xl bg-emerald-800 px-5 py-3 font-bold text-white">Enter The Hub</Link></div> : <>
        <p className="mt-3 text-base text-slate-700">Your staff invitation is valid for 48 hours. Confirm your contact details and choose your password. Birthday is optional.</p>
        {checking && <p role="status" className="mt-5">Checking your invitation…</p>}
        {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">{error}</p>}
        {!checking && invitation && <form onSubmit={finish} className="mt-6 space-y-5">
          <StaffContactFields value={contact} onChange={setContact} email={invitation.email} disabled={saving} />
          <label className="block font-bold">Create password<input className={fieldClass} type="password" autoComplete="new-password" minLength={10} required disabled={saving || savedPassword} value={password} onChange={event => setPassword(event.target.value)} /></label>
          <label className="block font-bold">Confirm password<input className={fieldClass} type="password" autoComplete="new-password" minLength={10} required disabled={saving || savedPassword} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>
          <button disabled={saving} className="w-full rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-60">{saving ? "Finishing your account…" : "Create Account & Enter Hub"}</button>
          <p className="text-sm text-slate-600">Valid until {new Date(invitation.expiresAt).toLocaleString()}. This updates your existing employee profile.</p>
        </form>}
        {!checking && !invitation && <form onSubmit={requestLink} className="mt-6 space-y-4">
          <p>Request a new invitation if you have not finished setup. If your account is already activated, go to Sign In.</p>
          <label className="block font-bold">Staff invitation email<input type="email" required autoComplete="email" className={fieldClass} value={email} onChange={event => { setEmail(event.target.value); setSent(false); }} /></label>
          {sent ? <p role="status">If this email has a pending staff invitation, a new 48-hour setup link has been requested. Check your inbox and Spam.</p> : <button disabled={saving || cooldown.remaining > 0} className="rounded-xl bg-emerald-800 px-5 py-3 font-bold text-white disabled:opacity-60">{saving ? "Requesting email…" : cooldown.remaining ? "Wait before requesting another email" : "Request new setup email"}</button>}
        </form>}
        <Link href="/login" className="mt-5 block py-3 font-bold text-emerald-800 underline">Return to Sign In</Link>
      </>}
    </section>
  </main>;
}
