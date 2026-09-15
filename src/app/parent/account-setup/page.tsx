"use client";

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { CheckCircle2, Eye, EyeOff, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export default function ParentAccountSetupPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (!supabase || !isSupabaseConfigured) {
      setError("The secure Parent Portal connection is not configured.");
      setLoading(false);
      return;
    }

    const auth = supabase;
    let mounted = true;

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const search = new URLSearchParams(window.location.search);
    const authError = hash.get("error_description") || search.get("error_description");
    if (authError) setError(decodeURIComponent(authError));

    void auth.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      if (sessionError) setError(sessionError.message);
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: listener } = auth.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !session) return;

    if (password.length < 8) {
      setError("Choose a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      const { data: refreshed } = await supabase.auth.getSession();
      const activeSession = refreshed.session ?? session;

      const response = await fetch("/api/parent/complete-invite", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${activeSession.access_token}`,
          "Content-Type": "application/json",
        },
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Your Parent Portal access could not be activated.");

      setComplete(true);
      window.setTimeout(() => router.replace("/parent"), 900);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not finish your Parent Portal account.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f4f0e7] p-4"><div className="text-center"><LoaderCircle className="mx-auto h-9 w-9 animate-spin text-emerald-700" /><p className="mt-3 text-sm font-black text-slate-700">Opening your secure invitation…</p></div></main>;
  }

  if (!session) {
    return <main className="min-h-screen bg-gradient-to-br from-[#f5efe2] via-white to-[#eaf5ee] p-4 sm:p-8">
      <section className="mx-auto mt-20 max-w-xl rounded-[30px] border border-red-200 bg-white p-7 text-center shadow-2xl">
        <LockKeyhole className="mx-auto h-11 w-11 text-red-700" />
        <h1 className="mt-4 text-2xl font-black text-slate-950">This invitation link cannot be opened</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{error || "The invitation may have expired or already been used. Ask your TCS location to send a new Parent Portal invitation."}</p>
        <button onClick={() => router.replace("/parent-login")} className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Go to Parent Login</button>
      </section>
    </main>;
  }

  return <main className="min-h-screen bg-gradient-to-br from-[#f5efe2] via-white to-[#eaf5ee] p-4 sm:p-8">
    <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-5xl items-center justify-center">
      <section className="grid w-full overflow-hidden rounded-[34px] border border-slate-200 bg-white shadow-2xl lg:grid-cols-[.9fr_1.1fr]">
        <div className="bg-gradient-to-br from-[#173d29] via-[#245a39] to-[#10291e] p-7 text-white sm:p-10">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-xl font-black">TCS</div>
          <p className="mt-8 text-xs font-black uppercase tracking-[.18em] text-emerald-200">Parent Portal invitation</p>
          <h1 className="mt-2 text-4xl font-black">Create your account</h1>
          <p className="mt-4 text-sm font-semibold leading-7 text-emerald-50/80">Your TCS location invited this email to the Parent Portal. You choose your own password; TCS staff do not create or know it.</p>

          <div className="mt-8 space-y-3 text-sm font-semibold text-emerald-50/90">
            <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-emerald-200" />Your account only opens the children and features TCS specifically assigned to your email.</p>
            <p className="flex items-start gap-2"><LockKeyhole className="mt-0.5 h-5 w-5 flex-none text-emerald-200" />Separate households can have separate logins, privacy settings, and financial access.</p>
          </div>
        </div>

        <div className="p-7 sm:p-10">
          {complete ? <div className="py-12 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-700" />
            <h2 className="mt-4 text-3xl font-black text-slate-950">Your account is ready</h2>
            <p className="mt-3 text-sm font-semibold text-slate-600">Opening your Parent Portal…</p>
          </div> : <>
            <p className="text-xs font-black uppercase tracking-[.18em] text-emerald-700">Secure account setup</p>
            <h2 className="mt-2 text-3xl font-black text-slate-950">Choose your password</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">Account email: <strong className="text-slate-900">{session.user.email}</strong></p>

            <form onSubmit={submit} className="mt-7 space-y-4">
              <label className="block"><span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500">New password</span><div className="relative"><LockKeyhole className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type={showPassword ? "text" : "password"} required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-11 text-sm font-semibold outline-none focus:border-emerald-400" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></label>
              <label className="block"><span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500">Confirm password</span><input type={showPassword ? "text" : "password"} required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Type it again" className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" /></label>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold leading-5 text-emerald-950">By finishing setup, you are creating your own authenticated TCS Parent Portal account for this email address.</div>

              <button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#245a39] px-4 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Create My Parent Account</button>
            </form>

            {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-900">{error}</div>}
          </>}
        </div>
      </section>
    </div>
  </main>;
}
